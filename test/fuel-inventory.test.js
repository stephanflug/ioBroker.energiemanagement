'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {FuelInventory,MAX_EVENTS}=require('../lib/fuel-inventory');
const base=Date.UTC(2026,10,8,12);
const event=(mode,amount,requestId='request_0001',extra={})=>({mode,amount,requestId,...extra});
test('capacity alone never invents a tank stock or percent',()=>{
 const inventory=new FuelInventory();const result=inventory.configure('pellets',{capacity:5000},base);
 assert.equal(result.capacity,5000);assert.equal(result.remaining,null);assert.equal(result.percent,null);assert.equal(result.known,false);assert.equal(result.estimated,true);
 inventory.observe(base,'pellets',100);assert.equal(inventory.summary('pellets').remaining,null);
 assert.throws(()=>inventory.recordFill(base,'pellets',event('add',100)),/Zuerst/);
});
test('explicit stock is reduced only by later known cumulative usage and survives restarts',()=>{
 const inventory=new FuelInventory();inventory.configure('pellets',{capacity:5000},base);inventory.observe(base,'pellets',100);
 inventory.recordFill(base,'pellets',event('set',3000));let result=inventory.observe(base+1000,'pellets',125);
 assert.equal(result.remaining,2975);assert.equal(result.consumedSinceFill,25);assert.equal(result.percent,59.5);assert.equal(result.partial,false);
 const restored=new FuelInventory(inventory.runtime());result=restored.observe(base+2000,'pellets',130);assert.equal(result.remaining,2970);assert.equal(result.consumedSinceFill,30);
});
test('refills add to remaining stock exactly once and expose delivery quantities separately from stock corrections',()=>{
 const inventory=new FuelInventory();inventory.observe(base,'oil',10);inventory.recordFill(base,'oil',event('set',100,'set_000001',{capacity:200}));
 let result=inventory.recordFill(base+1,'oil',event('add',50,'fill_00001'));assert.equal(result.remaining,150);assert.equal(result.events.at(-1).deliveredAmount,50);
 result=inventory.recordFill(base+2,'oil',event('add',50,'fill_00001'));assert.equal(result.remaining,150);assert.equal(result.events.length,2);
 assert.throws(()=>inventory.recordFill(base+3,'oil',event('add',51,'fill_00001')),/Kennung/i);assert.equal(inventory.summary('oil').remaining,150);
 result=inventory.recordFill(base+4,'oil',event('full',undefined,'full_00001'));assert.equal(result.remaining,200);assert.equal(result.events.at(-1).deliveredAmount,50);
 assert.equal(result.events[0].deliveredAmount,null);assert.equal(result.events[0].remainingAfter,100);
});
test('idempotent retry after consumption or a restart does not restore an earlier tank level',()=>{
 const inventory=new FuelInventory();inventory.observe(base,'pellets',0);inventory.recordFill(base,'pellets',event('set',100));inventory.recordFill(base+1,'pellets',event('add',20,'add_000001'));inventory.observe(base+2,'pellets',10);
 const restored=new FuelInventory(inventory.runtime()),result=restored.recordFill(base+3,'pellets',event('add',20,'add_000001'));assert.equal(result.remaining,110);assert.equal(result.events.length,2);
});
test('unknown stock can become known through full filling but its delivered amount remains unknown',()=>{
 const inventory=new FuelInventory();assert.throws(()=>inventory.recordFill(base,'oil',event('full',undefined)),/Tankkapazität/);
 const result=inventory.recordFill(base,'oil',event('full',undefined,'full_00001',{capacity:2500}));assert.equal(result.remaining,2500);assert.equal(result.percent,100);assert.equal(result.events.at(-1).deliveredAmount,null);assert.equal(result.partial,false);
});
test('overfill, invalid input and capacity changes below stock reject atomically',()=>{
 const inventory=new FuelInventory();inventory.recordFill(base,'oil',event('set',100,'set_000001',{capacity:200}));const before=inventory.runtime();
 for(const operation of [event('add',101,'fill_00001'),event('set',500,'set_000002',{capacity:400}),event('add',0,'add_000001'),event('set',-1,'bad_000001'),event('set','20','bad_000002'),event('add',Infinity,'bad_000003'),event('set',20,'bad')])assert.throws(()=>inventory.recordFill(base+1,'oil',operation));
 assert.deepEqual(inventory.runtime(),before);assert.throws(()=>inventory.configure('oil',{capacity:99},base+2),/Bestand/);assert.deepEqual(inventory.runtime(),before);
 for(const value of [-1,'200',Infinity,NaN])assert.throws(()=>inventory.configure('oil',{capacity:value},base+3));
});
test('gas has no invented tank stock and pellets/oil remain segregated',()=>{
 const inventory=new FuelInventory();inventory.observe(base,'pellets',0);inventory.observe(base,'oil',0);inventory.recordFill(base,'pellets',event('set',300));inventory.recordFill(base,'oil',event('set',500));
 inventory.observe(base+1,'pellets',10);assert.equal(inventory.summary('pellets').remaining,290);assert.equal(inventory.summary('oil').remaining,500);assert.equal(inventory.summary('pellets').unit,'kg');assert.equal(inventory.summary('oil').unit,'l');assert.equal(inventory.summary('gas').supported,false);
 assert.throws(()=>inventory.configure('gas',{capacity:1},base));assert.throws(()=>inventory.recordFill(base,'gas',event('set',1)));assert.throws(()=>inventory.observe(base,'gas',1));
});
test('gaps and counter rollbacks mark stock uncertain without increasing it; confirmed set repairs uncertainty',()=>{
 const inventory=new FuelInventory();inventory.observe(base,'oil',100);inventory.recordFill(base,'oil',event('set',300));
 let result=inventory.observe(base+1,'oil',110,{partial:true});assert.equal(result.remaining,290);assert.equal(result.partial,true);
 result=inventory.observe(base+2,'oil',5);assert.equal(result.remaining,290);assert.equal(result.partial,true);result=inventory.observe(base+3,'oil',10);assert.equal(result.remaining,285);
 result=inventory.recordFill(base+4,'oil',event('add',10,'add_000001'));assert.equal(result.partial,true);result=inventory.recordFill(base+5,'oil',event('set',290,'set_000002'));assert.equal(result.partial,false);
});
test('consumption beyond known stock clamps at zero and records uncertainty rather than fabricating negative stock',()=>{
 const inventory=new FuelInventory();inventory.observe(base,'pellets',0);inventory.recordFill(base,'pellets',event('set',10));const result=inventory.observe(base+1,'pellets',15);
 assert.equal(result.remaining,0);assert.equal(result.shortfall,5);assert.equal(result.consumedSinceFill,15);assert.equal(result.partial,true);
});
test('malformed runtime cannot fabricate stock, invalid events are ignored and exported objects are copies',()=>{
 const inventory=new FuelInventory({version:1,tanks:{pellets:{capacity:100,remaining:200,lastObservedTotal:-2,events:[{ts:base,mode:'add',amount:10,remainingAfter:20,requestId:'bad'}]},oil:{capacity:'500',remaining:-1}}});
 assert.equal(inventory.summary('pellets').capacity,100);assert.equal(inventory.summary('pellets').remaining,null);assert.equal(inventory.summary('oil').remaining,null);assert.deepEqual(inventory.summary('pellets').events,[]);
 inventory.recordFill(base,'pellets',event('set',20));const snapshot=inventory.runtime();snapshot.tanks.pellets.remaining=1;snapshot.tanks.pellets.events[0].amount=999;assert.equal(inventory.summary('pellets').remaining,20);assert.equal(inventory.summary('pellets').events[0].amount,20);
 const result=inventory.summary('pellets');result.events[0].remainingAfter=999;assert.equal(inventory.summary('pellets').events[0].remainingAfter,20);
});
test('stale observations and invalid timestamps cannot reorder stock adjustments',()=>{
 const inventory=new FuelInventory();inventory.observe(base+1000,'oil',100);inventory.recordFill(base+1000,'oil',event('set',300));inventory.observe(base,'oil',120);assert.equal(inventory.summary('oil').remaining,300);assert.throws(()=>inventory.recordFill(base,'oil',event('add',10,'add_000001')),/Füllzeitpunkt/);
 for(const stamp of [NaN,Infinity,-1,1e20])assert.throws(()=>inventory.observe(stamp,'oil',100));for(const value of [-1,NaN,Infinity,'20'])assert.throws(()=>inventory.observe(base+2000,'oil',value));
});
test('fill history and deduplication survive bounded retention without exposing more than 20 summary events',()=>{
 const inventory=new FuelInventory();inventory.recordFill(base,'oil',event('set',0));for(let index=1;index<=MAX_EVENTS+1;index++)inventory.recordFill(base+index,'oil',event('set',index,'event_'+String(index).padStart(8,'0')));
 assert.equal(inventory.runtime().tanks.oil.events.length,MAX_EVENTS);assert.equal(inventory.summary('oil').events.length,20);assert.equal(inventory.summary('oil').remaining,MAX_EVENTS+1);
});

test('idempotent retry of an older fill remains valid after later capacity and stock increases',()=>{
 const inventory=new FuelInventory();inventory.recordFill(base,'oil',event('set',100,'set_000001',{capacity:200}));const fill=event('add',50,'fill_00001',{capacity:200});inventory.recordFill(base+1,'oil',fill);inventory.recordFill(base+2,'oil',event('full',undefined,'full_00001',{capacity:300}));const result=inventory.recordFill(base+3,'oil',fill);assert.equal(result.capacity,300);assert.equal(result.remaining,300);assert.equal(result.events.length,3);
});
