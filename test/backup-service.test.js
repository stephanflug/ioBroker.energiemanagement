'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {BackupService,goodOff}=require('../lib/backup-service');
const {buildBackup,validateBackup,REQUIRED_IDS}=require('../lib/backup');
const {defaultSources,defaultConsumers}=require('../lib/normalize');
const {defaultHeating}=require('../lib/heating');
const {defaultForecast}=require('../lib/forecast');
const {defaultStoredUtilities}=require('../lib/utilities-service');
const {FuelInventory}=require('../lib/fuel-inventory');
const NOW=Date.UTC(2026,10,8,12),NS='energiemanagement.0',DAY='2026-11-07';
const clone=value=>structuredClone(value),json=value=>JSON.stringify(value),read=(adapter,id)=>JSON.parse(adapter.states[id].val);
function fixture({source='meter.0.old',amount=3}={}){
 const states=Object.fromEntries(REQUIRED_IDS.map(id=>[id,{val:id==='config.hardwareMaster'||id==='migration.done'?false:['history.intervals','history.power','heating.history'].includes(id)?'[]':'{}',ts:NOW}]));
 const sources=defaultSources();sources.importW.id=source;
 const consumers=defaultConsumers();consumers.master=true;consumers.devices=[{id:'washer',name:'Waschmaschine',type:'switch',enabled:true,requested:true,mode:'auto',priority:1,maxW:1000,minW:1000,minOffSec:30,statusId:'meter.0.on',measuredW:'meter.0.w',output:{armed:true,enableId:'switch.0.enable',enableOn:true}}];
 const heating=defaultHeating();Object.assign(heating,{enabled:true,hardwareEnabled:true,rooms:[{id:'living',name:'Wohnzimmer',stateId:'sensor.0.room',targetC:21,weight:1,enabled:true}],pump:{...heating.pump,armed:true,lockId:'heat.0.lock',statusId:'heat.0.running'}});
 const days={[DAY]:{importKWh:amount,exportKWh:0,pvKWh:1,houseKWh:amount+1,valid:1,invalid:0}};
 const inventory=new FuelInventory();inventory.recordFill(NOW-1000,'pellets',{mode:'set',amount:1500,capacity:3000,requestId:'service_fixture_01'});
 const values={'config.sources':sources,'config.consumers':consumers,'config.settings':{targetW:9500,reserveW:500,minCoveragePct:85},'config.hardwareMaster':true,'config.forecast':defaultForecast(),'config.heating':heating,'config.features_JSON':{water:true,fuel:true,heating:true},'config.utilities_JSON':defaultStoredUtilities(),'config.energySummary_JSON':{monthlyPvTargetKWh:250},'internal.runtime':{days,months:{},intervals:[],anchors:{import:{value:100,ts:NOW-1000}},lastPower:{ts:NOW-1000}},'internal.energySummary':{version:1,days:{}},'internal.utilities':{version:1,days:{water:{},pellets:{},oil:{},gas:{}},totals:{water:0,pellets:0,oil:0,gas:0}},'internal.fuelInventory':inventory.runtime(),'internal.heatingLearning':{version:1,heatingSamples:5,coolingSamples:7},'internal.heatingOutputs':{version:1,owned:{},holds:{}},'internal.hardware':{},'history.days':days,'history.power':[{ts:NOW-1000,values:{pvW:amount*100}}],'heating.history':[{ts:NOW-1000,meanC:21,roomValues:{living:21}}],'analytics.consumerDays_JSON':{version:1,days:{[DAY]:{washer:{kWh:.4,coveredSec:60}}}},'migration.done':true,'migration.report':{},'migration.backup':{}};
 for(const [id,value]of Object.entries(values))states[id]={val:typeof value==='object'?json(value):value,ts:NOW};
 return states;
}
function document(options){return buildBackup({states:fixture(options),namespace:NS,version:'0.9.0',now:NOW});}
function fakeAdapter(options={}){
 const states=fixture(),events=[],foreignWrites=[],files=[],owned=clone(options.owned||{}),foreign=clone(options.foreign||{});
 let failOnce=options.failSetOnce||null,loads=0,ticks=0;
 const adapter={namespace:NS,states,events,foreignWrites,files,activeHardware:owned,lastOff:{},dataBusy:false,stopping:false,restoreHold:false,
  sources:read({states},'config.sources'),consumers:read({states},'config.consumers'),settings:read({states},'config.settings'),hardwareMaster:true,energySummaryConfig:read({states},'config.energySummary_JSON'),
  engine:{r:read({states},'internal.runtime')},insights:{history:read({states},'history.power')},energySummary:{runtime:()=>read({states},'internal.energySummary')},consumerEnergy:{archive:()=>read({states},'analytics.consumerDays_JSON')},
  log:{warn:message=>events.push({kind:'warning',message})},
  async set(id,value,force){const val=typeof value==='object'?json(value):value;events.push({kind:'set',id,val,force});if(failOnce&&failOnce(id,val)){failOnce=null;throw Error('injected apply failure');}states[id]={val,ack:true,ts:NOW};},
  async getStateAsync(id){events.push({kind:'read',id});return clone(states[id]||null)},
  async writeFileAsync(storage,name,data){events.push({kind:'file',storage,name});if(options.fileFailure)throw Error('safety file unavailable');files.push({storage,name,data:Buffer.from(data)});},
  async validateWritable(id,type){events.push({kind:'validate-output',id,type})},
  async getForeignStateAsync(id){events.push({kind:'read-output',id});return clone(foreign[id]||null)},
  async setForeignStateAsync(id,state){foreignWrites.push({id,state:clone(state)});events.push({kind:'write-output',id});foreign[id]={...state,...(options.confirmForeign?{ack:true,q:0}:{})};},
  async loadRestoredData(){loads++;events.push({kind:'load'});this.sources=read(this,'config.sources');this.consumers=read(this,'config.consumers');this.settings=read(this,'config.settings');this.hardwareMaster=false;this.activeHardware=read(this,'internal.hardware');this.heating.config=read(this,'config.heating');this.heating.owned=read(this,'internal.heatingOutputs').owned;this.engine.r=read(this,'internal.runtime');this.insights.history=read(this,'history.power');this.restoreHold=false;},
  async tick(){ticks++;events.push({kind:'tick'})}
 };
 adapter.forecast={config:read(adapter,'config.forecast'),close:()=>events.push({kind:'forecast-close'})};
 adapter.heating={config:read(adapter,'config.heating'),owned:clone(options.heatingOwned||{}),queue:Promise.resolve(),
  async configure(config){events.push({kind:'heating-configure'});this.config=clone(config);await adapter.set('config.heating',config,true)},
  async persist(){await adapter.set('internal.heatingLearning',read(adapter,'internal.heatingLearning'),true);await adapter.set('heating.history',read(adapter,'heating.history'),true);await adapter.set('internal.heatingOutputs',{version:1,owned:this.owned,holds:{}},true)}
 };
 adapter.heating.engine={configure(config){events.push({kind:'heating-configure'});adapter.heating.config=clone(config);return adapter.heating.config}};
 adapter.heating.outputs={async release(reason){events.push({kind:'heating-release',reason});if(options.confirmHeating!==false)adapter.heating.owned={};return {outputs:[],errors:[]}},runtime:()=>({owned:adapter.heating.owned})};
 adapter.utilities={config:read(adapter,'config.utilities_JSON'),features:read(adapter,'config.features_JSON'),queue:Promise.resolve(),async persist(){await adapter.set('internal.utilities',read(adapter,'internal.utilities'),true);await adapter.set('internal.fuelInventory',read(adapter,'internal.fuelInventory'),true)}};
 adapter.counts=()=>({loads,ticks});return adapter;
}
const service=adapter=>new BackupService(adapter,{releaseTimeoutMs:0,wait:async()=>{throw Error('unexpected wait')}});
function controlsDisabled(adapter){assert.equal(adapter.hardwareMaster,false);assert.equal(adapter.states['config.hardwareMaster'].val,false);const consumers=read(adapter,'config.consumers'),heating=read(adapter,'config.heating');assert.equal(consumers.master,false);assert.equal(heating.enabled,false);assert.equal(heating.hardwareEnabled,false);return {consumers,heating};}

