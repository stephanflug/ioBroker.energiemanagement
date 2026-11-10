'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {buildBackup,buildRestorePlan,canonicalStringify,REQUIRED_IDS}=require('../lib/backup');
const {Utilities,defaultUtilities}=require('../lib/utilities');
const {FuelInventory}=require('../lib/fuel-inventory');
const {defaultSources,defaultConsumers}=require('../lib/normalize');
const {defaultHeating}=require('../lib/heating');
const {defaultForecast}=require('../lib/forecast');

const NOW=Date.UTC(2026,10,8,12),DAY='2026-11-08';
function states(overrides={}){
 const result=Object.fromEntries(REQUIRED_IDS.map(id=>[id,{val:id==='config.hardwareMaster'||id==='migration.done'?false:['history.intervals','history.power','heating.history'].includes(id)?'[]':'{}'}]));
 result['config.sources']={val:JSON.stringify(defaultSources())};
 result['config.consumers']={val:JSON.stringify(defaultConsumers())};
 result['config.heating']={val:JSON.stringify(defaultHeating())};
 result['config.forecast']={val:JSON.stringify(defaultForecast())};
 for(const [id,value]of Object.entries(overrides))result[id]={val:JSON.stringify(value)};
 return result;
}
const backup=overrides=>buildBackup({states:states(overrides),namespace:'energiemanagement.0',version:'0.9.0',now:NOW});
const values=plan=>Object.fromEntries(plan.entries.map(entry=>[entry.id,entry.val]));
const slot=start=>({start,importWs:1,exportWs:0,pvWs:0,houseWs:1,importSec:1,exportSec:1,pvSec:1,houseSec:1});

test('malformed open quarter keys and impossible coverage cannot enter a restored engine',()=>{
 const start=NOW-900000;
 const cases=[{foo:slot(start)},{[start]:slot(start+900000)},{[start+1]:slot(start+1)},{[start]:{...slot(start),importSec:901}},{[start]:{...slot(start),houseWs:-1}},{[start]:{start}}];
 for(const open of cases)assert.throws(()=>backup({'internal.runtime':{open}}),/internal.runtime/);
});

test('utility archives reject invalid calendar dates, unknown buckets and malformed totals',()=>{
 const row={value:1,coveredSec:60};
 for(const archive of [
  {version:1,days:{water:{'2026-02-30':row}}},
  {version:1,days:{electricity:{[DAY]:row}}},
  {version:1,days:{water:{[DAY]:{...row,coveredSec:0}}}},
  {version:1,days:{water:{[DAY]:{...row,value:'1'}}}},
  {version:1,days:{},totals:{water:-1}},
  {version:1,days:{},totals:{gas:'2'}}
 ])assert.throws(()=>backup({'internal.utilities':archive}),/internal.utilities/);
});

test('tank archives reject inconsistent stock, broken references and replayed fill IDs',()=>{
 const inventory=new FuelInventory();
 inventory.recordFill(NOW,'pellets',{mode:'set',amount:100,capacity:200,requestId:'adversarial_fill_01'});
 const initial=inventory.runtime();
 for(const mutate of [
  x=>x.tanks.pellets.remaining=201,
  x=>{x.tanks.pellets.lastObservedTotal=1;x.tanks.pellets.lastObservedAt=null;},
  x=>x.tanks.pellets.events.push({...x.tanks.pellets.events[0]}),
  x=>x.tanks.pellets.events[0].unit='l',
  x=>x.tanks.pellets.events[0].remainingAfter=201
 ]){
  const bad=structuredClone(initial);mutate(bad);
  assert.throws(()=>backup({'internal.fuelInventory':bad}),/internal.fuelInventory/);
 }
});

test('backup and restore retain both water inputs and the selected consumption authority',()=>{
 const config=defaultUtilities();
 Object.assign(config.water,{mode:'counter',flowId:'water.0.flow',flowUnit:'l/min',flowFactor:2,counterId:'water.0.total',counterUnit:'m³',counterFactor:1});
 const restored=values(buildRestorePlan(backup({'config.utilities_JSON':config}),{now:NOW}));
 const output=JSON.parse(restored['config.utilities_JSON']);
 assert.equal(output.water.flowId,'water.0.flow');assert.equal(output.water.counterId,'water.0.total');
 assert.equal(output.water.mode,'counter');assert.equal(output.water.flowFactor,2);
 const utilities=new Utilities();
 const reading=(value,ts)=>({value,ts,ack:true,q:0});
 const first=utilities.sample(NOW,config,{water:reading(10,NOW),waterFlow:reading(100,NOW),waterCounter:reading(10,NOW)});
 assert.equal(first.water.status,'disabled','a restored optional section still requires its feature flag to run');
 config.water.enabled=true;
 utilities.sample(NOW+1000,config,{water:reading(10,NOW+1000),waterFlow:reading(100,NOW+1000),waterCounter:reading(10,NOW+1000)});
 const second=utilities.sample(NOW+61000,config,{water:reading(10.1,NOW+61000),waterFlow:reading(100,NOW+61000),waterCounter:reading(10.1,NOW+61000)});
 assert.equal(second.water.periods.day.value,.1,'flow display is not added to counter consumption');
 assert.equal(second.water.live.flowPerHour,12);assert.equal(second.water.live.counter,10.1);
});

