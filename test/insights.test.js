'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EnergyInsights}=require('../lib/insights');
const {ConsumerEnergy}=require('../lib/consumer-energy');
const {normalizeConsumers,defaultSources}=require('../lib/normalize');
const base=Date.UTC(2026,10,7,10);
const device=(id,priority=1,type='switch')=>({id,name:id,enabled:true,requested:true,mode:'auto',type,minW:1000,maxW:2000,priority,measuredW:'test.'+id});
const live={importW:0,exportW:5000,pvW:6000,houseW:1000,batteryW:0};
function sample(engine,seconds=300,ds=[device('first')],l=live,meas={first:0},opts={}){let out;for(let t=0;t<=seconds;t+=5)out=engine.sample(base+t*1000,l,ds,meas,{reserveW:500},opts);return out;}
test('waits five minutes and allocates a shared budget by priority',()=>{
 const e=new EnergyInsights(),ds=[device('later',2),device('first',1)];
 const r=sample(e,300,ds,live,{later:0,first:0});
 assert.equal(r.advice.stableW,4500);assert.deepEqual(r.advice.recommendations.map(d=>d.targetW),[2000,2000]);
 assert.equal(e.history.length,6);
});
test('does not recommend before complete stability window',()=>assert.equal(sample(new EnergyInsights(),295).advice.recommendations[0].code,'observing'));
test('a cloud drop uses minimum surplus rather than average',()=>{
 const e=new EnergyInsights();sample(e,295);const r=e.sample(base+300000,{...live,exportW:1000},[device('first')],{first:0},{reserveW:500});
 assert.equal(r.advice.stableW,500);assert.equal(r.advice.recommendations[0].code,'wait');
});
test('no double allocation and parallel limit includes running loads',()=>{
 const ds=[device('first'),device('second',2),device('third',3)];
 const r=sample(new EnergyInsights(),300,ds,live,{first:0,second:0,third:0});
 assert.deepEqual(r.advice.recommendations.map(x=>x.targetW),[2000,2000,0]);
 const p=sample(new EnergyInsights(),300,ds,live,{first:100,second:0,third:0},{maxParallel:1});
 assert.equal(p.advice.recommendations[1].code,'parallel');
});
test('missing data blocks recommendations and records gaps, zero remains valid',()=>{
 const r=sample(new EnergyInsights(),300,[device('first')],{...live,exportW:null},{first:null});
 assert.equal(r.advice.valid,false);assert.equal(r.advice.recommendations[0].code,'unknown');
 const e=new EnergyInsights();const x=sample(e,0,[device('first')],{...live,pvW:null,exportW:0},{first:0});
 assert.equal(e.history[0].values.pvW,null);assert.equal(e.history[0].values['device:first'],0);assert.equal(x.advice.valid,true);
});
test('battery discharge is subtracted and a configured missing battery blocks',()=>{
 assert.equal(sample(new EnergyInsights(),300,[device('first')],{...live,batteryW:4500},{first:0},{hasBattery:true}).advice.stableW,0);
 assert.equal(sample(new EnergyInsights(),300,[device('first')],{...live,batteryW:null},{first:0},{hasBattery:true}).advice.valid,false);
});
test('long gaps, configuration changes and restarts reset stability',()=>{
 const e=new EnergyInsights();sample(e);assert.equal(e.sample(base+500000,live,[device('first')],{first:0},{reserveW:500}).advice.stable,false);
 sample(e);assert.equal(e.sample(base+305000,live,[device('first')],{first:0},{reserveW:600}).advice.stable,false);
 assert.equal(sample(new EnergyInsights(e.history),0).advice.stable,false);
});
test('archive retention is bounded and future points are removed',()=>{
 const e=new EnergyInsights([{ts:base-49*3600000,values:{}},{ts:base+90000,values:{}}]);sample(e,0);assert.equal(e.history.length,1);assert.equal(e.history[0].ts,base);
});
test('running, disabled and not requested consumers have explicit reasons',()=>{
 const ds=[device('first'),{...device('second'),enabled:false},{...device('third'),requested:false}];
 assert.deepEqual(sample(new EnergyInsights(),300,ds,live,{first:100,second:0,third:0}).advice.recommendations.map(x=>x.code),['running','disabled','prepare']);
});
test('normalization retains feedback mapping and defaults stay empty',()=>{
 const d=normalizeConsumers({devices:[{...device('first'),statusId:'test.first.on'}]});assert.equal(d.devices[0].statusId,'test.first.on');assert.equal(defaultSources().importW.id,'');
});
test('consumer energy trapezoid excludes long gaps and retains imported history',()=>{
 const e=new ConsumerEnergy({version:1,days:{'2026-11-06':{}}}),ds=[device('first')];
 e.sample(base,ds,{first:1000});e.sample(base+60000,ds,{first:2000});
 assert.ok(Math.abs(e.days['2026-11-07'].first.kWh-.025)<1e-8);
 e.sample(base+180000,ds,{first:2000});assert.equal(e.days['2026-11-07'].first.kWh,.025);assert.ok(e.days['2026-11-06']);
});
test('consumer energy splits Vienna midnight without duplicating energy',()=>{
 const e=new ConsumerEnergy(),t=Date.UTC(2026,10,7,22,59,30),ds=[device('first')];
 e.sample(t,ds,{first:1200});e.sample(t+60000,ds,{first:1200});
 assert.equal(e.days['2026-11-07'].first.kWh,.01);assert.equal(e.days['2026-11-08'].first.kWh,.01);
});