test('snapshot flushes current in-memory data before reading a detached valid full backup',async()=>{
 const a=fakeAdapter();a.settings.targetW=5432;a.sources.importW.id='meter.0.current';a.engine.r.days[DAY].importKWh=4;
 const result=await service(a).export();assert.equal(result.ok,true);validateBackup(result.backup);assert.equal(JSON.parse(result.backup.states['config.settings'].val).targetW,5432);assert.equal(JSON.parse(result.backup.states['config.sources'].val).importW.id,'meter.0.current');assert.equal(JSON.parse(result.backup.states['history.days'].val)[DAY].importKWh,4);assert.equal(JSON.parse(result.backup.states['internal.fuelInventory'].val).tanks.pellets.remaining,1500);
 const firstRead=a.events.findIndex(e=>e.kind==='read');assert.ok(firstRead>0);assert.ok(a.events.slice(0,firstRead).every(e=>e.kind==='set'));a.engine.r.days[DAY].importKWh=9;assert.equal(JSON.parse(result.backup.states['history.days'].val)[DAY].importKWh,4);assert.equal(a.dataBusy,false);assert.equal(a.files.length,0);assert.deepEqual(a.foreignWrites,[]);
});

test('same off value with ack false is commanded again and abort retains all unconfirmed ownership',async()=>{
 const record={enableId:'switch.0.enable',enableOn:true};const a=fakeAdapter({owned:{washer:record},foreign:{'switch.0.enable':{val:false,ack:false,q:0}},heatingOwned:{'heat.0.lock':{lastValue:true}},confirmHeating:false});
 await assert.rejects(()=>service(a).restore({requestId:'unconfirmed_release_01',backup:document({source:'meter.0.new'})}),/nicht bestätigt/);
 assert.deepEqual(a.foreignWrites,[{id:'switch.0.enable',state:{val:false,ack:false}}]);assert.deepEqual(a.activeHardware,{washer:record});assert.deepEqual(read(a,'internal.hardware'),{washer:record});assert.deepEqual(a.heating.owned,{'heat.0.lock':{lastValue:true}});assert.deepEqual(read(a,'internal.heatingOutputs').owned,a.heating.owned);assert.equal(a.sources.importW.id,'meter.0.old');assert.equal(a.counts().loads,0);assert.equal(a.restoreHold,true);controlsDisabled(a);assert.equal(a.dataBusy,false);
 assert.equal(a.files.length,1);const safety=validateBackup(a.files[0].data.toString());assert.equal(safety.states['config.hardwareMaster'].val,true);assert.deepEqual(JSON.parse(safety.states['internal.hardware'].val),{washer:record});assert.ok(a.events.findIndex(e=>e.kind==='file')<a.events.findIndex(e=>e.kind==='write-output'));
});

