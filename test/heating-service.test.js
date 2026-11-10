'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {HeatingService}=require('../lib/heating-service');
const {defaultHeating}=require('../lib/heating');
const base=Date.UTC(2026,10,8,10);
function fixture(){
 const states=new Map(),objects=new Map(),own=new Map(),writes=[];
 const adapter={namespace:'energiemanagement.0',consumers:{devices:[]},sources:{batteryW:{id:''},pv:[]},set:async(id,value)=>own.set(id,typeof value==='object'?JSON.stringify(value):value),getForeignStateAsync:async id=>states.get(id),getForeignObjectAsync:async id=>objects.get(id),getForeignObjectsAsync:async()=>Object.fromEntries(objects),setForeignStateAsync:async(id,state)=>{writes.push({id,...state});states.set(id,{...state,ts:base,from:'system.adapter.energiemanagement.0'});}};
 function add(id,type,value,write=false,unit=''){objects.set(id,{_id:id,type:'state',common:{name:id,type,read:true,write,unit}});states.set(id,{val:value,ack:true,ts:base,from:'system.adapter.test.0'});}
 add('test.0.room','number',20,false,'°C');add('test.0.outdoor','number',8,false,'°C');add('test.0.setpoint','number',21,true,'°C');
 const service=new HeatingService(adapter);
 const config=defaultHeating();config.enabled=true;config.rooms=[{id:'living',name:'Wohnzimmer',stateId:'test.0.room',targetC:21,weight:1,enabled:true}];config.outdoorId='test.0.outdoor';
 return {service,adapter,states,objects,own,writes,config,add};
}
test('default module neither writes nor invents room data',async()=>{const f=fixture();await f.service.tick(base,{importW:0,exportW:0,batteryW:null});assert.equal(f.writes.length,0);const s=JSON.parse(f.own.get('heating.status'));assert.equal(s.enabled,false);assert.equal(s.meanC,null);await f.service.close();assert.equal(f.writes.length,0);});
test('atomic save rejects wrong units and overlapping energy mappings before changing config',async()=>{const f=fixture();f.objects.get('test.0.room').common.unit='°F';await assert.rejects(()=>f.service.configure(f.config),/°C/);assert.equal(f.service.config.enabled,false);f.objects.get('test.0.room').common.unit='°C';f.adapter.sources.pv=[{id:'test.0.setpoint'}];const c={...f.config,circuits:[{id:'circle',setpointId:'test.0.setpoint',armed:true}]};await assert.rejects(()=>f.service.configure(c),/Energiequelle/);assert.equal(f.writes.length,0);});
test('observational mode records valid room data without a heatpump or output writes',async()=>{const f=fixture();await f.service.configure(f.config);await f.service.tick(base,{importW:0,exportW:3000,batteryW:null});const s=JSON.parse(f.own.get('heating.status'));assert.equal(s.meanC,20);assert.equal(s.ready,true);assert.equal(f.writes.length,0);assert.equal(JSON.parse(f.own.get('heating.history')).length,1);});
test('actual Homematic room ºC and outdoor Grad labels save and retain Celsius observations',async()=>{
 const f=fixture();f.objects.get('test.0.room').common.unit='ºC';f.states.get('test.0.room').val=25.5;
 f.objects.get('test.0.outdoor').common.unit='Grad';
 await f.service.configure(f.config);await f.service.tick(base,{});
 const saved=JSON.parse(f.own.get('config.heating')),status=JSON.parse(f.own.get('heating.status'));
 assert.equal(saved.rooms[0].stateId,'test.0.room');assert.equal(status.meanC,25.5);assert.equal(status.outdoorC,8);assert.equal(status.ready,true);assert.equal(f.writes.length,0);
});
test('Celsius label aliases neither allow string data points nor coerce string readings',async()=>{
 const f=fixture();f.objects.get('test.0.room').common.unit='ºC';f.objects.get('test.0.room').common.type='string';
 await assert.rejects(()=>f.service.configure(f.config),/Kein lesbarer number-Datenpunkt/);assert.equal(f.service.config.enabled,false);
 f.objects.get('test.0.room').common.type='number';await f.service.configure(f.config);f.states.get('test.0.room').val='25.5';
 await f.service.tick(base,{});const status=JSON.parse(f.own.get('heating.status'));
 assert.equal(status.meanC,null);assert.equal(status.ready,false);assert.equal(f.writes.length,0);
});
test('bad-quality or unacknowledged sensor values are excluded',async()=>{const f=fixture();await f.service.configure(f.config);f.states.get('test.0.room').q=16;await f.service.tick(base,{});assert.equal(JSON.parse(f.own.get('heating.status')).ready,false);f.states.get('test.0.room').q=0;f.states.get('test.0.room').ack=false;await f.service.tick(base+5000,{});assert.equal(JSON.parse(f.own.get('heating.status')).meanC,null);assert.equal(f.writes.length,0);});
test('disable restores only owned setpoint and queued later ticks cannot re-enable it',async()=>{const f=fixture();const c={...f.config,mode:'auto',hardwareEnabled:true,circuits:[{id:'circle',name:'Kreis',setpointId:'test.0.setpoint',baseC:21,minC:18,maxC:24,stepC:0.5,gain:1,armed:true}]};await f.service.configure(c);await f.service.tick(base,{});assert.equal(f.writes.at(-1).val,21.5);f.states.set('test.0.setpoint',{val:21.5,ack:true,ts:base+5000,from:'system.adapter.test.0'});await f.service.tick(base+5000,{});await Promise.all([f.service.configure({...c,enabled:false}),f.service.tick(base+10000,{})]);assert.equal(f.writes.at(-1).val,21);assert.equal(f.service.config.enabled,false);assert.ok(f.own.get('internal.heatingOutputs'));});
test('picker returns only writable direct controls for output selection',async()=>{const f=fixture();f.add('alias.0.room','number',21,true,'°C');f.add('system.adapter.fake.temp','number',21,true,'°C');f.add('energiemanagement.0.internal.fake','number',21,true,'°C');const outputs=await f.service.objects({query:'',type:'number',write:true});assert.deepEqual(outputs.map(x=>x.id),['test.0.setpoint']);});
test('disabled imported configurations may retain unmapped IDs without becoming active',async()=>{const f=fixture();await f.service.configure({...f.config,enabled:false,outdoorId:'future.0.outside',rooms:[{...f.config.rooms[0],stateId:'future.0.room'}]});await f.service.tick(base,{});assert.equal(f.writes.length,0);assert.equal(f.service.config.enabled,false);});
test('room history records individual valid values, gaps, source changes and minute retention without output writes',async()=>{
 const {roomSeriesKey}=require('../lib/heating-service');const f=fixture();
 f.add('test.0.room2','number',22,false,'°C');f.add('test.0.floor','number',25,false,'°C');
 f.config.rooms.push({id:'bedroom',name:'Schlafzimmer',stateId:'test.0.room2',targetC:21,weight:2,enabled:true});f.config.pv.floorId='test.0.floor';
 await f.service.configure(f.config);await f.service.tick(base,{});
 let rows=JSON.parse(f.own.get('heating.history')),key=roomSeriesKey(f.config.rooms[0]);
 assert.equal(rows[0].roomValues[key],20);assert.equal(rows[0].roomValues[roomSeriesKey(f.config.rooms[1])],22);assert.equal(rows[0].floorC,25);
 await f.service.tick(base+5000,{});assert.equal(JSON.parse(f.own.get('heating.history')).length,1);
 f.states.get('test.0.room').q=16;await f.service.tick(base+60000,{});rows=JSON.parse(f.own.get('heating.history'));
 assert.equal(rows[1].roomValues[key],null);assert.notEqual(rows[1].roomSignature,rows[0].roomSignature);
 f.add('test.0.replacement','number',24,false,'°C');f.config.rooms[0].stateId='test.0.replacement';
 await f.service.configure(f.config);await f.service.tick(base+120000,{});rows=JSON.parse(f.own.get('heating.history'));
 assert.notEqual(roomSeriesKey(f.config.rooms[0]),key);assert.equal(rows[2].roomValues[key],undefined);assert.equal(rows[2].roomValues[roomSeriesKey(f.config.rooms[0])],24);assert.equal(f.writes.length,0);
});
