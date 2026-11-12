'use strict';
/* Safe, deterministic FUP evaluation. No eval, no implicit hardware writes. */
const OPS=new Set(['input','virtual','constant','add','sub','mul','div','min','max','gt','lt','gte','lte','eq','neq','and','or','not','xor','limit','output']);
const INPUTS={input:0,virtual:0,constant:0,not:1,output:1,limit:3};
function validate(config){
 if(!config||!Array.isArray(config.logics)||config.logics.length>50)throw Error('Maximal 50 Logiken');
 if(config.externalWritesEnabled!==undefined&&typeof config.externalWritesEnabled!=='boolean')throw Error('FUP-Schreibfreigabe muss Boolean sein');
 const names=new Set(),writtenTargets=new Set();
 for(const logic of config.logics){
  if(typeof logic.id!=='string'||!/^[\w-]{1,50}$/.test(logic.id)||names.has(logic.id))throw Error('Ungültige oder doppelte Logik-ID');
  names.add(logic.id);
  if(typeof logic.name!=='string'||logic.name.length>100)throw Error('Ungültiger Logikname');
  if(!Array.isArray(logic.blocks)||logic.blocks.length>100)throw Error('Maximal 100 Bausteine pro Logik');
  const ids=new Set();
  for(const b of logic.blocks){
   if(typeof b.id!=='string'||!/^[\w-]{1,50}$/.test(b.id)||ids.has(b.id)||!OPS.has(b.op))throw Error('Ungültiger Baustein');
   ids.add(b.id);
   if(b.op==='input'&&b.stateId&&!/^[\w.:-]{1,200}$/.test(b.stateId))throw Error('Ungültiger Eingangs-Datenpunkt');
   if(b.op==='output'&&b.stateId&&!/^[\w.:-]{1,200}$/.test(b.stateId))throw Error('Ungültiger Ausgangs-Datenpunkt');
   if(b.op==='output'&&b.writeEnabled!==undefined&&typeof b.writeEnabled!=='boolean')throw Error('Ausgangs-Schreibfreigabe muss Boolean sein');
   if(b.op==='output'&&b.writeEnabled===true&&b.createNew!==true&&b.stateId){if(writtenTargets.has(b.stateId))throw Error('Fremder Ausgang wird von mehreren Logiken beschrieben');writtenTargets.add(b.stateId)}
   if(b.op==='output'&&b.createNew===true&&b.outputKey&&!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(b.outputKey))throw Error('Neuer Ausgang benötigt einen gültigen Namen (Buchstaben, Ziffern, Unterstrich).');
   if(b.op==='virtual'&&(!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(b.virtualKey||'')))throw Error('Virtueller Datenpunkt benötigt einen gültigen Namen');
   if(b.op==='virtual'&&b.value!==undefined&&!(typeof b.value==='boolean'||typeof b.value==='number'&&Number.isFinite(b.value)))throw Error('Virtueller Standardwert ungültig');
   if(b.op==='constant'&&!(typeof b.value==='boolean'||typeof b.value==='number'&&Number.isFinite(b.value)))throw Error('Konstante ungültig');
   if(!Array.isArray(b.inputs)||b.inputs.length>3)throw Error('Eingänge ungültig');
  }
  for(const b of logic.blocks)for(const id of b.inputs)if(id!==''&&!ids.has(id))throw Error('Verbindung verweist auf fehlenden Baustein');
 }
 return {logics:config.logics,externalWritesEnabled:config.externalWritesEnabled===true};
}
function evaluate(config,read){
 const result=[];
 for(const logic of validate(config).logics){
  const blocks=new Map(logic.blocks.map(b=>[b.id,b])),cache=new Map(),active=new Set(),errors=[];
  function calc(id){
   if(cache.has(id))return cache.get(id);
   if(active.has(id))throw Error('Zyklische Verbindung bei '+id);
   active.add(id);
   try{
   const b=blocks.get(id);if(!b)throw Error('Eingang nicht verbunden');const v=b.inputs.map(calc);
   const n=x=>{if(typeof x!=='number'||!Number.isFinite(x))throw Error('Zahlenwert fehlt bei '+id);return x};
   const bool=x=>{if(typeof x!=='boolean')throw Error('Boolean fehlt bei '+id);return x};
   let out;
   switch(b.op){
    case 'input':if(!b.stateId)throw Error('Datenpunkt nicht zugeordnet');out=read(b.stateId);break;
    case 'virtual':out=read('virtual:'+logic.id+':'+b.virtualKey);break;
    case 'constant':out=b.value;break;
    case 'add':out=v.reduce((a,x)=>a+n(x),0);break;
    case 'sub':out=n(v[0])-n(v[1]);break;
    case 'mul':out=v.reduce((a,x)=>a*n(x),1);break;
    case 'div':if(n(v[1])===0)throw Error('Division durch null');out=n(v[0])/n(v[1]);break;
    case 'min':out=Math.min(...v.map(n));break;
    case 'max':out=Math.max(...v.map(n));break;
    case 'gt':out=n(v[0])>n(v[1]);break;
    case 'lt':out=n(v[0])<n(v[1]);break;
    case 'gte':out=n(v[0])>=n(v[1]);break;
    case 'lte':out=n(v[0])<=n(v[1]);break;
    case 'eq':out=v[0]===v[1];break;
    case 'neq':out=v[0]!==v[1];break;
    case 'and':out=v.every(bool);break;
    case 'or':out=v.some(bool);break;
    case 'not':out=!bool(v[0]);break;
    case 'xor':out=v.filter(bool).length%2===1;break;
    case 'limit':out=Math.max(n(v[1]),Math.min(n(v[2]),n(v[0])));break;
    case 'output':out=v[0];break;
   }
   if(out===null||out===undefined||typeof out==='number'&&!Number.isFinite(out))throw Error('Ungültiger Wert bei '+id);
   cache.set(id,out);return out;
   }finally{active.delete(id)}
  }
  const values={};
  for(const b of logic.blocks){try{values[b.id]=calc(b.id)}catch(e){errors.push(b.id+': '+e.message);values[b.id]=null}}
  result.push({id:logic.id,name:logic.name,enabled:logic.enabled===true,values,errors,outputs:logic.blocks.filter(b=>b.op==='output').map(b=>({id:b.id,stateId:b.stateId||'',createNew:b.createNew===true,outputKey:b.outputKey||'',writeEnabled:b.writeEnabled===true,value:values[b.id],simulation:true}))});
 }
 return {ts:Date.now(),logics:result,simulation:true};
}
module.exports={validate,evaluate};