test('lifetime utility totals and matching inventory references survive archive pruning and restore',()=>{
 const inventory=new FuelInventory();
 inventory.recordFill(NOW-120000,'pellets',{mode:'set',amount:100,capacity:200,requestId:'lifetime_fill_001'});
 inventory.observe(NOW-60000,'pellets',1000);
 inventory.observe(NOW,'pellets',1002);
 const utilityRuntime={version:1,startedAt:NOW-365*86400000,lastSampleAt:NOW,days:{water:{},pellets:{[DAY]:{value:2,coveredSec:60,startedAt:NOW-60000,updatedAt:NOW}},oil:{},gas:{}},totals:{water:0,pellets:1002,oil:0,gas:0}};
 const restored=values(buildRestorePlan(backup({'internal.utilities':utilityRuntime,'internal.fuelInventory':inventory.runtime()}),{now:NOW+60000}));
 const utilities=new Utilities(JSON.parse(restored['internal.utilities']));
 const tank=new FuelInventory(JSON.parse(restored['internal.fuelInventory']));
 assert.equal(utilities.lastSampleAt,null,'no measurement gap is bridged');
 assert.equal(utilities.totals.pellets,1002,'lifetime total does not shrink to the retained day archive');
 tank.observe(NOW+60000,'pellets',utilities.totals.pellets);
 assert.equal(tank.summary('pellets').remaining,98,'restoring and observing the same total consumes no stock');
 tank.observe(NOW+120000,'pellets',utilities.totals.pellets+1);
 assert.equal(tank.summary('pellets').remaining,97);
});

test('inventory references must match restored lifetime totals before preview or restore',()=>{
 const inventory=new FuelInventory();
 inventory.recordFill(NOW-60000,'oil',{mode:'set',amount:100,capacity:200,requestId:'consistency_fill_1'});
 inventory.observe(NOW,'oil',1002);
 const runtime={version:1,days:{water:{},pellets:{},oil:{[DAY]:{value:2,coveredSec:60}},gas:{}},totals:{water:0,pellets:0,oil:1002,gas:0}};
 const input={'internal.utilities':runtime,'internal.fuelInventory':inventory.runtime()};
 assert.doesNotThrow(()=>buildRestorePlan(backup(input)));
 for(const total of [1000,1003])assert.throws(()=>backup({...input,'internal.utilities':{...runtime,totals:{...runtime.totals,oil:total}}}),/Verbrauchsreferenz/);
 assert.throws(()=>backup({...input,'internal.utilities':{...runtime,totals:{water:0,pellets:0,gas:0}}}),/Verbrauchssumme.*fehlt/);
 const near={...runtime,totals:{...runtime.totals,oil:1002+1e-10}};
 assert.doesNotThrow(()=>backup({...input,'internal.utilities':near}),'normal floating point noise is accepted');
 const changed=backup(input);
 changed.states['internal.utilities'].val=JSON.stringify({...runtime,totals:{...runtime.totals,oil:1003}});
 const payload={...changed};delete payload.checksum;
 changed.checksum.value=crypto.createHash('sha256').update(canonicalStringify(payload)).digest('hex');
 assert.throws(()=>buildRestorePlan(changed),/Verbrauchsreferenz/,'even a correctly checksummed document is rejected before planning');
});

test('legacy utility totals can be inferred only when retained days match the inventory reference',()=>{
 const inventory=new FuelInventory();
 inventory.recordFill(NOW-60000,'pellets',{mode:'set',amount:100,capacity:200,requestId:'legacy_fill_0001'});
 inventory.observe(NOW,'pellets',2);
 const legacy={version:1,days:{water:{},pellets:{[DAY]:{value:2,coveredSec:60}},oil:{},gas:{}}};
 const input={'internal.utilities':legacy,'internal.fuelInventory':inventory.runtime()};
 assert.doesNotThrow(()=>backup(input));
 inventory.observe(NOW+1,'pellets',1002);
 assert.throws(()=>backup({...input,'internal.fuelInventory':inventory.runtime()}),/Verbrauchsreferenz/,'a pruned archive cannot silently replace a lifetime reference');
});
