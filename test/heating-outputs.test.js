'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {HeatingOutputs}=require('../lib/heating-outputs');
const NOW=Date.UTC(2026,10,8,12),DEVICE='system.adapter.heat.0',SELF='system.adapter.energiemanagement.0';
function config(){return {enabled:true,hardwareEnabled:true,mode:'auto',sensorMaxAgeSec:1800,rooms:[{stateId:'temp.0.room'}],outdoorId:'temp.0.outdoor',pump:{armed:true,lockId:'heat.0.lock',lockOn:true,statusId:'heat.0.running',powerId:'heat.0.watts'},circuits:[{id:'main',name:'Heizkreis',armed:true,setpointId:'heat.0.target',baseC:21,minC:18,maxC:24,stepC:0.5}],pv:{floorId:'temp.0.floor'}};}
function status(now=NOW,extra={}){return {ts:now,hardwareAllowed:true,pumpLock:true,circuits:[{id:'main',targetC:22}],pv:{active:false,hardwareAllowed:false},...extra};}
function fixture(){
 const objects={'heat.0.lock':{type:'state',common:{type:'boolean',read:true,write:true}},'heat.0.target':{type:'state',common:{type:'number',read:true,write:true,unit:'°C',min:15,max:28}}};
 const states={'heat.0.lock':{val:false,ack:true,from:DEVICE,ts:NOW},'heat.0.target':{val:21,ack:true,from:DEVICE,ts:NOW},'heat.0.running':{val:true,ack:true,from:DEVICE,ts:NOW}};
 let now=NOW;const writes=[];
 const adapter={namespace:'energiemanagement.0',async getForeignObjectAsync(id){return objects[id]||null},async getForeignStateAsync(id){return states[id]?{...states[id]}:null},async setForeignStateAsync(id,s){writes.push({id,...s});states[id]={...s,from:SELF,ts:now}}};
 return {objects,states,writes,adapter,clock(t){now=t},ack(id,t=now){states[id]={...states[id],ack:true,from:DEVICE,ts:t}}};
}
test('disabled, observe and absent hardware permission produce no writes or takeover',async()=>{
 for(const patch of [{enabled:false},{mode:'observe'},{hardwareEnabled:false}]){const f=fixture(),w=new HeatingOutputs(f.adapter);await w.apply(NOW,{...config(),...patch},status());assert.equal(f.writes.length,0);assert.deepEqual(w.runtime().owned,{});}
});
test('new commands are pending until the actual device confirms them',async()=>{
 const f=fixture(),w=new HeatingOutputs(f.adapter);const r=await w.apply(NOW,config(),status());assert.equal(r.errors.length,0);assert.deepEqual(f.writes.map(x=>[x.id,x.val]),[['heat.0.lock',true],['heat.0.target',21.5]]);assert.ok(f.writes.every(x=>x.ack===false));
 assert.equal(w.runtime().owned['heat.0.lock'].pending,true);assert.equal(w.runtime().owned['heat.0.target'].pending,true);
 f.ack('heat.0.lock',NOW+5000);f.ack('heat.0.target',NOW+5000);await w.apply(NOW+5000,config(),status(NOW+5000));assert.equal(f.writes.length,2);assert.equal(w.runtime().owned['heat.0.lock'].pending,false);
});
test('Celsius metadata aliases allow the same bounded setpoint command',async()=>{
 for(const unit of ['ºC','º C','℃','Grad','Grad Celsius']){
  const f=fixture(),c=config();c.pump.armed=false;f.objects['heat.0.target'].common.unit=unit;
  const result=await new HeatingOutputs(f.adapter).apply(NOW,c,status());
  assert.equal(result.errors.length,0,unit);assert.deepEqual(f.writes.map(x=>[x.id,x.val,x.ack]),[['heat.0.target',21.5,false]],unit);
 }
});
test('Celsius normalization keeps incompatible scales and direct-output permissions enforced',async()=>{
 for(const unit of ['°F','ºF','K','W','%']){
  const f=fixture(),c=config();c.pump.armed=false;f.objects['heat.0.target'].common.unit=unit;
  const result=await new HeatingOutputs(f.adapter).apply(NOW,c,status());assert.ok(result.errors.length,unit);assert.equal(f.writes.length,0,unit);
 }
 for(const change of [common=>common.read=false,common=>common.write=false,common=>common.alias={id:'alias.0.target'}]){
  const f=fixture(),c=config();c.pump.armed=false;f.objects['heat.0.target'].common.unit='ºC';change(f.objects['heat.0.target'].common);
  const result=await new HeatingOutputs(f.adapter).apply(NOW,c,status());assert.ok(result.errors.length);assert.equal(f.writes.length,0);
 }
});
test('setpoints respect device limits, half-degree steps and five-minute dwell',async()=>{
 const f=fixture();f.objects['heat.0.target'].common.max=21.8;const c=config();c.pump.armed=false;const w=new HeatingOutputs(f.adapter);
 await w.apply(NOW,c,status());assert.equal(f.writes[0].val,21.5);f.ack('heat.0.target',NOW+5000);
 await w.apply(NOW+299000,c,status(NOW+299000));assert.equal(f.writes.length,1);
 f.clock(NOW+300000);await w.apply(NOW+300000,c,status(NOW+300000));assert.equal(f.writes.length,2);assert.equal(f.writes[1].val,21.8);
});
test('initial flow-temperature or out-of-range target cannot be taken over',async()=>{
 const f=fixture();f.states['heat.0.target'].val=45;const c=config();c.pump.armed=false;const w=new HeatingOutputs(f.adapter);const r=await w.apply(NOW,c,status());assert.equal(f.writes.length,0);assert.match(r.errors[0].message,/Zuordnung prüfen/);assert.deepEqual(w.runtime().owned,{});
});
test('missing pump status does not lock, but an independently valid circuit may still work',async()=>{
 const f=fixture();delete f.states['heat.0.running'];const w=new HeatingOutputs(f.adapter),r=await w.apply(NOW,config(),status());assert.equal(f.writes.length,1);assert.equal(f.writes[0].id,'heat.0.target');assert.match(r.errors[0].message,/Betriebsrückmeldung/);
});
test('stale plans and bad sensor guards release only previously owned controls',async()=>{
 const f=fixture(),w=new HeatingOutputs(f.adapter);await w.apply(NOW,config(),status());f.ack('heat.0.lock',NOW+5000);f.ack('heat.0.target',NOW+5000);f.clock(NOW+5000);
 await w.apply(NOW+5000,config(),status(NOW+5000,{hardwareAllowed:false}));assert.deepEqual(f.writes.slice(2).map(x=>[x.id,x.val]),[['heat.0.lock',false],['heat.0.target',21]]);
 assert.equal(w.runtime().owned['heat.0.lock'].releasing,true);f.ack('heat.0.lock',NOW+10000);f.ack('heat.0.target',NOW+10000);await w.apply(NOW+10000,{...config(),enabled:false},status(NOW+10000));assert.deepEqual(w.runtime().owned,{});
 const cold=fixture(),other=new HeatingOutputs(cold.adapter);await other.apply(NOW+100000,config(),status(NOW));assert.equal(cold.writes.length,0);
});
test('external lock already active is never acquired and never unlocked',async()=>{
 const f=fixture();f.states['heat.0.lock'].val=true;const c=config();c.circuits=[];const w=new HeatingOutputs(f.adapter);await w.apply(NOW,c,status());await w.release('Stop',NOW+1000);assert.equal(f.writes.length,0);assert.deepEqual(w.runtime().owned,{});
});
test('manual change relinquishes ownership and gives the user a thirty-minute hold',async()=>{
 const f=fixture(),c=config();c.circuits=[];const w=new HeatingOutputs(f.adapter);await w.apply(NOW,c,status());f.ack('heat.0.lock',NOW+1000);await w.apply(NOW+1000,c,status(NOW+1000));
 f.states['heat.0.lock']={val:false,ack:true,from:'system.adapter.javascript.1',ts:NOW+2000};await w.apply(NOW+2000,c,status(NOW+2000));await w.release('Stop',NOW+3000);assert.equal(f.writes.length,1);assert.ok(w.runtime().holds['heat.0.lock']>NOW+2000);assert.deepEqual(w.runtime().owned,{});
});
test('acknowledged device state from an unrelated writer is not mistaken for ownership',async()=>{
 const f=fixture(),c=config();c.circuits=[];const w=new HeatingOutputs(f.adapter);await w.apply(NOW,c,status());f.states['heat.0.lock']={val:true,ack:true,from:'system.adapter.javascript.1',ts:NOW+2000};await w.release('Stop',NOW+2000);assert.equal(f.writes.length,1);assert.deepEqual(w.runtime().owned,{});
});
test('unconfirmed command times out without repeated commands; own pending command can be released',async()=>{
 const f=fixture(),c=config();c.circuits=[];const w=new HeatingOutputs(f.adapter);await w.apply(NOW,c,status());const r=await w.apply(NOW+35000,c,status(NOW+35000));assert.match(r.errors[0].message,/unbestätigt/);assert.equal(f.writes.length,1);f.clock(NOW+40000);await w.release('Schutzfreigabe',NOW+40000);assert.equal(f.writes[1].val,false);
});
test('saved ownership survives restart and restores original setpoints on stop',async()=>{
 const f=fixture(),c=config();c.pump.armed=false;const first=new HeatingOutputs(f.adapter);await first.apply(NOW,c,status());f.ack('heat.0.target',NOW+5000);await first.apply(NOW+5000,c,status(NOW+5000));const restarted=new HeatingOutputs(f.adapter,first.runtime());f.clock(NOW+10000);await restarted.release('Neustart',NOW+10000);assert.equal(f.writes.at(-1).val,21);
 const wrongNamespace=new HeatingOutputs({...f.adapter,namespace:'energiemanagement.1'},first.runtime());assert.deepEqual(wrongNamespace.runtime().owned,{});
});
test('input/output collisions, repeated outputs, aliases and wrong units never receive new commands',async()=>{
 for(const change of [c=>c.rooms.push({stateId:'heat.0.target'}),c=>c.circuits.push({...c.circuits[0],id:'other'})]){const f=fixture(),c=config();change(c);const r=await new HeatingOutputs(f.adapter).apply(NOW,c,status());assert.equal(f.writes.length,0);assert.ok(r.errors.length);}
 for(const change of [f=>f.objects['heat.0.target'].common.unit='W',f=>f.objects['heat.0.target'].common.alias={id:'x.y'},f=>f.objects['heat.0.target'].common.write=false]){const f=fixture(),c=config();c.pump.armed=false;change(f);assert.ok((await new HeatingOutputs(f.adapter).apply(NOW,c,status())).errors.length);assert.equal(f.writes.length,0);}
});
test('PV safety guard cannot issue or retain a boosted target without floor protection',async()=>{
 const f=fixture(),c=config();c.pump.armed=false;const w=new HeatingOutputs(f.adapter);const r=await w.apply(NOW,c,status(NOW,{pv:{active:true,hardwareAllowed:false},circuits:[{id:'main',targetC:22,boostC:1}]}));assert.equal(f.writes.length,0);assert.match(r.outputs[0].status,/gültiger/);
});
test('one failing output does not prevent another output or discard pending restoration',async()=>{
 const f=fixture(),c=config();delete f.objects['heat.0.lock'];const w=new HeatingOutputs(f.adapter),r=await w.apply(NOW,c,status());assert.ok(r.errors.length);assert.equal(f.writes[0].id,'heat.0.target');f.ack('heat.0.target',NOW+1000);await w.apply(NOW+1000,c,status(NOW+1000));delete f.objects['heat.0.target'];await w.release('Stop',NOW+2000);assert.ok(w.runtime().owned['heat.0.target']);
});

