'use strict';
const path=require('node:path');
const assert=require('node:assert/strict');
const {tests}=require('@iobroker/testing');
const {defaultSources,normalizeConsumers,normalizeSettings}=require('../lib/normalize');
const {defaultHeating,normalizeHeating}=require('../lib/heating');
const {defaultForecast}=require('../lib/forecast');
const {normalizeStoredUtilities}=require('../lib/utilities-service');
const {createRuntime,vienna}=require('../lib/engine');
const pkg=require('../package.json');

// This official harness installs its own controller in os.tmpdir(). The preload
// makes the public release check deterministic and tests the offline case.
const preload=path.join(__dirname,'fixtures/github-offline.cjs');
process.env.NODE_OPTIONS=[process.env.NODE_OPTIONS,'--require='+preload].filter(Boolean).join(' ');
const N='energiemanagement.0';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function invoke(client,method,...args){return new Promise((resolve,reject)=>client[method](...args,(error,result)=>error?reject(error):resolve(result)));}
const read=(h,id)=>invoke(h.states,'getState',id.includes('.')&&id.startsWith(N+'.')?id:N+'.'+id);
const value=async(h,id)=>(await read(h,id))?.val;
async function waitFor(fn,label,timeout=20000){const end=Date.now()+timeout;for(;;){const result=await fn();if(result)return result;if(Date.now()>end)throw Error('Timed out: '+label);await sleep(100);}}
async function put(h,id,val,type=typeof val,unit=''){
 await invoke(h.objects,'setObject',id,{_id:id,type:'state',common:{name:id,type,role:'value',read:true,write:true,...(unit?{unit}:{})},native:{}});
 await invoke(h.states,'setState',id,{val,ack:true,ts:Date.now()});
}

