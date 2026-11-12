'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {applyForeignOutputs}=require('../lib/free-logic-output');
const {validate}=require('../lib/free-logic');
function setup({global=false,perOutput=false,val=true,old=false,type='boolean',writable=true}={}){
 const config={externalWritesEnabled:global,logics:[{id:'test',name:'Test',enabled:true,blocks:[{id:'source',op:'constant',name:'Konstante',value:1,inputs:[]},{id:'out',op:'output',inputs:['source'],stateId:'hm-rega.0.48501',createNew:false,writeEnabled:perOutput}]}]};
 const evaluated={logics:[{id:'test',enabled:true,errors:[],outputs:[{id:'out',stateId:'hm-rega.0.48501',createNew:false,value:val}]}]};
 const calls=[];
 const io={getObject:async()=>({type:'state',common:{type,write:writable}}),getState:async()=>({val:old,ack:true}),setState:async(id,value)=>{calls.push({id,value})}};
 return {config,evaluated,io,calls};
}
test('Fremdausgang bleibt ohne beide Freigaben strikt read-only',async()=>{
 for(const options of [{global:false,perOutput:false},{global:true,perOutput:false},{global:false,perOutput:true}]){
  const c=setup(options);await applyForeignOutputs(c.config,c.evaluated,c.io);
  assert.equal(c.calls.length,0);
 }
});
test('Explizit freigegebener Boolean-Ausgang wird mit val und ack:false übergeben',async()=>{
 const c=setup({global:true,perOutput:true});await applyForeignOutputs(c.config,c.evaluated,c.io);
 assert.deepEqual(c.calls,[{id:'hm-rega.0.48501',value:true}]);
 assert.equal(c.evaluated.logics[0].outputs[0].writeStatus,'Schreibbefehl gesendet');
});
test('Unveränderte Zielwerte werden nicht erneut geschrieben',async()=>{
 const c=setup({global:true,perOutput:true,old:true});await applyForeignOutputs(c.config,c.evaluated,c.io);
 assert.equal(c.calls.length,0);
 assert.equal(c.evaluated.logics[0].outputs[0].writeStatus,'Zielwert bereits vorhanden');
});
test('Nicht schreibbare States und Typkonflikte werden abgewiesen',async()=>{
 for(const options of [{global:true,perOutput:true,writable:false},{global:true,perOutput:true,type:'number'}]){
  const c=setup(options);await applyForeignOutputs(c.config,c.evaluated,c.io);
  assert.equal(c.calls.length,0);
  assert.match(c.evaluated.logics[0].outputs[0].writeStatus,/nicht beschreibbar|Datentyp/);
 }
});
test('Logikfehler verhindert jede externe Ausgabe',async()=>{
 const c=setup({global:true,perOutput:true});c.evaluated.logics[0].errors.push('Fehler');
 await applyForeignOutputs(c.config,c.evaluated,c.io);assert.equal(c.calls.length,0);
});
test('Doppelt konfigurierte Schreiber werden bereits bei Validierung abgelehnt',()=>{
 const c=setup({global:true,perOutput:true});
 const copy=JSON.parse(JSON.stringify(c.config.logics[0]));copy.id='second';copy.blocks[0].id='source2';copy.blocks[1].id='out2';copy.blocks[1].inputs=['source2'];c.config.logics.push(copy);
 assert.throws(()=>validate(c.config),/mehreren Logiken/);
});
