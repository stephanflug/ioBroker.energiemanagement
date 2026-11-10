'use strict';
const TYPES={pellets:{name:'Pellets',unit:'kg'},oil:{name:'Öl',unit:'l'}};
const MAX_QUANTITY=1000000000,MAX_EVENTS=1000;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const round=value=>Number(value.toFixed(9));
const quantity=value=>finite(value)&&value>=0&&value<=MAX_QUANTITY;
const validTime=value=>finite(value)&&value>=0&&finite(new Date(value).getTime());
const validRequest=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(value);
const empty=()=>({capacity:null,remaining:null,lastObservedTotal:null,lastObservedAt:null,consumedSinceFill:0,partial:true,shortfall:0,updatedAt:null,lastFillAt:null,events:[]});
function capacity(value){
 if(value===null||value===0)return null;
 if(!quantity(value)||value<=0)throw Error('Tankkapazität muss eine positive Zahl oder leer sein.');
 return value;
}
function requireType(type){if(!Object.hasOwn(TYPES,type))throw Error('Tankbestand ist nur für Pellets und Öl verfügbar.');}
function requireTime(now){if(!validTime(now))throw Error('Ungültiger Zeitstempel für den Tankbestand.');}
function cleanEvent(event,type){
 if(!event||typeof event!=='object'||!validTime(event.ts)||!['set','add','full'].includes(event.mode)||!quantity(event.amount)||!quantity(event.remainingAfter)||!validRequest(event.requestId))return null;
 if(event.type!==undefined&&event.type!==type)return null;
 const delivered=event.deliveredAmount===null?null:quantity(event.deliveredAmount)?event.deliveredAmount:null;
 return {ts:event.ts,type,unit:TYPES[type].unit,mode:event.mode,amount:event.amount,deliveredAmount:delivered,remainingBefore:quantity(event.remainingBefore)?event.remainingBefore:null,remainingAfter:event.remainingAfter,capacityAfter:quantity(event.capacityAfter)&&event.capacityAfter>0?event.capacityAfter:null,requestId:event.requestId,fingerprint:typeof event.fingerprint==='string'?event.fingerprint.slice(0,1000):''};
}
class FuelInventory{
 constructor(runtime={}){
  this.tanks={pellets:empty(),oil:empty()};
  if(runtime?.version!==1||!runtime.tanks||typeof runtime.tanks!=='object'||Array.isArray(runtime.tanks))return;
  for(const type of Object.keys(this.tanks)){
   const source=runtime.tanks[type];if(!source||typeof source!=='object'||Array.isArray(source))continue;
   const tank=this.tanks[type];
   tank.capacity=quantity(source.capacity)&&source.capacity>0?source.capacity:null;
   tank.remaining=quantity(source.remaining)&&(!tank.capacity||source.remaining<=tank.capacity)?source.remaining:null;
   tank.lastObservedTotal=finite(source.lastObservedTotal)&&source.lastObservedTotal>=0?source.lastObservedTotal:null;
   tank.lastObservedAt=validTime(source.lastObservedAt)?source.lastObservedAt:null;
   if(tank.lastObservedTotal!==null&&tank.lastObservedAt===null)tank.lastObservedTotal=null;
   tank.consumedSinceFill=finite(source.consumedSinceFill)&&source.consumedSinceFill>=0?source.consumedSinceFill:0;
   tank.partial=source.partial===true||tank.remaining===null;
   tank.shortfall=finite(source.shortfall)&&source.shortfall>=0?source.shortfall:0;
   tank.updatedAt=validTime(source.updatedAt)?source.updatedAt:null;
   tank.lastFillAt=validTime(source.lastFillAt)?source.lastFillAt:null;
   const ids=new Set();
   for(const sourceEvent of Array.isArray(source.events)?source.events:[]){const event=cleanEvent(sourceEvent,type);if(event&&!ids.has(event.requestId)){ids.add(event.requestId);tank.events.push(event);}}
   tank.events=tank.events.slice(-MAX_EVENTS);
  }
 }
 configure(type,spec={},now=Date.now()){
  requireType(type);requireTime(now);
  if(!spec||typeof spec!=='object'||Array.isArray(spec))throw Error('Tankkonfiguration muss ein Objekt sein.');
  if(!Object.hasOwn(spec,'capacity'))return this.summary(type);
  const next=capacity(spec.capacity),tank=this.tanks[type];
  if(next!==null&&tank.remaining!==null&&tank.remaining>next)throw Error('Tankkapazität liegt unter dem hinterlegten Bestand. Zuerst den Bestand berichtigen.');
  tank.capacity=next;tank.updatedAt=tank.updatedAt===null?now:Math.max(now,tank.updatedAt);return this.summary(type);
 }
 observe(now,type,lifetimeTotal,{partial=false}={}){
  requireType(type);requireTime(now);
  if(!finite(lifetimeTotal)||lifetimeTotal<0)throw Error('Verbrauchssumme muss eine gültige nichtnegative Zahl sein.');
  const tank=this.tanks[type];
  if(tank.lastObservedAt!==null&&now<tank.lastObservedAt)return this.summary(type);
  if(tank.lastObservedTotal!==null){
   const delta=lifetimeTotal-tank.lastObservedTotal;
   if(delta< -1e-9)tank.partial=true;
   else if(delta>0&&tank.remaining!==null){
    tank.consumedSinceFill=round(tank.consumedSinceFill+delta);
    if(delta>tank.remaining){tank.shortfall=round(tank.shortfall+delta-tank.remaining);tank.partial=true;}
    tank.remaining=round(Math.max(0,tank.remaining-delta));
   }
  }
  tank.lastObservedTotal=lifetimeTotal;tank.lastObservedAt=now;
  tank.updatedAt=tank.updatedAt===null?now:Math.max(now,tank.updatedAt);tank.partial ||= partial===true;return this.summary(type);
 }
 recordFill(now,type,operation={}){
  requireType(type);requireTime(now);
  if(!operation||typeof operation!=='object'||Array.isArray(operation))throw Error('Füllvorgang muss ein Objekt sein.');
  if(!['set','add','full'].includes(operation.mode))throw Error('Füllart muss Bestand setzen, Nachfüllen oder Vollfüllen sein.');
  if(!validRequest(operation.requestId))throw Error('Füllvorgang benötigt eine eindeutige Kennung.');
  const tank=this.tanks[type],mode=operation.mode,hasCapacity=Object.hasOwn(operation,'capacity'),newCapacity=hasCapacity?capacity(operation.capacity):tank.capacity;
  if(mode!=='full'&&(!quantity(operation.amount)||mode==='add'&&operation.amount<=0))throw Error(mode==='add'?'Nachfüllmenge muss eine positive Zahl sein.':'Bestand muss eine gültige nichtnegative Zahl sein.');
  const fingerprint=JSON.stringify({mode,amount:mode==='full'?null:operation.amount,capacity:hasCapacity?newCapacity:'unchanged'}),previous=tank.events.find(event=>event.requestId===operation.requestId);
  if(previous){if(previous.fingerprint!==fingerprint)throw Error('Diese Vorgangskennung wurde bereits für eine andere Füllung verwendet.');return this.summary(type);}
  if(hasCapacity&&newCapacity!==null&&tank.remaining!==null&&tank.remaining>newCapacity&&mode!=='set')throw Error('Tankkapazität liegt unter dem hinterlegten Bestand. Zuerst den Bestand berichtigen.');
  if(tank.lastObservedAt!==null&&now<tank.lastObservedAt)throw Error('Füllzeitpunkt liegt vor der letzten Verbrauchsmessung.');
  let remaining;
  if(mode==='full'){if(newCapacity===null)throw Error('Für Vollfüllen zuerst die Tankkapazität hinterlegen.');remaining=newCapacity;}
  else if(mode==='set')remaining=operation.amount;
  else {if(tank.remaining===null)throw Error('Zuerst den aktuellen Bestand hinterlegen; danach ist Nachfüllen möglich.');remaining=tank.remaining+operation.amount;}
  if(!quantity(remaining))throw Error('Berechneter Tankbestand ist ungültig.');
  if(newCapacity!==null&&remaining>newCapacity+1e-9)throw Error('Bestand überschreitet die Tankkapazität.');
  remaining=round(newCapacity===null?remaining:Math.min(remaining,newCapacity));
  const before=tank.remaining,deliveredAmount=mode==='add'?operation.amount:mode==='full'&&before!==null?round(Math.max(0,remaining-before)):null;
  const event={ts:now,type,unit:TYPES[type].unit,mode,amount:mode==='full'?newCapacity:operation.amount,deliveredAmount,remainingBefore:before,remainingAfter:remaining,capacityAfter:newCapacity,requestId:operation.requestId,fingerprint};
  tank.capacity=newCapacity;tank.remaining=remaining;tank.consumedSinceFill=0;
  if(mode==='set'||mode==='full'){tank.partial=false;tank.shortfall=0;}
  tank.updatedAt=now;tank.lastFillAt=now;tank.events.push(event);tank.events=tank.events.slice(-MAX_EVENTS);return this.summary(type);
 }
 summary(type){
  if(!Object.hasOwn(TYPES,type))return {supported:false,type,unit:type==='gas'?'m³':null,capacity:null,remaining:null,percent:null,known:false,estimated:true,partial:true,updatedAt:null,events:[]};
  const tank=this.tanks[type];return {supported:true,type,name:TYPES[type].name,unit:TYPES[type].unit,capacity:tank.capacity,remaining:tank.remaining,percent:tank.capacity!==null&&tank.remaining!==null?round(tank.remaining/tank.capacity*100):null,known:tank.remaining!==null,estimated:true,partial:tank.partial,shortfall:tank.shortfall,consumedSinceFill:tank.consumedSinceFill,updatedAt:tank.updatedAt,lastFillAt:tank.lastFillAt,events:clone(tank.events.slice(-20))};
 }
 runtime(){return {version:1,tanks:clone(this.tanks)};}
}
module.exports={FuelInventory,TYPES,MAX_EVENTS};