tests.integration(path.join(__dirname,'..'),{
 controllerVersion:process.env.IOBROKER_TEST_CONTROLLER_VERSION||'7.2.5',
 loglevel:'info',waitBeforeStartupSuccess:1000,
 defineAdditionalTests({suite}){
  suite('0.10.1 state upgrade with GitHub unavailable',getHarness=>{
   let harness,expected,day,foreignCommands=0;
   before(async function(){
    this.timeout(60000);harness=getHarness();day=vienna(Date.now()-86400000).day;
    await put(harness,'test.0.grid.power',1200,'number','W');
    await put(harness,'test.0.grid.counter',12345.25,'number','kWh');
    await put(harness,'test.0.pv.power',2400,'number','W');
    await put(harness,'test.0.load.power',75,'number','W');
    await put(harness,'test.0.load.enable',false,'boolean');
    await put(harness,'test.0.room.temperature',21,'number','°C');
    await put(harness,'test.0.outdoor.temperature',8,'number','°C');
    const sources=defaultSources();sources.importW.id='test.0.grid.power';sources.importKWh.id='test.0.grid.counter';sources.pv=[{id:'test.0.pv.power',factor:1,name:'Existing roof'}];
    const consumers=normalizeConsumers({master:false,maxParallel:2,devices:[{id:'existing_load',name:'Existing load',enabled:true,requested:true,priority:4,maxW:1500,measuredW:'test.0.load.power',output:{armed:false,enableId:'test.0.load.enable'}}]});
    const heating=normalizeHeating({...defaultHeating(),rooms:[{id:'living',name:'Existing room',stateId:'test.0.room.temperature',targetC:20.5,weight:2}],outdoorId:'test.0.outdoor.temperature'});
    const settings=normalizeSettings({targetW:8100,reserveW:675,tariffThresholdW:11000,minCoveragePct:91});
    const utilities=normalizeStoredUtilities({water:{mode:'counter',stateId:'test.0.water.counter',unit:'m³'},rainwater:{mode:'flow',stateId:'',unit:'l/min'},fuel:{type:'oil',mode:'counter',stateId:''}});
    const dayRow={importKWh:4.25,exportKWh:3.5,pvKWh:10,houseKWh:10.75,peakW:2200,peakStart:Date.now()-86400000,valid:96,invalid:0};
    const consumerDays={version:1,days:{[day]:{existing_load:{name:'Existing load',sourceId:'test.0.load.power',kWh:1.2345,coveredSec:86000,samples:100,updatedAt:Date.now()-86400000}}}};
    const utilityRuntime={version:1,startedAt:Date.now()-86400000,lastSampleAt:null,days:{water:{[day]:{value:.62,coveredSec:86000}},rainwater:{},pellets:{},oil:{},gas:{}},totals:{water:.62,rainwater:0,pellets:0,oil:0,gas:0}};
    expected={sources,consumers,heating,settings,utilities,dayRow,consumerDays,utilityRuntime};
    const records={'config.sources':sources,'config.consumers':consumers,'config.settings':settings,'config.heating':heating,'config.forecast':defaultForecast(),'config.utilities_JSON':utilities,'config.features_JSON':{water:false,rainwater:false,fuel:false,heating:true},'internal.runtime':createRuntime({days:{[day]:dayRow}}),'history.days':{[day]:dayRow},'analytics.consumerDays_JSON':consumerDays,'internal.utilities':utilityRuntime};
    for(const [id,record]of Object.entries(records))await put(harness,N+'.'+id,JSON.stringify(record),'string');
    await put(harness,N+'.config.hardwareMaster',false,'boolean');
    await put(harness,N+'.status.version','0.10.1','string');
    harness.on('stateChange',(id,state)=>{if(id==='test.0.load.enable'&&state?.ack===false)foreignCommands++;});
    await harness.startAdapterAndWait();
    await waitFor(async()=>await value(harness,'status.running')===true,'application started');
   });
   it('keeps existing source mappings, priorities, settings and heating configuration',async()=>{
    assert.equal(await value(harness,'status.version'),pkg.version);
    for(const [state,key]of [['config.sources','sources'],['config.consumers','consumers'],['config.settings','settings'],['config.heating','heating'],['config.utilities_JSON','utilities']])assert.deepEqual(JSON.parse(await value(harness,state)),expected[key],state);
    assert.equal(await value(harness,'config.hardwareMaster'),false);
    assert.equal((await invoke(harness.states,'getState','test.0.load.enable')).val,false);assert.equal(foreignCommands,0);
   });
   it('retains historical energy, utility totals and device energy from 0.10.1',async()=>{
    const runtime=JSON.parse(await value(harness,'internal.runtime'));
    assert.deepEqual(runtime.days[day],expected.dayRow);
    assert.deepEqual(JSON.parse(await value(harness,'analytics.consumerDays_JSON')).days[day],expected.consumerDays.days[day]);
    const utilities=JSON.parse(await value(harness,'internal.utilities'));
    assert.equal(utilities.totals.water,.62);assert.equal(utilities.days.water[day].value,.62);
   });
   it('continues measurements and reports an informational failure while GitHub is offline',async function(){
    this.timeout(20000);
    await waitFor(async()=>JSON.parse(await value(harness,'update.status_JSON')).status==='unavailable','offline version status');
    await waitFor(async()=>{const sample=await value(harness,'status.lastSample');return typeof sample==='string'&&Number.isFinite(Date.parse(sample));},'first complete measurement');
    const first=await value(harness,'status.lastSample');
    await waitFor(async()=>{const next=await value(harness,'status.lastSample');return typeof next==='string'&&next!==first;},'next measurement cycle');
    assert.equal(await value(harness,'status.running'),true);assert.equal(await value(harness,'status.lastError'),'');
    assert.equal(foreignCommands,0);assert.equal((await invoke(harness.states,'getState','test.0.load.enable')).val,false);
   });
   it('retains the same configuration and archives through a real adapter process restart',async function(){
    this.timeout(40000);await harness.stopAdapter();
    // @iobroker/testing deliberately permits one process per harness. Use a
    // fresh harness with the same isolated DB connection for a genuine restart.
    const restarted=new harness.constructor(path.join(__dirname,'..'),path.dirname(path.dirname(harness.testAdapterDir)),harness.dbConnection);
    await invoke(harness.states,'delState','system.adapter.'+N+'.sigKill');
    // The standalone harness has no host process to clear the previous alive flag.
    await invoke(harness.states,'setState','system.adapter.'+N+'.alive',{val:false,ack:true,from:'system.host.testing'});
    try{
     await restarted.startAdapterAndWait();
     await waitFor(async()=>await value(restarted,'status.running')===true,'adapter restarted');
     await waitFor(async()=>{const sample=await value(restarted,'status.lastSample');return typeof sample==='string'&&Number.isFinite(Date.parse(sample));},'restart measurement');
     const restartSample=await value(restarted,'status.lastSample');
     await waitFor(async()=>{const sample=await value(restarted,'status.lastSample');return typeof sample==='string'&&sample!==restartSample;},'next restart measurement cycle');
     assert.deepEqual(JSON.parse(await value(restarted,'config.sources')),expected.sources);
     assert.deepEqual(JSON.parse(await value(restarted,'config.consumers')),expected.consumers);
     assert.deepEqual(JSON.parse(await value(restarted,'config.heating')),expected.heating);
     assert.equal(JSON.parse(await value(restarted,'internal.utilities')).totals.water,.62);
     assert.deepEqual(JSON.parse(await value(restarted,'internal.runtime')).days[day],expected.dayRow);
     assert.equal(foreignCommands,0);assert.equal((await invoke(restarted.states,'getState','test.0.load.enable')).val,false);
    }finally{if(restarted.isAdapterRunning()&&!restarted.didAdapterStop())await restarted.stopAdapter();}
   });
  });
 }
});
