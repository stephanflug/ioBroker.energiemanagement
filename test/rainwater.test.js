'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Utilities,defaultUtilities,normalizeUtilities}=require('../lib/utilities');
const {UtilitiesService,defaultFeatures,normalizeFeatures,defaultStoredUtilities}=require('../lib/utilities-service');
const {buildBackup,buildRestorePlan,REQUIRED_IDS}=require('../lib/backup');
const {defaultSources,defaultConsumers}=require('../lib/normalize');
const {defaultHeating}=require('../lib/heating');
const {defaultForecast}=require('../lib/forecast');
const {midnight}=require('../lib/energy-summary');
const BASE=Date.UTC(2026,10,9,11),reading=(value,ts)=>({value,ts,ack:true,q:0});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≈ ${b}`);
function rain(mode='flow',unit=mode==='flow'?'l/min':'m³'){
 const config=defaultUtilities();config.rainwater={enabled:true,mode,unit,stateId:'meter.0.rainwater',factor:1};return config;
}
function fixture(){
 const own=new Map(),states=new Map(),objects=new Map(),reads=[];
 const adapter={namespace:'energiemanagement.0',set:async(id,value)=>own.set(id,value),getForeignStateAsync:async id=>{reads.push(id);return states.get(id);},getForeignObjectAsync:async id=>objects.get(id)};
 function add(id,value){objects.set(id,{type:'state',common:{type:'number',read:true,write:false}});states.set(id,{val:value,ts:BASE,ack:true,q:0});}
 return {service:new UtilitiesService(adapter),own,states,objects,reads,add};
}
test('rainwater starts hidden and disabled while legacy optional selections and sources survive normalization',()=>{
 assert.equal(defaultFeatures().rainwater,false);assert.equal(normalizeFeatures({water:true,fuel:true,heating:true}).rainwater,false);
 assert.equal(defaultStoredUtilities().rainwater.flowId,'');assert.equal(defaultStoredUtilities().rainwater.counterId,'');
 const legacy={water:{enabled:true,mode:'flow',stateId:'meter.0.drinking',unit:'l/h',factor:2},fuel:{enabled:true,type:'oil',mode:'counter',stateId:'meter.0.oil',factor:1}};
 const config=normalizeUtilities(legacy);assert.equal(config.water.flowId,'meter.0.drinking');assert.equal(config.water.flowUnit,'l/h');assert.equal(config.water.flowFactor,2);assert.equal(config.fuel.type,'oil');assert.equal(config.rainwater.enabled,false);
 const result=new Utilities().sample(BASE,legacy,{});assert.equal(result.rainwater.status,'disabled');assert.equal(result.rainwater.periods.day.value,null);
});
test('rainwater flow supports every water unit and remains independent of drinking water and fuel usage',()=>{
 for(const [unit,value]of [['l/min',10],['l/h',600],['m³/h',.6]]){
  const core=new Utilities(),config=rain('flow',unit);config.water={enabled:true,mode:'flow',stateId:'meter.0.water',unit:'l/min',factor:1};config.fuel={enabled:true,type:'pellets',mode:'counter',stateId:'meter.0.fuel',factor:1};
  core.sample(BASE,config,{rainwater:reading(value,BASE),water:reading(20,BASE),fuel:reading(10,BASE)});
  const result=core.sample(BASE+60000,config,{rainwater:reading(value,BASE+60000),water:reading(20,BASE+60000),fuel:reading(12,BASE+60000)});
  close(result.rainwater.periods.day.value,.01);close(result.water.periods.day.value,.02);assert.equal(result.fuel.periods.day.value,2);close(core.runtime().totals.rainwater,.01);close(core.runtime().totals.water,.02);assert.equal(core.runtime().totals.pellets,2);
 }
});
test('both rainwater readings display together but only the selected counter contributes to consumption',()=>{
 const core=new Utilities(),config=rain('counter');config.rainwater={...config.rainwater,flowId:'meter.0.rainFlow',flowUnit:'l/min',flowFactor:1,counterId:'meter.0.rainCounter',counterUnit:'l',counterFactor:1};
 core.sample(BASE,config,{rainwater:reading(100000,BASE),rainwaterFlow:reading(10,BASE),rainwaterCounter:reading(100000,BASE)});
 const result=core.sample(BASE+60000,config,{rainwater:reading(100025,BASE+60000),rainwaterFlow:reading(10,BASE+60000),rainwaterCounter:reading(100025,BASE+60000)});
 close(result.rainwater.periods.day.value,.025);close(result.rainwater.live.flowPerHour,.6);close(result.rainwater.live.counterValue,100.025);assert.equal(result.rainwater.unit,'m³');
});
test('rainwater counter reset, bad-quality gaps, restart and disabled periods cannot fabricate consumption',()=>{
 const core=new Utilities(),config=rain('counter');core.sample(BASE,config,{rainwater:reading(100,BASE)});
 let result=core.sample(BASE+10000,config,{rainwater:reading(1,BASE+10000)});assert.equal(result.rainwater.status,'counter-reset');assert.equal(result.rainwater.periods.day.value,null);
 result=core.sample(BASE+20000,config,{rainwater:reading(1.2,BASE+20000)});close(result.rainwater.periods.day.value,.2);
 core.sample(BASE+30000,config,{rainwater:{...reading(2,BASE+30000),q:64}});core.sample(BASE+40000,config,{rainwater:reading(3,BASE+40000)});close(core.runtime().totals.rainwater,.2);
 const restarted=new Utilities(core.runtime());close(restarted.sample(BASE+50000,config,{rainwater:reading(10,BASE+50000)}).rainwater.periods.day.value,.2);
 config.rainwater.enabled=false;restarted.sample(BASE+60000,config,{rainwater:reading(20,BASE+60000)});config.rainwater.enabled=true;close(restarted.sample(BASE+70000,config,{rainwater:reading(30,BASE+70000)}).rainwater.periods.day.value,.2);
});
test('rainwater periods split at local calendar boundaries without resetting the meter or other resources',()=>{
 const start=midnight('2027-01-01'),core=new Utilities(),config=rain('flow','m³/h');core.sample(start-30000,config,{rainwater:reading(1,start-30000)});const result=core.sample(start+30000,config,{rainwater:reading(1,start+30000)});
 close(result.rainwater.periods.day.value,1/120);close(result.rainwater.periods.month.value,1/120);close(result.rainwater.periods.year.value,1/120);close(core.runtime().days.rainwater['2026-12-31'].value,1/120);assert.deepEqual(core.runtime().days.water,{});
});
test('hidden rainwater never polls a source, and feature enabling validates both independent source mappings',async()=>{
 const f=fixture();f.add('rain.0.flow',10);f.add('rain.0.counter',100);await f.service.configure({section:'rainwater',config:{mode:'counter',flowId:'rain.0.flow',flowUnit:'l/min',flowFactor:1,counterId:'rain.0.counter',counterUnit:'m³',counterFactor:1}});
 await f.service.tick(BASE);assert.deepEqual(f.reads,[]);assert.equal(f.own.get('analytics.utilities_JSON').rainwater.enabled,false);
 f.objects.get('rain.0.flow').common.type='string';await assert.rejects(()=>f.service.configureFeatures({rainwater:true}),/Regenwasser.*Zahlen/);assert.equal(f.service.features.rainwater,false);
 f.objects.get('rain.0.flow').common.type='number';await f.service.configureFeatures({rainwater:true});await f.service.tick(BASE+1000);assert.deepEqual(f.reads.sort(),['rain.0.counter','rain.0.flow']);
 f.states.get('rain.0.counter').val=100.02;f.states.get('rain.0.counter').ts=BASE+11000;await f.service.tick(BASE+11000);close(f.own.get('analytics.utilities_JSON').rainwater.periods.day.value,.02);close(f.own.get('analytics.utilities_JSON').rainwater.live.flowPerHour,.6);
});
test('rainwater source edits at the same timestamp preserve independent water and fuel integration',async()=>{
 const f=fixture();f.add('water.0.flow',10);f.add('rain.0.flow',20);f.add('rain.0.otherFlow',30);
 await f.service.configure({section:'water',config:{mode:'flow',stateId:'water.0.flow',unit:'l/min',factor:1}});await f.service.configure({section:'rainwater',config:{mode:'flow',stateId:'rain.0.flow',unit:'l/min',factor:1}});await f.service.configureFeatures({water:true,rainwater:true});await f.service.tick(BASE);
 await f.service.configure({section:'rainwater',config:{mode:'flow',stateId:'rain.0.otherFlow',unit:'l/min',factor:1}});await f.service.sampleAndPublish(BASE);
 for(const value of f.states.values())value.ts=BASE+60000;await f.service.tick(BASE+60000);close(f.own.get('analytics.utilities_JSON').water.periods.day.value,.01);close(f.own.get('analytics.utilities_JSON').rainwater.periods.day.value,.03);
});
test('full backup and restore preserve rainwater mappings, visibility and native-unit archives with legacy compatibility',()=>{
 const values=Object.fromEntries(REQUIRED_IDS.map(id=>[id,id==='config.hardwareMaster'||id==='migration.done'?false:['history.intervals','history.power','heating.history'].includes(id)?'[]':'{}']));
 Object.assign(values,{'config.sources':JSON.stringify(defaultSources()),'config.consumers':JSON.stringify(defaultConsumers()),'config.forecast':JSON.stringify(defaultForecast()),'config.heating':JSON.stringify(defaultHeating()),'config.features_JSON':JSON.stringify({water:true,rainwater:true,fuel:false,heating:false}),'config.utilities_JSON':JSON.stringify({...defaultStoredUtilities(),rainwater:{mode:'counter',stateId:'rain.0.total',unit:'m³',factor:1}}),'internal.utilities':JSON.stringify({version:1,days:{rainwater:{'2026-11-09':{value:.3,coveredSec:3600}},water:{}},totals:{rainwater:1.5,water:2,pellets:0,oil:0,gas:0}})});
 const backup=buildBackup({states:values,now:BASE}),plan=buildRestorePlan(backup,{now:BASE+10000}),entries=new Map(plan.entries.map(entry=>[entry.id,entry.val]));
 assert.equal(JSON.parse(entries.get('config.features_JSON')).rainwater,true);assert.equal(JSON.parse(entries.get('config.utilities_JSON')).rainwater.stateId,'rain.0.total');assert.equal(JSON.parse(entries.get('internal.utilities')).days.rainwater['2026-11-09'].value,.3);assert.equal(JSON.parse(entries.get('internal.utilities')).totals.rainwater,1.5);
 delete values['config.features_JSON'];values['config.features_JSON']=JSON.stringify({water:true,fuel:false,heating:false});values['internal.utilities']=JSON.stringify({version:1,days:{water:{}}});assert.doesNotThrow(()=>buildRestorePlan(buildBackup({states:values,now:BASE})));
});
