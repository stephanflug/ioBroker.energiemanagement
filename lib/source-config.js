'use strict';
const {normalizeConsumers,defaultConsumers,validId}=require('./normalize');

const fields={measuredW:{type:'number',label:'Istleistung'},statusId:{type:'boolean',label:'Status'}};
const busy=adapter=>{if(adapter.dataBusy)throw Error('Datensicherung oder Wiederherstellung läuft. Bitte anschließend erneut speichern.');if(adapter.stopping)throw Error('Adapter wird beendet.');};
function sourceId(value,label){
 if(typeof value!=='string')throw Error(label+': Datenpunkt-ID muss Text sein.');
 const id=value.trim();
 if(id&&(!validId(id)||id.startsWith('system.')||id.startsWith('energiemanagement.')))throw Error(label+': Bitte einen gültigen externen Datenpunkt verwenden.');
 return id;
}
class ConsumerSourceConfig{
 constructor(adapter){this.adapter=adapter;this.queue=Promise.resolve();}
 configure(request={}){
  const next=this.queue.catch(()=>{}).then(()=>this.apply(request));this.queue=next;return next;
 }
 async apply(request){
  const adapter=this.adapter;busy(adapter);
  if(!request||typeof request!=='object'||Array.isArray(request)||!Array.isArray(request.devices))throw Error('Verbrauchsquellen müssen eine Geräteliste enthalten.');
  const max=adapter.config?.maxConsumers||250;
  if(request.devices.length>max)throw Error('Zu viele Verbrauchsquellen.');
  const readCurrent=async()=>{
   let raw=await adapter.read('config.consumers');
   try{raw=typeof raw==='string'?JSON.parse(raw):raw;}catch{throw Error('Gespeicherte Verbraucherliste ist ungültig.');}
   return normalizeConsumers(raw??adapter.consumers??defaultConsumers(),max);
  };
  const current=await readCurrent();
  const known=new Map(current.devices.map(device=>[device.id,device]));
  const patches=new Map();
  for(const row of request.devices){
   if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!known.has(row.id))throw Error('Unbekannter Verbraucher. Bitte die Datenquellen neu laden.');
   if(patches.has(row.id))throw Error('Verbraucher mehrfach in den Datenquellen vorhanden: '+row.id);
   const patch={};
   for(const [key,meta]of Object.entries(fields))if(Object.hasOwn(row,key)){
    const id=sourceId(row[key],meta.label);patch[key]=id;
    if(id){
     const object=await adapter.getForeignObjectAsync(id);
     if(object?.type!=='state'||object.common?.type!==meta.type||object.common.read===false)throw Error(meta.label+': Bitte einen lesbaren '+(meta.type==='number'?'Zahlen':'Boolean')+'-Datenpunkt auswählen: '+id);
    }
   }
   patches.set(row.id,patch);
  }
  // Validation may wait for a remote controller. Preserve edits made elsewhere
  // during that wait and change only the two source fields requested here.
  const latest=await readCurrent();
  if([...patches.keys()].some(id=>!latest.devices.some(device=>device.id===id)))throw Error('Verbraucherliste wurde geändert. Bitte die Datenquellen neu laden.');
  const candidate=normalizeConsumers({...latest,devices:latest.devices.map(device=>({...device,...patches.get(device.id)}))},max);
  adapter.heating?.validateConflicts(adapter.heating.config,candidate,adapter.sources);
  busy(adapter);
  await adapter.set('config.consumers',candidate,true);
  adapter.consumers=candidate;
  await adapter.createConsumers();
  return candidate;
 }
}
module.exports={ConsumerSourceConfig};
