'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {UtilitiesService}=require('../lib/utilities-service');
const base=Date.UTC(2026,10,9,12);
function fixture({runtime={},inventoryRuntime={},config}={}){
 const own=new Map(),writes=[],values=new Map();let clock=base,fail=null;
 const adapter={namespace:'energiemanagement.0',set:async(id,value)=>{writes.push(id);if(id===fail)throw Error('Speicherung unterbrochen');own.set(id,structuredClone(value));},getForeignObjectAsync:async id=>values.has(id)?{_id:id,type:'state',common:{type:'number',read:true}}:null,getForeignStateAsync:async id=>values.has(id)?{val:values.get(id),ts:clock,ack:true,q:0}:null};
 const service=new UtilitiesService(adapter,config||{fuel:{type:'pellets',mode:'counter',stateId:'test.0.pellets',factor:1}},{water:false,fuel:true,heating:false},runtime,inventoryRuntime);
 values.set('test.0.pellets',100);values.set('test.0.oil',500);
 return {service,own,writes,values,get clock(){return clock},advance(ms=60000){clock+=ms},fail(id){fail=id},async run(fn){const old=Date.now;Date.now=()=>clock;try{return await fn()}finally{Date.now=old}}};
}
test('capacity, stock correction, consumption and refill share one durable ledger without inventing deliveries',async()=>{
 const f=fixture();await f.run(async()=>{
  let doc=await f.service.inventoryConfigure({type:'pellets',capacity:500});assert.equal(doc.pellets.remaining,null);assert.equal(doc.pellets.known,false);
  await assert.rejects(()=>f.service.refill({type:'pellets',operation:{mode:'add',amount:100,requestId:'fill_000001'}}),/Zuerst/);
  doc=await f.service.refill({type:'pellets',operation:{mode:'set',amount:200,requestId:'set_0000001'}});assert.equal(doc.pellets.remaining,200);assert.equal(doc.pellets.events[0].deliveredAmount,null);
  f.advance();f.values.set('test.0.pellets',110);
  doc=await f.service.refill({type:'pellets',operation:{mode:'add',amount:50,requestId:'fill_000001'}});
  assert.equal(doc.pellets.remaining,240,'already measured consumption is deducted before adding new fuel');assert.equal(doc.pellets.consumedSinceFill,0);assert.equal(doc.pellets.events.at(-1).remainingBefore,190);assert.equal(doc.pellets.events.at(-1).deliveredAmount,50);
  f.advance();f.values.set('test.0.pellets',120);await f.service.tick(f.clock);assert.equal(f.service.inventory.summary('pellets').remaining,230);assert.equal(f.service.core.totals.pellets,20);
  await f.service.persist();assert.equal(f.own.get('internal.fuelInventory').tanks.pellets.remaining,230);assert.equal(f.own.get('analytics.utilitiesArchive_JSON').totals.pellets,20);
 });
});
test('refill retries remain idempotent after later usage and service restart',async()=>{
 const f=fixture(),operation={mode:'add',amount:20,requestId:'retry_000001'};await f.run(async()=>{
  await f.service.refill({type:'pellets',operation:{mode:'set',amount:100,requestId:'set_0000001'}});
  await f.service.refill({type:'pellets',operation});f.advance();f.values.set('test.0.pellets',110);await f.service.tick(f.clock);await f.service.persist();
 });
 const restarted=fixture({runtime:f.own.get('internal.utilities'),inventoryRuntime:f.own.get('internal.fuelInventory'),config:f.service.config});restarted.advance(120000);restarted.values.set('test.0.pellets',110);
 await restarted.run(async()=>{const doc=await restarted.service.refill({type:'pellets',operation});assert.equal(doc.pellets.remaining,110);assert.equal(doc.pellets.events.length,2);assert.equal(doc.pellets.events.at(-1).requestId,operation.requestId);});
});
test('inventory is persisted before archive and an interrupted refill retry cannot add its quantity twice',async()=>{
 const f=fixture(),operation={mode:'add',amount:50,requestId:'retry_000002'};await f.run(async()=>{
  await f.service.refill({type:'pellets',operation:{mode:'set',amount:100,requestId:'set_0000001'}});f.advance();f.values.set('test.0.pellets',110);f.writes.length=0;f.fail('internal.utilities');
  await assert.rejects(()=>f.service.refill({type:'pellets',operation}),/unterbrochen/);assert.equal(f.own.get('internal.fuelInventory').tanks.pellets.remaining,140);assert.ok(f.writes.indexOf('internal.fuelInventory')<f.writes.indexOf('internal.utilities'));
  f.fail(null);const doc=await f.service.refill({type:'pellets',operation});assert.equal(doc.pellets.remaining,140);assert.equal(doc.pellets.events.length,2);assert.equal(f.own.get('internal.utilities').totals.pellets,10);
 });
});
test('switching fuel keeps pellet and oil histories and current stock independent; gas has no tank',async()=>{
 const f=fixture();await f.run(async()=>{
  await f.service.refill({type:'pellets',operation:{mode:'set',amount:300,requestId:'set_pellets01'}});f.advance();f.values.set('test.0.pellets',110);await f.service.tick(f.clock);
  await f.service.configure({section:'fuel',config:{type:'oil',mode:'counter',stateId:'test.0.oil',factor:1}});await f.service.refill({type:'oil',operation:{mode:'set',amount:500,requestId:'set_oil00001'}});f.advance();f.values.set('test.0.oil',507);await f.service.tick(f.clock);
  const doc=f.service.inventoryDocument();assert.equal(doc.pellets.remaining,290);assert.equal(doc.pellets.unit,'kg');assert.equal(doc.oil.remaining,493);assert.equal(doc.oil.unit,'l');assert.equal(f.service.core.totals.pellets,10);assert.equal(f.service.core.totals.oil,7);
  await assert.rejects(()=>f.service.refill({type:'gas',operation:{mode:'set',amount:10,requestId:'set_gas00001'}}),/Pellets und Öl/);
 });
});
test('unrecorded measurement gaps mark an existing stock uncertain without fabricating consumption',async()=>{
 const f=fixture();await f.run(async()=>{
  await f.service.refill({type:'pellets',operation:{mode:'set',amount:300,requestId:'set_0000001'}});assert.equal(f.service.inventory.summary('pellets').partial,false);
  f.advance(360000);f.values.set('test.0.pellets',130);await f.service.tick(f.clock);assert.equal(f.service.inventory.summary('pellets').remaining,300);assert.equal(f.service.inventory.summary('pellets').partial,true);
  f.advance();f.values.set('test.0.pellets',135);await f.service.tick(f.clock);assert.equal(f.service.inventory.summary('pellets').remaining,295);
  const doc=await f.service.refill({type:'pellets',operation:{mode:'set',amount:280,requestId:'correct_00001'}});assert.equal(doc.pellets.remaining,280);assert.equal(doc.pellets.partial,false);
 });
});
test('same-time fuel source priming preserves the independent water integration baseline',async()=>{
 const f=fixture();await f.run(async()=>{
  f.values.set('test.0.water',10);await f.service.configure({section:'water',config:{mode:'flow',stateId:'test.0.water',unit:'l/min',factor:1}});await f.service.configureFeatures({water:true,fuel:true,heating:false});
  await f.service.refill({type:'pellets',operation:{mode:'set',amount:300,requestId:'set_pellets01'}});f.advance();await f.service.tick(f.clock);assert.equal(f.service.core.totals.water,.01);
  await f.service.configure({section:'fuel',config:{type:'oil',mode:'counter',stateId:'test.0.oil',factor:1}});await f.service.refill({type:'oil',operation:{mode:'set',amount:500,requestId:'set_oil00001'}});
  assert.equal(f.service.lastSummary.fuel.type,'oil');assert.equal(f.service.lastSummary.water.status,'ok');f.advance();f.values.set('test.0.oil',507);await f.service.tick(f.clock);
  assert.equal(f.service.core.totals.water,.02);assert.equal(f.service.inventory.summary('oil').remaining,493);
 });
});
test('restart retains last stock but marks possible unrecorded downtime without fabricating a consumption delta',async()=>{
 const f=fixture();await f.run(async()=>{await f.service.refill({type:'pellets',operation:{mode:'set',amount:300,requestId:'set_0000001'}});f.advance();f.values.set('test.0.pellets',110);await f.service.tick(f.clock);await f.service.persist();});
 const runtime=f.own.get('internal.utilities'),inventoryRuntime=f.own.get('internal.fuelInventory'),before=structuredClone(inventoryRuntime.tanks.pellets);assert.equal(before.partial,false);
 const restored=fixture({runtime,inventoryRuntime,config:f.service.config}),tank=restored.service.inventory.runtime().tanks.pellets;
 assert.equal(tank.remaining,290);assert.equal(tank.partial,true);assert.equal(tank.lastObservedTotal,before.lastObservedTotal);assert.equal(tank.lastObservedAt,before.lastObservedAt);assert.equal(tank.consumedSinceFill,before.consumedSinceFill);assert.deepEqual(tank.events,before.events);assert.equal(inventoryRuntime.tanks.pellets.partial,false,'caller snapshot is not mutated');
});
