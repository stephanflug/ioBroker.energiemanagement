'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluate,validate}=require('../lib/free-logic');
function build(){return {logics:[{id:'test',name:'Test',enabled:true,blocks:[
 {id:'source',op:'input',name:'Eingang',stateId:'test.0.value',inputs:[]},
 {id:'setpoint',op:'constant',name:'Konstante',value:20,inputs:[]},
 {id:'sum',op:'add',name:'Addieren',inputs:['source','setpoint']},
 {id:'output',op:'output',name:'Ausgang',inputs:['sum'],createNew:true,outputKey:'Test'}
]}]}}
test('Live-FUP liefert Werte bis zum Ausgang',()=>{
 const result=evaluate(build(),id=>id==='test.0.value'?16:null).logics[0];
 assert.deepEqual(result.errors,[]);
 assert.equal(result.values.sum,36);
 assert.equal(result.values.output,36);
});
test('Baustein löschen unterbricht betroffene Verbindungen, aber speichert die Logik',()=>{
 const cfg=build(),logic=cfg.logics[0];
 logic.blocks=logic.blocks.filter(b=>b.id!=='setpoint');
 for(const block of logic.blocks)block.inputs=block.inputs.map(id=>id==='setpoint'?'':id);
 assert.doesNotThrow(()=>validate(cfg));
 assert.deepEqual(logic.blocks.find(b=>b.id==='sum').inputs,['source','']);
 const result=evaluate(cfg,()=>16).logics[0];
 assert.equal(result.values.sum,null);
 assert.equal(result.values.output,null);
 assert.ok(result.errors.some(s=>s.includes('Eingang nicht verbunden')));
 assert.ok(!result.errors.some(s=>s.includes('Zyklische Verbindung')));
});
test('Unbekannte Baustein-Verweise werden weiterhin abgelehnt',()=>{
 const cfg=build();cfg.logics[0].blocks.find(b=>b.id==='sum').inputs[1]='unknown';
 assert.throws(()=>validate(cfg),/Verbindung verweist auf fehlenden Baustein/);
});
