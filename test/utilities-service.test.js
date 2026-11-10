'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {UtilitiesService,defaultStoredUtilities,normalizeFeatures}=require('../lib/utilities-service');
const base=Date.UTC(2026,10,8,12);
function fixture(){
 const own=new Map(),objects=new Map(),states=new Map(),events=[];const adapter={namespace:'energiemanagement.0',set:async(id,value)=>{events.push(id);own.set(id,value)},getForeignObjectAsync:async id=>objects.get(id),getForeignStateAsync:async id=>states.get(id),getForeignObjectsAsync:async()=>Object.fromEntries(objects)};
 adapter.heating={config:{enabled:true,hardwareEnabled:true,rooms:[]},configure:async config=>{events.push('heating-disabled');adapter.heating.config=config;return config}};
 const service=new UtilitiesService(adapter);
 function add(id,value=10,type='number'){objects.set(id,{_id:id,type:'state',common:{name:id,read:true,write:false,type,unit:'Liter pro Minute'}});states.set(id,{val:value,ack:true,ts:base,q:0})}
 return {service,adapter,own,objects,states,events,add};
}
test('hiding heating disables optimization and hardware before committing visibility; re-showing does not re-arm it',async()=>{
 const f=fixture();await f.service.configureFeatures({water:false,fuel:false,heating:false});assert.equal(f.adapter.heating.config.enabled,false);assert.equal(f.adapter.heating.config.hardwareEnabled,false);assert.equal(f.events[0],'heating-disabled');assert.equal(f.events[1],'config.features_JSON');assert.equal(f.service.heatingAllowed(),false);
 await f.service.configureFeatures({water:false,fuel:false,heating:true});assert.equal(f.service.heatingAllowed(),true);assert.equal(f.adapter.heating.config.enabled,false);assert.equal(f.adapter.heating.config.hardwareEnabled,false);
});
test('failed heating stop keeps the heating view available',async()=>{
 const f=fixture();await f.service.configureFeatures({heating:true});f.adapter.heating.configure=async()=>{throw Error('Gerät nicht erreichbar')};await assert.rejects(()=>f.service.configureFeatures({heating:false}),/nicht erreichbar/);assert.equal(f.service.features.heating,true);assert.equal(f.service.hidingHeating,false);
});
test('section saves preserve the other section and do not use source unit labels as a conversion factor',async()=>{
 const f=fixture();f.add('test.0.water');f.add('test.0.fuel');await f.service.configureFeatures({water:true,fuel:true,heating:true});await f.service.configure({section:'water',config:{mode:'flow',stateId:'test.0.water',unit:'l/min',factor:1}});const water=JSON.stringify(f.service.config.water);await f.service.configure({section:'fuel',config:{mode:'counter',type:'pellets',stateId:'test.0.fuel',factor:1}});assert.equal(JSON.stringify(f.service.config.water),water);await f.service.tick(base);f.states.get('test.0.water').ts=base+60000;f.states.get('test.0.fuel').ts=base+60000;await f.service.tick(base+60000);assert.equal(f.own.get('analytics.utilities_JSON').water.periods.day.value,.01);assert.equal(f.own.get('analytics.utilities_JSON').fuel.periods.day.value,0);
});
test('bad source mappings are rejected atomically and disabled imports retain future IDs',async()=>{
 const f=fixture();await f.service.configure({section:'water',config:{mode:'counter',unit:'m³',stateId:'future.0.water',factor:1}});await assert.rejects(()=>f.service.configureFeatures({water:true,heating:true}),/Zahlen/);assert.equal(f.service.features.water,false);
 f.add('future.0.water','42','string');await assert.rejects(()=>f.service.configureFeatures({water:true,heating:true}),/Zahlen/);assert.equal(f.adapter.heating.config.enabled,true);
 f.objects.get('future.0.water').common.type='number';await f.service.configureFeatures({water:true,heating:true});assert.equal(f.service.features.water,true);
});
test('fuel type changes require clearing or replacing the old source and never silently relabel it',async()=>{
 const f=fixture();f.add('test.0.fuel');await f.service.configure({section:'fuel',config:{type:'pellets',mode:'counter',stateId:'test.0.fuel',factor:1}});await assert.rejects(()=>f.service.configure({section:'fuel',config:{...f.service.config.fuel,type:'oil'}}),/Brennstoffwechsel/);assert.equal(f.service.config.fuel.type,'pellets');await f.service.configure({section:'fuel',config:{...f.service.config.fuel,type:'oil',stateId:''}});assert.equal(f.service.config.fuel.type,'oil');assert.equal(f.service.config.fuel.stateId,'');
});
test('unacknowledged or bad quality values break recording and persistence does not expose write methods',async()=>{
 const f=fixture();f.add('test.0.water');await f.service.configure({section:'water',config:{mode:'flow',stateId:'test.0.water',unit:'l/min',factor:1}});await f.service.configureFeatures({water:true,heating:true});await f.service.tick(base);f.states.get('test.0.water').ack=false;await f.service.tick(base+10000);assert.equal(f.own.get('analytics.utilities_JSON').water.periods.day.value,null);f.states.get('test.0.water').ack=true;f.states.get('test.0.water').ts=base+20000;await f.service.tick(base+20000);assert.equal(f.own.get('analytics.utilities_JSON').water.periods.day.value,null);await f.service.close();assert.equal(f.own.get('internal.utilities').version,1);
});
test('malformed configuration commands do not reset optional modules or stop heating',async()=>{
 const f=fixture();for(const request of [{},{section:'water'},{config:[]},{config:'bad'}])await assert.rejects(()=>f.service.configure(request));await assert.rejects(()=>f.service.configureFeatures());assert.equal(f.adapter.heating.config.enabled,true);assert.deepEqual(f.service.config,defaultStoredUtilities());assert.throws(()=>normalizeFeatures({water:'true'}));
});
test('picker returns only readable external numeric states',async()=>{
 const f=fixture();f.add('test.0.water');f.add('test.0.waterText','10','string');f.add('energiemanagement.0.water');f.add('system.adapter.water');const rows=await f.service.objects({query:'water'});assert.deepEqual(rows.map(r=>r.id),['test.0.water']);
});