test('confirmed outputs are released before restored mappings are applied, then every control stays disabled',async()=>{
 const a=fakeAdapter({owned:{washer:{enableId:'switch.0.enable',enableOn:true}},foreign:{'switch.0.enable':{val:true,ack:true,q:0}},confirmForeign:true,heatingOwned:{'heat.0.lock':{lastValue:true}}});const b=service(a),incoming=document({source:'meter.0.restored',amount:8});
 const result=await b.restore({requestId:'confirmed_restore_01',backup:incoming});assert.equal(result.ok,true);assert.match(result.safetyBackupPath,/^0_userdata\.0\/energiemanagement-backups\/energiemanagement\.0-vor-restore-/);assert.equal(a.files[0].storage,'0_userdata.0');assert.equal(a.sources.importW.id,'meter.0.restored');assert.equal(read(a,'history.days')[DAY].importKWh,8);assert.equal(read(a,'internal.fuelInventory').tanks.pellets.remaining,1500);assert.deepEqual(a.activeHardware,{});assert.ok(a.lastOff.washer>0);assert.deepEqual(read(a,'internal.heatingOutputs').owned,{});assert.equal(a.counts().loads,1);assert.equal(a.restoreHold,false);assert.equal(a.dataBusy,false);const c=controlsDisabled(a);assert.equal(c.consumers.devices[0].output.armed,false);assert.equal(c.heating.pump.armed,false);
 const output=a.events.findIndex(e=>e.kind==='write-output'),applied=a.events.findIndex(e=>e.kind==='set'&&e.id==='config.sources'&&e.val.includes('meter.0.restored'));assert.ok(output>=0&&output<applied);assert.equal(b.completed.size,1);assert.equal(read(a,'internal.runtime').lastPower,null);assert.deepEqual(read(a,'internal.runtime').anchors,{});
});

