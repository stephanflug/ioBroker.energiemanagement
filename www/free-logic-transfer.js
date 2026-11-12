'use strict';
/* Portable FUP template/backup format. Pure functions also used by node:test. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.EnergyFUPTransfer=api;
})(typeof window==='object'?window:null,function(){
 const FORMAT='ioBroker.EnergieManagement.FUP',VERSION=1,MAX_LOGICS=50,MAX_BLOCKS=100;
 const OPS=new Set(['input','virtual','constant','add','sub','mul','div','min','max','gt','lt','gte','lte','eq','neq','and','or','not','xor','limit','output']);
 const pattern=/^[a-zA-Z0-9_.:-]{1,200}$/;
 const keyPattern=/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/;
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 function sanitizeBlock(b){
  if(!isObject(b)||!OPS.has(b.op)||typeof b.id!=='string'||!/^[\w-]{1,50}$/.test(b.id))throw Error('Ungültiger Funktionsbaustein');
  if(!Array.isArray(b.inputs)||b.inputs.length>3||b.inputs.some(x=>typeof x!=='string'))throw Error('Ungültige Verbindung im Baustein '+b.id);
  const n={id:b.id,op:b.op,name:typeof b.name==='string'?b.name.slice(0,100):b.op,inputs:[...b.inputs]};
  if(Number.isFinite(b.x))n.x=b.x;
  if(Number.isFinite(b.y))n.y=b.y;
  if(b.op==='input'||b.op==='output'){
   const id=b.stateId||'';
   if(typeof id!=='string'||id&&(id.length>200||!pattern.test(id)))throw Error('Ungültige Datenpunkt-ID bei '+b.id);
   n.stateId=id;
  }
  if(b.op==='virtual'){
   if(!keyPattern.test(b.virtualKey||''))throw Error('Virtueller Sollwert hat keinen gültigen Namen');
   n.virtualKey=b.virtualKey;
   n.valueType=b.valueType==='boolean'?'boolean':'number';
  }
  if(b.op==='virtual'||b.op==='constant'){
   const value=b.op==='virtual'&&b.value===undefined?(n.valueType==='boolean'?false:0):b.value;
   if(typeof value!=='boolean'&&!(typeof value==='number'&&Number.isFinite(value)))throw Error('Ungültiger Bausteinwert bei '+b.id);
   n.value=value;
  }
  if(b.op==='output'){
   n.createNew=b.createNew===true;
   n.outputKey=b.outputKey||'';
   n.outputType=b.outputType==='boolean'?'boolean':'number';
   if(n.createNew&&!keyPattern.test(n.outputKey))throw Error('Ungültiger Name eines neuen Ausgangs');
   n.writeEnabled=b.writeEnabled===true;
   n.cyclicWrite=b.cyclicWrite===true;
   n.cycleSeconds=b.cycleSeconds??60;
   if(!Number.isInteger(n.cycleSeconds)||n.cycleSeconds<10||n.cycleSeconds>3600)throw Error('Schreibintervall muss zwischen 10 und 3600 Sekunden liegen');
  }
  return n;
 }
 function sanitizeLogic(logic){
  if(!isObject(logic)||typeof logic.id!=='string'||!/^[\w-]{1,50}$/.test(logic.id))throw Error('Logik-ID ungültig');
  if(typeof logic.name!=='string'||logic.name.length>100)throw Error('Logikname ungültig');
  if(!Array.isArray(logic.blocks)||logic.blocks.length>MAX_BLOCKS)throw Error('Zu viele Bausteine');
  const blocks=logic.blocks.map(sanitizeBlock),ids=new Set(blocks.map(b=>b.id));
  if(ids.size!==blocks.length)throw Error('Doppelte Baustein-IDs');
  for(const b of blocks)for(const id of b.inputs)if(id&&!ids.has(id))throw Error('Verbindung verweist auf einen fehlenden Baustein');
  return {id:logic.id,name:logic.name,enabled:logic.enabled===true,blocks};
 }
 function createExport(config,type,logicId){
  if(!['backup','template'].includes(type))throw Error('Exportart ungültig');
  const source=config?.logics;
  if(!Array.isArray(source)||source.length>MAX_LOGICS)throw Error('Logik-Konfiguration ungültig');
  let logics=source.map(sanitizeLogic);
  if(type==='template'){
   logics=logics.filter(l=>l.id===logicId);
   if(logics.length!==1)throw Error('Bitte eine Logik für die Vorlage auswählen');
   logics=logics.map(l=>{
    const mapping=new Map(l.blocks.map((b,i)=>[b.id,'b'+(i+1)]));
    return {id:'template',name:l.name,enabled:false,blocks:l.blocks.map(b=>{
     const next={...b,id:mapping.get(b.id),inputs:b.inputs.map(i=>i?mapping.get(i):'')};
     if(next.op==='input'||next.op==='output')next.stateId='';
     if(next.op==='output'){next.writeEnabled=false;next.cyclicWrite=false;}
     return next;
    })};
   });
  }
  return {format:FORMAT,schemaVersion:VERSION,type,exportedAt:new Date().toISOString(),externalWritesEnabled:type==='backup'&&config.externalWritesEnabled===true,logics};
 }
 function importLogics(data,existing,idFactory){
  if(!isObject(data))throw Error('Keine gültige JSON-Vorlage');
  if(data.format!==undefined&&(data.format!==FORMAT||data.schemaVersion!==VERSION||!['backup','template'].includes(data.type)))throw Error('Unbekanntes Vorlagenformat oder Version');
  if(!Array.isArray(data.logics)||!data.logics.length||data.logics.length>MAX_LOGICS)throw Error('Die Datei enthält keine gültigen Logiken');
  if(!Array.isArray(existing)||existing.length+data.logics.length>MAX_LOGICS)throw Error('Maximal 50 Logiken sind erlaubt');
  if(typeof idFactory!=='function')throw Error('ID-Erzeugung fehlt');
  const used=new Set(existing.map(l=>l.id)),names=new Set(existing.map(l=>l.name)),imports=[];
  for(const incoming of data.logics){
   const original=sanitizeLogic(incoming),blockMap=new Map();
   let id=idFactory('logic');
   for(let attempt=0;used.has(id)&&attempt<10;attempt++)id=idFactory('logic');
   if(used.has(id)||typeof id!=='string'||!/^[\w-]{1,50}$/.test(id))throw Error('Neue Logik-ID nicht eindeutig');
   used.add(id);
   let name=original.name||'Importierte Logik',counter=1;
   while(names.has(name)){counter++;name=(original.name||'Importierte Logik').slice(0,88)+' (Import '+counter+')';}
   names.add(name);
   for(const b of original.blocks)blockMap.set(b.id,idFactory('block'));
   if(new Set(blockMap.values()).size!==blockMap.size)throw Error('Neue Baustein-IDs nicht eindeutig');
   const blocks=original.blocks.map(b=>{
    const copy={...b,id:blockMap.get(b.id),inputs:b.inputs.map(x=>x?blockMap.get(x):'')};
    if(copy.op==='output'){copy.writeEnabled=false;copy.cyclicWrite=false;}
    return copy;
   });
   imports.push({id,name,enabled:false,blocks});
  }
  return imports;
 }
 return {createExport,importLogics,FORMAT,VERSION};
});
