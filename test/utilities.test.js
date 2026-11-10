'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Utilities,defaultUtilities,normalizeUtilities}=require('../lib/utilities');
const {midnight}=require('../lib/energy-summary');
const base=Date.parse('2026-11-08T11:00:00Z');
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≈ ${expected}`);
const reading=(value,ts)=>({value,ts,ack:true,q:0});
function water(mode='flow',unit=mode==='flow'?'l/min':'m³'){const c=defaultUtilities();c.water={enabled:true,mode,stateId:'meter.0.water',unit,factor:1};return c;}
function fuel(type='pellets',mode='counter'){const c=defaultUtilities();c.fuel={enabled:true,type,mode,stateId:'meter.0.fuel',factor:1,rateTime:'h'};return c;}

test('optional modules default off and report missing usage rather than treating cumulative counter as consumption',()=>{
 const u=new Utilities(),c=defaultUtilities(),d=u.sample(base,c,{water:reading(600,base),fuel:reading(1000,base)});
 assert.equal(d.water.enabled,false);assert.equal(d.fuel.enabled,false);assert.equal(d.water.periods.day.value,null);assert.equal(d.fuel.periods.year.value,null);
 const first=new Utilities().sample(base,water('counter'),{water:reading(600,base)});assert.equal(first.water.live.counterValue,600);assert.equal(first.water.periods.day.value,null);
});
test('strict configuration accepts mode units and read-only alias inputs without allowing recursive/system sources',()=>{
 const c=water('counter','m3');c.water.stateId='alias.0.water';assert.equal(normalizeUtilities(c).water.unit,'m³');
 for(const mutate of [c=>c.water.factor=0,c=>c.water.factor=-1,c=>c.water.factor=Infinity,c=>c.water.factor='1',c=>c.water.enabled='true',c=>c.water.unit='kg',c=>c.water.stateId='system.adapter.admin.0',c=>c.water.stateId='energiemanagement.0.utilities.water',c=>c.fuel.type='coal',c=>c.fuel.rateTime='s',c=>c.water.mode='both']){const input=water();mutate(input);assert.throws(()=>normalizeUtilities(input));}
 for(const input of [null,[],false,'water'])assert.throws(()=>normalizeUtilities(input));
 const empty=water();empty.water.stateId='';assert.equal(new Utilities().sample(base,empty,{}).water.status,'unconfigured');
});
test('all supported water flow units and calibration yield the same measured cubic metres',()=>{
 for(const [unit,value]of [['l/min',10],['l/h',600],['m³/h',.6]]){const u=new Utilities(),c=water('flow',unit);u.sample(base,c,{water:reading(value,base)});const s=u.sample(base+60000,c,{water:reading(value,base+60000)});close(s.water.periods.day.value,.01);close(s.water.periods.month.value,.01);close(s.water.live.flowPerHour,.6);assert.equal(s.water.live.unit,'m³/h');}
 const u=new Utilities(),c=water('flow','l/min');c.water.factor=.001;u.sample(base,c,{water:reading(10000,base)});close(u.sample(base+60000,c,{water:reading(10000,base+60000)}).water.periods.day.value,.01);
});
test('water counter units convert totals and record only positive differences, including measured zero',()=>{
 const u=new Utilities(),c=water('counter','l');u.sample(base,c,{water:reading(100000,base)});let d=u.sample(base+10000,c,{water:reading(100000,base)});assert.equal(d.water.periods.day.value,0);assert.equal(d.water.periods.day.coveredSec,10);
 d=u.sample(base+20000,c,{water:reading(100010,base+20000)});close(d.water.periods.day.value,.01);close(d.water.live.counter,100.01);assert.equal(d.water.live.flowPerHour,null);
});
test('fuel keeps native kg, l and m³ and supports counter or hourly consumption independently',()=>{
 for(const [type,unit]of [['pellets','kg'],['oil','l'],['gas','m³']]){
  const u=new Utilities(),c=fuel(type);u.sample(base,c,{fuel:reading(20,base)});const d=u.sample(base+60000,c,{fuel:reading(22,base+60000)});assert.equal(d.fuel.unit,unit);assert.equal(d.fuel.periods.day.value,2);
  const r=new Utilities(),rc=fuel(type,'flow');r.sample(base,rc,{fuel:reading(6,base)});close(r.sample(base+60000,rc,{fuel:reading(6,base+60000)}).fuel.periods.day.value,.1);
 }
});
test('flow trapezoids split exactly at Vienna day/month/year boundaries without resetting the meter or history',()=>{
 const boundary=midnight('2027-01-01'),u=new Utilities(),c=water();u.sample(boundary-30000,c,{water:reading(10,boundary-30000)});const d=u.sample(boundary+30000,c,{water:reading(10,boundary+30000)});
 close(d.water.periods.day.value,.005);close(d.water.periods.month.value,.005);close(d.water.periods.year.value,.005);assert.equal(d.water.periods.year.key,'2027');assert.equal(d.water.periods.day.coveredSec,30);assert.equal(d.water.periods.day.partial,false);assert.equal(d.water.periods.day.estimatedBoundary,false);close(u.runtime().days.water['2026-12-31'].value,.005);
 const next=u.sample(midnight('2027-02-01'),c,{});assert.equal(next.water.periods.day.value,null);assert.equal(next.water.periods.month.value,null);close(next.water.periods.year.value,.005);assert.ok(u.runtime().days.water['2026-12-31']);
});
test('counter differences crossing midnight are explicitly labelled as estimated distribution',()=>{
 const boundary=midnight('2027-01-01'),u=new Utilities(),c=fuel('gas');u.sample(boundary-30000,c,{fuel:reading(100,boundary-30000)});const d=u.sample(boundary+30000,c,{fuel:reading(106,boundary+30000)});
 assert.equal(d.fuel.periods.day.value,3);assert.equal(d.fuel.periods.year.value,3);assert.equal(d.fuel.periods.day.estimatedBoundary,true);assert.equal(d.fuel.periods.day.partial,true);assert.equal(u.runtime().days.gas['2026-12-31'].value,3);
});
test('DST-aware period boundaries have 23 and 25 hours and flow integration remains physical',()=>{
 for(const [day,hours]of [['2026-03-29',23],['2026-10-25',25]]){
  const start=midnight(day),u=new Utilities(),c=water('flow','m³/h');const s=u.sample(start+60000,c,{water:reading(1,start+60000)});assert.equal((s.water.periods.day.end-s.water.periods.day.start)/3600000,hours);
  const d=u.sample(start+120000,c,{water:reading(1,start+120000)});close(d.water.periods.day.value,1/60);
 }
});
test('long flow gaps, invalid readings and stale/future timestamps interrupt integration',()=>{
 for(const bad of [null,{value:'10',ts:base+10000},reading(-1,base+10000),reading(NaN,base+10000),reading(Infinity,base+10000),{value:10,ts:base+10000,ack:false},{value:10,ts:base+10000,q:16},reading(10,base-130000),reading(10,base+50000)]){
  const u=new Utilities(),c=water();u.sample(base,c,{water:reading(10,base)});assert.equal(u.sample(base+10000,c,{water:bad}).water.periods.day.value,null);assert.equal(u.sample(base+20000,c,{water:reading(10,base+20000)}).water.periods.day.value,null);close(u.sample(base+30000,c,{water:reading(10,base+30000)}).water.periods.day.value,1/600);
 }
 const u=new Utilities(),c=water();u.sample(base,c,{water:reading(10,base)});const gap=u.sample(base+91000,c,{water:reading(10,base+91000)});assert.equal(gap.water.status,'gap');assert.equal(gap.water.periods.day.value,null);close(u.sample(base+151000,c,{water:reading(10,base+151000)}).water.periods.day.value,.01);
});
test('counter resets and long polling gaps establish a new baseline',()=>{
 const u=new Utilities(),c=water('counter');u.sample(base,c,{water:reading(100,base)});let s=u.sample(base+10000,c,{water:reading(2,base+10000)});assert.equal(s.water.status,'counter-reset');assert.equal(s.water.periods.day.value,null);s=u.sample(base+20000,c,{water:reading(2.5,base+20000)});close(s.water.periods.day.value,.5);
 const g=new Utilities();g.sample(base,c,{water:reading(100,base)});s=g.sample(base+301000,c,{water:reading(101,base+301000)});assert.equal(s.water.status,'gap');assert.equal(s.water.periods.day.value,null);close(g.sample(base+311000,c,{water:reading(102,base+311000)}).water.periods.day.value,1);
 const stale=new Utilities().sample(base,c,{water:reading(100,base-86400001)});assert.equal(stale.water.live.counter,null);
});
test('mode/source/factor changes do not bridge incompatible samples and preserve prior water consumption',()=>{
 const u=new Utilities(),c=water();u.sample(base,c,{water:reading(10,base)});u.sample(base+60000,c,{water:reading(10,base+60000)});
 c.water.stateId='alias.0.otherWater';assert.equal(u.sample(base+70000,c,{water:reading(100,base+70000)}).water.periods.day.value,.01);close(u.sample(base+80000,c,{water:reading(100,base+80000)}).water.periods.day.value,.01+1/60);
 c.water.factor=.1;const before=u.sample(base+90000,c,{water:reading(100,base+90000)}).water.periods.day.value;close(before,.01+1/60);
 c.water.mode='counter';c.water.unit='m³';close(u.sample(base+100000,c,{water:reading(1000,base+100000)}).water.periods.day.value,before);
});
test('fuel type switches retain separate archives and never mix kg, l or m³',()=>{
 const u=new Utilities(),c=fuel('pellets');u.sample(base,c,{fuel:reading(10,base)});assert.equal(u.sample(base+10000,c,{fuel:reading(11,base+10000)}).fuel.periods.day.value,1);
 c.fuel.type='gas';assert.equal(u.sample(base+20000,c,{fuel:reading(20,base+20000)}).fuel.periods.day.value,null);assert.equal(u.sample(base+30000,c,{fuel:reading(22,base+30000)}).fuel.periods.day.value,2);
 c.fuel.type='pellets';assert.equal(u.sample(base+40000,c,{fuel:reading(30,base+40000)}).fuel.periods.day.value,1);assert.equal(u.sample(base+50000,c,{fuel:reading(31,base+50000)}).fuel.periods.day.value,2);assert.equal(u.runtime().days.gas['2026-11-08'].value,2);
});
test('restart persistence retains measured data without integrating unseen flow or counter deltas',()=>{
 for(const mode of ['flow','counter']){const c=water(mode),u=new Utilities();u.sample(base,c,{water:reading(10,base)});const before=u.sample(base+60000,c,{water:reading(mode==='flow'?10:11,base+60000)}).water.periods.day.value;const restored=new Utilities(u.runtime());const after=restored.sample(base+120000,c,{water:reading(mode==='flow'?100:20,base+120000)});assert.equal(after.water.periods.day.value,before);assert.equal('previous' in restored.runtime(),false);}
});
test('disabled modules and backward clock jumps never add usage, and invalid persisted rows are ignored',()=>{
 const u=new Utilities({version:1,days:{water:{'not-a-day':{value:1,coveredSec:2},'2026-02-30':{value:1,coveredSec:2},'2026-11-08':{value:-1,coveredSec:2}},oil:{'2026-11-08':{value:2,coveredSec:0}}}}),c=water();u.sample(base,c,{water:reading(10,base)});u.sample(base+60000,c,{water:reading(10,base+60000)});assert.equal(u.sample(base+30000,c,{water:reading(10,base+30000)}).water.periods.day.value,.01);
 c.water.enabled=false;assert.equal(u.sample(base+120000,c,{water:reading(1000,base+120000)}).water.periods.day.value,.01);c.water.enabled=true;assert.equal(u.sample(base+130000,c,{water:reading(1000,base+130000)}).water.periods.day.value,.01);
 assert.deepEqual(Object.keys(u.runtime().days.oil),[]);assert.throws(()=>u.sample(NaN,c,{}),/Zeitstempel/);
});

test('on-change counters count their first increment after an hour of continuously observed zero use',()=>{
 const u=new Utilities(),c=water('counter');u.sample(base,c,{water:reading(100,base)});
 for(let minute=1;minute<=60;minute++)u.sample(base+minute*60000,c,{water:reading(100,base)});
 const summary=u.sample(base+3610000,c,{water:reading(100.02,base+3610000)});close(summary.water.periods.day.value,.02);assert.equal(summary.water.status,'ok');close(summary.water.periods.day.coveredSec,3610);
});
