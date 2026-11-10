'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {StorageService,defaultStorageConfig,normalizeStorageConfig,validateStorageRuntime}=require('../lib/storage-service');
const {REQUIRED_IDS}=require('../lib/backup');
const {decodeCheckpoint}=require('../lib/storage-checkpoint');
const {defaultSources,defaultConsumers}=require('../lib/normalize');
const {defaultHeating}=require('../lib/heating'),{defaultForecast}=require('../lib/forecast');
const {defaultStoredUtilities,defaultFeatures}=require('../lib/utilities-service');
const NOW=Date.UTC(2026,10,9,15),NS='energiemanagement.0',DATABASE={mode:'database',instance:'influxdb.0'},MANIFEST=NS+'.storage.checkpointManifest_JSON';
const clone=value=>structuredClone(value),isChunk=id=>id.startsWith(NS+'.storage.checkpointChunks.');
function fixture(){
 let now=NOW,responder=null;
 const states=new Map(REQUIRED_IDS.map(id=>[id,{val:['config.hardwareMaster','migration.done'].includes(id)?false:['history.intervals','history.power','heating.history'].includes(id)?'[]':'{}',ack:true,ts:now}]));
 const values={'config.sources':defaultSources(),'config.consumers':defaultConsumers(),'config.settings':{targetW:9500,reserveW:500,minCoveragePct:85},'config.forecast':defaultForecast(),'config.heating':defaultHeating(),'config.energySummary_JSON':{monthlyPvTargetKWh:0},'config.features_JSON':defaultFeatures(),'config.utilities_JSON':defaultStoredUtilities(),'analytics.consumerDays_JSON':{version:1,days:{}},'live.snapshot':{ts:now,values:{houseW:700,pvW:1000,importW:0,exportW:300,batteryW:-200,importKWh:123,exportKWh:null}},'control.summary':[{id:'washer',name:'Waschmaschine',measuredW:0},{id:'absent',measuredW:null}],'analytics.utilities_JSON':{updatedAt:now,water:{enabled:true,status:'ok',unit:'m³',live:{flowPerHour:0,counterValue:15},periods:{day:{value:.3}}},rainwater:{enabled:false,status:'disabled',unit:'m³',live:{flowPerHour:5,counterValue:100},periods:{day:{value:3}}}},'heating.status':{ts:now,enabled:true,meanC:21,outdoorC:4,rooms:[{id:'living',name:'Wohnzimmer',enabled:true,valid:true,valueC:21.5},{id:'invalid',enabled:true,valid:false,valueC:0}]}};
 for(const [id,value]of Object.entries(values))states.set(id,{val:JSON.stringify(value),ack:true,ts:now});
 const objects={
  'system.adapter.influxdb.0':{_id:'system.adapter.influxdb.0',type:'instance',common:{name:'influxdb',version:'5.1.8',enabled:true},native:{password:'do-not-expose'}},
  'system.adapter.sql.1':{_id:'system.adapter.sql.1',type:'instance',common:{name:'sql',enabled:false}},
  'system.adapter.history.0':{_id:'system.adapter.history.0',type:'instance',common:{name:'history',enabled:true}},
  'system.adapter.admin.0':{_id:'system.adapter.admin.0',type:'instance',common:{name:'influxdb',enabled:true}},
  'system.adapter.influxdb.2.bad':{_id:'system.adapter.influxdb.2.bad',type:'instance',common:{enabled:true}}
 };
 const foreign={'system.adapter.influxdb.0.alive':{val:true},'influxdb.0.info.connection':{val:true},'system.adapter.sql.1.alive':{val:false},'system.adapter.history.0.alive':{val:true}};
 const calls=[],created=[],sets=[],durable=new Map(),key=(instance,id,ts)=>instance+'|'+id+'|'+ts;
 function rows(instance,id,start,end,limit=10){return [...durable.values()].filter(row=>row.instance===instance&&row.id===id&&row.state.ts>=(start??0)&&row.state.ts<=(end??Infinity)).sort((a,b)=>b.state.ts-a.state.ts).slice(0,limit).map(row=>clone(row.state));}
 function defaultReply(instance,command,payload,callback){
  if(command==='storeState'){for(const point of payload)durable.set(key(instance,point.id,point.state.ts),{instance,id:point.id,state:clone(point.state)});callback({success:true,successCount:payload.length,connected:true});}
  else if(command==='getRawEntries')callback({id:payload.id,result:rows(instance,payload.id,payload.start,payload.end,payload.limit),total:rows(instance,payload.id,payload.start,payload.end,Infinity).length});
  else if(command==='getHistory')callback({result:rows(instance,payload.id,payload.options?.start,payload.options?.end,payload.options?.limit),error:null});
  else if(command==='flushBuffer')callback(payload?.id?{error:null}:{error:'Global buffer flush is forbidden.'});
  else callback({error:'Unsupported provider command '+command});
 }
 const adapter={namespace:NS,dataBusy:false,restoreHold:false,stopping:false,
  async set(id,value){sets.push({id,value:clone(value)});states.set(id,{val:typeof value==='object'?JSON.stringify(value):value,ack:true,ts:now});},
  async getStateAsync(id){return clone(states.get(id)||null);},async getForeignObjectsAsync(pattern,type){calls.push({kind:'objects',pattern,type});return clone(objects);},async getForeignStateAsync(id){calls.push({kind:'foreign',id});return clone(foreign[id]||null);},
  async setObjectNotExistsAsync(id,object){created.push({id,object:clone(object)});},
  sendTo(instance,command,payload,callback){calls.push({kind:'send',instance,command,payload:clone(payload)});if(responder)return responder(instance,command,payload,callback,defaultReply);defaultReply(instance,command,payload,callback);}
 };
 return {adapter,states,calls,created,sets,foreign,objects,durable,defaultReply,now:()=>now,advance:ms=>{now+=ms;},respond:fn=>{responder=fn;},read:id=>JSON.parse(states.get(id).val),stored:(id,ts=now,instance='influxdb.0')=>clone(durable.get(key(instance,id,ts))?.state)};
}
function service(f,config=defaultStorageConfig(),runtime={}){return new StorageService(f.adapter,config,runtime,{now:f.now,timeoutMs:10});}
async function run(s,f){s.tick(f.now());await s.flush();}
const sends=f=>f.calls.filter(row=>row.kind==='send'),stores=f=>sends(f).filter(row=>row.command==='storeState'),points=f=>stores(f).flatMap(row=>row.payload),manifests=f=>points(f).filter(point=>point.id===MANIFEST);

