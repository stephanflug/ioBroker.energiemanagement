'use strict';
const {Utilities,defaultUtilities,normalizeUtilities}=require('./utilities');
const {FuelInventory}=require('./fuel-inventory');
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const defaultFeatures=()=>({water:false,rainwater:false,fuel:false,heating:false});
function normalizeFeatures(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Optionale Bereiche müssen ein Konfigurationsobjekt sein.');
 const out=defaultFeatures();for(const key of Object.keys(out)){if(raw[key]!==undefined&&typeof raw[key]!=='boolean')throw Error('Die Bereichsauswahl muss Boolean-Werte enthalten.');out[key]=raw[key]===true;}return out;
}
function normalizeStoredUtilities(raw={}){
 const config=normalizeUtilities(raw),out={};
 for(const key of ['water','rainwater','fuel']){const {enabled,...section}=config[key];out[key]=section;if(key==='fuel')delete out[key].rateTime;}
 return out;
}
const defaultStoredUtilities=()=>normalizeStoredUtilities(defaultUtilities());
class UtilitiesService{
 constructor(adapter,config={},features=defaultFeatures(),runtime={},inventoryRuntime={}){
  this.adapter=adapter;this.config=normalizeStoredUtilities(config);this.features=normalizeFeatures(features);this.core=new Utilities(runtime);this.inventory=new FuelInventory(inventoryRuntime);this.lastSummary=null;this.queue=Promise.resolve();this.closed=false;this.catalog=null;this.hidingHeating=false;this.lastSave=0;
  // Source integration anchors intentionally do not survive a restart. Keep
  // the last stock estimate, but disclose possible unrecorded downtime without
  // deducting a made-up consumption delta or advancing its saved observation.
  for(const type of ['pellets','oil']){const tank=this.inventory.tanks[type];if(tank.remaining!==null)this.inventory.observe(tank.lastObservedAt??Date.now(),type,tank.lastObservedTotal??this.core.totals[type],{partial:true});}
 }
 serial(fn){const next=this.queue.catch(()=>{}).then(fn);this.queue=next;return next;}
 activeConfig(){return Object.fromEntries(['water','rainwater','fuel'].map(kind=>[kind,{...this.config[kind],enabled:this.features[kind]}]));}
 heatingAllowed(){return this.features.heating&&!this.hidingHeating;}
 async validateMappings(config=this.config,features=this.features){
  const inputs=[];for(const kind of ['water','rainwater'])if(features[kind])for(const id of [config[kind].flowId,config[kind].counterId])if(id)inputs.push([kind==='water'?'Wasser':'Regenwasser',id]);if(features.fuel&&config.fuel.stateId)inputs.push(['Brennstoff',config.fuel.stateId]);
  for(const [kind,id]of inputs){const object=await this.adapter.getForeignObjectAsync(id);if(object?.type!=='state'||object.common?.type!=='number'||object.common.read===false)throw Error(kind+': Bitte einen lesbaren Zahlen-Datenpunkt zuordnen.');}
 }
 async disableHiddenHeating(){
  const heating=this.adapter.heating;
  if(!heating||!heating.config.enabled&&!heating.config.hardwareEnabled)return;
  await heating.configure({...heating.config,enabled:false,hardwareEnabled:false});
 }
 configureFeatures(raw){return this.serial(async()=>{
  if(this.closed)throw Error('Verbrauchsauswertung wird beendet.');
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Bereichsauswahl fehlt.');
  const next=normalizeFeatures(raw);await this.validateMappings(this.config,next);
  if(!next.heating){this.hidingHeating=true;try{await this.disableHiddenHeating();}finally{this.hidingHeating=false;}}
  if(this.features.fuel&&!next.fuel&&['pellets','oil'].includes(this.config.fuel.type))this.inventory.observe(Date.now(),this.config.fuel.type,this.core.totals[this.config.fuel.type],{partial:true});
  this.features=next;await this.adapter.set('config.features_JSON',next,true);await this.adapter.set('utilities.error','',true);return next;
 });}
 configure(request={}){return this.serial(async()=>{
  if(this.closed)throw Error('Verbrauchsauswertung wird beendet.');
  if(!request?.config||typeof request.config!=='object'||Array.isArray(request.config))throw Error('Verbrauchszuordnung fehlt.');
  const section=request.section;if(section!==undefined&&!['water','rainwater','fuel'].includes(section))throw Error('Unbekannter Verbrauchsbereich.');
  let source=request.config;
  if(['water','rainwater'].includes(section)&&!['flowId','counterId','flowUnit','counterUnit','flowFactor','counterFactor'].some(key=>Object.hasOwn(source,key))){const mode=source.mode||this.config[section].mode;source={...this.config[section],...source,[mode+'Id']:source.stateId??'', [mode+'Unit']:source.unit??(mode==='flow'?'l/min':'m³'),[mode+'Factor']:source.factor??1};}
  const next=normalizeStoredUtilities(section?{...this.config,[section]:source}:source);
  if(next.fuel.type!==this.config.fuel.type&&next.fuel.stateId&&next.fuel.stateId===this.config.fuel.stateId)throw Error('Beim Brennstoffwechsel bitte die bisherige Zuordnung zuerst entfernen und speichern oder einen neuen Datenpunkt auswählen.');
  await this.validateMappings(next);
  if(JSON.stringify(next.fuel)!==JSON.stringify(this.config.fuel))for(const type of ['pellets','oil'])this.inventory.observe(Date.now(),type,this.core.totals[type],{partial:true});
  this.config=next;await this.adapter.set('config.utilities_JSON',next,true);await this.adapter.set('utilities.error','',true);return next;
 });}
 async readings(){
  const read=async id=>{if(!id)return null;try{const state=await this.adapter.getForeignStateAsync(id);return state&&state.ack===true&&(state.q===undefined||state.q===0)?{value:state.val,ts:state.ts,ack:state.ack,q:state.q}:null;}catch{return null;}};
  const [waterFlow,waterCounter,rainwaterFlow,rainwaterCounter,fuel]=await Promise.all([read(this.features.water?this.config.water.flowId:''),read(this.features.water?this.config.water.counterId:''),read(this.features.rainwater?this.config.rainwater.flowId:''),read(this.features.rainwater?this.config.rainwater.counterId:''),read(this.features.fuel?this.config.fuel.stateId:'')]);
  return {water:this.config.water.mode==='flow'?waterFlow:waterCounter,waterFlow,waterCounter,rainwater:this.config.rainwater.mode==='flow'?rainwaterFlow:rainwaterCounter,rainwaterFlow,rainwaterCounter,fuel};
 }
 observeInventory(now,summary){for(const type of ['pellets','oil']){const selected=this.features.fuel&&this.config.fuel.type===type;this.inventory.observe(now,type,this.core.totals[type],{partial:!selected||summary?.fuel?.status!=='ok'});}}
 inventoryDocument(now=Date.now()){
  const runtime=this.inventory.runtime(),result={version:1,updatedAt:now};for(const type of ['pellets','oil'])result[type]={...this.inventory.summary(type),events:runtime.tanks[type].events};return result;
 }
 async sampleAndPublish(now){
  if(this.core.lastSampleAt===null||now>this.core.lastSampleAt){const readings=await this.readings();if(this.closed)return;this.lastSummary=this.core.sample(now,this.activeConfig(),readings);}
  else if(now===this.core.lastSampleAt){
   // A configuration command and a refill can arrive in the same millisecond
   // as the last tick. Prime only a changed source at that timestamp; sampling
   // the whole core again would clear the unaffected source's valid baseline.
   const config=normalizeUtilities(this.activeConfig()),changed=[];
   for(const kind of ['water','rainwater','fuel']){
    const source=config[kind],signature=JSON.stringify(kind!=='fuel'?{enabled:source.enabled,mode:source.mode,stateId:source.stateId,unit:source.unit,factor:source.factor}:source);
    if(signature!==this.core.signatures[kind])changed.push(kind);
   }
   if(changed.length){
    const readings=await this.readings();if(this.closed)return;
    this.lastSummary ||= {version:1,updatedAt:now,timezone:'Europe/Vienna',recordingStartedAt:this.core.startedAt};
    for(const kind of changed){const bucket=kind==='fuel'?config.fuel.type:kind;this.lastSummary[kind]={...this.core.module(now,kind,config[kind],readings[kind],true),periods:this.core.periods(now,bucket)};}
   }
  }
  this.observeInventory(now,this.lastSummary);if(this.lastSummary)await this.adapter.set('analytics.utilities_JSON',this.lastSummary,true);await this.adapter.set('analytics.fuelInventory_JSON',this.inventoryDocument(now),true);
 }
 tick(now){return this.serial(async()=>{
  if(this.closed)return;
  try{await this.sampleAndPublish(now);await this.adapter.set('utilities.error','');if(now-this.lastSave>=60000||now<this.lastSave)await this.persist(now);}
  catch(error){await this.adapter.set('utilities.error',String(error.message||error));}
 });}
 inventoryConfigure(request={}){return this.serial(async()=>{
  if(this.closed)throw Error('Verbrauchsauswertung wird beendet.');
  const now=Date.now();await this.sampleAndPublish(now);this.inventory.configure(request.type,{capacity:request.capacity},now);await this.persist(now);const doc=this.inventoryDocument(now);await this.adapter.set('analytics.fuelInventory_JSON',doc,true);return doc;
 });}
 refill(request={}){return this.serial(async()=>{
  if(this.closed)throw Error('Verbrauchsauswertung wird beendet.');
  const now=Date.now();await this.sampleAndPublish(now);this.inventory.recordFill(now,request.type,request.operation);await this.persist(now);const doc=this.inventoryDocument(now);await this.adapter.set('analytics.fuelInventory_JSON',doc,true);return doc;
 });}
 async persist(now=Date.now()){await this.adapter.set('internal.fuelInventory',this.inventory.runtime(),true);const archive=this.core.runtime();await this.adapter.set('internal.utilities',archive,true);await this.adapter.set('analytics.utilitiesArchive_JSON',archive,true);this.lastSave=now;}
 close(){this.closed=true;return this.serial(()=>this.persist());}
 async objects(request={}){
  const type=request.type==='boolean'?'boolean':'number';
  const query=typeof request.query==='string'?request.query.trim().toLocaleLowerCase('de').slice(0,100):'';
  if(query.length<2)return [];
  if(!this.catalog||Date.now()-this.catalog.ts>60000)this.catalog={ts:Date.now(),objects:await this.adapter.getForeignObjectsAsync('*','state')};
  const label=object=>typeof object.common?.name==='object'?object.common.name.de||object.common.name.en||object._id:String(object.common?.name||object._id);
  const objects=Object.values(this.catalog.objects||{}).filter(object=>object?.type==='state'&&object.common?.type===type&&object.common.read!==false&&!object._id.startsWith('system.')&&!object._id.startsWith('energiemanagement.')&&(object._id+' '+label(object)).toLocaleLowerCase('de').includes(query)).sort((a,b)=>label(a).localeCompare(label(b),'de')).slice(0,30);
  return Promise.all(objects.map(async object=>{let state;try{state=await this.adapter.getForeignStateAsync(object._id);}catch{}return {id:object._id,name:label(object),type:object.common.type,unit:String(object.common.unit||''),value:finite(state?.val)||typeof state?.val==='boolean'?state.val:null,ts:state?.ts??null};}));
 }
}
module.exports={UtilitiesService,defaultFeatures,normalizeFeatures,defaultStoredUtilities,normalizeStoredUtilities};
