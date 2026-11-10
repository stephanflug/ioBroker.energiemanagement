'use strict';
const crypto=require('node:crypto');
const {normalizeSources,normalizeConsumers,normalizeSettings}=require('./normalize');
const {normalizeHeating}=require('./heating');
const {normalizeForecast}=require('./forecast');
const {normalizeEnergySummaryConfig}=require('./energy-summary-config');
const FORMAT='iobroker.energiemanagement.backup',SCHEMA_VERSION=1,MAX_BACKUP_BYTES=32*1024*1024;
// Restore never accepts foreign state IDs, state objects, scripts or commands.
const BACKUP_STATE_IDS=Object.freeze([
 'config.sources','config.consumers','config.settings','config.hardwareMaster','config.forecast','config.heating','config.energySummary_JSON','config.features_JSON','config.utilities_JSON',
 'history.intervals','history.days','history.months','history.power','analytics.consumerDays_JSON','analytics.status_JSON','analytics.energySummary_JSON','analytics.utilities_JSON','analytics.utilitiesArchive_JSON','analytics.fuelInventory_JSON',
 'internal.runtime','internal.hardware','internal.heatingLearning','internal.heatingOutputs','internal.energySummary','internal.utilities','internal.fuelInventory',
 'heating.history','heating.status','heating.message','heating.hardware','heating.error','forecast.data','forecast.status','forecast.error','utilities.error',
 'migration.done','migration.report','migration.cleanupStatus','migration.backup'
 ,'config.storage_JSON','internal.storage','storage.status_JSON','internal.dayComparison','analytics.dayComparison_JSON'
]);
const IDS=new Set(BACKUP_STATE_IDS),BOOL_IDS=new Set(['config.hardwareMaster','migration.done']);
const TEXT_IDS=new Set(['heating.message','heating.error','forecast.status','forecast.error','utilities.error','migration.cleanupStatus']);
const ARRAY_IDS=new Set(['history.intervals','history.power','heating.history']);
const REQUIRED_IDS=Object.freeze(['config.sources','config.consumers','config.settings','config.hardwareMaster','config.forecast','config.heating','config.energySummary_JSON','config.features_JSON','config.utilities_JSON','internal.runtime','history.intervals','history.days','history.months','history.power','analytics.consumerDays_JSON','internal.heatingLearning','heating.history','internal.energySummary','internal.utilities','internal.fuelInventory','migration.done','migration.report','migration.backup']);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const clone=value=>JSON.parse(JSON.stringify(value));
const namespaceValid=value=>typeof value==='string'&&/^energiemanagement\.\d{1,6}$/.test(value);
function validateTree(value,label='Sicherung'){
 let nodes=0;const seen=new Set();
 function walk(item,depth){
  if(++nodes>2000000||depth>64)throw Error(label+': Datenstruktur ist zu groß oder zu tief.');
  if(item===null||typeof item==='boolean')return;
  if(typeof item==='number'){if(!Number.isFinite(item))throw Error(label+': Ungültige Zahl.');return;}
  if(typeof item==='string'){if(Buffer.byteLength(item)>MAX_BACKUP_BYTES)throw Error(label+': Text ist zu groß.');return;}
  if(typeof item!=='object'||(!Array.isArray(item)&&!plain(item)))throw Error(label+': Nur JSON-Daten sind zulässig.');
  if(seen.has(item))throw Error(label+': Kreisförmige Daten sind unzulässig.');seen.add(item);
  if(Array.isArray(item)&&item.length>500000)throw Error(label+': Zu viele Datensätze.');
  for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(item))){
   if(Array.isArray(item)&&key==='length')continue;
   if(['__proto__','prototype','constructor'].includes(key))throw Error(label+': Unzulässiger Datenschlüssel.');
   if(!Object.hasOwn(descriptor,'value'))throw Error(label+': Getter und Setter sind unzulässig.');
   walk(descriptor.value,depth+1);
  }
  seen.delete(item);
 }
 walk(value,0);
}
function canonicalStringify(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalStringify).join(',')+']';
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalStringify(value[key])).join(',')+'}';
}
function checksum(payload){return crypto.createHash('sha256').update(canonicalStringify(payload)).digest('hex');}
function parseDocument(input){
 if(typeof input==='string'){
  if(Buffer.byteLength(input)>MAX_BACKUP_BYTES)throw Error('Sicherungsdatei ist größer als 32 MiB.');
  try{input=JSON.parse(input);}catch{throw Error('Sicherungsdatei enthält kein gültiges JSON.');}
 }
 validateTree(input);
 if(Buffer.byteLength(JSON.stringify(input))>MAX_BACKUP_BYTES)throw Error('Sicherungsdatei ist größer als 32 MiB.');
 return input;
}
function validTime(value){return finite(value)&&value>=0&&finite(new Date(value).getTime());}
function validDay(key){if(typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key))return false;const date=new Date(key+'T12:00:00Z');return validTime(date.getTime())&&date.toISOString().slice(0,10)===key;}
const validMonth=key=>typeof key==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(key);
function requireObject(value,label){if(!plain(value))throw Error(label+': Objekt erwartet.');}
function positive(value,label,zero=true){if(!finite(value)||(zero?value<0:value<=0))throw Error(label+': Nichtnegative endliche Zahl erwartet.');}
function checkTime(value,label,nullable=true){if(value===undefined||nullable&&value===null)return;if(!validTime(value))throw Error(label+': Ungültiger Zeitpunkt.');}
const ENERGY_METRICS=['importKWh','exportKWh','pvKWh','houseKWh'];
function energyRecords(records,label,monthly=false){
 requireObject(records,label);for(const [key,row]of Object.entries(records)){
  if(!(monthly?validMonth(key):validDay(key)))throw Error(label+': Ungültiger Kalenderschlüssel.');requireObject(row,label);
  for(const metric of ENERGY_METRICS)positive(row[metric],label+'.'+metric);
  for(const key of ['peakW','peakStart','valid','invalid'])if(row[key]!==undefined)positive(row[key],label+'.'+key);
  if(row.coveredSec!==undefined){requireObject(row.coveredSec,label);for(const value of Object.values(row.coveredSec))positive(value,label+'.coveredSec');}
 }
}
function energyIntervals(rows,label){
 if(!Array.isArray(rows)||rows.length>8640)throw Error(label+': Intervallliste ungültig.');
 for(const row of rows){requireObject(row,label);checkTime(row.start,label,false);if(!validTime(row.start))throw Error(label+': Intervallzeit fehlt.');for(const metric of ENERGY_METRICS)if(row[metric]!==undefined)positive(row[metric],label+'.'+metric);for(const key of ['averageW','coveragePct'])if(row[key]!==undefined)positive(row[key],label+'.'+key);}
}
function utilityArchive(data,label,battery=false){
 requireObject(data,label);if(data.days===undefined){if(Object.keys(data).length===0)return;throw Error(label+': Tagesarchiv fehlt.');}requireObject(data.days,label+'.days');
 if(data.version!==1)throw Error(label+': Archivversion nicht unterstützt.');
 const groups=battery?{battery:data.days}:data.days;
 if(!battery)for(const key of Object.keys(groups))if(!['water','rainwater','pellets','oil','gas'].includes(key))throw Error(label+': Unbekannter Verbrauchsbereich.');
 for(const records of Object.values(groups)){requireObject(records,label);if(Object.keys(records).length>450)throw Error(label+': Mehr als 450 gespeicherte Tage.');for(const [key,row]of Object.entries(records)){
  if(!validDay(key))throw Error(label+': Ungültiger Kalenderschlüssel.');requireObject(row,label);positive(row.coveredSec,label+'.coveredSec',false);if(battery){positive(row.batteryChargeKWh,label);positive(row.batteryDischargeKWh,label);}else positive(row.value,label);checkTime(row.startedAt,label);checkTime(row.updatedAt,label);if(row.estimatedBoundary!==undefined&&typeof row.estimatedBoundary!=='boolean')throw Error(label+': Qualitätsangabe ungültig.');
 }}
 if(data.totals!==undefined){requireObject(data.totals,label+'.totals');for(const [key,value]of Object.entries(data.totals)){if(!['water','rainwater','pellets','oil','gas'].includes(key))throw Error(label+': Unbekannte Verbrauchssumme.');positive(value,label+'.totals');}}
}
function inventoryData(data,label){
 if(Object.keys(data).length===0)return;
 if(data.version!==1||!plain(data.tanks)||Object.keys(data).some(key=>!['version','tanks'].includes(key)))throw Error(label+': Tankarchiv ungültig.');
 const quantities=(value,nullable=false,strictPositive=false)=>nullable&&value===null||finite(value)&&value>=0&&value<=1000000000&&(!strictPositive||value>0);
 const fields=['capacity','remaining','lastObservedTotal','lastObservedAt','consumedSinceFill','partial','shortfall','updatedAt','lastFillAt','events'];
 for(const type of Object.keys(data.tanks))if(!['pellets','oil'].includes(type))throw Error(label+': Unbekannter Tanktyp.');
 for(const type of ['pellets','oil']){
  const tank=data.tanks[type];requireObject(tank,label+'.'+type);for(const key of Object.keys(tank))if(!fields.includes(key))throw Error(label+': Unbekanntes Tankfeld.');
  if(!quantities(tank.capacity,true,true)||!quantities(tank.remaining,true)||tank.capacity!==null&&tank.remaining!==null&&tank.remaining>tank.capacity)throw Error(label+': Bestand oder Kapazität ungültig.');
  if(tank.lastObservedTotal!==null)positive(tank.lastObservedTotal,label+'.lastObservedTotal');checkTime(tank.lastObservedAt,label);if(tank.lastObservedTotal!==null&&!validTime(tank.lastObservedAt))throw Error(label+': Verbrauchsreferenz ohne Zeitpunkt.');
  positive(tank.consumedSinceFill,label);positive(tank.shortfall,label);if(typeof tank.partial!=='boolean')throw Error(label+': Bestandsqualität fehlt.');checkTime(tank.updatedAt,label);checkTime(tank.lastFillAt,label);
  if(!Array.isArray(tank.events)||tank.events.length>1000)throw Error(label+': Füllhistorie ungültig.');const ids=new Set();
  for(const event of tank.events){requireObject(event,label);if(!validTime(event.ts)||event.type!==type||event.unit!==(type==='pellets'?'kg':'l')||!['set','add','full'].includes(event.mode)||!quantities(event.amount)||event.mode==='add'&&event.amount<=0||!quantities(event.deliveredAmount,true)||!quantities(event.remainingBefore,true)||!quantities(event.remainingAfter)||!quantities(event.capacityAfter,true,true)||event.capacityAfter!==null&&event.remainingAfter>event.capacityAfter||typeof event.requestId!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(event.requestId)||typeof event.fingerprint!=='string'||event.fingerprint.length>1000||ids.has(event.requestId))throw Error(label+': Füllereignis ungültig.');ids.add(event.requestId);}
 }
}
function validateInventoryReferences(parsedStates){
 const inventory=parsedStates.get('internal.fuelInventory'),utilities=parsedStates.get('internal.utilities');
 for(const type of ['pellets','oil']){
  const tank=inventory?.tanks?.[type];if(!tank||tank.lastObservedTotal===null)continue;
  let total;
  if(Object.hasOwn(utilities,'totals')){
   if(!Object.hasOwn(utilities.totals,type))throw Error('internal.fuelInventory: Verbrauchssumme für '+type+' fehlt im Verbrauchsarchiv.');
   total=utilities.totals[type];
  }else {
   // Legacy archives have no lifetime totals. Their retained sum is usable
   // only when it matches the inventory reference; otherwise pruning or a
   // partial snapshot could consume stock without any new measurement.
   total=Object.values(utilities.days?.[type]||{}).reduce((sum,row)=>sum+row.value,0);
  }
  const reference=tank.lastObservedTotal,tolerance=Math.max(1e-8,Math.max(Math.abs(reference),Math.abs(total))*Number.EPSILON*32);
  if(!finite(total)||Math.abs(reference-total)>tolerance)throw Error('internal.fuelInventory: Verbrauchsreferenz für '+type+' stimmt nicht mit der Verbrauchssumme überein.');
 }
}
function validateStoredData(id,data){
 if(id==='history.days')energyRecords(data,id);if(id==='history.months')energyRecords(data,id,true);if(id==='history.intervals')energyIntervals(data,id);
 if(id==='internal.runtime'){
  for(const key of ['days','months','open','anchors'])if(data[key]!==undefined)requireObject(data[key],id+'.'+key);
  if(data.days!==undefined)energyRecords(data.days,id);if(data.months!==undefined)energyRecords(data.months,id,true);if(data.intervals!==undefined)energyIntervals(data.intervals,id);
  for(const [key,slot]of Object.entries(data.open||{})){
   requireObject(slot,id);if(!Number.isSafeInteger(slot.start)||slot.start<0||slot.start%900000!==0||key!==String(slot.start))throw Error(id+': Schlüssel des offenen Messintervalls ungültig.');
   for(const field of ['importWs','exportWs','pvWs','houseWs','importSec','exportSec','pvSec','houseSec']){positive(slot[field],id+'.'+field);if(field.endsWith('Sec')&&slot[field]>900)throw Error(id+': Messabdeckung über einer Viertelstunde.');}
  }
 }
 if(id==='internal.energySummary')utilityArchive(data,id,true);
 if(id==='internal.utilities'||id==='analytics.utilitiesArchive_JSON')utilityArchive(data,id);
 if(id==='internal.fuelInventory')inventoryData(data,id);
 if(id==='internal.dayComparison')require('./day-comparison').validateDayComparisonRuntime(data);
 if(id==='internal.storage')require('./storage-service').validateStorageRuntime(data);
 if(id==='analytics.consumerDays_JSON'){
  if(Object.keys(data).length===0)return;if(data.version!==1||!plain(data.days))throw Error(id+': Gerätearchiv ungültig.');
  for(const [day,rows]of Object.entries(data.days)){if(!validDay(day))throw Error(id+': Kalenderschlüssel ungültig.');requireObject(rows,id);for(const [key,row]of Object.entries(rows)){if(!/^[a-z][a-z0-9_]{1,47}$/.test(key))throw Error(id+': Verbraucher-ID ungültig.');requireObject(row,id);positive(row.kWh,id);positive(row.coveredSec,id,false);if(row.samples!==undefined)positive(row.samples,id);checkTime(row.updatedAt,id);}}
 }
 if(id==='history.power'||id==='heating.history'){
  if(data.length>2880)throw Error(id+': Zu viele Trendpunkte.');for(const row of data){requireObject(row,id);if(!validTime(row.ts))throw Error(id+': Trendzeit fehlt.');if(id==='history.power'){requireObject(row.values,id);for(const value of Object.values(row.values))if(value!==null&&!finite(value))throw Error(id+': Trendwert ungültig.');}else{for(const key of ['meanC','outdoorC','targetC','floorC','pvBoostC'])if(row[key]!==undefined&&row[key]!==null&&!finite(row[key]))throw Error(id+': Temperaturwert ungültig.');if(row.roomValues!==undefined){requireObject(row.roomValues,id);for(const value of Object.values(row.roomValues))if(value!==null&&!finite(value))throw Error(id+': Raumwert ungültig.');}}}
 }
}
function parseValue(id,value){
 if(BOOL_IDS.has(id)){if(typeof value!=='boolean')throw Error(id+': Boolean-Wert erwartet.');return value;}
 if(TEXT_IDS.has(id)){if(typeof value!=='string')throw Error(id+': Text erwartet.');return value;}
 if(typeof value!=='string')throw Error(id+': Gespeicherter JSON-Text erwartet.');
 let data;try{data=JSON.parse(value);}catch{throw Error(id+': Ungültiger JSON-Text.');}
 validateTree(data,id);
 if(ARRAY_IDS.has(id)){if(!Array.isArray(data))throw Error(id+': Liste erwartet.');}
 else if(!plain(data))throw Error(id+': Objekt erwartet.');
 if(id==='config.sources')normalizeSources(data);
 else if(id==='config.consumers')normalizeConsumers(data);
 else if(id==='config.settings'){
  for(const key of ['targetW','reserveW','tariffThresholdW','minCoveragePct'])if(data[key]!==undefined&&!finite(data[key]))throw Error(id+': Ungültiger Zahlenwert.');
  normalizeSettings(data);
 }else if(id==='config.forecast')normalizeForecast(data);
 else if(id==='config.storage_JSON')require('./storage-service').normalizeStorageConfig(data);
 else if(id==='config.heating')normalizeHeating(data);
 else if(id==='config.energySummary_JSON')normalizeEnergySummaryConfig(data);
 else if(id==='config.features_JSON')require('./utilities-service').normalizeFeatures(data);
 else if(id==='config.utilities_JSON')require('./utilities-service').normalizeStoredUtilities(data);

 validateStoredData(id,data);
 return data;
}
function relativeId(id,namespace){
 if(typeof id!=='string')throw Error('Ungültige Datenpunkt-ID.');
 const relative=id.startsWith(namespace+'.')?id.slice(namespace.length+1):id;
 if(!IDS.has(relative))throw Error('Nicht unterstützter Sicherungs-Datenpunkt: '+id);
 return relative;
}
function validateBackup(input){
 const doc=parseDocument(input);
 if(!plain(doc)||doc.format!==FORMAT||doc.schemaVersion!==SCHEMA_VERSION)throw Error('Keine unterstützte Energiemanagement-Vollsicherung.');
 for(const key of Object.keys(doc))if(!['format','schemaVersion','adapterVersion','createdAt','namespace','states','checksum'].includes(key))throw Error('Unbekanntes Sicherungsfeld: '+key);
 if(!namespaceValid(doc.namespace))throw Error('Ungültige Quellinstanz.');
 if(typeof doc.adapterVersion!=='string'||!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(doc.adapterVersion))throw Error('Ungültige Adapterversion.');
 if(typeof doc.createdAt!=='string'||!Number.isFinite(Date.parse(doc.createdAt)))throw Error('Ungültiger Sicherungszeitpunkt.');
 if(!plain(doc.states))throw Error('Sicherungs-Datenpunkte fehlen.');
 for(const id of REQUIRED_IDS)if(!Object.hasOwn(doc.states,id))throw Error('Sicherung unvollständig: '+id+' fehlt.');
 const parsedStates=new Map();
 for(const [id,entry]of Object.entries(doc.states)){
  if(!IDS.has(id))throw Error('Nicht unterstützter Sicherungs-Datenpunkt: '+id);
  if(!plain(entry)||!Object.hasOwn(entry,'val'))throw Error(id+': Gespeicherter Wert fehlt.');
  for(const key of Object.keys(entry))if(!['val','ts'].includes(key))throw Error(id+': Unbekanntes Zustandsfeld.');
  if(entry.ts!==undefined&&(!finite(entry.ts)||entry.ts<0))throw Error(id+': Ungültiger Zeitstempel.');
  parsedStates.set(id,parseValue(id,entry.val));
 }
 validateInventoryReferences(parsedStates);
 const payload={...doc};delete payload.checksum;
 if(!plain(doc.checksum)||doc.checksum.algorithm!=='sha256'||typeof doc.checksum.value!=='string'||!/^[a-f0-9]{64}$/.test(doc.checksum.value)||Object.keys(doc.checksum).some(key=>!['algorithm','value'].includes(key)))throw Error('Prüfsumme fehlt oder ist ungültig.');
 const actual=checksum(payload);if(!crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(doc.checksum.value,'hex')))throw Error('Prüfsumme stimmt nicht; Sicherung wurde verändert oder beschädigt.');
 return clone(doc);
}
function buildBackup({states,namespace='energiemanagement.0',version,now=Date.now()}={}){
 if(!namespaceValid(namespace)||!finite(now))throw Error('Ungültige Sicherungsinstanz oder Zeit.');
 if(!(states instanceof Map)&&!plain(states))throw Error('Sicherungs-Datenpunkte fehlen.');
 const records={};
 for(const [id,input]of states instanceof Map?states:Object.entries(states)){
  if(input===null||input===undefined)continue;
  const relative=relativeId(id,namespace);if(Object.hasOwn(records,relative))throw Error('Doppelter Sicherungs-Datenpunkt: '+relative);
  const isRecord=plain(input)&&Object.hasOwn(input,'val');let val=isRecord?input.val:input;
  if(val===undefined||val===null)continue;
  if(!BOOL_IDS.has(relative)&&!TEXT_IDS.has(relative)&&typeof val==='object'){validateTree(val,relative);val=JSON.stringify(val);}
  const record={val};if(isRecord&&finite(input.ts)&&input.ts>=0)record.ts=input.ts;
  parseValue(relative,record.val);records[relative]=record;
 }
 const payload={format:FORMAT,schemaVersion:SCHEMA_VERSION,adapterVersion:version||require('../package.json').version,createdAt:new Date(now).toISOString(),namespace,states:records};
 validateTree(payload);const doc={...payload,checksum:{algorithm:'sha256',value:checksum(payload)}};
 return validateBackup(doc);
}
function safeConsumerConfig(raw){const config=normalizeConsumers(raw);config.master=false;for(const device of config.devices)device.output.armed=false;return config;}
function safeHeatingConfig(raw){const config=normalizeHeating(raw);config.enabled=false;config.hardwareEnabled=false;config.pump.armed=false;for(const circuit of config.circuits)circuit.armed=false;return config;}
function buildRestorePlan(input,{currentNamespace='energiemanagement.0',now=Date.now(),currentConsumerIds=[]}={}){
 if(!namespaceValid(currentNamespace)||!finite(now))throw Error('Ungültige Zielinstanz oder Zeit.');
 const doc=validateBackup(input),values=new Map(Object.entries(doc.states).map(([id,entry])=>[id,entry.val]));
 if(!values.has('internal.dayComparison'))values.set('internal.dayComparison','{}');
 if(!values.has('config.storage_JSON'))values.set('config.storage_JSON',JSON.stringify(require('./storage-service').defaultStorageConfig()));
 values.set('internal.storage','{}');values.set('storage.status_JSON','{}');
 const consumers=safeConsumerConfig(parseValue('config.consumers',values.get('config.consumers'))),heating=safeHeatingConfig(parseValue('config.heating',values.get('config.heating')));
 values.set('config.hardwareMaster',false);values.set('config.consumers',JSON.stringify(consumers));values.set('config.heating',JSON.stringify(heating));
 const runtime=parseValue('internal.runtime',values.get('internal.runtime'));runtime.anchors={};runtime.lastPower=null;values.set('internal.runtime',JSON.stringify(runtime));
 for(const id of ['internal.energySummary','internal.utilities'])if(values.has(id)){const data=parseValue(id,values.get(id));delete data.previous;delete data.anchors;data.lastSampleAt=null;values.set(id,JSON.stringify(data));}
 const safety=new Map([
  ['config.hardwareMaster',false],['config.consumers',JSON.stringify(consumers)],['config.heating',JSON.stringify(heating)],['control.ready',false],['control.virtualMaster',false],['control.hardwareReady',false],['control.availableW',0],['control.allowedW',0],['control.reductionW',0],['control.summary','[]'],
  ['commands.heatingResetLearning',false],['commands.forecastRefresh',false],['commands.importLegacy',false],['commands.cleanupLegacy',false],
  ['internal.hardware','{}'],['internal.heatingOutputs',JSON.stringify({version:1,owned:{},holds:{}})]
 ]);
 const consumerIds=[...new Set([...consumers.devices.map(device=>device.id),...currentConsumerIds])];for(const id of consumerIds){if(typeof id!=='string'||!/^[a-z][a-z0-9_]{1,47}$/.test(id))throw Error('Ungültige Verbraucher-ID bei Wiederherstellung.');safety.set('consumers.'+id+'.allow',false);safety.set('consumers.'+id+'.targetW',0);}
 for(const [id,val]of safety)values.set(id,val);
 const refreshed={
  'analytics.dayComparison_JSON':'{}',
  'forecast.data':'{}','forecast.status':'Nach Wiederherstellung wird die Prognose neu berechnet.','forecast.error':'',
  'analytics.energySummary_JSON':'{}','analytics.utilities_JSON':'{}','analytics.fuelInventory_JSON':'{}','analytics.utilitiesArchive_JSON':values.get('internal.utilities')||'{"version":1,"days":{}}','analytics.status_JSON':'{}','utilities.error':'',
  'heating.status':JSON.stringify({version:1,ts:now,enabled:false,mode:heating.mode,ready:false,hardwareAllowed:false,pumpLock:false,action:'disabled',reason:'Nach Wiederherstellung zur Prüfung deaktiviert.',rooms:[],circuits:[],pv:{active:false},learning:{}}),
  'heating.hardware':JSON.stringify({ts:now,status:'restored-disabled',outputs:[],errors:[]}),
  'heating.message':'Nach Wiederherstellung zur Prüfung deaktiviert.','heating.error':'',
  'status.dataOk':false,'status.lastSample':'','status.lastError':'',
  'live.snapshot':JSON.stringify({ts:now,values:{importW:null,exportW:null,pvW:null,houseW:null,batteryW:null,importKWh:null,exportKWh:null},houseQuality:'unknown',dataOk:false}),
  'insights.advice':JSON.stringify({version:1,updatedAt:now,valid:false,stable:false,mode:'advisory',summary:'Auswertung wird nach Wiederherstellung neu aufgebaut.',recommendations:[]}),
  'insights.message':'Auswertung wird nach Wiederherstellung neu aufgebaut.'
 };
 for(const [id,val]of Object.entries(refreshed))values.set(id,val);
 const safetyIds=new Set(safety.keys());const entries=[...safety].map(([id,val])=>({id,val}));
 for(const id of [...values.keys()].filter(id=>!safetyIds.has(id)).sort())entries.push({id,val:values.get(id)});
 return {namespace:currentNamespace,sourceNamespace:doc.namespace,adapterVersion:doc.adapterVersion,createdAt:doc.createdAt,entries,
  summary:{stateCount:Object.keys(doc.states).length,writeCount:entries.length,consumerCount:consumers.devices.length,roomCount:heating.rooms.length,hasInventory:values.has('internal.fuelInventory'),archives:Object.fromEntries(['history.days','history.months','history.intervals','history.power','heating.history','analytics.consumerDays_JSON','internal.utilities','internal.energySummary','internal.fuelInventory'].map(id=>[id,doc.states[id]!==undefined]))},
  warnings:['Hardwaresteuerung, Verbraucher-Master und Heizungsoptimierung bleiben nach der Wiederherstellung deaktiviert.','Historische Messwerte, Lernwerte und Tankdaten werden übernommen; aktuelle Messungen und Prognosen werden neu aufgebaut.']};
}
function buildRollbackPlan(snapshot,options={}){return {...buildRestorePlan(snapshot,options),rollback:true};}
module.exports={FORMAT,SCHEMA_VERSION,MAX_BACKUP_BYTES,BACKUP_STATE_IDS,REQUIRED_IDS,buildBackup,validateBackup,buildRestorePlan,buildRollbackPlan,canonicalStringify};
