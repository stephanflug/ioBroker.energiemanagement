'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
test('running adapter exports and restores its tank, mappings and history through real service reconstruction',async()=>{
 const data=new Map(),files=new Map(),writes=[];
 class FakeAdapter{
  constructor(){this.config={};this.namespace='energiemanagement.0';this.log={info(){},warn(){},error(message){throw Error(message);}};}
  on(){} setInterval(){return 2;} clearInterval(){}async setObjectNotExistsAsync(){}async getStateAsync(id){return data.has(id)?{val:data.get(id),ack:true,ts:Date.now()}:null;}
  async setStateAsync(id,state){data.set(id,state.val);}async subscribeStatesAsync(){}async getForeignStateAsync(){return null;}
  async setForeignStateAsync(id,state){writes.push({id,state});}async writeFileAsync(adapter,name,content){files.set(adapter+'/'+name,Buffer.from(content));}
 }
 const filename=path.resolve(__dirname,'../main.js'),requireLocal=createRequire(filename),mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:name=>name==='@iobroker/adapter-core'?{Adapter:FakeAdapter}:requireLocal(name),module:mod,exports:mod.exports,Date,JSON,console,setTimeout,setInterval:()=>1,clearInterval(){}},{filename});
 const adapter=mod.exports({versionCheckOptions:{fetch:async()=>({status:200,headers:{get:()=>null},text:async()=>'[]'})}});await adapter.onReady();
 await adapter.utilities.inventoryConfigure({type:'pellets',capacity:1000});
 await adapter.utilities.refill({type:'pellets',operation:{mode:'set',amount:250,requestId:'initial-stock-001'}});
 const exported=await adapter.backup.export();assert.equal(exported.ok,true);assert.equal(adapter.dataBusy,false);
 await adapter.utilities.refill({type:'pellets',operation:{mode:'add',amount:100,requestId:'later-fill-001'}});
 assert.equal(adapter.utilities.inventory.summary('pellets').remaining,350);
 const oldEngine=adapter.engine,oldHeating=adapter.heating,oldUtilities=adapter.utilities;
 const result=await adapter.backup.restore({backup:exported.backup,requestId:'restore-whole-001'});
 while(adapter.running)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(result.ok,true);assert.ok(files.has(result.safetyBackupPath));
 assert.notEqual(adapter.engine,oldEngine);assert.notEqual(adapter.heating,oldHeating);assert.notEqual(adapter.utilities,oldUtilities);
 assert.equal(oldUtilities.closed,true);assert.equal(oldHeating.closed,true);
 const stock=adapter.utilities.inventory.summary('pellets');assert.equal(stock.remaining,250);assert.equal(stock.capacity,1000);assert.equal(stock.events.length,1);assert.equal(stock.partial,true);
 assert.equal(adapter.hardwareMaster,false);assert.equal(adapter.consumers.master,false);assert.equal(adapter.heating.config.enabled,false);assert.equal(adapter.heating.config.hardwareEnabled,false);
 assert.equal(adapter.restoreHold,false);assert.equal(data.get('internal.restoreHold'),false);assert.equal(writes.length,0);
 const safety=JSON.parse(files.get(result.safetyBackupPath));assert.equal(JSON.parse(safety.states['internal.fuelInventory'].val).tanks.pellets.remaining,350);
 const after=await adapter.backup.export();assert.equal(JSON.parse(after.backup.states['internal.fuelInventory'].val).tanks.pellets.remaining,250);
 await adapter.onUnload(()=>{});
});
