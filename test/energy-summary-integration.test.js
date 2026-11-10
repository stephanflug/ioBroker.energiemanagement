'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EnergyEngine,QUARTER,SETTLE_MS,vienna}=require('../lib/engine');
const {EnergySummary}=require('../lib/energy-summary');
const {normalizeEnergySummaryConfig}=require('../lib/energy-summary-config');
const start=Date.UTC(2026,10,8,10);
function filledSlot(engine,ts=start){const slot=engine._slot(ts);Object.assign(slot,{importWs:3600000,exportWs:0,pvWs:0,houseWs:7200000,importSec:900,exportSec:0,pvSec:900,houseSec:900});return slot;}
test('calendar summary remains consistent when an open quarter becomes archived, with independent zero/missing coverage',()=>{
 const engine=new EnergyEngine(),summary=new EnergySummary();filledSlot(engine);
 const before=summary.sample(start+QUARTER,{},{engineRuntime:engine.r});assert.equal(before.periods.day.metrics.importKWh.value,1);assert.equal(before.periods.day.metrics.pvKWh.value,0);assert.equal(before.periods.day.metrics.exportKWh.value,null);
 engine._finalize(start+QUARTER+SETTLE_MS,85);
 const after=summary.sample(start+QUARTER+SETTLE_MS,{},{engineRuntime:engine.r});
 assert.equal(after.periods.day.metrics.importKWh.value,1);assert.equal(after.periods.day.metrics.pvKWh.value,0);assert.equal(after.periods.day.metrics.exportKWh.value,null);
 assert.equal(engine.r.days[vienna(start).day].coveredSec.pvKWh,900);assert.equal(engine.r.intervals[0].coveredSec.importKWh,900);assert.equal(engine.r.days[vienna(start).day].legacyCoverage,undefined);
});
test('adding new coverage to a pre-update archive preserves its unknown historical coverage',()=>{
 const day=vienna(start).day,engine=new EnergyEngine({days:{[day]:{importKWh:5,exportKWh:0,pvKWh:2,houseKWh:7,valid:1,invalid:0}}});filledSlot(engine);engine._finalize(start+QUARTER+SETTLE_MS,85);
 assert.equal(engine.r.days[day].legacyCoverage,true);assert.equal(engine.r.days[day].importKWh,6);
 const summary=new EnergySummary().sample(start+QUARTER+SETTLE_MS,{},{engineRuntime:engine.r});assert.equal(summary.periods.day.metrics.importKWh.value,6);assert.equal(summary.periods.day.metrics.importKWh.coveredSec,null);assert.equal(summary.periods.day.metrics.importKWh.partial,true);
});
test('PV targets normalize separately from measurement and control configuration',()=>{
 assert.deepEqual(normalizeEnergySummaryConfig({}),{monthlyPvTargetKWh:0});assert.deepEqual(normalizeEnergySummaryConfig({monthlyPvTargetKWh:250.1234}),{monthlyPvTargetKWh:250.123});
 for(const value of [-1,Infinity,NaN,'250',null,true,1000001]){if(value===null)continue;assert.throws(()=>normalizeEnergySummaryConfig({monthlyPvTargetKWh:value}),/PV-Monatsziel/);}
 for(const raw of [null,[],false,'250'])assert.throws(()=>normalizeEnergySummaryConfig(raw));
});