test('storage choices are strict and default internal never contacts a foreign service',async()=>{
 assert.deepEqual(normalizeStorageConfig({}),defaultStorageConfig());
 for(const value of [null,[],{mode:'other'},{mode:'database',instance:'admin.0'},{mode:'database',instance:'influxdb.0.extra'},{mode:'internal',instance:'sql.0'},{mode:'internal',password:'secret'}])assert.throws(()=>normalizeStorageConfig(value));
 const f=fixture(),s=service(f);assert.equal((await s.test()).internal,true);await run(s,f);assert.deepEqual(f.calls,[]);assert.equal(f.read('storage.status_JSON').code,'internal');assert.equal(f.created.length,0);
});
test('database discovery returns only installed supported instances and public metadata',async()=>{
 const f=fixture(),instances=await service(f).instances();assert.deepEqual(instances.map(row=>row.id),['history.0','influxdb.0','sql.1']);
 assert.equal(instances.find(row=>row.id==='influxdb.0').available,true);assert.equal(instances.find(row=>row.id==='history.0').available,true);assert.equal(instances.find(row=>row.id==='sql.1').available,false);assert.ok(!JSON.stringify(instances).includes('password'));assert.ok(!JSON.stringify(instances).includes('do-not-expose'));
});
test('selecting a database tests reads without writes and rejects missing or failed targets atomically',async()=>{
 const f=fixture(),s=service(f);await assert.rejects(()=>s.configure({mode:'database',instance:'sql.99'}),/nicht vorhanden/);await assert.rejects(()=>s.configure({mode:'database',instance:'sql.1'}),/nicht gestartet/);
 await s.configure(DATABASE);assert.deepEqual(s.config,DATABASE);assert.ok(sends(f).every(row=>row.command==='getHistory'));assert.deepEqual(f.read('config.storage_JSON'),s.config);
 f.respond((instance,command,payload,callback)=>callback({error:'query failed'}));await assert.rejects(()=>s.configure({mode:'database',instance:'history.0'}),/query failed/);assert.equal(s.config.instance,'influxdb.0');assert.equal(f.read('config.storage_JSON').instance,'influxdb.0');
});
test('native measurements and chunked full snapshots require persisted readback before confirmation',async()=>{
 const f=fixture(),s=service(f);await s.configure(DATABASE);s.tick(f.now());assert.ok(s.task);await s.flush();
 const all=points(f),numeric=all.filter(point=>typeof point.state.val==='number');
 for(const [id,value]of [['live.importW',0],['live.batteryW',-200],['storage.series.devices.washer.powerW',0],['storage.series.water.flowPerHour',0]])assert.ok(numeric.some(point=>point.id===NS+'.'+id&&point.state.val===value));
 assert.ok(numeric.every(point=>Number.isFinite(point.state.val)&&point.state.ts===NOW&&point.state.ack===true));assert.ok(!numeric.some(point=>/rainwater|absent|invalid/.test(point.id)));assert.ok(all.every(point=>point.id.startsWith(NS+'.')));assert.ok(f.created.every(row=>row.id.startsWith('storage.')&&row.object.common.write===false));
 const manifest=f.stored(MANIFEST);assert.ok(manifest);const chunks=all.filter(point=>isChunk(point.id)).map(point=>({id:point.id,...f.stored(point.id)})),doc=decodeCheckpoint({id:MANIFEST,...manifest},chunks,{namespace:NS});
 assert.equal(doc.namespace,NS);assert.equal(JSON.parse(doc.states['config.storage_JSON'].val).instance,'influxdb.0');assert.ok(doc.states['internal.fuelInventory']);assert.ok(doc.states['config.heating']);assert.ok(!all.some(point=>point.id===NS+'.storage.checkpoint_JSON'));
 const commit=f.calls.findIndex(row=>row.kind==='send'&&row.command==='storeState'&&row.payload.some(point=>point.id===MANIFEST));
 for(const point of all.filter(point=>isChunk(point.id)))assert.ok(f.calls.findIndex(row=>row.kind==='send'&&row.command==='getRawEntries'&&row.payload.id===point.id)<commit);
 assert.ok(sends(f).every(row=>row.command!=='flushBuffer'));assert.equal(s.runtime().lastWriteAt,NOW);assert.equal(s.runtime().lastCheckpointAt,NOW);assert.equal(s.runtime().verificationVersion,2);assert.equal(f.read('storage.status_JSON').code,'ok');
});
test('second-minute writes do not resend checkpoints and stale measurements are not replayed hourly',async()=>{
 const f=fixture(),s=service(f);await s.configure(DATABASE);await run(s,f);const first=f.calls.length;f.advance(30000);await run(s,f);assert.equal(f.calls.length,first);
 f.advance(30000);await run(s,f);assert.equal(manifests(f).length,1);assert.ok(points(f).some(point=>typeof point.state.val==='number'&&point.state.ts===f.now()));
 f.advance(3600000);await run(s,f);assert.equal(manifests(f).length,2);const final=points(f).filter(point=>point.state.ts===f.now());assert.ok(final.length>0);assert.ok(final.every(point=>typeof point.state.val==='string'));
});
test('offline writes retain local archives and retry only after durable database reads recover',async()=>{
 const f=fixture(),s=service(f);await s.configure(DATABASE);const previous=f.states.get('internal.fuelInventory').val;
 f.respond((instance,command,payload,callback)=>callback(command==='storeState'?{success:true,successCount:payload.length,connected:false}:{result:[]}));await run(s,f);assert.equal(s.runtime().lastWriteAt,null);assert.equal(s.runtime().lastCheckpointAt,null);assert.equal(s.runtime().retryAt,NOW+60000);assert.equal(f.read('storage.status_JSON').code,'error');assert.equal(f.states.get('internal.fuelInventory').val,previous);const count=f.calls.length;f.advance(59000);await run(s,f);assert.equal(f.calls.length,count);
 f.advance(1000);f.respond(null);await run(s,f);assert.equal(s.runtime().error,'');assert.equal(s.runtime().lastCheckpointAt,f.now());assert.equal(f.read('storage.status_JSON').code,'ok');
});
test('timeouts and partial acceptance report errors without rejecting the energy tick',async()=>{
 const f=fixture(),s=service(f);await s.configure(DATABASE);f.respond(()=>{});assert.equal(s.tick(f.now()),undefined);await s.flush();assert.match(s.runtime().error,/nicht rechtzeitig|Zeitüberschreitung|Timeout/i);assert.equal(s.runtime().lastWriteAt,null);
 f.advance(60000);f.respond((instance,command,payload,callback)=>callback({success:true,successCount:0,connected:true}));await run(s,f);assert.match(s.runtime().error,/nicht vollständig bestätigt/);assert.equal(s.runtime().lastCheckpointAt,null);
});
test('buffer acceptance without persisted data cannot confirm measurements or a full snapshot',async()=>{
 const f=fixture(),s=service(f);await s.configure(DATABASE);f.respond((instance,command,payload,callback,reply)=>command==='storeState'?callback({success:true,successCount:payload.length,connected:true}):reply(instance,command,payload,callback));
 await run(s,f);assert.equal(s.runtime().lastWriteAt,null);assert.equal(s.runtime().lastCheckpointAt,null);assert.equal(f.read('storage.status_JSON').code,'error');assert.equal(manifests(f).length,0);assert.ok(sends(f).some(row=>row.command==='getRawEntries'));
});
test('readback must match timestamp and value rather than merely return an older record',async()=>{
 for(const mutate of [row=>({...row,ts:row.ts-1}),row=>({...row,val:row.val+1})]){
  const f=fixture(),s=service(f);await s.configure(DATABASE);f.respond((instance,command,payload,callback,reply)=>reply(instance,command,payload,result=>callback(command==='getRawEntries'?{...result,result:result.result.map(mutate)}:result)));
  await run(s,f);assert.equal(s.runtime().lastWriteAt,null);assert.equal(s.runtime().lastCheckpointAt,null);assert.equal(manifests(f).length,0);
 }
});
test('missing or mixed-generation chunks cannot publish a committed checkpoint manifest',async()=>{
 for(const mode of ['missing','mixed']){
  const f=fixture(),s=service(f);await s.configure(DATABASE);
  f.respond((instance,command,payload,callback,reply)=>reply(instance,command,payload,result=>{if(command==='getRawEntries'&&isChunk(payload.id))result={...result,result:mode==='missing'?[]:result.result.map(row=>({...row,val:JSON.stringify({...JSON.parse(row.val),snapshotId:'0'.repeat(32)})}))};callback(result);}));
  await run(s,f);assert.equal(s.runtime().lastWriteAt,NOW);assert.equal(s.runtime().lastCheckpointAt,null);assert.equal(manifests(f).length,0);assert.equal(f.read('storage.status_JSON').code,'error');
 }
});
test('an unreadable committed manifest does not advance the full snapshot confirmation',async()=>{
 const f=fixture(),s=service(f);await s.configure(DATABASE);f.respond((instance,command,payload,callback,reply)=>reply(instance,command,payload,result=>callback(command==='getRawEntries'&&payload.id===MANIFEST?{...result,result:[]}:result)));
 await run(s,f);assert.equal(s.runtime().lastWriteAt,NOW);assert.equal(manifests(f).length,1);assert.equal(s.runtime().lastCheckpointAt,null);assert.equal(f.read('storage.status_JSON').code,'error');
});
test('large snapshots use small chunks and every write request respects byte and point limits',async()=>{
 const f=fixture(),s=service(f),text=Array.from({length:36000},(_,index)=>crypto.createHash('sha256').update(String(index)).digest('hex')).join('');assert.ok(Buffer.byteLength(text)>2*1024*1024);f.states.set('migration.report',{val:JSON.stringify({text}),ack:true,ts:NOW});
 await s.configure(DATABASE);await run(s,f);assert.equal(s.runtime().lastCheckpointAt,NOW);assert.ok(points(f).filter(point=>isChunk(point.id)).length>3);
 for(const call of stores(f)){assert.ok(call.payload.length<=10);assert.ok(Buffer.byteLength(JSON.stringify(call.payload))<=64*1024);}
 const manifest=f.stored(MANIFEST),chunks=points(f).filter(point=>isChunk(point.id)).map(point=>({id:point.id,...f.stored(point.id)}));assert.equal(JSON.parse(decodeCheckpoint({id:MANIFEST,...manifest},chunks).states['migration.report'].val).text,text);
 const g=fixture(),fresh=service(g,DATABASE);await assert.rejects(()=>fresh.store('influxdb.0',[{id:NS+'.storage.checkpointChunks.0000',state:{val:'x'.repeat(65536),ts:NOW,ack:true}}]),/groß|Größe|Grenze|64|limit/i);assert.equal(sends(g).length,0);
});
test('legacy acceptance-only timestamps reset while version-two verified timestamps survive a restart',()=>{
 const f=fixture(),legacy={version:1,configKey:'database:influxdb.0',lastWriteAt:NOW,lastCheckpointAt:NOW,lastAttemptAt:NOW,retryAt:null,error:''};validateStorageRuntime(legacy);
 const old=service(f,DATABASE,legacy);assert.equal(old.runtime().lastWriteAt,null);assert.equal(old.runtime().lastCheckpointAt,null);
 const verified=service(f,DATABASE,{...legacy,verificationVersion:2});assert.equal(verified.runtime().lastWriteAt,NOW);assert.equal(verified.runtime().lastCheckpointAt,NOW);validateStorageRuntime(verified.runtime());
});
test('restore holds and malicious future metadata cannot suppress legitimate archival',async()=>{
 const f=fixture(),s=service(f,DATABASE,{version:1,verificationVersion:2,configKey:'database:influxdb.0',lastWriteAt:NOW+864000000,lastCheckpointAt:NOW+864000000,lastAttemptAt:NOW+864000000,retryAt:NOW+864000000,error:''});f.adapter.dataBusy=true;s.tick(f.now());await assert.rejects(()=>s.configure(defaultStorageConfig()),/Wiederherstellung/);assert.deepEqual(f.calls,[]);f.adapter.dataBusy=false;f.adapter.restoreHold=true;s.tick(f.now());assert.deepEqual(f.calls,[]);f.adapter.restoreHold=false;await run(s,f);assert.equal(s.runtime().lastWriteAt,NOW);assert.equal(s.runtime().lastCheckpointAt,NOW);
 for(const raw of [null,[],{version:2},{version:1,configKey:'x',lastWriteAt:-1,lastCheckpointAt:null,lastAttemptAt:null,retryAt:null,error:''}])assert.throws(()=>validateStorageRuntime(raw));validateStorageRuntime(s.runtime());
});
test('closing during a read-only connection test cannot commit a newly selected backend',async()=>{
 const f=fixture(),s=service(f);let answer;f.respond((instance,command,payload,callback)=>{answer=callback;});const configure=s.configure(DATABASE);while(!answer)await new Promise(resolve=>setImmediate(resolve));
 const close=s.close();answer({result:[]});await assert.rejects(()=>configure,/beendet/);await close;assert.deepEqual(s.config,defaultStorageConfig());assert.ok(!f.states.has('config.storage_JSON'));assert.ok(sends(f).every(row=>row.command==='getHistory'));
});
test('discarding an old service drains pending writes without overwriting restored metadata',async()=>{
 const f=fixture(),s=service(f);await s.configure(DATABASE);let acknowledge;f.respond((instance,command,payload,callback,reply)=>command==='storeState'?acknowledge=()=>reply(instance,command,payload,callback):reply(instance,command,payload,callback));
 s.tick(f.now());while(!acknowledge)await new Promise(resolve=>setImmediate(resolve));const runtime='{}',status=JSON.stringify({version:1,code:'restored',message:'New service owns this metadata.'});f.states.set('internal.storage',{val:runtime,ack:true,ts:f.now()});f.states.set('storage.status_JSON',{val:status,ack:true,ts:f.now()});
 const count=f.sets.length,close=s.close({persist:false});acknowledge();await close;assert.equal(s.closed,true);assert.equal(s.task,null);assert.equal(f.sets.length,count);assert.equal(f.states.get('internal.storage').val,runtime);assert.equal(f.states.get('storage.status_JSON').val,status);const calls=f.calls.length;s.tick(f.now()+60000);await Promise.resolve();assert.equal(f.calls.length,calls);
});
test('history backends verify this adapter data through the common history read API',async()=>{
 const f=fixture(),s=service(f);await s.configure({mode:'database',instance:'history.0'});await run(s,f);assert.equal(s.runtime().lastWriteAt,NOW);assert.equal(s.runtime().lastCheckpointAt,NOW);assert.ok(sends(f).every(call=>call.command!=='getRawEntries'&&call.command!=='flushBuffer'));assert.ok(sends(f).filter(call=>call.command==='getHistory').every(call=>call.payload.id.startsWith(NS+'.')));
});