test('normal comfort adjustment remains possible while PV boost is unavailable',async()=>{
 const f=fixture(),c=config();c.pump.armed=false;await new HeatingOutputs(f.adapter).apply(NOW,c,status(NOW,{pv:{active:false,hardwareAllowed:false},circuits:[{id:'main',targetC:22,boostC:0}]}));assert.equal(f.writes[0].val,21.5);
});
test('changed lock polarity restores the original control before any new takeover',async()=>{
 const f=fixture(),c=config();c.circuits=[];const w=new HeatingOutputs(f.adapter);await w.apply(NOW,c,status());f.ack('heat.0.lock',NOW+1000);c.pump.lockOn=false;f.clock(NOW+1000);await w.apply(NOW+1000,c,status(NOW+1000));assert.equal(f.writes.length,2);assert.equal(f.writes[1].val,false);assert.equal(w.runtime().owned['heat.0.lock'].releasing,true);
});

test('changed mapping waits for confirmed restoration before acquiring a new output',async()=>{
 const f=fixture(),c=config();c.circuits=[];const w=new HeatingOutputs(f.adapter);await w.apply(NOW,c,status());f.ack('heat.0.lock',NOW+1000);await w.apply(NOW+1000,c,status(NOW+1000));
 f.objects['heat.0.other']={...f.objects['heat.0.lock']};f.states['heat.0.other']={val:false,ack:true,from:DEVICE,ts:NOW+2000};const changed={...c,pump:{...c.pump,lockId:'heat.0.other'}};f.clock(NOW+2000);await w.apply(NOW+2000,changed,status(NOW+2000));assert.equal(f.writes.length,2);assert.equal(f.writes[1].id,'heat.0.lock');assert.equal(f.writes[1].val,false);
 await w.apply(NOW+3000,changed,status(NOW+3000));assert.equal(f.writes.length,2);f.ack('heat.0.lock',NOW+4000);f.clock(NOW+4000);await w.apply(NOW+4000,changed,status(NOW+4000));assert.equal(f.writes.length,3);assert.equal(f.writes[2].id,'heat.0.other');
});

