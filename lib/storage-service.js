'use strict';
const {BACKUP_STATE_IDS,buildBackup}=require('./backup');
const {buildCheckpointPoints,decodeCheckpoint}=require('./storage-checkpoint');
const MINUTE=60000,HOUR=3600000,MAX_POINTS=500,MAX_BATCH_POINTS=10,MAX_BATCH_BYTES=65536;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const INSTANCE=/^(influxdb|sql|history)\.\d{1,6}$/;
const clone=value=>JSON.parse(JSON.stringify(value));
const defaultStorageConfig=()=>({mode:'internal',instance:''});
function normalizeStorageConfig(raw={}){
 if(!plain(raw))throw Error('Speichereinstellungen müssen ein Objekt sein.');
 for(const key of Object.keys(raw))if(!['mode','instance'].includes(key))throw Error('Unbekannte Speichereinstellung: '+key);
 const mode=raw.mode??'internal',instance=raw.instance??'';
 if(!['internal','database'].includes(mode)||typeof instance!=='string')throw Error('Bitte Intern oder eine vorhandene Datenbankinstanz auswählen.');
 if(mode==='internal'){if(instance!=='')throw Error('Beim internen Speicher darf keine Datenbankinstanz gesetzt sein.');return defaultStorageConfig();}
 if(!INSTANCE.test(instance))throw Error('Unterstützt werden vorhandene influxdb-, sql- oder history-Instanzen.');
 return {mode,instance};
}
function validateStorageRuntime(raw={}){
 if(!plain(raw))throw Error('Ungültiger Datenbank-Speicherstatus.');
 if(!Object.keys(raw).length)return raw;
 const allowed=['version','verificationVersion','configKey','lastWriteAt','lastCheckpointAt','lastAttemptAt','retryAt','error'];
 if(raw.version!==1||Object.keys(raw).some(key=>!allowed.includes(key))||typeof raw.configKey!=='string'||raw.configKey.length>100||typeof raw.error!=='string'||raw.error.length>500)throw Error('Ungültiger Datenbank-Speicherstatus.');
 if(raw.verificationVersion!==undefined&&raw.verificationVersion!==2)throw Error('Ungültige Datenbank-Prüfversion.');
 for(const key of ['lastWriteAt','lastCheckpointAt','lastAttemptAt','retryAt'])if(raw[key]!==null&&(!Number.isSafeInteger(raw[key])||raw[key]<0))throw Error('Ungültiger Zeitpunkt im Datenbank-Speicherstatus.');
 return raw;
}
const configKey=config=>config.mode+':'+config.instance;
function message(error){return String(error?.message||error||'Keine Bestätigung erhalten.').replace(/[\r\n]+/g,' ').slice(0,300);}
class StorageService{
 constructor(adapter,raw=defaultStorageConfig(),runtime={},options={}){
  this.adapter=adapter;this.config=normalizeStorageConfig(raw);this.now=options.now||Date.now;this.timeoutMs=options.timeoutMs??8000;this.writeTimeoutMs=options.timeoutMs??35000;this.task=null;this.queue=Promise.resolve();this.closed=false;this.generation=0;this.failures=0;this.known=new Set();this.statusPublished=false;this.lastScheduledAt=null;
  this.meta={version:1,verificationVersion:2,configKey:configKey(this.config),lastWriteAt:null,lastCheckpointAt:null,lastAttemptAt:null,retryAt:null,error:''};
  try{validateStorageRuntime(runtime);if(runtime.configKey===this.meta.configKey){for(const key of ['lastWriteAt','lastCheckpointAt','lastAttemptAt']){const value=runtime[key];this.meta[key]=(key==='lastAttemptAt'||runtime.verificationVersion===2)&&Number.isSafeInteger(value)&&value<=this.now()?value:null;}this.meta.error=runtime.error||'';}}
  catch{} // Invalid status never blocks future sampling or changes the selected backend.
 }
 runtime(){return clone(this.meta);}
 serial(fn){const next=this.queue.catch(()=>{}).then(fn);this.queue=next;return next;}
 async instances(){
  const objects=await this.adapter.getForeignObjectsAsync('system.adapter.*','instance');
  const entries=Object.values(objects||{}).filter(object=>object?.type==='instance'&&typeof object._id==='string'&&INSTANCE.test(object._id.replace(/^system\.adapter\./,'')));
  const name=object=>typeof object.common?.name==='object'?object.common.name.de||object.common.name.en||'':String(object.common?.titleLang?.de||object.common?.title||object.common?.name||'');
  return Promise.all(entries.sort((a,b)=>a._id.localeCompare(b._id)).map(async object=>{
   const id=object._id.replace(/^system\.adapter\./,'');let alive=null,connected=null;
   try{const state=await this.adapter.getForeignStateAsync('system.adapter.'+id+'.alive');alive=state?.val===true;}catch{}
   try{const state=await this.adapter.getForeignStateAsync(id+'.info.connection');connected=typeof state?.val==='boolean'?state.val:null;}catch{}
   return {id,type:id.split('.')[0],name:name(object),enabled:object.common?.enabled===true,alive,connected,available:object.common?.enabled===true&&alive===true&&connected!==false};
  }));
 }
 async target(instance,requireReady=true){
  if(!INSTANCE.test(instance||''))throw Error('Bitte eine vorhandene Datenbankinstanz auswählen.');
  const target=(await this.instances()).find(entry=>entry.id===instance);
  if(!target)throw Error('Diese Datenbankinstanz ist in ioBroker nicht vorhanden.');
  if(requireReady&&!target.available)throw Error('Die ausgewählte Datenbankinstanz ist deaktiviert, nicht gestartet oder nicht verbunden.');
  return target;
 }
 send(instance,command,payload,{write=false,label=command}={}){return new Promise((resolve,reject)=>{
  let settled=false;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);};
  const timer=setTimeout(()=>finish(Error('Datenbank '+instance+' antwortet beim '+label+' nicht rechtzeitig.')),write?this.writeTimeoutMs:this.timeoutMs);
  try{this.adapter.sendTo(instance,command,payload,result=>{if(result?.error)finish(Error('Datenbank '+instance+' – '+label+': '+message(result.error)));else finish(null,result);});}catch(error){finish(error);}
 });}
 async test(request={}){
  if(!plain(request))throw Error('Ungültige Datenbankauswahl.');
  const instance=request.instance??this.config.instance;
  if(instance===''&&this.config.mode==='internal')return {internal:true,available:true,message:'Der interne Speicher benötigt keine Datenbankverbindung.'};
  const target=await this.target(instance);const end=this.now();
  const result=await this.send(instance,'getHistory',{id:this.adapter.namespace+'.live.houseW',options:{start:Math.max(0,end-MINUTE),end,count:1,limit:1,aggregate:'none',returnNewestEntries:true}});
  if(!Array.isArray(result)&&!Array.isArray(result?.result))throw Error('Die Datenbank hat keine gültige Antwort auf die Leseprüfung geliefert.');
  return {internal:false,available:true,instance:target.id,type:target.type,message:'Instanz erreichbar; Lesezugriff bestätigt. Es wurden keine Messwerte geschrieben.'};
 }
 configure(raw){return this.serial(async()=>{
  if(this.closed||this.adapter.stopping)throw Error('Datenspeicher wird beendet.');
  if(this.adapter.dataBusy)throw Error('Sicherung oder Wiederherstellung läuft. Bitte danach erneut speichern.');
  const next=normalizeStorageConfig(raw);
  if(next.mode==='database')await this.test({instance:next.instance});
  if(this.closed||this.adapter.stopping)throw Error('Datenspeicher wird beendet.');
  if(this.adapter.dataBusy)throw Error('Sicherung oder Wiederherstellung läuft. Bitte danach erneut speichern.');
  if(this.task)await this.task;
  if(this.closed||this.adapter.stopping)throw Error('Datenspeicher wird beendet.');
  if(this.adapter.dataBusy)throw Error('Sicherung oder Wiederherstellung läuft. Bitte danach erneut speichern.');
  this.generation++;this.config=next;this.meta={version:1,verificationVersion:2,configKey:configKey(next),lastWriteAt:null,lastCheckpointAt:null,lastAttemptAt:null,retryAt:null,error:''};this.failures=0;this.lastScheduledAt=null;
  await this.adapter.set('config.storage_JSON',next,true);await this.persist();return clone(next);
 });}
 async json(id){try{const state=await this.adapter.getStateAsync(id);return typeof state?.val==='string'?JSON.parse(state.val):null;}catch{return null;}}
 async points(now){
  const [snapshot,utilities,heating,plan]=await Promise.all(['live.snapshot','analytics.utilities_JSON','heating.status','control.summary'].map(id=>this.json(id)));
  const points=[],seen=new Set(),fresh=timestamp=>finite(timestamp)&&timestamp<=now+15000&&now-timestamp<=120000;
  const add=(id,value,unit='',label=id)=>{if(!finite(value)||seen.has(id)||points.length>=MAX_POINTS)return;seen.add(id);points.push({id:this.adapter.namespace+'.'+id,state:{val:value,ts:now,ack:true,from:'system.adapter.'+this.adapter.namespace},meta:{unit,label}});};
  if(fresh(snapshot?.ts)){
   for(const key of ['importW','exportW','houseW','pvW','batteryW'])add('live.'+key,snapshot.values?.[key],'W');
   for(const key of ['importKWh','exportKWh'])add('live.'+key,snapshot.values?.[key],'kWh');
   for(const row of Array.isArray(plan)?plan:[])if(/^[a-z][a-z0-9_]{1,47}$/.test(row?.id||''))add('storage.series.devices.'+row.id+'.powerW',row.measuredW,'W',row.name||row.id);
  }
  if(fresh(utilities?.updatedAt))for(const kind of ['water','rainwater','fuel']){
   const row=utilities[kind];if(!row?.enabled)continue;const prefix=kind==='fuel'?'fuel.'+row.type:kind;
   if(!/^(water|rainwater|fuel\.(pellets|oil|gas))$/.test(prefix))continue;
   if(row.status==='ok'){add('storage.series.'+prefix+'.flowPerHour',row.live?.flowPerHour,row.unit+'/h');add('storage.series.'+prefix+'.counter',row.live?.counterValue,row.unit);}
   add('storage.series.'+prefix+'.today',row.periods?.day?.value,row.unit);
  }
  if(fresh(heating?.ts)&&heating?.enabled){
   add('storage.series.heating.meanC',heating.meanC,'°C');add('storage.series.heating.outdoorC',heating.outdoorC,'°C');
   for(const room of heating.rooms||[])if(room?.enabled&&room.valid&&/^[a-zA-Z0-9_-]{1,64}$/.test(room.id||''))add('storage.series.heating.rooms.'+room.id+'.temperatureC',room.valueC,'°C',room.name||room.id);
  }
  return points;
 }
 async ensure(points){
  for(const point of points){const id=point.id.slice(this.adapter.namespace.length+1);if(!['storage.series.','storage.checkpointChunks.','storage.checkpointManifest_JSON'].some(prefix=>id.startsWith(prefix))||this.known.has(id))continue;
   const text=typeof point.state.val==='string';await this.adapter.setObjectNotExistsAsync(id,{type:'state',common:{name:point.meta?.label||id,type:text?'string':'number',role:text?'text':'value',read:true,write:false,...(point.meta?.unit?{unit:point.meta.unit}:{})},native:{}});this.known.add(id);
  }
 }
 async store(instance,points){
  if(!points.length)return;
  const batches=[];let batch=[];
  for(const {id,state}of points){const point={id,state};if(Buffer.byteLength(JSON.stringify([point]))>MAX_BATCH_BYTES)throw Error('Datenbankeintrag überschreitet die sichere Schreibgröße.');
   if(batch.length&&(batch.length>=MAX_BATCH_POINTS||Buffer.byteLength(JSON.stringify([...batch,point]))>MAX_BATCH_BYTES)){batches.push(batch);batch=[];}batch.push(point);
  }if(batch.length)batches.push(batch);
  for(const batch of batches){if(this.closed||this.adapter.dataBusy||this.adapter.restoreHold)throw Object.assign(Error('Datenbankarchivierung für die Datensicherung angehalten.'),{paused:true});const response=await this.send(instance,'storeState',batch,{write:true,label:'Schreiben'});
   if(response?.success!==true||response.connected===false||finite(response.successCount)&&response.successCount!==batch.length)throw Error('Die Datenbank hat die Speicherung nicht vollständig bestätigt.');
  }
 }
 async verify(instance,points){
  const verified=[];
  for(const point of points){if(this.closed||this.adapter.dataBusy||this.adapter.restoreHold)throw Object.assign(Error('Datenbankprüfung für die Datensicherung angehalten.'),{paused:true});
   const result=instance.startsWith('influxdb.')?await this.send(instance,'getRawEntries',{id:point.id,start:point.state.ts,end:point.state.ts,limit:2,offset:0,sort:'desc'},{write:true,label:'Prüfen der gespeicherten Werte'}):await this.send(instance,'getHistory',{id:point.id,options:{start:point.state.ts,end:point.state.ts+1,count:2,limit:2,aggregate:'none',removeBorderValues:true}},{write:true,label:'Prüfen der gespeicherten Werte'});
   const rows=Array.isArray(result)?result:result?.result;if(!Array.isArray(rows))throw Error('Die Datenbank hat keine gespeicherten Werte zur Prüfung geliefert.');
   const row=rows.find(row=>{const value=row?.val??row?.value,expected=point.state.val;return row?.ts===point.state.ts&&(row.id===undefined||row.id===point.id)&&(typeof expected==='number'?finite(value)&&Math.abs(value-expected)<=Math.max(1,Math.abs(expected))*1e-9:value===expected);});
   if(!row)throw Error('Datenbankeintrag noch nicht nachweislich gespeichert: '+point.id);
   verified.push({id:point.id,val:row.val??row.value,ts:row.ts});
  }return verified;
 }
 async checkpoint(now){
  const states={};for(const id of BACKUP_STATE_IDS){const state=await this.adapter.getStateAsync(id);if(state)states[id]=state;}
  const doc=buildBackup({states,namespace:this.adapter.namespace,now});
  return buildCheckpointPoints(doc,this.adapter.namespace,now);
 }
 async write(now,generation){
  const instance=this.config.instance;this.meta.lastAttemptAt=now;await this.persist();
  try{
   await this.target(instance);if(this.closed||generation!==this.generation||this.adapter.dataBusy)return;
   const points=await this.points(now);await this.ensure(points);
   if(this.closed||generation!==this.generation||this.adapter.dataBusy)return;
   if(points.length){await this.store(instance,points);await this.verify(instance,points);this.meta.lastWriteAt=now;}
   if(this.closed||generation!==this.generation||this.adapter.dataBusy)return;
   if(this.meta.lastCheckpointAt===null||now-this.meta.lastCheckpointAt>=HOUR){
    const plan=await this.checkpoint(now);await this.ensure([...plan.chunkPoints,plan.manifestPoint]);await this.store(instance,plan.chunkPoints);
    const rows=await this.verify(instance,plan.chunkPoints);decodeCheckpoint(plan.manifest,rows,{namespace:this.adapter.namespace});
    await this.store(instance,[plan.manifestPoint]);await this.verify(instance,[plan.manifestPoint]);this.meta.lastCheckpointAt=now;
   }
   this.failures=0;this.meta.error='';this.meta.retryAt=null;
  }catch(error){if(generation!==this.generation||error.paused)return;this.failures++;this.meta.error=message(error);this.meta.retryAt=now+Math.min(15*MINUTE,MINUTE*2**Math.min(4,this.failures-1));}
  finally{if(generation===this.generation)await this.persist();}
 }
 tick(now=this.now()){
  if(this.closed||this.adapter.stopping||this.adapter.dataBusy||this.adapter.restoreHold||this.task)return;
  if(this.config.mode==='internal'){if(!this.statusPublished)this.task=this.persist().catch(()=>{}).finally(()=>{this.task=null;});return;}
  if(!Number.isSafeInteger(now)||now<0)return;
  if(this.meta.retryAt!==null&&now<this.meta.retryAt)return;
  if(this.lastScheduledAt!==null&&now>=this.lastScheduledAt&&now-this.lastScheduledAt<MINUTE)return;
  this.lastScheduledAt=now;const generation=this.generation;
  this.task=this.write(now,generation).catch(()=>{}).finally(()=>{this.task=null;});
 }
 async persist(){
  await this.adapter.set('internal.storage',this.runtime(),true);
  const internal=this.config.mode==='internal',status={version:1,updatedAt:this.now(),mode:this.config.mode,instance:this.config.instance,code:internal?'internal':this.meta.error?'error':this.meta.lastWriteAt!==null||this.meta.lastCheckpointAt!==null?'ok':'waiting',lastWriteAt:this.meta.lastWriteAt,lastCheckpointAt:this.meta.lastCheckpointAt,lastAttemptAt:this.meta.lastAttemptAt,retryAt:this.meta.retryAt,error:this.meta.error,
   message:internal?'Einstellungen und erfasste Daten werden intern in ioBroker gespeichert.':this.meta.error?'Datenbank nicht bestätigt. Lokale Archive werden weitergeführt; im externen Detailverlauf können Lücken entstehen.':this.meta.lastCheckpointAt!==null?'Messwerte und vollständiger Sicherungsstand wurden aus der Datenbank zurückgelesen und geprüft.':'Datenbank ausgewählt. Die erste Archivierung erfolgt im nächsten Messzyklus.',
   numericIntervalSeconds:60,checkpointIntervalSeconds:3600,localFallback:true};
  await this.adapter.set('storage.status_JSON',status,true);this.statusPublished=true;return status;
 }
 async flush(){await this.queue.catch(()=>{});if(this.task)await this.task;await this.persist();}
 async close({persist=true}={}){this.closed=true;this.generation++;await this.queue.catch(()=>{});if(this.task)await this.task;if(persist)await this.persist();}
}
module.exports={StorageService,defaultStorageConfig,normalizeStorageConfig,validateStorageRuntime};
