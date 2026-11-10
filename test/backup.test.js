'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildBackup,validateBackup,buildRestorePlan,buildRollbackPlan,canonicalStringify,MAX_BACKUP_BYTES}=require('../lib/backup');
const {defaultSources,defaultConsumers}=require('../lib/normalize');
const {defaultHeating}=require('../lib/heating');
const {defaultForecast}=require('../lib/forecast');
const {defaultStoredUtilities}=require('../lib/utilities-service');
const {EnergyEngine,QUARTER,SETTLE_MS}=require('../lib/engine');
const {FuelInventory}=require('../lib/fuel-inventory');
const BASE=Date.UTC(2026,10,8,12),NS='energiemanagement.0';
const json=value=>JSON.stringify(value),parse=entry=>JSON.parse(entry.val);
function fixture(){
 const consumers=defaultConsumers();consumers.master=true;consumers.devices=[{id:'washer',name:'Waschmaschine',type:'switch',enabled:true,requested:true,mode:'auto',priority:1,maxW:1000,minW:1000,minOffSec:30,statusId:'meter.0.on',measuredW:'meter.0.w',output:{armed:true,enableId:'switch.0.enable',enableOn:true}}];
 const heating=defaultHeating();Object.assign(heating,{enabled:true,hardwareEnabled:true,mode:'auto',rooms:[{id:'living',name:'Wohnzimmer',stateId:'sensor.0.room',targetC:21,weight:1,enabled:true}],outdoorId:'sensor.0.outdoor',pump:{...heating.pump,lockId:'heat.0.lock',statusId:'heat.0.running',armed:true},circuits:[{id:'circle',name:'Heizkreis',setpointId:'heat.0.target',armed:true,baseC:21,minC:18,maxC:24,stepC:.5,gain:1}]});
 const sources=defaultSources();sources.importW.id='meter.0.w';sources.importKWh.id='meter.0.kWh';
 const forecast=defaultForecast();Object.assign(forecast,{enabled:true,location:{name:'Ort',latitude:48,longitude:16,timezone:'Europe/Vienna'},arrays:[{name:'Dach',peakKwp:5,tilt:30,azimuth:180}]});
 const slotStart=BASE-2*QUARTER;
 const days={'2026-11-07':{importKWh:3,pvKWh:2,houseKWh:5,exportKWh:0,valid:1,invalid:0}};
 const runtime={startedAt:BASE-86400000,sourceSignature:'old-source',anchors:{import:{value:100,ts:BASE-1000}},lastPower:{ts:BASE-1000,pv:500,house:1000},days,months:{},intervals:[],open:{[slotStart]:{start:slotStart,importWs:3600000,exportWs:0,pvWs:1800000,houseWs:5400000,importSec:900,exportSec:900,pvSec:900,houseSec:900}}};
 const inventory=new FuelInventory();inventory.recordFill(BASE-10000,'pellets',{mode:'set',amount:1500,capacity:5000,requestId:'backup_fixture_1'});inventory.recordFill(BASE-10000,'oil',{mode:'set',amount:400,capacity:1000,requestId:'backup_fixture_2'});
 const values={
  'config.sources':json(sources),'config.consumers':json(consumers),'config.settings':json({targetW:9500,reserveW:500,tariffThresholdW:10000,minCoveragePct:85}),'config.hardwareMaster':true,'config.forecast':json(forecast),'config.heating':json(heating),'config.energySummary_JSON':json({monthlyPvTargetKWh:250}),'config.features_JSON':json({water:true,fuel:true,heating:true}),'config.utilities_JSON':json(defaultStoredUtilities()),
  'internal.runtime':json(runtime),'internal.hardware':json({washer:{lastValue:true}}),'internal.heatingOutputs':json({version:1,owned:{'heat.0.lock':{pending:true,lastValue:true}},holds:{}}),'internal.heatingLearning':json({version:1,heatingSamples:12,coolingSamples:13,heatingRateKph:.4,coolingLossPerHourK:.02}),
  'internal.energySummary':json({version:1,lastSampleAt:BASE+10000,days:{'2026-11-07':{batteryChargeKWh:2,batteryDischargeKWh:1,coveredSec:3000}}}),'internal.utilities':json({version:1,lastSampleAt:BASE+10000,days:{water:{'2026-11-07':{value:.3,coveredSec:1000}},pellets:{},oil:{},gas:{}}}),
  'internal.fuelInventory':json(inventory.runtime()),
  'history.days':json(days),'history.months':'{}','history.intervals':'[]','history.power':json([{ts:BASE-1000,values:{pvW:500,houseW:null,batteryW:-100}}]),'heating.history':json([{ts:BASE-1000,meanC:21,roomValues:{living:21}}]),
  'analytics.consumerDays_JSON':json({version:1,days:{'2026-11-07':{washer:{name:'Waschmaschine',kWh:.8,coveredSec:3000}}}}),'analytics.energySummary_JSON':json({updatedAt:BASE,periods:{year:{key:'2026'}}}),'analytics.utilities_JSON':json({updatedAt:BASE,water:{}}),
  'forecast.data':json({fetchedAt:BASE-86400000,days:[{date:'2026-11-07',kWh:4}]}),'migration.done':true,'migration.report':'{}','migration.cleanupStatus':'bereit','migration.backup':json({scripts:{'script.js.archived':{common:{source:'log("nur archiviert")'}}}})
 };
 return {values,states:Object.fromEntries(Object.entries(values).map(([id,val])=>[id,{val,ts:BASE-1000}]))};
}
function backup(states=fixture().states){return buildBackup({states,namespace:NS,version:'0.9.0',now:BASE});}
function stateMap(plan){return new Map(plan.entries.map(entry=>[entry.id,entry.val]));}
test('full backup preserves adapter data and creates a reproducible canonical checksum',()=>{
 const f=fixture(),a=backup(f.states),b=backup(Object.fromEntries(Object.entries(f.states).reverse()));assert.equal(a.checksum.value,b.checksum.value);assert.deepEqual(validateBackup(json(a)),a);assert.equal(a.format,'iobroker.energiemanagement.backup');assert.equal(a.schemaVersion,1);assert.equal(a.namespace,NS);assert.equal(a.states['internal.fuelInventory'].val,f.values['internal.fuelInventory']);
 f.states['config.hardwareMaster'].val=false;assert.equal(a.states['config.hardwareMaster'].val,true,'backup is detached from mutable input');assert.equal(canonicalStringify({b:1,a:2}),'{'+'"a":2,"b":1}');
});
test('own namespaced records are accepted and foreign, arbitrary or duplicate state IDs are rejected',()=>{
 const f=fixture();const own=Object.fromEntries(Object.entries(f.states).map(([id,value])=>[NS+'.'+id,value]));assert.deepEqual(backup(own),backup(f.states));
 for(const id of ['javascript.0.scriptEnabled.test','system.adapter.admin.0','commands.cleanupLegacy','energiemanagement.1.config.sources','config.evil'])assert.throws(()=>backup({...f.states,[id]:{val:false}}),/Datenpunkt/);
 assert.throws(()=>backup({...f.states,[NS+'.config.sources']:f.states['config.sources']}),/Doppelter/);
});
test('missing critical states, unsupported versions, corruption and checksum omissions fail before planning',()=>{
 const f=fixture();delete f.states['config.sources'];assert.throws(()=>backup(f.states),/unvollständig/);
 const b=backup();b.states['history.days'].val='{}';assert.throws(()=>validateBackup(b),/Prüfsumme/);
 for(const change of [x=>x.schemaVersion=99,x=>x.format='other',x=>delete x.checksum,x=>x.namespace='hm-rpc.0',x=>x.createdAt='yesterday',x=>x.adapterVersion='latest',x=>x.extra={}]){const doc=backup();change(doc);assert.throws(()=>buildRestorePlan(doc));}
});
test('dangerous keys, nonfinite values, malformed JSON and oversized input are rejected',()=>{
 const f=fixture();for(const raw of ['{bad json}',json({'__proto__':false})]){if(raw==='{}')continue;assert.throws(()=>validateBackup(raw));}
 assert.throws(()=>backup({...f.states,'history.days':{val:'{"__proto__":{"polluted":true}}'}}),/Datenschlüssel/);
 assert.throws(()=>backup({...f.states,'history.days':{val:{count:Infinity}}}),/Zahl/);
 assert.throws(()=>backup({...f.states,'config.settings':{val:'{"targetW":"9500"}'}}),/Zahlenwert/);
 assert.throws(()=>validateBackup(' '.repeat(MAX_BACKUP_BYTES+1)),/32 MiB/);
 const circular={};circular.self=circular;assert.throws(()=>backup({...f.states,'history.days':{val:circular}}),/Kreis/);
});
test('restore keeps source mappings, archives, learning and tank stock while disabling every output permission',()=>{
 const f=fixture(),plan=buildRestorePlan(backup(f.states),{currentNamespace:'energiemanagement.1',now:BASE+10000,currentConsumerIds:['old_device']}),values=stateMap(plan);
 assert.equal(plan.namespace,'energiemanagement.1');assert.equal(plan.sourceNamespace,NS);assert.equal(values.get('config.hardwareMaster'),false);
 const consumers=JSON.parse(values.get('config.consumers')),heating=JSON.parse(values.get('config.heating'));assert.equal(consumers.master,false);assert.equal(consumers.devices[0].output.armed,false);assert.equal(consumers.devices[0].output.enableId,'switch.0.enable');assert.equal(heating.enabled,false);assert.equal(heating.hardwareEnabled,false);assert.equal(heating.pump.armed,false);assert.equal(heating.circuits[0].armed,false);assert.equal(heating.rooms[0].stateId,'sensor.0.room');
 for(const id of ['config.sources','history.days','history.months','heating.history','analytics.consumerDays_JSON','internal.heatingLearning','internal.fuelInventory','migration.backup'])assert.equal(values.get(id),f.values[id],id+' preserved');
 assert.deepEqual(JSON.parse(values.get('internal.hardware')),{});assert.deepEqual(JSON.parse(values.get('internal.heatingOutputs')).owned,{});assert.equal(values.get('consumers.washer.allow'),false);assert.equal(values.get('consumers.old_device.allow'),false);assert.equal(values.get('consumers.old_device.targetW'),0);
 for(const id of ['commands.importLegacy','commands.cleanupLegacy','commands.forecastRefresh','commands.heatingResetLearning'])assert.equal(values.get(id),false,id+' never replayed');
 assert.equal(JSON.parse(values.get('config.features_JSON')).water,true);assert.equal(JSON.parse(values.get('config.features_JSON')).heating,true);assert.equal(JSON.parse(values.get('config.forecast')).enabled,true);
 assert.ok(plan.entries.every(entry=>!entry.id.startsWith(NS+'.')),'writes stay relative to intended target');
});
test('stale readings, recommendations and forecasts are replaced instead of looking current after restore',()=>{
 const values=stateMap(buildRestorePlan(backup(),{now:BASE+10000}));assert.deepEqual(JSON.parse(values.get('forecast.data')),{});assert.deepEqual(JSON.parse(values.get('analytics.energySummary_JSON')),{});assert.equal(values.get('control.ready'),false);assert.equal(values.get('control.virtualMaster'),false);assert.equal(values.get('status.lastSample'),'');assert.equal(values.get('status.dataOk'),false);assert.equal(JSON.parse(values.get('heating.status')).enabled,false);assert.equal(JSON.parse(values.get('live.snapshot')).values.pvW,null);assert.equal(JSON.parse(values.get('insights.advice')).valid,false);
});
test('observed open energy survives restore but old counter and power anchors cannot bridge downtime',()=>{
 const values=stateMap(buildRestorePlan(backup(),{now:BASE})),runtime=JSON.parse(values.get('internal.runtime'));assert.deepEqual(runtime.anchors,{});assert.equal(runtime.lastPower,null);assert.equal(Object.keys(runtime.open).length,1);const engine=new EnergyEngine(runtime);const measured={importW:{value:0,ts:BASE},importKWh:{value:999,ts:BASE},exportW:{value:0,ts:BASE},pvW:0,batteryW:{value:0,ts:BASE}};engine.sample(BASE,measured,{minCoveragePct:85,targetW:9500},runtime.sourceSignature);assert.equal(engine.r.days['2026-11-08'].importKWh,1,'only observed backup quarter is added');assert.equal(engine.r.intervals.filter(row=>row.importKWh===1).length,1);
 for(const id of ['internal.energySummary','internal.utilities'])assert.equal(JSON.parse(values.get(id)).lastSampleAt,null);
});
test('backup plan is pure and rollback uses the same safe disabled control state',()=>{
 const doc=backup(),before=json(doc),plan=buildRollbackPlan(doc,{now:BASE});assert.equal(json(doc),before);assert.equal(plan.rollback,true);assert.equal(stateMap(plan).get('config.hardwareMaster'),false);assert.throws(()=>buildRestorePlan(doc,{currentNamespace:'system.adapter.admin.0'}));assert.throws(()=>buildRestorePlan(doc,{currentConsumerIds:['bad.id']}));
});
