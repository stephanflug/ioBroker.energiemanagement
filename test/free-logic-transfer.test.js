'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createExport,importLogics}=require('../www/free-logic-transfer');
const {validate}=require('../lib/free-logic');

const sample=()=>({externalWritesEnabled:true,logics:[{
 id:'battery',name:'BatterieVoll',enabled:true,blocks:[
  {id:'soc',op:'input',name:'SOC',inputs:[],stateId:'goodwe_we.0.runtime.battery_soc'},
  {id:'limit',op:'constant',name:'Grenze',value:80,inputs:[]},
  {id:'compare',op:'gt',name:'Größer',inputs:['soc','limit'],x:300,y:60},
  {id:'out',op:'output',name:'E-Patrone',inputs:['compare'],stateId:'hm-rega.0.48501',createNew:false,writeEnabled:true,cyclicWrite:true,cycleSeconds:60}
 ]}]}));
const idFactory=()=>{let n=0;return prefix=>prefix+'_'+(++n)};

test('Teilbare Vorlage entfernt lokale Zuordnungen und alle Aktivierungen',()=>{
 const data=createExport(sample(),'template','battery');
 assert.equal(data.type,'template');
 assert.equal(data.externalWritesEnabled,false);
 const l=data.logics[0];
 assert.equal(l.enabled,false);
 assert.equal(l.blocks.find(b=>b.op==='input').stateId,'');
 assert.equal(l.blocks.find(b=>b.op==='output').stateId,'');
 assert.equal(l.blocks.find(b=>b.op==='output').writeEnabled,false);
 assert.equal(l.blocks.find(b=>b.op==='output').cyclicWrite,false);
 assert.deepEqual(l.blocks.find(b=>b.op==='gt').inputs,['b1','b2']);
});
test('Import erzeugt neue IDs, erhält Verbindungen, deaktiviert Schreiben und bewahrt vorhandene Logik',()=>{
 const existing=sample().logics;
 const before=JSON.stringify(existing);
 const data=createExport(sample(),'backup');
 assert.equal(data.externalWritesEnabled,true);
 assert.equal(data.logics[0].blocks.find(b=>b.op==='output').writeEnabled,true);
 const imports=importLogics(data,existing,idFactory());
 assert.equal(JSON.stringify(existing),before);
 assert.equal(imports.length,1);
 assert.equal(imports[0].enabled,false);
 assert.notEqual(imports[0].id,'battery');
 assert.notEqual(imports[0].name,'BatterieVoll');
 assert.deepEqual(imports[0].blocks.find(b=>b.op==='gt').inputs.slice().length,2);
 assert.ok(imports[0].blocks.find(b=>b.op==='gt').inputs.every(id=>imports[0].blocks.some(b=>b.id===id)));
 assert.equal(imports[0].blocks.find(b=>b.op==='output').stateId,'hm-rega.0.48501');
 assert.equal(imports[0].blocks.find(b=>b.op==='output').writeEnabled,false);
 assert.equal(imports[0].blocks.find(b=>b.op==='output').cyclicWrite,false);
 assert.doesNotThrow(()=>validate({logics:imports}));
});
test('Import einer Vorlage bewahrt keine fremden Datenpunkt-IDs',()=>{
 const original=createExport(sample(),'template','battery');
 const parsed=JSON.parse(JSON.stringify(original));
 const imports=importLogics(parsed,[],idFactory());
 assert.equal(imports[0].blocks.find(b=>b.op==='input').stateId,'');
 assert.equal(imports[0].blocks.find(b=>b.op==='output').stateId,'');
 assert.equal(imports[0].enabled,false);
 assert.equal(imports[0].blocks.find(b=>b.op==='output').writeEnabled,false);
});
test('Import lehnt fehlende Verbindungen, falsches Format und Mengenüberschreitung ab',()=>{
 const broken=createExport(sample(),'backup');
 broken.logics[0].blocks[2].inputs[0]='missing';
 assert.throws(()=>importLogics(broken,[],idFactory()),/Verbindung/);
 const wrong=createExport(sample(),'backup');wrong.schemaVersion=99;
 assert.throws(()=>importLogics(wrong,[],idFactory()),/Vorlagenformat/);
 const enough=Array.from({length:50},(_,i)=>({id:'other_'+i,name:'Other '+i,blocks:[]}));
 assert.throws(()=>importLogics(createExport(sample(),'backup'),enough,idFactory()),/Maximal 50/);
});
test('Import und Export prüfen das Schreibintervall',()=>{
 const value=sample();value.logics[0].blocks.find(b=>b.op==='output').cycleSeconds=9;
 assert.throws(()=>createExport(value,'backup'),/Schreibintervall/);
});
