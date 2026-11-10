'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildBackup,buildRestorePlan,REQUIRED_IDS}=require('../lib/backup');
const {defaultSources,defaultConsumers}=require('../lib/normalize');
const {defaultForecast}=require('../lib/forecast'),{defaultHeating}=require('../lib/heating');
const {DayComparison}=require('../lib/day-comparison'),{Utilities}=require('../lib/utilities'),{ConsumerEnergy}=require('../lib/consumer-energy');
const NOW=Date.UTC(2026,10,9,12);
function snapshot(extra={}){
 const states=Object.fromEntries(REQUIRED_IDS.map(id=>[id,{val:['config.hardwareMaster','migration.done'].includes(id)?false:['history.intervals','history.power','heating.history'].includes(id)?'[]':'{}'}]));
 for(const [id,value]of Object.entries({'config.sources':defaultSources(),'config.consumers':defaultConsumers(),'config.forecast':defaultForecast(),'config.heating':defaultHeating(),...extra}))states[id]={val:JSON.stringify(value)};
 return buildBackup({states,version:'0.10.0',now:NOW});
}
test('one full backup retains rainwater, comparison profiles and selected storage while excluding recursive checkpoints',()=>{
 const comparison=new DayComparison();comparison.sample(NOW,{houseW:1000},[],{},{houseSignature:'meter-A'});comparison.sample(NOW+60000,{houseW:1000},[],{},{houseSignature:'meter-A'});
 const config={rainwater:{enabled:true,mode:'flow',stateId:'sensor.0.rainFlow',unit:'l/min',factor:1}},utilities=new Utilities();
 utilities.sample(NOW,config,{rainwater:{value:1,ts:NOW}});utilities.sample(NOW+60000,config,{rainwater:{value:1,ts:NOW+60000}});
 const doc=snapshot({'config.features_JSON':{rainwater:true},'config.utilities_JSON':config,'internal.utilities':utilities.runtime(),'internal.dayComparison':comparison.runtime(),'config.storage_JSON':{mode:'database',instance:'influxdb.0'},'internal.storage':{version:1,configKey:'database:influxdb.0',lastWriteAt:NOW,lastCheckpointAt:NOW,lastAttemptAt:NOW,retryAt:null,error:''}});
 const values=Object.fromEntries(buildRestorePlan(doc,{now:NOW+120000}).entries.map(entry=>[entry.id,entry.val]));
 assert.equal(JSON.parse(values['config.features_JSON']).rainwater,true);
 assert.equal(JSON.parse(values['internal.utilities']).totals.rainwater,.001);
 assert.deepEqual(JSON.parse(values['internal.dayComparison']),comparison.runtime());
 assert.deepEqual(JSON.parse(values['config.storage_JSON']),{mode:'database',instance:'influxdb.0'});
 assert.deepEqual(JSON.parse(values['internal.storage']),{});assert.equal(values['analytics.dayComparison_JSON'],'{}');
 assert.equal(Object.hasOwn(doc.states,'storage.checkpoint_JSON'),false);
});
test('older full backups start new comparison profiles and internal storage instead of retaining unrelated target datasets',()=>{
 const plan=buildRestorePlan(snapshot(),{now:NOW}),values=Object.fromEntries(plan.entries.map(entry=>[entry.id,entry.val]));
 assert.equal(values['internal.dayComparison'],'{}');assert.deepEqual(JSON.parse(values['config.storage_JSON']),{mode:'internal',instance:''});assert.equal(values['internal.storage'],'{}');
 assert.throws(()=>snapshot({'config.storage_JSON':{mode:'database',instance:'javascript.0'}}),/Instanzen/);
 assert.throws(()=>snapshot({'internal.dayComparison':{version:1,bucketSeconds:900,lastSampleAt:NOW,days:{invalid:{series:{}}}}}),/Tag/);
});
test('consumer source changes preserve measured daily totals but mark them ineligible for historical comparisons',()=>{
 const energy=new ConsumerEnergy(),device={id:'pump',name:'Pumpe',measuredW:'sensor.0.old'};
 energy.sample(NOW,[device],{pump:1000});energy.sample(NOW+60000,[device],{pump:1000});
 const first=energy.archive().days['2026-11-09'].pump.kWh;
 device.measuredW='sensor.0.new';energy.sample(NOW+120000,[device],{pump:2000});energy.sample(NOW+180000,[device],{pump:2000});
 const row=energy.archive().days['2026-11-09'].pump;assert.ok(row.kWh>first);assert.equal(row.sourceChanged,true);assert.equal(row.sourceId,'sensor.0.new');
});
