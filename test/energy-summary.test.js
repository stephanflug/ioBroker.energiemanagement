'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EnergySummary,dayKey,midnight,periodsAt}=require('../lib/energy-summary');
const at=value=>Date.parse(value),close=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const metric=(result,key,period='day')=>result.periods[period].metrics[key];
function record(values={},seconds=900){return {importKWh:0,exportKWh:0,pvKWh:0,houseKWh:0,...values,coveredSec:Object.fromEntries(['importKWh','exportKWh','pvKWh','houseKWh'].map(key=>[key,seconds]))};}
test('calendar bounds use Vienna midnight and actual 23/25-hour DST days',()=>{
 assert.equal(dayKey(at('2026-11-08T23:30:00Z')),'2026-11-09');
 for(const [key,hours]of [['2026-03-29',23],['2026-10-25',25],['2026-11-08',24]]){
  const p=periodsAt(at(key+'T12:00:00Z')).day;assert.equal((p.end-p.start)/3600000,hours);assert.equal(p.start,midnight(key));
 }
 const p=periodsAt(at('2026-12-31T23:00:00Z'));assert.equal(p.day.key,'2027-01-01');assert.equal(p.month.key,'2027-01');assert.equal(p.year.key,'2027');assert.equal(p.year.start,at('2026-12-31T23:00:00Z'));
});
test('nonbattery totals add closed days and every open interval once without finalization jumps',()=>{
 const now=at('2026-11-08T10:00:10Z'),engine={days:{'2026-11-08':record({importKWh:1,pvKWh:2,houseKWh:3,exportKWh:.5}),'2026-11-07':record({importKWh:5}),'2026-10-31':record({importKWh:10})},open:{a:{start:now-910000,importWs:360000,importSec:60,pvWs:0,pvSec:60,houseWs:0,houseSec:60,exportWs:0,exportSec:60},b:{start:now-10000,importWs:720000,importSec:10,pvWs:0,pvSec:10,houseWs:0,houseSec:10,exportWs:0,exportSec:10}}};
 const summary=new EnergySummary(),first=summary.sample(now,{}, {engineRuntime:engine});close(metric(first,'importKWh').value,1.3);close(metric(first,'importKWh','month').value,6.3);close(metric(first,'importKWh','year').value,16.3);assert.equal(metric(first,'importKWh').coveredSec,970);
 engine.days['2026-11-08'].importKWh+=.1;engine.days['2026-11-08'].coveredSec.importKWh+=60;delete engine.open.a;
 close(metric(summary.sample(now+1000,{}, {engineRuntime:engine}),'importKWh').value,1.3);assert.equal(first.periods.month.recordedFromKey,'2026-11-07');
});
test('legacy positive totals are retained as partial while legacy zero placeholders remain unknown',()=>{
 const now=at('2026-11-08T12:00:00Z'),summary=new EnergySummary(),engine={days:{'2026-11-08':{importKWh:7,pvKWh:0,exportKWh:0}}};
 let out=summary.sample(now,{}, {engineRuntime:engine});assert.equal(metric(out,'importKWh').value,7);assert.equal(metric(out,'importKWh').coveredSec,null);assert.equal(metric(out,'importKWh').source,'archive');assert.equal(metric(out,'importKWh').partial,true);assert.equal(metric(out,'pvKWh').value,null);
 engine.days['2026-11-08']=record({importKWh:7},600);out=summary.sample(now+1000,{}, {engineRuntime:engine});assert.equal(metric(out,'pvKWh').value,0);assert.equal(metric(out,'pvKWh').coveredSec,600);
 engine.days['2026-11-08'].legacyCoverage=true;out=summary.sample(now+2000,{}, {engineRuntime:engine});assert.equal(metric(out,'importKWh').coveredSec,null);assert.equal(metric(out,'importKWh').knownCoveredSec,600);
});
test('calendar year/month/day roll over even when current measurements are missing; archives are not reset',()=>{
 const engine={days:{'2026-12-31':record({pvKWh:12,importKWh:4})}},summary=new EnergySummary();
 const before=summary.sample(at('2026-12-31T22:59:59Z'),{}, {engineRuntime:engine});assert.equal(metric(before,'pvKWh','year').value,12);
 const after=summary.sample(at('2026-12-31T23:00:00Z'),{}, {engineRuntime:engine});for(const name of ['day','month','year'])assert.equal(metric(after,'pvKWh',name).value,null);
 assert.equal(after.periods.day.key,'2027-01-01');assert.equal(after.periods.month.key,'2027-01');assert.equal(after.periods.year.key,'2027');assert.equal(engine.days['2026-12-31'].pvKWh,12);
});
test('battery integrates signed charge/discharge separately and splits a zero crossing exactly',()=>{
 const now=at('2026-11-08T12:00:00Z'),summary=new EnergySummary();summary.sample(now,{batteryW:-1000});let out=summary.sample(now+60000,{batteryW:1000});
 close(metric(out,'batteryChargeKWh').value,1/240);close(metric(out,'batteryDischargeKWh').value,1/240);assert.equal(metric(out,'batteryChargeKWh').coveredSec,60);
 out=summary.sample(now+120000,{batteryW:1000});close(metric(out,'batteryDischargeKWh').value,1/240+1/60);assert.equal(metric(out,'batteryChargeKWh').source,'measured-power');
});
test('valid zero battery power is measured zero, whereas missing/invalid/stale-filtered samples create gaps',()=>{
 const now=at('2026-11-08T12:00:00Z'),summary=new EnergySummary();let out=summary.sample(now,{batteryW:0});assert.equal(metric(out,'batteryChargeKWh').value,null);
 out=summary.sample(now+5000,{batteryW:0});assert.equal(metric(out,'batteryChargeKWh').value,0);assert.equal(metric(out,'batteryDischargeKWh').value,0);
 for(const [i,batteryW]of [null,undefined,NaN,'1000',true,50001].entries())summary.sample(now+10000+i*5000,{batteryW});
 summary.sample(now+50000,{batteryW:1000});out=summary.sample(now+55000,{batteryW:1000});assert.equal(metric(out,'batteryDischargeKWh').coveredSec,10);close(metric(out,'batteryDischargeKWh').value,5/3600);
});
test('battery does not bridge long gaps, source remapping, restarts or backwards clock movement',()=>{
 const now=at('2026-11-08T12:00:00Z'),summary=new EnergySummary();summary.sample(now,{batteryW:1000},{sourceSignature:'old'});summary.sample(now+5000,{batteryW:1000},{sourceSignature:'old'});
 summary.sample(now+100001,{batteryW:1000},{sourceSignature:'old'});let out=summary.sample(now+105001,{batteryW:1000},{sourceSignature:'new'});assert.equal(metric(out,'batteryDischargeKWh').coveredSec,5);
 out=summary.sample(now+110001,{batteryW:1000},{sourceSignature:'new'});assert.equal(metric(out,'batteryDischargeKWh').coveredSec,10);
 const restored=new EnergySummary(summary.runtime());restored.sample(now+115001,{batteryW:1000},{sourceSignature:'new'});out=restored.sample(now+120001,{batteryW:1000},{sourceSignature:'new'});assert.equal(metric(out,'batteryDischargeKWh').coveredSec,15);
 restored.sample(now+100000,{batteryW:1000},{sourceSignature:'new'});restored.sample(now+110000,{batteryW:1000},{sourceSignature:'new'});restored.sample(now+125001,{batteryW:1000},{sourceSignature:'new'});out=restored.sample(now+130001,{batteryW:1000},{sourceSignature:'new'});assert.equal(metric(out,'batteryDischargeKWh').coveredSec,20);
});
test('a battery interval crossing local midnight is divided between day/month/year',()=>{
 const start=at('2026-12-31T22:59:30Z'),summary=new EnergySummary();summary.sample(start,{batteryW:-1200});const out=summary.sample(start+60000,{batteryW:-1200});
 close(summary.runtime().days['2026-12-31'].batteryChargeKWh,.01);close(summary.runtime().days['2027-01-01'].batteryChargeKWh,.01);for(const period of ['day','month','year'])close(metric(out,'batteryChargeKWh',period).value,.01);assert.equal(metric(out,'batteryChargeKWh').coveredSec,30);
});
test('DST battery intervals remain absolute elapsed time and are assigned to local dates',()=>{
 for(const start of [at('2026-03-29T00:59:30Z'),at('2026-10-25T00:59:30Z')]){
  const summary=new EnergySummary();summary.sample(start,{batteryW:3600});const out=summary.sample(start+60000,{batteryW:3600});close(metric(out,'batteryDischargeKWh').value,.06);assert.equal(metric(out,'batteryDischargeKWh').coveredSec,60);assert.equal(Object.keys(summary.runtime().days).length,1);
 }
});
test('invalid persisted battery rows and future engine days do not become plausible totals',()=>{
 const now=at('2026-11-08T12:00:00Z'),summary=new EnergySummary({version:1,days:{'2026-11-08':{batteryChargeKWh:7,batteryDischargeKWh:1,coveredSec:0},'2026-99-99':{batteryChargeKWh:7,batteryDischargeKWh:1,coveredSec:20}}});const out=summary.sample(now,{}, {engineRuntime:{days:{'2026-11-09':record({pvKWh:100}),'2026-11-08':{pvKWh:-5,importKWh:'7'}}}});
 assert.equal(metric(out,'batteryChargeKWh').value,null);assert.equal(metric(out,'pvKWh','month').value,null);assert.equal(metric(out,'importKWh').value,null);assert.throws(()=>summary.sample(NaN,{}),/Zeitstempel/);
});