test('a rejected API response after a real write retains ownership for restoration',async()=>{
 const f=fixture(),c=config();c.circuits=[];const send=f.adapter.setForeignStateAsync.bind(f.adapter);let fail=true;f.adapter.setForeignStateAsync=async(id,state)=>{await send(id,state);if(fail){fail=false;throw Error('Response lost after commit');}};const w=new HeatingOutputs(f.adapter);const result=await w.apply(NOW,c,status());assert.equal(result.errors.length,1);assert.equal(w.runtime().owned['heat.0.lock'].lastValue,true);f.clock(NOW+1000);await w.release('Stop',NOW+1000);assert.equal(f.writes.at(-1).val,false);assert.equal(w.runtime().owned['heat.0.lock'].releasing,true);
});
test('a failed restore before writing retains the old owned control and permits retry',async()=>{
 const f=fixture(),c=config();c.circuits=[];const w=new HeatingOutputs(f.adapter);await w.apply(NOW,c,status());f.ack('heat.0.lock',NOW+1000);await w.apply(NOW+1000,c,status(NOW+1000));const send=f.adapter.setForeignStateAsync.bind(f.adapter);let fail=true;f.adapter.setForeignStateAsync=async(id,state)=>{if(fail){fail=false;throw Error('No DB write');}await send(id,state);};let result=await w.release('Stop',NOW+2000);assert.equal(result.errors.length,1);assert.equal(w.runtime().owned['heat.0.lock'].lastValue,true);assert.equal(w.runtime().owned['heat.0.lock'].releasing,false);f.clock(NOW+3000);result=await w.release('Retry',NOW+3000);assert.equal(f.writes.at(-1).val,false);assert.equal(w.runtime().owned['heat.0.lock'].releasing,true);
});