test('confirmed off readings avoid redundant commands while bad quality readings require confirmation',async()=>{
 assert.equal(goodOff({val:false,ack:true,q:0},false),true);assert.equal(goodOff({val:false,ack:true,q:64},false),false);assert.equal(goodOff({val:false,ack:false},false),false);
 const a=fakeAdapter({owned:{washer:{enableId:'switch.0.enable',enableOn:true}},foreign:{'switch.0.enable':{val:false,ack:true}}});await service(a).restore({requestId:'already_released_01',backup:document()});assert.deepEqual(a.foreignWrites,[]);assert.deepEqual(a.activeHardware,{});
 const poor=fakeAdapter({owned:{washer:{enableId:'switch.0.enable',enableOn:true}},foreign:{'switch.0.enable':{val:false,ack:true,q:64}}});await assert.rejects(()=>service(poor).restore({requestId:'bad_quality_reading_01',backup:document()}),/nicht bestätigt/);assert.equal(poor.foreignWrites.length,1);assert.ok(poor.activeHardware.washer);
});

test('failure to persist the safety file happens before disabling controls or touching hardware and mappings',async()=>{
 const a=fakeAdapter({fileFailure:true,owned:{washer:{enableId:'switch.0.enable',enableOn:true}},foreign:{'switch.0.enable':{val:true,ack:true}}});const original=clone(a.states);await assert.rejects(()=>service(a).restore({requestId:'safety_file_failure_01',backup:document({source:'meter.0.new'})}),/safety file unavailable/);
 assert.equal(a.hardwareMaster,true);assert.equal(a.consumers.master,true);assert.equal(a.heating.config.enabled,true);assert.equal(a.restoreHold,false);assert.equal(a.sources.importW.id,'meter.0.old');assert.equal(a.counts().loads,0);assert.equal(a.dataBusy,false);assert.deepEqual(a.foreignWrites,[]);assert.equal(a.events.some(e=>e.kind==='heating-release'||e.kind==='heating-configure'||e.kind==='forecast-close'),false);for(const id of REQUIRED_IDS)assert.equal(a.states[id].val,original[id].val,id+' remains unchanged');
});

test('a partial apply failure rolls back previous archives and mappings with disabled controls and cleared anchors',async()=>{
 const a=fakeAdapter({failSetOnce:(id,val)=>id==='history.power'&&val.includes('800')});const b=service(a),before=clone(a.states),incoming=document({source:'meter.0.new',amount:8});
 await assert.rejects(()=>b.restore({requestId:'apply_failure_rollback_01',backup:incoming}),/vorherige Daten mit deaktivierten Steuerungen zurückgesichert/);
 assert.equal(a.sources.importW.id,'meter.0.old');assert.equal(a.states['history.days'].val,before['history.days'].val);assert.equal(a.states['history.power'].val,before['history.power'].val);assert.equal(a.states['internal.fuelInventory'].val,before['internal.fuelInventory'].val);assert.equal(a.states['internal.heatingLearning'].val,before['internal.heatingLearning'].val);assert.equal(a.counts().loads,1);assert.equal(a.restoreHold,false);assert.equal(a.dataBusy,false);const c=controlsDisabled(a);assert.equal(c.consumers.devices[0].output.armed,false);assert.equal(c.heating.pump.armed,false);assert.deepEqual(read(a,'internal.hardware'),{});assert.deepEqual(read(a,'internal.heatingOutputs').owned,{});assert.deepEqual(read(a,'internal.runtime').anchors,{});assert.equal(b.completed.size,0);
 assert.ok(a.events.some(e=>e.kind==='set'&&e.id==='history.days'&&e.val.includes('"importKWh":8')),'incoming archive was applied before injected failure');assert.equal(a.files.length,1);validateBackup(a.files[0].data.toString());
});

test('serialized request IDs deduplicate the same backup and reject reuse for a different checksum without side effects',async()=>{
 const a=fakeAdapter(),b=service(a),backup=document({source:'meter.0.new'}),requestId='dedupe_restore_request_01';const first=await b.restore({requestId,backup:json(backup)}),eventCount=a.events.length,counts=a.counts();
 const second=await b.restore({requestId,backup:clone(backup)});assert.deepEqual(second,first);assert.equal(a.events.length,eventCount);assert.deepEqual(a.counts(),counts);assert.equal(a.files.length,1);
 await assert.rejects(()=>b.restore({requestId,backup:document({source:'meter.0.other'})}),/anderen Sicherung/);assert.equal(a.events.length,eventCount);assert.deepEqual(a.counts(),counts);assert.equal(a.files.length,1);
});
