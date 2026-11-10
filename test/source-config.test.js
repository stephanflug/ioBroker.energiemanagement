'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ConsumerSourceConfig}=require('../lib/source-config');
const {normalizeConsumers}=require('../lib/normalize');
function fixture(){
 const config=normalizeConsumers({master:true,maxParallel:2,devices:[{id:'dryer',name:'Trockner',enabled:true,maxW:2000,measuredW:'old.0.power',statusId:'old.0.status',output:{armed:true,enableId:'actor.0.enable'}},{id:'washer',name:'Waschmaschine',maxW:1200}]});
 const objects=new Map(),writes=[];let stored=structuredClone(config),created=0,conflict=false;
 const adapter={config:{maxConsumers:250},consumers:config,sources:{},heating:{config:{},validateConflicts:()=>{if(conflict)throw Error('Heizungs-Ausgang bereits als Energiequelle verwendet');}},read:async()=>JSON.stringify(stored),set:async(id,value)=>{writes.push({id,value});stored=structuredClone(value);},createConsumers:async()=>{created++;},getForeignObjectAsync:async id=>objects.get(id)};
 const service=new ConsumerSourceConfig(adapter);
 const add=(id,type='number',props={})=>objects.set(id,{_id:id,type:'state',common:{read:true,type,...props}});
 return {service,adapter,objects,writes,add,get stored(){return stored;},set stored(value){stored=normalizeConsumers(value);},get created(){return created;},set conflict(value){conflict=value;}};
}
test('source saves merge only measurement IDs and preserve all other configuration and devices',async()=>{
 const f=fixture();f.add('meter.0.power');f.add('meter.0.status','boolean');const before=f.stored;
 const result=await f.service.configure({master:false,devices:[{id:'dryer',measuredW:' meter.0.power ',statusId:'meter.0.status',name:'Attack',output:{armed:false}}]});
 assert.deepEqual(result,{...before,devices:[{...before.devices[0],measuredW:'meter.0.power',statusId:'meter.0.status'},before.devices[1]]});
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].id,'config.consumers');assert.equal(f.adapter.consumers,result);assert.equal(f.created,1);
});
test('invalid, own, administrative, unreadable and wrong type sources reject the whole patch',async()=>{
 for(const [id,type,props]of [['system.adapter.host','number',{}],['energiemanagement.1.live.houseW','number',{}],['bad id','number',{}],['meter.0.text','string',{}],['meter.0.hidden','number',{read:false}],['meter.0.channel','number',{}]]){
  const f=fixture();f.add('meter.0.ok');f.add(id,type,props);if(id.endsWith('channel'))f.objects.get(id).type='channel';const before=f.stored;
  await assert.rejects(()=>f.service.configure({devices:[{id:'washer',measuredW:'meter.0.ok'},{id:'dryer',measuredW:id}]}));assert.equal(f.writes.length,0);assert.deepEqual(f.stored,before);
 }
 const f=fixture();f.add('meter.0.numericStatus');await assert.rejects(()=>f.service.configure({devices:[{id:'dryer',statusId:'meter.0.numericStatus'}]}),/Boolean/);assert.equal(f.writes.length,0);
});
test('malformed and stale consumer rows cannot create, remove or duplicate consumers',async()=>{
 const f=fixture();for(const request of [{},{devices:{}},{devices:[{id:'unknown',measuredW:''}]},{devices:[{id:'dryer'},{id:'dryer'}]},{devices:[{id:'dryer',measuredW:null}]}])await assert.rejects(()=>f.service.configure(request));assert.equal(f.writes.length,0);
});
test('source fields can be cleared independently and heating conflicts reject before storage',async()=>{
 const f=fixture();const result=await f.service.configure({devices:[{id:'dryer',measuredW:''}]});assert.equal(result.devices[0].measuredW,'');assert.equal(result.devices[0].statusId,'old.0.status');
 f.conflict=true;await assert.rejects(()=>f.service.configure({devices:[{id:'dryer',statusId:''}]}),/Heizungs/);assert.equal(f.writes.length,1);
});
test('source validation preserves more recent device and output edits made while awaiting metadata',async()=>{
 const f=fixture();f.add('meter.0.power');f.adapter.getForeignObjectAsync=async id=>{f.stored={...f.stored,master:false,devices:f.stored.devices.map(device=>device.id==='dryer'?{...device,name:'Neu',priority:4,output:{...device.output,armed:false,enableId:'actor.0.new'}}:device)};return f.objects.get(id);};
 const result=await f.service.configure({devices:[{id:'dryer',measuredW:'meter.0.power'}]});assert.equal(result.master,false);assert.equal(result.devices[0].name,'Neu');assert.equal(result.devices[0].priority,4);assert.equal(result.devices[0].output.enableId,'actor.0.new');assert.equal(result.devices[0].output.armed,false);
});
test('busy guard prevents a pending source command from committing into a backup transaction',async()=>{
 const f=fixture();f.add('meter.0.power');f.adapter.getForeignObjectAsync=async id=>{f.adapter.dataBusy=true;return f.objects.get(id);};await assert.rejects(()=>f.service.configure({devices:[{id:'dryer',measuredW:'meter.0.power'}]}),/Datensicherung/);assert.equal(f.writes.length,0);
 f.adapter.dataBusy=false;await f.service.configure({devices:[{id:'dryer',measuredW:''}]});assert.equal(f.writes.length,1);
});
test('queued source saves read the preceding result rather than clobbering it',async()=>{
 const f=fixture();f.add('meter.0.power');f.add('meter.0.status','boolean');await Promise.all([f.service.configure({devices:[{id:'dryer',measuredW:'meter.0.power'}]}),f.service.configure({devices:[{id:'dryer',statusId:'meter.0.status'}]})]);assert.equal(f.stored.devices[0].measuredW,'meter.0.power');assert.equal(f.stored.devices[0].statusId,'meter.0.status');
});
