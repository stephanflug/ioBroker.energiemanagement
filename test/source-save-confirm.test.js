'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../www/app.js'),'utf8');
const start=script.indexOf(' async function waitForSavedConfig(');
const end=script.indexOf('\n async function save(',start);
if(start<0||end<start)throw Error('Save confirmation implementation was moved');
const snippet=script.slice(start,end);
function makeWait(states,{delay=210}={}){
 let now=0,reads=0;
 const readVal=async id=>{
  if(id==='status.lastError')return {val:'Test rejection'};
  reads++;
  return states[Math.min(reads-1,states.length-1)];
 };
 const schedule=fn=>{now+=delay;fn();};
 const clock={now:()=>now};
 return {wait:new Function('readVal','setTimeout','Date',snippet+';return waitForSavedConfig;')(readVal,schedule,clock),reads:()=>reads};
}
test('Wartet auf ack:true nach asynchronem ioBroker-Schreibbefehl',async()=>{
 const payload={pv:[{id:'goodwe_we.0.runtime.ppv',factor:1,name:'PV 1'}]};
 const val=JSON.stringify(payload);
 const t=makeWait([{val,ack:false},{val,ack:false},{val,ack:true}]);
 const confirmation=await t.wait('config.sources',payload,1600);
 assert.equal(confirmation.ack,true);
 assert.ok(t.reads()>=3);
});
test('Alte Konfiguration mit ack:true wird nicht als erfolgreiche Speicherung betrachtet',async()=>{
 const payload={pv:[{id:'goodwe_we.0.runtime.ppv',factor:1,name:'PV 1'}]};
 const previous=JSON.stringify({pv:[]}),val=JSON.stringify(payload);
 const t=makeWait([{val:previous,ack:true},{val:previous,ack:true},{val,ack:true}]);
 const confirmation=await t.wait('config.sources',payload,1600);
 assert.equal(confirmation.val,val);
 assert.ok(t.reads()>=3);
});
test('Ohne Adapterbestätigung wird mit sichtbarem Fehler abgebrochen',async()=>{
 const payload={pv:[]},t=makeWait([{val:JSON.stringify(payload),ack:false}],{delay:200});
 await assert.rejects(t.wait('config.sources',payload,500),/nicht bestätigt.*Adapterfehler/);
});
test('Datenquellen-Speichern zeigt Pflichtfelder und PV-Fehler an und wartet auf Bestätigung',()=>{
 assert.match(script,/sourceSaveError\(e\.message,key\)/);
 assert.match(script,/Pflichtquelle fehlt: /);
 assert.match(script,/PV-Quelle entfernen/);
 assert.match(script,/sourceDirty'\)\.textContent='Speichert/);
 assert.match(script,/await save\('config\.sources',forms\.sources,'sources'\)/);
});
