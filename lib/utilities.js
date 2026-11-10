'use strict';
const {dayKey,midnight,periodsAt}=require('./energy-summary');
const TIMEZONE='Europe/Vienna',FLOW_MAX_GAP=90000,COUNTER_MAX_GAP=300000,FLOW_MAX_AGE=120000,COUNTER_MAX_AGE=86400000;
const TYPES={pellets:{name:'Pellets',unit:'kg'},oil:{name:'Öl',unit:'l'},gas:{name:'Gas',unit:'m³'}};
const finite=value=>typeof value==='number'&&Number.isFinite(value),copy=value=>JSON.parse(JSON.stringify(value));
const round=value=>Number(value.toFixed(9));
const validId=id=>typeof id==='string'&&id.length<=255&&(!id||/^[A-Za-z0-9_][\w.:-]*$/.test(id)&&!id.startsWith('system.')&&!id.startsWith('energiemanagement.'));
function defaultUtilities(){return {water:{enabled:false,mode:'flow',stateId:'',unit:'l/min',factor:1},rainwater:{enabled:false,mode:'flow',stateId:'',unit:'l/min',factor:1},fuel:{enabled:false,type:'pellets',mode:'counter',stateId:'',factor:1,rateTime:'h'}};}
function normalizeUtilities(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Wasser/Regenwasser/Brennstoff muss ein Konfigurationsobjekt sein.');
 const defaults=defaultUtilities(),out={};
 for(const kind of ['water','rainwater','fuel']){
  const input=raw[kind]??{};if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ungültige '+kind+'-Konfiguration.');
  const item={...defaults[kind],...input};
  if(typeof item.enabled!=='boolean')throw Error('Freigabe muss Boolean sein.');
  if(!['flow','counter'].includes(item.mode))throw Error('Messart muss Durchfluss oder Zählerstand sein.');
  if(typeof item.stateId!=='string'||!validId(item.stateId.trim()))throw Error('Ungültiger Eingangs-Datenpunkt.');
  if(!finite(item.factor)||item.factor<=0||item.factor>1000000)throw Error('Messfaktor muss positiv und höchstens 1.000.000 sein.');
  out[kind]={enabled:item.enabled,mode:item.mode,stateId:item.stateId.trim(),factor:item.factor};
  if(kind!=='fuel'){
   const dual=['flowId','counterId','flowUnit','counterUnit','flowFactor','counterFactor'].some(key=>Object.hasOwn(input,key));
   const flowId=dual?input.flowId??'':item.mode==='flow'?item.stateId:'';
   const counterId=dual?input.counterId??'':item.mode==='counter'?item.stateId:'';
   for(const id of [flowId,counterId])if(typeof id!=='string'||!validId(id.trim()))throw Error('Ungültiger Wasser-Datenpunkt.');
   const canonical=value=>String(value).replace(/m3/g,'m³').trim();
   const flowUnit=canonical(dual?input.flowUnit??'l/min':item.mode==='flow'?input.unit??'l/min':'l/min');
   const counterUnit=canonical(dual?input.counterUnit??'m³':item.mode==='counter'?input.unit??'m³':'m³');
   if(!['l/min','l/h','m³/h'].includes(flowUnit)||!['m³','l'].includes(counterUnit))throw Error('Wassereinheit passt nicht zur Messart.');
   const flowFactor=dual?input.flowFactor??1:item.mode==='flow'?item.factor:1,counterFactor=dual?input.counterFactor??1:item.mode==='counter'?item.factor:1;
   if(!finite(flowFactor)||flowFactor<=0||flowFactor>1000000||!finite(counterFactor)||counterFactor<=0||counterFactor>1000000)throw Error('Wasser-Messfaktoren müssen positiv und höchstens 1.000.000 sein.');
   Object.assign(out[kind],{flowId:flowId.trim(),flowUnit,flowFactor,counterId:counterId.trim(),counterUnit,counterFactor});
   out[kind].stateId=out[kind][item.mode+'Id'];out[kind].unit=out[kind][item.mode+'Unit'];out[kind].factor=out[kind][item.mode+'Factor'];
  }else {
   if(!Object.hasOwn(TYPES,item.type))throw Error('Brennstoff muss Pellets, Öl oder Gas sein.');
   if(item.rateTime!=='h')throw Error('Brennstoff-Durchfluss muss je Stunde vorliegen.');
   out.fuel.type=item.type;out.fuel.rateTime='h';
  }
 }
 return out;
}
function validDay(key){if(typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key))return false;const date=new Date(key+'T12:00:00Z');return finite(date.getTime())&&date.toISOString().slice(0,10)===key;}
function nextDay(key){const date=new Date(key+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);}
function emptyPeriods(now){const periods=periodsAt(now);for(const period of Object.values(periods))Object.assign(period,{value:null,coveredSec:0,partial:true,recordedFromKey:null,estimatedBoundary:false});return periods;}
function convert(kind,config,value){
 const scaled=value*config.factor;if(!finite(scaled)||scaled<0)return null;
 if(kind==='fuel')return scaled;
 if(config.mode==='counter')return config.unit==='l'?scaled/1000:scaled;
 return config.unit==='l/min'?scaled*.06:config.unit==='l/h'?scaled/1000:scaled;
}
class Utilities {
 constructor(runtime={}){
  this.days={water:{},rainwater:{},pellets:{},oil:{},gas:{}};this.totals={water:0,rainwater:0,pellets:0,oil:0,gas:0};this.previous={};this.signatures={};
  this.startedAt=finite(runtime?.startedAt)?runtime.startedAt:null;this.lastSampleAt=finite(runtime?.lastSampleAt)?runtime.lastSampleAt:null;
  if(runtime?.version===1&&runtime.days&&typeof runtime.days==='object'&&!Array.isArray(runtime.days))for(const key of Object.keys(this.days)){
   for(const [day,record]of Object.entries(runtime.days[key]||{}))if(validDay(day)&&record&&finite(record.value)&&record.value>=0&&finite(record.coveredSec)&&record.coveredSec>0){
    this.days[key][day]={value:record.value,coveredSec:record.coveredSec,startedAt:finite(record.startedAt)?record.startedAt:midnight(day),updatedAt:finite(record.updatedAt)?record.updatedAt:midnight(nextDay(day)),estimatedBoundary:record.estimatedBoundary===true};
   }
  }
  for(const bucket of Object.keys(this.totals)){const saved=runtime?.totals?.[bucket];this.totals[bucket]=finite(saved)&&saved>=0?saved:Object.values(this.days[bucket]).reduce((sum,row)=>sum+row.value,0);}
 }
 integrate(bucket,previous,current,mode){
  const duration=current.ts-previous.ts,delta=mode==='counter'?current.value-previous.value:null;
  const estimated=mode==='counter'&&delta>0&&(dayKey(previous.ts)!==dayKey(current.ts)||dayKey(previous.sourceTs)!==dayKey(current.sourceTs));
  let at=previous.ts;
  while(at<current.ts){
   const day=dayKey(at),end=Math.min(current.ts,midnight(nextDay(day))),fraction=(end-at)/duration;
   let amount;
   if(mode==='counter')amount=Math.max(0,delta)*fraction;
   else {const p0=previous.value+(current.value-previous.value)*(at-previous.ts)/duration,p1=previous.value+(current.value-previous.value)*(end-previous.ts)/duration;amount=(p0+p1)/2*(end-at)/3600000;}
   if(finite(amount)&&amount>=0){
    const row=this.days[bucket][day] ||= {value:0,coveredSec:0,startedAt:at,updatedAt:end,estimatedBoundary:false};
    row.value+=amount;this.totals[bucket]+=amount;row.coveredSec+=(end-at)/1000;row.updatedAt=end;row.estimatedBoundary ||= estimated;
   }
   at=end;
  }
 }
 periods(now,bucket){
  const periods=emptyPeriods(now),today=dayKey(now);
  for(const period of Object.values(periods)){
   let value=0,coverage=0,evidence=false,first=null,estimated=false;
   for(const [day,row]of Object.entries(this.days[bucket]))if(day<=today&&(day===period.key||day.startsWith(period.key+'-'))){value+=row.value;coverage+=row.coveredSec;evidence=true;first=!first||day<first?day:first;estimated ||= row.estimatedBoundary;}
   if(evidence)Object.assign(period,{value:round(value),coveredSec:round(coverage),partial:estimated||coverage+1<Math.max(0,(Math.min(now,period.end)-period.start)/1000),recordedFromKey:first,estimatedBoundary:estimated});
  }
  return periods;
 }
 module(now,kind,config,reading,canIntegrate){
  const bucket=kind==='fuel'?config.type:kind,unit=kind==='fuel'?TYPES[config.type].unit:'m³';
  const result={enabled:config.enabled,mode:config.mode,unit,...(kind==='fuel'?{type:config.type,name:TYPES[config.type].name}:{}),inputUnit:kind!=='fuel'?config.unit:unit+(config.mode==='flow'?'/h':''),live:{value:null,unit,flowPerHour:null,counter:null,counterValue:null,inputValue:null,inputUnit:kind!=='fuel'?config.unit:unit+(config.mode==='flow'?'/h':'')},status:'missing',message:'Keine gültige Messung vorhanden.'};
  const signature=JSON.stringify(kind!=='fuel'?{enabled:config.enabled,mode:config.mode,stateId:config.stateId,unit:config.unit,factor:config.factor}:config);if(signature!==this.signatures[kind]){this.previous[kind]=null;this.signatures[kind]=signature;}
  if(!config.enabled){this.previous[kind]=null;result.status='disabled';result.message='Bereich deaktiviert.';return result;}
  if(!config.stateId){this.previous[kind]=null;result.status='unconfigured';result.message='Noch kein Datenpunkt zugeordnet.';return result;}
  const maxAge=config.mode==='flow'?FLOW_MAX_AGE:COUNTER_MAX_AGE,age=now-reading?.ts;
  if(!reading||!finite(reading.value)||reading.value<0||!finite(reading.ts)||reading.ts<0||age< -15000||age>maxAge||reading.ack!==undefined&&reading.ack!==true||reading.q!==undefined&&reading.q!==0){this.previous[kind]=null;result.status='invalid';result.message='Messwert fehlt, ist ungültig oder veraltet.';return result;}
  const value=convert(kind,config,reading.value);if(value===null){this.previous[kind]=null;result.status='invalid';result.message='Umgerechneter Messwert ist ungültig.';return result;}
  result.live.value=value;result.live.inputValue=reading.value*config.factor;result.status='ok';result.message='Messwert aktuell.';
  if(config.mode==='flow'){result.live.flowPerHour=value;result.live.unit=unit+'/h';}else result.live.counter=result.live.counterValue=value;
  const current={ts:now,sourceTs:reading.ts,value},previous=this.previous[kind];
  if(canIntegrate&&previous){
   const gap=now-previous.ts,limit=config.mode==='flow'?FLOW_MAX_GAP:COUNTER_MAX_GAP;
   // A counter can publish only on change. Continuous polling of its held
   // value still establishes zero consumption between samples.
   if(gap>0&&gap<=limit){
    if(config.mode==='counter'&&value<previous.value){result.status='counter-reset';result.message='Zählerstand gesunken; neue Ausgangsbasis gesetzt.';}
    else this.integrate(bucket,previous,current,config.mode);
   }else {result.status='gap';result.message='Meldelücke; neue Ausgangsbasis gesetzt.';}
  }
  this.previous[kind]=canIntegrate?current:null;return result;
 }
 sample(now,rawConfig={},readings={}){
  if(!finite(now)||!finite(new Date(now).getTime()))throw TypeError('Gültiger Zeitstempel erforderlich.');
  const config=normalizeUtilities(rawConfig),forward=this.lastSampleAt===null||now>this.lastSampleAt;
  if(this.startedAt===null)this.startedAt=now;if(!forward)this.previous={};
  const water=this.module(now,'water',config.water,readings.water,forward),rainwater=this.module(now,'rainwater',config.rainwater,readings.rainwater,forward),fuel=this.module(now,'fuel',config.fuel,readings.fuel,forward);
  if(forward)this.lastSampleAt=now;
  for(const bucket of Object.keys(this.days)){const keys=Object.keys(this.days[bucket]).sort();for(const key of keys.slice(0,Math.max(0,keys.length-450)))delete this.days[bucket][key];}
  for(const [kind,result]of [['water',water],['rainwater',rainwater]])if(config[kind].enabled){
   for(const mode of ['flow','counter']){
    const key=kind+(mode==='flow'?'Flow':'Counter');if(!Object.hasOwn(readings,key))continue;
    const reading=readings[key],spec={mode,unit:config[kind][mode+'Unit'],factor:config[kind][mode+'Factor']},age=now-reading?.ts,maxAge=mode==='flow'?FLOW_MAX_AGE:COUNTER_MAX_AGE;
    const valid=!!config[kind][mode+'Id']&&reading&&finite(reading.value)&&reading.value>=0&&finite(reading.ts)&&age>=-15000&&age<=maxAge&&(reading.ack===undefined||reading.ack===true)&&(reading.q===undefined||reading.q===0);
    const value=valid?convert('water',spec,reading.value):null;
    if(mode==='flow')result.live.flowPerHour=value;else result.live.counter=result.live.counterValue=value;
   }
  }
  water.periods=this.periods(now,'water');rainwater.periods=this.periods(now,'rainwater');fuel.periods=this.periods(now,config.fuel.type);
  return {version:1,updatedAt:now,timezone:TIMEZONE,recordingStartedAt:this.startedAt,water,rainwater,fuel};
 }
 runtime(){return {version:1,startedAt:this.startedAt,lastSampleAt:this.lastSampleAt,days:copy(this.days),totals:copy(this.totals)};}
}
module.exports={Utilities,defaultUtilities,normalizeUtilities,TYPES};
