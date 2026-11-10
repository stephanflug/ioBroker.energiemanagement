'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
test('new adapter starts, persists insights, and does not command hardware by default',async()=>{
 const data=new Map(),objects=new Map(),foreignWrites=[],foreignData=new Map();
 class FakeAdapter {
  constructor(){this.config={};this.namespace='energiemanagement.0';this.log={info(){},warn(){},error(m){throw Error(m)}};}
  on(){} async setObjectNotExistsAsync(id,obj){objects.set(id,obj)}
  async getStateAsync(id){return data.has(id)?{val:data.get(id)}:null}
  async setStateAsync(id,s){data.set(id,s.val)}
  async subscribeStatesAsync(){} async getForeignStateAsync(id){return foreignData.get(id)||null}
  async setForeignStateAsync(id,val){foreignWrites.push({id,val})}
 }
 const filename=path.resolve(__dirname,'../main.js'),localRequire=createRequire(filename),mod={exports:{}};
 const context={require:n=>n==='@iobroker/adapter-core'?{Adapter:FakeAdapter}:localRequire(n),module:mod,exports:mod.exports,Date,JSON,console,setTimeout,setInterval:()=>1,clearInterval(){}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),context,{filename});
 const adapter=mod.exports({});await adapter.onReady();
 assert.equal(data.get('status.version'),require('../package.json').version);assert.equal(data.get('status.running'),true);assert.equal(data.get('config.hardwareMaster'),false);
 const history=JSON.parse(data.get('history.power'));assert.equal(history.length,1);assert.equal(history[0].values.pvW,null);
 const snapshot=JSON.parse(data.get('live.snapshot'));assert.equal(snapshot.values.pvW,null);assert.equal(snapshot.houseQuality,'unknown');assert.ok(Number.isFinite(snapshot.ts));
 assert.equal(JSON.parse(data.get('insights.advice')).valid,false);assert.equal(foreignWrites.length,0);
 assert.ok(objects.has('analytics.consumerDays_JSON'));
 assert.ok(objects.has('analytics.energySummary_JSON'));
 const energySummary=JSON.parse(data.get('analytics.energySummary_JSON'));assert.equal(energySummary.version,1);assert.equal(energySummary.timezone,'Europe/Vienna');assert.equal(energySummary.periods.day.metrics.pvKWh.value,null);assert.equal(energySummary.live.phase1W,null);
 assert.equal(JSON.parse(data.get('config.energySummary_JSON')).monthlyPvTargetKWh,0);
 await adapter.onStateChange('energiemanagement.0.config.energySummary_JSON',{val:JSON.stringify({monthlyPvTargetKWh:250}),ack:false});assert.equal(JSON.parse(data.get('config.energySummary_JSON')).monthlyPvTargetKWh,250);assert.equal(foreignWrites.length,0);
 assert.equal(JSON.parse(data.get('config.forecast')).enabled,false);
 assert.equal(JSON.parse(data.get('config.forecast')).location.latitude,null);
 assert.ok(objects.has('commands.forecastRefresh'));
 const heatingConfig=JSON.parse(data.get('config.heating'));assert.equal(heatingConfig.enabled,false);assert.equal(heatingConfig.hardwareEnabled,false);assert.equal(heatingConfig.mode,'observe');assert.equal(JSON.parse(data.get('heating.status')).action,'disabled');
 await adapter.onStateChange('energiemanagement.0.config.forecast',{val:JSON.stringify({enabled:false,provider:'local',location:{name:'',latitude:null,longitude:null,timezone:'UTC'},arrays:[{name:'Roof',peakKwp:0,tilt:30,azimuth:180}],performanceRatio:0.8,weatherFactor:0.7}),ack:false});
 assert.equal(JSON.parse(data.get('config.forecast')).provider,'local');
 assert.equal(JSON.parse(data.get('forecast.data')).days,undefined);
await adapter.onUnload(()=>{});assert.equal(data.get('status.running'),false);assert.equal(JSON.parse(data.get('internal.energySummary')).version,1);
});
