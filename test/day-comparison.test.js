'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DayComparison,validateDayComparisonRuntime,MAX_BUCKETS}=require('../lib/day-comparison');
const {midnight}=require('../lib/energy-summary');
const DEVICE={id:'pump',name:'Wärmepumpe',measuredW:'meter.0.pumpW'},OPTIONS={houseSignature:'same house source'};
const close=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function fill(engine,day,minutes,{house=1000,pump=500,device=DEVICE,options=OPTIONS}={}){
 let result;for(let second=0;second<=minutes*60;second+=60)result=engine.sample(midnight(day)+second*1000,{houseW:house},[device],{pump},options);return result;
}
function clone(value){return JSON.parse(JSON.stringify(value));}
function total(engine){return Object.values(engine.runtime().days).reduce((sum,day)=>sum+Object.values(day.series).filter(row=>row.kind==='house').reduce((s,row)=>s+row.buckets.filter(Boolean).reduce((v,bucket)=>v+bucket[0],0),0),0);}
function series(runtime,day,kind='house'){return Object.values(runtime.days[day].series).find(row=>row.kind===kind);}
test('same-time comparison uses house and consumers independently and ranks measured increases',()=>{
 const engine=new DayComparison();fill(engine,'2026-11-08',120,{house:1000,pump:500});const result=fill(engine,'2026-11-09',120,{house:1500,pump:250});
 assert.equal(result.status,'ok');assert.equal(result.cutoffMinutes,120);assert.equal(result.house.basis,'same-time');close(result.house.todayKWh,3);close(result.house.baselineKWh,2);close(result.house.deltaKWh,1);close(result.house.deltaPct,50);
 const pump=result.rows[0];close(pump.todayKWh,.5);close(pump.baselineKWh,1);close(pump.deltaKWh,-.5);assert.equal(pump.status,'comparable');assert.deepEqual(pump.baselineDays,['2026-11-08']);
 assert.deepEqual(result.increases.map(row=>row.id),['house']);assert.equal(result.house.coveragePct,100);assert.equal(result.house.coveredSec,7200);
});
test('baseline means only the preceding seven source-matched days at the same cutoff',()=>{
 const engine=new DayComparison();fill(engine,'2026-11-01',60,{house:9000});for(let day=2;day<=8;day++)fill(engine,`2026-11-${String(day).padStart(2,'0')}`,60,{house:1000});const result=fill(engine,'2026-11-09',60,{house:2000});
 close(result.house.todayKWh,2);close(result.house.baselineKWh,1);assert.equal(result.house.baselineDays.length,7);assert.equal(result.house.baselineDays[0],'2026-11-02');assert.equal(result.house.baselineDays.at(-1),'2026-11-08');
});
test('an unfinished today is never compared with a full previous day and unfinished quarters are excluded',()=>{
 const engine=new DayComparison();fill(engine,'2026-11-08',240,{house:1000});const result=fill(engine,'2026-11-09',127,{house:2000});
 assert.equal(result.cutoffMinutes,120);assert.equal(result.window.end,midnight('2026-11-09')+120*60000);close(result.house.todayKWh,4);close(result.house.baselineKWh,2);close(result.house.deltaKWh,2);
});
test('measured zero is a valid baseline while absent measurements remain unknown',()=>{
 const engine=new DayComparison();fill(engine,'2026-11-08',60,{house:0,pump:0});const result=fill(engine,'2026-11-09',60,{house:1000,pump:500});
 assert.equal(result.house.baselineKWh,0);assert.equal(result.house.deltaPct,null);assert.equal(result.house.deltaKWh,1);assert.equal(result.rows[0].deltaPct,null);
 const missing=new DayComparison();let empty;for(let second=0;second<=3600;second+=60)empty=missing.sample(midnight('2026-11-09')+second*1000,{houseW:null},[DEVICE],{pump:null},OPTIONS);
 assert.equal(empty.house.todayKWh,null);assert.equal(empty.house.status,'insufficient');assert.equal(empty.rows[0].todayKWh,null);assert.deepEqual(empty.increases,[]);
});
test('comparisons use only the same fully measured quarters and refuse insufficient shared coverage',()=>{
 const engine=new DayComparison();fill(engine,'2026-11-08',240);fill(engine,'2026-11-09',240);const runtime=engine.runtime();
 series(runtime,'2026-11-09').buckets[4]=null;
 const partial=new DayComparison(runtime),now=midnight('2026-11-09')+240*60000;let result=partial.sample(now,{houseW:1000},[DEVICE],{pump:500},OPTIONS);
 assert.equal(result.house.status,'comparable');assert.equal(result.house.coveragePct,93.75);assert.equal(result.house.partial,true);close(result.house.todayKWh,3.75);close(result.house.baselineKWh,3.75);
 series(runtime,'2026-11-09').buckets[5]=null;result=new DayComparison(runtime).sample(now,{houseW:1000},[DEVICE],{pump:500},OPTIONS);assert.equal(result.house.status,'insufficient');assert.equal(result.house.deltaKWh,null);
});
test('multiple baselines must share the same covered window rather than different missing periods',()=>{
 const engine=new DayComparison();for(const day of ['2026-11-07','2026-11-08','2026-11-09'])fill(engine,day,240);
 const runtime=engine.runtime();series(runtime,'2026-11-07').buckets[0]=null;series(runtime,'2026-11-08').buckets[1]=null;
 const result=new DayComparison(runtime).sample(midnight('2026-11-09')+240*60000,{houseW:1000},[DEVICE],{pump:500},OPTIONS);
 assert.equal(result.house.status,'comparable');assert.deepEqual(result.house.baselineDays,['2026-11-08']);assert.equal(result.house.coveragePct,93.75);close(result.house.todayKWh,result.house.baselineKWh);
});
test('source changes isolate device and house history without mixing earlier energy',()=>{
 const engine=new DayComparison();fill(engine,'2026-11-08',60);const changedDevice={...DEVICE,measuredW:'meter.0.newPump'};
 let result=fill(engine,'2026-11-09',60,{device:changedDevice});assert.equal(result.house.status,'comparable');assert.equal(result.rows[0].status,'insufficient');assert.equal(result.rows[0].baselineKWh,null);
 const houseChanged=new DayComparison();fill(houseChanged,'2026-11-08',60);result=fill(houseChanged,'2026-11-09',60,{options:{houseSignature:'new house source'}});assert.equal(result.house.status,'insufficient');assert.equal(result.rows[0].status,'comparable');
});
test('integration is not duplicated by equal timestamps, backwards clocks, restarts or reset anchors',()=>{
 const engine=new DayComparison(),start=midnight('2026-11-09');engine.sample(start,{houseW:3600},[],{},OPTIONS);engine.sample(start+5000,{houseW:3600},[],{},OPTIONS);close(total(engine),.005);
 engine.sample(start+5000,{houseW:3600},[],{},OPTIONS);close(total(engine),.005);
 const restored=new DayComparison(engine.runtime());restored.sample(start+10000,{houseW:3600},[],{},OPTIONS);close(total(restored),.005);restored.sample(start+15000,{houseW:3600},[],{},OPTIONS);close(total(restored),.010);
 restored.sample(start-86400000,{houseW:3600},[],{},OPTIONS);assert.ok(restored.runtime().days['2026-11-09']);close(total(restored),.010);
 restored.sample(start+10000,{houseW:3600},[],{},OPTIONS);restored.sample(start+15000,{houseW:3600},[],{},OPTIONS);close(total(restored),.010);
 restored.sample(start+20000,{houseW:3600},[],{},OPTIONS);close(total(restored),.015);restored.reset();restored.sample(start+25000,{houseW:3600},[],{},OPTIONS);close(total(restored),.015);
});
test('invalid power and long sample gaps interrupt integration instead of inventing consumption',()=>{
 const engine=new DayComparison(),start=midnight('2026-11-09');engine.sample(start,{houseW:3600},[],{},OPTIONS);engine.sample(start+5000,{houseW:3600},[],{},OPTIONS);close(total(engine),.005);
 engine.sample(start+100000,{houseW:3600},[],{},OPTIONS);close(total(engine),.005);engine.sample(start+105000,{houseW:null},[],{},OPTIONS);engine.sample(start+110000,{houseW:3600},[],{},OPTIONS);close(total(engine),.005);engine.sample(start+115000,{houseW:3600},[],{},OPTIONS);close(total(engine),.010);
 for(const bad of ['3600',true,-1,Infinity,100000001])engine.sample(start+120000,{houseW:bad},[],{},OPTIONS);close(total(engine),.010);
 assert.throws(()=>engine.sample(NaN,{}),/Zeitstempel/);assert.throws(()=>engine.sample(start+.5,{}),/Zeitstempel/);
});
test('quarter and local midnight splits retain exact measured energy on each date',()=>{
 const engine=new DayComparison(),start=midnight('2026-11-10')-30000;engine.sample(start,{houseW:3600},[],{},OPTIONS);engine.sample(start+60000,{houseW:3600},[],{},OPTIONS);
 const runtime=engine.runtime();close(series(runtime,'2026-11-09').buckets[95][0],.03);close(series(runtime,'2026-11-10').buckets[0][0],.03);assert.equal(series(runtime,'2026-11-10').buckets[0][1],30);assert.equal(series(runtime,'2026-11-09').buckets[95][1],30);
});
test('DST dates retain physical elapsed energy but do not claim an ordinary same-clock comparison',()=>{
 for(const iso of ['2026-03-29T00:59:30Z','2026-10-25T00:59:30Z']){
  const engine=new DayComparison(),start=Date.parse(iso);engine.sample(start,{houseW:3600},[DEVICE],{pump:1000},OPTIONS);const result=engine.sample(start+60000,{houseW:3600},[DEVICE],{pump:1000},OPTIONS);
  close(total(engine),.06);assert.equal(result.status,'dst-day');assert.equal(result.house.status,'insufficient');assert.equal(result.house.deltaKWh,null);assert.deepEqual(result.increases,[]);assert.ok(result.excludedDstDays.includes(result.day));
 }
 const engine=new DayComparison();fill(engine,'2026-10-25',60,{house:9000});fill(engine,'2026-10-26',60,{house:1000});const result=fill(engine,'2026-10-27',60,{house:2000});
 assert.deepEqual(result.house.baselineDays,['2026-10-26']);close(result.house.baselineKWh,1);assert.ok(result.excludedDstDays.includes('2026-10-25'));
});
function history(proven=true){
 const points=[];for(const day of ['2026-11-08','2026-11-09'])for(let minute=0;minute<=60;minute++)points.push({ts:midnight(day)+minute*60000,values:{houseW:day==='2026-11-09'?2000:1000,'device:pump':500},...(proven?{sourceIds:{house:OPTIONS.houseSignature,'device:pump':DEVICE.measuredW}}:{})});return points;
}
test('historical power seeds comparisons only with matching provenance and is not added twice after restart',()=>{
 const now=midnight('2026-11-09')+3600000;
 let engine=new DayComparison({},history(false)),result=engine.sample(now,{houseW:2000},[DEVICE],{pump:500},OPTIONS);assert.equal(result.house.status,'insufficient');assert.equal(result.house.todayKWh,null);assert.equal(Object.keys(engine.runtime().days).length,0);
 engine=new DayComparison({},history(true));result=engine.sample(now,{houseW:2000},[DEVICE],{pump:500},OPTIONS);assert.equal(result.house.status,'comparable');close(result.house.todayKWh,2);close(result.house.baselineKWh,1);assert.equal(result.rows[0].status,'comparable');
 const before=total(engine),saved=engine.runtime();engine=new DayComparison(saved,history(true));result=engine.sample(now,{houseW:2000},[DEVICE],{pump:500},OPTIONS);close(total(engine),before);assert.equal(result.house.status,'comparable');
 const wrong=history(true);for(const point of wrong)point.sourceIds['device:pump']='meter.0.other';result=new DayComparison({},wrong).sample(now,{houseW:2000},[DEVICE],{pump:500},OPTIONS);assert.equal(result.house.status,'comparable');assert.equal(result.rows[0].status,'insufficient');
});
function archive(today={}){return {version:1,days:{'2026-11-07':{pump:{sourceId:DEVICE.measuredW,kWh:6,coveredSec:86400}},'2026-11-08':{pump:{sourceId:DEVICE.measuredW,kWh:7,coveredSec:86400}},'2026-11-09':{pump:{sourceId:DEVICE.measuredW,kWh:8,coveredSec:7200,...today}}}};}
test('fallback is explicitly positive whole-day exceeded evidence and never masquerades as a same-time result',()=>{
 const engine=new DayComparison(),now=midnight('2026-11-09')+7200000,result=engine.sample(now,{houseW:null},[DEVICE],{pump:null},{...OPTIONS,consumerArchive:archive()});const row=result.rows[0];
 assert.equal(row.status,'comparable');assert.equal(row.basis,'full-day-exceeded');close(row.todayKWh,8);close(row.baselineKWh,6.5);close(row.deltaKWh,1.5);assert.equal(row.referenceWindow.endMinute,1440);assert.match(row.reason,/ganzer Vergleichstag/);assert.equal(result.house.status,'insufficient');
 const notExceeded=new DayComparison().sample(now,{},[DEVICE],{},{...OPTIONS,consumerArchive:archive({kWh:6})});assert.equal(notExceeded.rows[0].status,'insufficient');assert.equal(notExceeded.rows[0].baselineKWh,null);
 const zero=archive();zero.days['2026-11-07'].pump.kWh=0;zero.days['2026-11-08'].pump.kWh=0;const zeroOut=new DayComparison().sample(now,{},[DEVICE],{},{...OPTIONS,consumerArchive:zero});assert.equal(zeroOut.rows[0].deltaPct,null);assert.equal(zeroOut.rows[0].baselineKWh,0);
});
test('fallback rejects remapped or incomplete old days, but a partial observed today may already exceed a whole day',()=>{
 const now=midnight('2026-11-09')+7200000,data=archive({coveredSec:3600,partial:true});let result=new DayComparison().sample(now,{},[DEVICE],{},{...OPTIONS,consumerArchive:data});assert.equal(result.rows[0].basis,'full-day-exceeded');assert.equal(result.rows[0].partial,true);assert.equal(result.rows[0].coveragePct,50);
 data.days['2026-11-07'].pump.sourceId='meter.0.old';data.days['2026-11-08'].pump.coveredSec=1000;result=new DayComparison().sample(now,{},[DEVICE],{},{...OPTIONS,consumerArchive:data});assert.equal(result.rows[0].status,'insufficient');
 const mixed=archive();mixed.days['2026-11-09'].pump.sourceChanged=true;result=new DayComparison().sample(now,{},[DEVICE],{},{...OPTIONS,consumerArchive:mixed});assert.equal(result.rows[0].status,'insufficient');
 const future=archive();future.days['2026-11-09'].pump.coveredSec=7201.1;result=new DayComparison().sample(now,{},[DEVICE],{},{...OPTIONS,consumerArchive:future});assert.equal(result.rows[0].status,'insufficient');
});
test('same-time measured profiles take precedence over a daily fallback and never sum device deltas into house energy',()=>{
 const engine=new DayComparison();fill(engine,'2026-11-08',60,{house:1000,pump:2000});fill(engine,'2026-11-09',60,{house:1000,pump:1000});const data=archive({coveredSec:3600});const result=engine.sample(midnight('2026-11-09')+3600000,{houseW:1000},[DEVICE],{pump:1000},{...OPTIONS,consumerArchive:data});
 assert.equal(result.rows[0].basis,'same-time');assert.equal(result.rows[0].deltaKWh,-1);assert.equal(result.house.deltaKWh,0);assert.deepEqual(result.increases,[]);
});
test('runtime is detached, bounded, strictly validated and old or bad archives cannot create plausible comparisons',()=>{
 const engine=new DayComparison();fill(engine,'2026-11-08',15);const runtime=engine.runtime();validateDayComparisonRuntime(runtime);series(runtime,'2026-11-08').buckets[0][0]=100;assert.notEqual(series(engine.runtime(),'2026-11-08').buckets[0][0],100);
 const bad=engine.runtime();series(bad,'2026-11-08').buckets[0][1]=901;assert.throws(()=>validateDayComparisonRuntime(bad),/Messabdeckung/);assert.equal(Object.keys(new DayComparison(bad).runtime().days).length,0);
 const badKey=engine.runtime(),record=badKey.days['2026-11-08'];record.series['wrong-key']=record.series[Object.keys(record.series)[0]];assert.throws(()=>validateDayComparisonRuntime(badKey),/Messreihe/);
 const invalidDate=engine.runtime();invalidDate.days['2026-02-30']=invalidDate.days['2026-11-08'];assert.throws(()=>validateDayComparisonRuntime(invalidDate),/Ungültiger Tag/);
 const future=engine.runtime();future.lastSampleAt=midnight('2026-11-08')+300000;assert.throws(()=>validateDayComparisonRuntime(future),/Messabdeckung/);
 const noWatermark=engine.runtime();noWatermark.lastSampleAt=null;assert.throws(()=>validateDayComparisonRuntime(noWatermark),/Erfassungszeitpunkt/);
 const expired=new DayComparison(engine.runtime());expired.sample(midnight('2026-12-20'),{},[],{},OPTIONS);assert.equal(Object.keys(expired.runtime().days).length,0);
 assert.deepEqual(validateDayComparisonRuntime({}),{version:1,bucketSeconds:900,lastSampleAt:null,days:{}});
});
test('maximum consumer profiles prune whole oldest days at the bucket cap and remain fully backuppable',()=>{
 const {buildBackup,REQUIRED_IDS}=require('../lib/backup');
 const {defaultSources,defaultConsumers}=require('../lib/normalize');
 const {defaultHeating}=require('../lib/heating'),{defaultForecast}=require('../lib/forecast');
 const devices=Array.from({length:250},(_,index)=>({id:'d'+String(index).padStart(3,'0'),name:'Gerät '+index,measuredW:'meter.0.d'+index}));
 const measured=Object.fromEntries(devices.map(device=>[device.id,100]));
 const base=new DayComparison(),first=midnight('2026-11-01');
 base.sample(first,{houseW:1000},devices,measured,OPTIONS);base.sample(first+60000,{houseW:1000},devices,measured,OPTIONS);
 const template=base.runtime().days['2026-11-01'].series;
 const runtime={version:1,bucketSeconds:900,lastSampleAt:midnight('2026-11-13')+43*900000,days:{}};
 for(let index=1;index<=13;index++){
  const day='2026-11-'+String(index).padStart(2,'0'),buckets=index===13?43:96;
  runtime.days[day]={series:Object.fromEntries(Object.entries(template).map(([key,row])=>[key,{...row,buckets:Array.from({length:buckets},()=>[row.kind==='house'?.25:.025,900])}]))};
 }
 const count=value=>Object.values(value.days).reduce((sum,day)=>sum+Object.values(day.series).reduce((subtotal,row)=>subtotal+row.buckets.filter(Boolean).length,0),0);
 assert.equal(count(runtime),299945);validateDayComparisonRuntime(runtime);
 const engine=new DayComparison(runtime),start=runtime.lastSampleAt;
 engine.sample(start,{houseW:1000},devices,measured,OPTIONS);const result=engine.sample(start+60000,{houseW:1000},devices,measured,OPTIONS);
 const saved=engine.runtime();assert.ok(count(saved)<=MAX_BUCKETS);assert.equal(Object.hasOwn(saved.days,'2026-11-01'),false);assert.equal(Object.keys(saved.days).length,12);
 assert.equal(Object.values(saved.days['2026-11-02'].series).length,251);assert.equal(result.house.status,'comparable');assert.equal(result.house.baselineDays.length,7);validateDayComparisonRuntime(saved);
 const states=Object.fromEntries(REQUIRED_IDS.map(id=>[id,{val:['config.hardwareMaster','migration.done'].includes(id)?false:['history.intervals','history.power','heating.history'].includes(id)?'[]':'{}'}]));
 for(const [id,value]of Object.entries({'config.sources':defaultSources(),'config.consumers':defaultConsumers(),'config.heating':defaultHeating(),'config.forecast':defaultForecast(),'internal.dayComparison':saved}))states[id]={val:JSON.stringify(value)};
 const backup=buildBackup({states,namespace:'energiemanagement.0',version:'0.10.0',now:start+60000});
 assert.equal(JSON.parse(backup.states['internal.dayComparison'].val).lastSampleAt,start+60000);
 const tooMany=clone(runtime);const row=Object.values(tooMany.days['2026-11-13'].series)[0];row.buckets.push([.25,900]);tooMany.lastSampleAt+=900000;
 // Add enough legitimate same-quarter rows to cross the persisted archive limit.
 for(const next of Object.values(tooMany.days['2026-11-13'].series).slice(1,57))next.buckets.push([.025,900]);
 assert.throws(()=>validateDayComparisonRuntime(tooMany),/300\.000/);
});
