'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..','www',file),'utf8');
test('Zentrale Datenquellenverwaltung darf verschobene Geräteausgänge nicht entfernen',()=>{
 const code=read('sources-manager.js');
 assert.doesNotMatch(code,/consumer\.innerHTML\s*=/);
 assert.match(code,/consumer\.insertAdjacentHTML\('afterbegin'/);
 assert.match(code,/outputPage\.children/);
});
test('Gemeinsamer Datenpunkt-Picker validiert Lese-/Schreibrechte und ermöglicht ALIAS',()=>{
 const code=read('app.js');
 assert.match(code,/window\.EnergyStatePicker\s*=/);
 assert.match(code,/alias\.0/);
 assert.match(code,/x\.obj\.common\.write===true/);
 assert.match(code,/x\.obj\.common\.read!==false/);
 assert.match(code,/target\.onSelect\(id,meta\)/);
 assert.match(code,/if\(el\)el\.textContent=dirty\[key\]/);
});
test('Alle Datenquellen-Module verwenden den gemeinsamen Picker',()=>{
 for(const file of ['sources-manager.js','heating.js','batteries.js','utilities.js','rainwater.js']){
  assert.match(read(file),/window\.EnergyStatePicker\.open\(/,file+' nutzt den zentralen Picker');
 }
});
test('Die PV-Quelle lässt sich weiterhin ergänzen, ohne gespeicherte Quellen zu überschreiben',()=>{
 const code=read('app.js');
 assert.match(code,/function addPvSource\(event\)/);
 assert.match(code,/list\.push\(\{id:'',factor:1,name:'PV '/);
 assert.match(code,/mark\('sources'\);renderSources\(\)/);
});
