'use strict';
const {defaultHeating,normalizeHeating,HeatingEngine}=require('./heating');
const {HeatingOutputs}=require('./heating-outputs');
const {normalizeUnit,isCelsiusUnit}=require('./heating-units');
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const forbidden=id=>id.startsWith('system.')||id.startsWith('alias.');
// Compact source identity keeps a changed room mapping out of the old sensor's curve.
// Keep this FNV-1a implementation in sync with www/heating-trend.js.
function historyHash(value){let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return (hash>>>0).toString(16).padStart(8,'0');}
const roomSeriesKey=room=>room.id+'@'+historyHash(room.stateId);
class HeatingService {
 constructor(adapter,raw=defaultHeating(),runtime={},outputRuntime={},history=[]){
  this.adapter=adapter;this.engine=new HeatingEngine(runtime);this.config=this.engine.configure(raw);
  this.outputs=new HeatingOutputs(adapter,outputRuntime);this.history=Array.isArray(history)?history.filter(x=>finite(x?.ts)).slice(-2880):[];
  this.queue=Promise.resolve();this.closed=false;this.lastSave=0;this.lastHistory=this.history.at(-1)?.ts||0;this.catalog=null;
 }
 serial(fn){const next=this.queue.catch(()=>{}).then(fn);this.queue=next;return next;}
 inputIds(config=this.config){return [...new Set([...config.rooms.filter(x=>x.enabled).map(x=>x.stateId),config.outdoorId,config.pump.statusId,config.pump.powerId,config.pv.floorId].filter(Boolean))];}
 outputIds(config=this.config){return [config.pump.lockId,...config.circuits.map(x=>x.setpointId)].filter(Boolean);}
 validateConflicts(config,consumers=this.adapter.consumers,sources=this.adapter.sources){
  const heatingOut=this.outputIds(config),heatingIn=this.inputIds(config);
  const energyOut=(consumers?.devices||[]).flatMap(d=>[d.output?.enableId,d.output?.powerId]).filter(Boolean);
  const energyIn=[...(consumers?.devices||[]).flatMap(d=>[d.measuredW,d.statusId]),...Object.entries(sources||{}).flatMap(([k,v])=>k==='pv'?(v||[]).map(x=>x.id):[v?.id])].filter(Boolean);
  for(const id of heatingOut){if(forbidden(id)||id.startsWith(this.adapter.namespace+'.'))throw Error('Unzulässiger Heizungs-Ausgang: '+id);if(energyOut.includes(id)||energyIn.includes(id))throw Error('Heizungs-Ausgang bereits als Energiequelle oder Verbraucher verwendet: '+id);}
  for(const id of energyOut)if(heatingIn.includes(id))throw Error('Ein Heizungsfühler darf nicht zugleich Verbraucher-Ausgang sein: '+id);
 }
 async validateMappings(config){
  this.validateConflicts(config);
  if(!config.enabled)return;
  const check=async(id,type,write=false,unit='')=>{
   if(!id)return;
   const obj=await this.adapter.getForeignObjectAsync(id);
   if(obj?.type!=='state'||obj.common?.type!==type||obj.common?.read===false)throw Error('Kein lesbarer '+type+'-Datenpunkt: '+id);
   if(write&&(obj.common.write!==true||obj.common.read!==true||obj.common.alias))throw Error('Heizungs-Ausgang ist nicht direkt les- und beschreibbar: '+id);
   const u=normalizeUnit(obj.common.unit);
   if(unit==='C'&&!isCelsiusUnit(obj.common.unit))throw Error('Temperatur muss in °C vorliegen: '+id);
   if(unit==='W'&&u&&u!=='w')throw Error('Wärmepumpenleistung muss in W vorliegen: '+id);
  };
  for(const room of config.rooms.filter(r=>r.enabled))await check(room.stateId,'number',false,'C');
  await check(config.outdoorId,'number',false,'C');await check(config.pv.floorId,'number',false,'C');
  await check(config.pump.statusId,'boolean');await check(config.pump.powerId,'number',false,'W');
  await check(config.pump.lockId,'boolean',true);
  for(const circle of config.circuits)await check(circle.setpointId,'number',true,'C');
 }
 configure(raw){return this.serial(async()=>{
  if(this.closed)throw Error('Heizungsmodul wird beendet.');
  const config=normalizeHeating(raw);await this.validateMappings(config);
  if(JSON.stringify(config)!==JSON.stringify(this.config)){
   const report=await this.outputs.release('Heizungskonfiguration geändert');await this.adapter.set('heating.hardware',report);
   this.config=this.engine.configure(config);
  }
  await this.adapter.set('config.heating',config,true);await this.adapter.set('heating.error','',true);
  await this.adapter.set('heating.status',{ts:Date.now(),enabled:config.enabled,mode:config.mode,ready:false,action:config.enabled?'checking':'disabled',reason:config.enabled?'Neue Einstellungen gespeichert. Frische Messwerte werden geprüft.':'Heizungsmodul deaktiviert.',rooms:[],circuits:[],pv:{active:false},learning:{}});
  await this.persist(true);return this.config;
 });}
 async readings(){
  if(!this.config.enabled)return {};
  const entries=await Promise.all(this.inputIds().map(async id=>{
   try{const s=await this.adapter.getForeignStateAsync(id);return [id,s&&s.ack===true&&(s.q===undefined||s.q===0)?{value:s.val,ts:s.ts}:null];}catch{return [id,null];}
  }));return Object.fromEntries(entries);
 }
 tick(now,live){return this.serial(async()=>{
  if(this.closed)return;
  try{
   const readings=await this.readings();if(this.closed)return;
   const status=this.engine.sample(now,readings,{...live,hasBattery:!!this.adapter.sources?.batteryW?.id});
   const hardware=await this.outputs.apply(now,this.config,status);
   await this.adapter.set('heating.status',status);await this.adapter.set('heating.message',status.reason||'');
   await this.adapter.set('heating.hardware',hardware);await this.adapter.set('heating.error',hardware.errors.map(e=>e.message).join('; ').slice(0,1000));
   const age=now-this.lastHistory;
   if(this.config.enabled&&(age>=60000||age<0)){
    const rooms=status.rooms.filter(room=>room.enabled);
    const roomValues=Object.fromEntries(rooms.map(room=>[roomSeriesKey(room),room.valid&&finite(room.valueC)?room.valueC:null]));
    // A different valid-room composition or weighting must also break the average.
    const roomSignature=historyHash(JSON.stringify(rooms.filter(room=>room.valid).map(room=>[room.id,room.stateId,room.weight]).sort((a,b)=>a[0].localeCompare(b[0]))));
    this.history.push({ts:now,meanC:status.meanC,outdoorC:status.outdoorC,targetC:status.targetMeanC,action:status.action,pvBoostC:status.pv?.active?status.pv.boostC:0,pumpRunning:status.pump?.running??null,floorC:finite(status.pv?.floorC)?status.pv.floorC:null,roomValues,roomSignature});
    this.history=this.history.filter(x=>x.ts>now-48*3600000&&x.ts<=now).slice(-2880);this.lastHistory=now;
    await this.adapter.set('heating.history',this.history);
   }
   await this.persist(now-this.lastSave>=60000||now<this.lastSave,now);
  }catch(e){
   const message=String(e.message||e);const hardware=await this.outputs.release('Auswertung fehlerhaft');
   await this.adapter.set('heating.error',message);await this.adapter.set('heating.hardware',hardware);
   await this.adapter.set('heating.status',{ts:now,enabled:this.config.enabled,mode:this.config.mode,ready:false,hardwareAllowed:false,pumpLock:false,action:'error',reason:message,rooms:[],circuits:[],pv:{active:false},learning:{}});
   await this.persist(true,now);
  }
 });}
 async persist(force=false,now=Date.now()){
  await this.adapter.set('internal.heatingOutputs',this.outputs.runtime());
  if(force){await this.adapter.set('internal.heatingLearning',this.engine.runtime());await this.adapter.set('heating.history',this.history);this.lastSave=now;}
 }
 resetLearning(){return this.serial(async()=>{
  const hardware=await this.outputs.release('Lernmodell zurückgesetzt');await this.adapter.set('heating.hardware',hardware);
  this.engine=new HeatingEngine();this.engine.configure(this.config);await this.persist(true);
 });}
 close(){this.closed=true;return this.serial(async()=>{await this.adapter.set('heating.hardware',await this.outputs.release('Adapter beendet'));await this.persist(true);});}
 async objects(request={}){
  const query=typeof request.query==='string'?request.query.trim().toLocaleLowerCase('de').slice(0,100):'',type=request.type==='boolean'?'boolean':'number',write=request.write===true;
  if(!this.catalog||Date.now()-this.catalog.ts>60000)this.catalog={ts:Date.now(),objects:await this.adapter.getForeignObjectsAsync('*','state')};
  const name=o=>typeof o.common?.name==='object'?(o.common.name.de||o.common.name.en||''):String(o.common?.name||'');
  const list=Object.values(this.catalog.objects||{}).filter(o=>o?.type==='state'&&o.common?.type===type&&o.common.read!==false&&!o._id.startsWith('system.')&&!o._id.startsWith(this.adapter.namespace+'.')&&(!write||!forbidden(o._id)&&o.common.write===true&&o.common.read===true&&!o.common.alias)&&(!query||(o._id+' '+name(o)).toLocaleLowerCase('de').includes(query)))
   .sort((a,b)=>{const score=o=>(String(o.common.role||'').includes('temperature')?1:0)+(name(o).toLowerCase().includes('raum')?1:0);return score(b)-score(a)||name(a).localeCompare(name(b),'de');}).slice(0,30);
  return Promise.all(list.map(async o=>{let s;try{s=await this.adapter.getForeignStateAsync(o._id)}catch{}return {id:o._id,name:name(o),type:o.common.type,unit:o.common.unit||'',write:o.common.write===true,value:s?.val??null,ts:s?.ts??null};}));
 }
}
module.exports={HeatingService,roomSeriesKey};
