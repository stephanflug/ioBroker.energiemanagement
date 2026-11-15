'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const j=require('/opt/iobroker/node_modules/jsdom');
const base=process.argv[2];
const d=j.jsdom(fs.readFileSync(base+'/index.html','utf8'),{url:'http://127.0.0.1:8082/energiemanagement/test-issues/index.html?instance=energiemanagement.1'});
const w=d.defaultView,p=w.Element.prototype;
if(!p.after)p.after=function(n){this.parentNode.insertBefore(n,this.nextSibling)};
if(!p.insertAdjacentHTML)p.insertAdjacentHTML=function(where,html){const root=d.createElement('div');root.innerHTML=html;for(const n of Array.from(root.childNodes))this.appendChild(n)};
w.URLSearchParams=URLSearchParams;
w.console=console;w.confirm=()=>true;
const mock={
 '0_userdata.0.EnergiemanagementTest.data':{heat:{valid:true,phase:'Heizen empfohlen',heatingRecommended:true,outdoorC:4.5,heatLimitC:12,yearTotal:0.1,location:'Tarrenz'},fuel:{counter:{value:149.952,status:'stale',sourceTs:1794630395976},unit:'kg',type:'pellets'},water:{counter:{id:'hm-rega.0.82351',value:1042.4},unit:'m³'}},
 '0_userdata.0.EnergiemanagementTest.config':{referenceC:20,heatLimitC:12,hysteresisC:1},
 '0_userdata.0.EnergiemanagementTest.archive':{days:{'2026-11-15':{sum:9,samples:2,lastAt:1794736000000,firstAt:1794735700000}}},
 'energiemanagement.1.analytics.utilitiesArchive_JSON':{days:{water:{},pellets:{}}},
 'energiemanagement.0.analytics.utilitiesArchive_JSON':{days:{water:{'2026-11-10':{value:.2,coveredSec:86000}},pellets:{'2026-11-10':{value:2.4,coveredSec:86000}}}}
};
const sock={connected:true,on(){return this},emit(op,...args){const cb=args.pop();Promise.resolve().then(()=>cb(null,op==='getState'?{val:JSON.stringify(mock[args[0]]||{})}:true))}};
w.io={connect:()=>sock};w.EnergyStatePicker={open(o){o.onSelect('0_userdata.0.TestWater')}};
w.eval(fs.readFileSync(base+'/features.js','utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded',{bubbles:true}));
setTimeout(()=>{
try{
for(const id of ['emtOverview','emtFuelCounter','emtWaterChart','emtFuelChart','emtHddChart','emtHddSettings','emtUtilitiesSettings','emtResetApply','emtSwapMeter'])assert(d.getElementById(id),'Missing '+id);
for(const id of ['emtWaterChart','emtFuelChart','emtHddChart'])assert(d.getElementById(id).querySelector('svg'),'Missing chart '+id);
assert.match(d.getElementById('emtFuelCounter').textContent,/149,952/);
d.getElementById('emtTabHdd').click();assert(!d.getElementById('emtHddSettings').classList.contains('emt-hidden'));
d.getElementById('emtNewMeterPicker').click();assert.equal(d.getElementById('emtNewMeter').value,'0_userdata.0.TestWater');
console.log('OK: 3 charts, heating tab, reset & meter UI, known fuel counter, shared picker');
process.exit(0);
}catch(e){console.error('TEST FAILED',e);process.exit(1)}
},750);
