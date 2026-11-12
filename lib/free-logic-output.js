'use strict';

/* Explicitly authorized foreign FUP outputs. Never writes without BOTH gates. */
const isValue=value=>typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value));
const isSafeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_.:-]{3,200}$/.test(id)&&!id.startsWith('system.')&&!id.startsWith('admin.')&&!id.startsWith('energiemanagement.');

async function applyForeignOutputs(config,evaluated,io){
 const globalEnabled=config?.externalWritesEnabled===true;
 const definitions=new Map((config?.logics||[]).map(logic=>[logic.id,new Map((logic.blocks||[]).map(block=>[block.id,block]))]));
 const targeted=new Set();
 const lastWrites=io.lastWrites instanceof Map?io.lastWrites:new Map();
 const now=typeof io.now==='function'?io.now():Date.now();
 for(const logic of evaluated.logics||[]){
  for(const output of logic.outputs||[]){
   if(output.createNew||!output.stateId)continue;
   const definition=definitions.get(logic.id)?.get(output.id);
   output.writeEnabled=definition?.writeEnabled===true;
   output.cyclicWrite=definition?.cyclicWrite===true;
   output.cycleSeconds=Number.isInteger(definition?.cycleSeconds)?definition.cycleSeconds:60;
   output.writeStatus='Nur Live-Anzeige';
   if(!logic.enabled){output.writeStatus='Logik deaktiviert';continue;}
   if(!output.writeEnabled){output.writeStatus='Schreiben am Ausgang nicht freigegeben';continue;}
   if(!globalEnabled){output.writeStatus='Globale FUP-Schreibfreigabe aus';continue;}
   if(logic.errors?.length){output.writeStatus='Berechnungsfehler – nicht geschrieben';continue;}
   if(!isSafeId(output.stateId)){output.writeStatus='Unzulässige Datenpunkt-ID';continue;}
   if(!isValue(output.value)){output.writeStatus='Ungültiger Ausgangswert';continue;}
   if(targeted.has(output.stateId)){output.writeStatus='Mehrere aktive Ausgänge auf demselben Datenpunkt';continue;}
   targeted.add(output.stateId);
   try{
    const obj=await io.getObject(output.stateId);
    if(obj?.type!=='state'||obj.common?.write!==true){output.writeStatus='Datenpunkt fehlt oder ist nicht beschreibbar';continue;}
    if(obj.common.type!==typeof output.value){output.writeStatus='Datentyp stimmt nicht überein';continue;}
    const current=await io.getState(output.stateId);
    const cycleMs=output.cycleSeconds*1000;
    const key=logic.id+'|'+output.id+'|'+output.stateId;
    const last=lastWrites.get(key);
    if(current?.val===output.value){
     if(!output.cyclicWrite){output.writeStatus='Zielwert bereits vorhanden – zyklisch AUS';continue;}
     if(Number.isFinite(last)&&now-last<cycleMs){
      output.writeStatus='Zyklisch alle '+output.cycleSeconds+' s – nächste Ausgabe in '+Math.ceil((cycleMs-(now-last))/1000)+' s';
      continue;
     }
    }
    await io.setState(output.stateId,output.value);
    lastWrites.set(key,now);
    output.writeStatus=output.cyclicWrite?'Schreibbefehl gesendet (zyklisch '+output.cycleSeconds+' s)':'Schreibbefehl gesendet';
   }catch(error){output.writeStatus='Schreibfehler: '+String(error?.message||error).slice(0,140);}
  }
 }
 return evaluated;
}
module.exports={applyForeignOutputs,isSafeId};
