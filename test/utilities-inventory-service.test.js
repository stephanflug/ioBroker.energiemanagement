'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {UtilitiesService}=require('../lib/utilities-service');
const base=Date.UTC(2026,10,9,12);
function fixture(runtime={},inventoryRuntime={}){
 const own=new Map(),objects=new Map(),states=new Map(),events=[];
 const adapter={namespace:'energiemanagement.0',set:async(id,value)=>{events.push(id);own.set(id,structuredClone(value));},getForeignObjectAsync:async id=>objects.get(id),getForeignStateAsync:async id=>states.get(id),getForeignObjectsAsync:async()=>Object.fromEntries(objects)};
 const service=new UtilitiesService(adapter,{fuel:{type:'pellets',mode:'counter',stateId:'meter.0.pellets',factor:1}}, {water:false,fuel:true,heating:false},runtime,inventoryRuntime);
 const add=(id,value,ts=Date.now())=>{objects.set(id,{_id:id,type:'state',common:{read:true,type:'number',unit:'custom'}});states.set(id,{val:value,ts,ack:true,q:0});};
 add('meter.0.pellets',1000);
 return {service,adapter,own,objects,states,events,add};
}
test('capacity never fabricates stock; refill samples pending consumption before adding a delivery and retries remain idempotent',async t=>{
 t.mock.timers.enable({apis:['Date'],now:base});const f=fixture();
 let doc=await f.service.inventoryConfigure({type:'pellets',capacity:1000});assert.equal(doc.pellets.remaining,null);assert.equal(doc.pellets.percent,null);
 doc=await f.service.refill({type:'pellets',operation:{mode:'set',amount:300,requestId:'stock_00001'}});assert.equal(doc.pellets.remaining,300);
 t.mock.timers.tick(10000);f.add('meter.0.pellets',1010);const operation={mode:'add',amount:100,requestId:'delivery_00001'};
 doc=await f.service.refill({type:'pellets',operation});assert.equal(doc.pellets.remaining,390);assert.equal(doc.pellets.events.at(-1).remainingBefore,290);assert.equal(doc.pellets.events.at(-1).deliveredAmount,100);
 t.mock.timers.tick(10000);f.add('meter.0.pellets',1015);doc=await f.service.refill({type:'pellets',operation});assert.equal(doc.pellets.remaining,385);assert.equal(doc.pellets.events.length,2);assert.equal(doc.pellets.consumedSinceFill,5);
 assert.equal(f.own.get('analytics.fuelInventory_JSON').pellets.remaining,385);assert.equal(f.own.get('internal.fuelInventory').tanks.pellets.events.length,2);
 const lastInventory=f.events.lastIndexOf('internal.fuelInventory'),lastRuntime=f.events.lastIndexOf('internal.utilities');assert.ok(lastInventory<lastRuntime);assert.deepEqual(f.own.get('analytics.utilitiesArchive_JSON'),f.own.get('internal.utilities'));
});
test('a service restart preserves totals, tank events and exact retry identity without bridging unobserved usage',async t=>{
 t.mock.timers.enable({apis:['Date'],now:base});const f=fixture();await f.service.inventoryConfigure({type:'pellets',capacity:500});
 await f.service.refill({type:'pellets',operation:{mode:'set',amount:400,requestId:'stock_00001'}});t.mock.timers.tick(10000);f.add('meter.0.pellets',1010);await f.service.tick(Date.now());await f.service.persist();
 const restored=fixture(f.own.get('internal.utilities'),f.own.get('internal.fuelInventory'));t.mock.timers.tick(60000);restored.add('meter.0.pellets',1050);await restored.service.tick(Date.now());assert.equal(restored.service.inventory.summary('pellets').remaining,390);
 t.mock.timers.tick(10000);restored.add('meter.0.pellets',1055);let doc=await restored.service.refill({type:'pellets',operation:{mode:'set',amount:400,requestId:'stock_00001'}});assert.equal(doc.pellets.remaining,385);assert.equal(doc.pellets.events.length,1);assert.equal(restored.service.core.totals.pellets,15);
});
test('fuel gaps mark tank uncertainty and switching fuel types keeps stocks, totals and native units separate',async t=>{
 t.mock.timers.enable({apis:['Date'],now:base});const f=fixture();await f.service.refill({type:'pellets',operation:{mode:'set',amount:300,requestId:'stock_00001'}});
 t.mock.timers.tick(10000);f.states.get('meter.0.pellets').ack=false;await f.service.tick(Date.now());assert.equal(f.service.inventory.summary('pellets').remaining,300);assert.equal(f.service.inventory.summary('pellets').partial,true);
 f.add('meter.0.oil',200);await f.service.configure({section:'fuel',config:{type:'oil',mode:'counter',stateId:'meter.0.oil',factor:1}});
 t.mock.timers.tick(10000);let doc=await f.service.refill({type:'oil',operation:{mode:'full',capacity:1000,requestId:'oil_full_001'}});assert.equal(doc.oil.remaining,1000);assert.equal(doc.oil.unit,'l');assert.equal(doc.pellets.remaining,300);assert.equal(doc.pellets.unit,'kg');
 t.mock.timers.tick(10000);f.add('meter.0.oil',205);await f.service.tick(Date.now());assert.equal(f.service.inventory.summary('oil').remaining,995);assert.equal(f.service.core.totals.oil,5);assert.equal(f.service.core.totals.pellets,0);
 await assert.rejects(()=>f.service.refill({type:'gas',operation:{mode:'full',capacity:1000,requestId:'gas_full_001'}}),/Pellets und Öl/);
});
test('both water readings display independently while only the selected source contributes usage',async t=>{
 t.mock.timers.enable({apis:['Date'],now:base});const f=fixture();f.add('meter.0.flow',10);f.add('meter.0.water',100000);
 await f.service.configure({section:'water',config:{mode:'counter',flowId:'meter.0.flow',flowUnit:'l/min',flowFactor:1,counterId:'meter.0.water',counterUnit:'l',counterFactor:1}});await f.service.configureFeatures({water:true,fuel:true,heating:false});await f.service.tick(Date.now());
 t.mock.timers.tick(60000);f.add('meter.0.flow',10);f.add('meter.0.water',100100);await f.service.tick(Date.now());let summary=f.own.get('analytics.utilities_JSON');assert.equal(summary.water.live.flowPerHour,.6);assert.equal(summary.water.live.counterValue,100.1);assert.equal(summary.water.periods.day.value,.1);
 // Invalid consumption source cannot silently switch to the still-valid flow.
 t.mock.timers.tick(60000);f.add('meter.0.flow',20);f.states.get('meter.0.water').q=1;await f.service.tick(Date.now());summary=f.own.get('analytics.utilities_JSON');assert.equal(summary.water.live.flowPerHour,1.2);assert.equal(summary.water.live.counterValue,null);assert.equal(summary.water.status,'invalid');assert.equal(summary.water.periods.day.value,.1);
});
