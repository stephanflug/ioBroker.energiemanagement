'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {normalizeBatteryConfig,readBatteryMeasurements}=require('../lib/battery-sources');
test('separate batteries and optional fields',()=>{
 const c={batteries:[{id:'goodwe',enabled:true,sources:{soc:'goodwe.soc',voltage:'goodwe.voltage'}},{id:'growatt',enabled:true,sources:{soc:'growatt.soc'}},{id:'off',enabled:false}]};
 const now=1000000;
 const rows=readBatteryMeasurements(c,{'goodwe.soc':{val:78,ts:now},'goodwe.voltage':{val:52.4,ts:now},'growatt.soc':{val:54,ts:now}},now);
 assert.equal(rows.length,2);assert.equal(rows[0].values.soc,78);assert.equal(rows[1].values.soc,54);
 assert.equal(rows[0].values.current,null);
 assert.equal(Object.hasOwn(rows[0],'totalSoc'),false);
});
test('invalid SOC and stale data are not displayed',()=>{
 const c={batteries:[{id:'battery_1',enabled:true,sources:{soc:'a.soc'}}]};
 assert.equal(readBatteryMeasurements(c,{'a.soc':{val:105,ts:100}},100)[0].values.soc,null);
 assert.equal(readBatteryMeasurements(c,{'a.soc':{val:50,ts:100}},200000)[0].values.soc,null);
});
test('duplicate IDs are rejected',()=>assert.throws(()=>normalizeBatteryConfig({batteries:[{id:'same'},{id:'same'}]})));
