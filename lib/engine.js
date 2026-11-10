'use strict';
const {clamp,numeric}=require('./normalize');
const QUARTER=900000, HOUR=3600000, MAX_COUNTER_GAP=180000, SETTLE_MS=120000;
const iso=ts=>new Date(ts).toISOString();
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function vienna(ts){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ts));
 const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return {day:`${m.year}-${m.month}-${m.day}`,month:`${m.year}-${m.month}`};
}
const round=(v,d=3)=>Number((Number(v)||0).toFixed(d));
function fresh(sample,now,max=120000){return sample&&finite(sample.value)&&finite(sample.ts)&&sample.ts<=now+15000&&now-sample.ts<=max;}
function emptySlot(ts){return {start:ts,importWs:0,exportWs:0,pvWs:0,houseWs:0,importSec:0,exportSec:0,pvSec:0,houseSec:0};}
function createRuntime(old={}){
 return {startedAt:old.startedAt||Date.now(),sourceSignature:old.sourceSignature||'',anchors:old.anchors||{},
  open:old.open||{},lastPower:old.lastPower||null,
  intervals:Array.isArray(old.intervals)?old.intervals.slice(-8640):[],
  days:old.days||{},months:old.months||{},invalidSamples:old.invalidSamples||0,
  incomplete:old.incomplete||0,lastValid:old.lastValid||null};
}
class EnergyEngine{
 constructor(runtime={}){this.r=createRuntime(runtime);this.dirty=false;}
 _slot(at){const start=Math.floor(at/QUARTER)*QUARTER,k=String(start);return this.r.open[k]||(this.r.open[k]=emptySlot(start));}
 _distribute(start,end,Ws,amount,covered){
  if(!finite(Ws)||!finite(start)||!finite(end)||end<=start)return;
  for(let at=start;at<end;){const until=Math.min(end,(Math.floor(at/QUARTER)+1)*QUARTER);
   const slot=this._slot(at),frac=(until-at)/(end-start);
   slot[amount]+=Ws*frac;
   if(covered)slot[covered]+=(until-at)/1000;
   at=until;
  }
 }
 _counter(channel,sample,now){
  if(!fresh(sample,now))return;
  const prev=this.r.anchors[channel];
  if(prev&&sample.ts<=prev.ts)return;
  if(prev){
   const dt=sample.ts-prev.ts,delta=sample.value-prev.value;
   if(dt<=MAX_COUNTER_GAP&&dt>0&&delta>=-1e-6&&delta<=dt/HOUR*50+0.01){
    const key=channel==='import'?'importWs':'exportWs';
    this._distribute(prev.ts,sample.ts,Math.max(0,delta)*3600000,key,channel==='import'?'importSec':'exportSec');
   }else this.r.invalidSamples++;
  }
  this.r.anchors[channel]={value:sample.value,ts:sample.ts};this.dirty=true;
 }
 _power(now,pv,house){
  const old=this.r.lastPower;
  if(old&&now>old.ts&&now-old.ts<=30000){
   if(finite(old.pv))this._distribute(old.ts,now,old.pv*(now-old.ts)/1000,'pvWs','pvSec');
   if(finite(old.house))this._distribute(old.ts,now,old.house*(now-old.ts)/1000,'houseWs','houseSec');
  }
  this.r.lastPower={ts:now,pv,house};this.dirty=true;
 }
 _finalize(now,coverage){
  let completed=0;
  for(const start of Object.keys(this.r.open).map(Number).sort((a,b)=>a-b)){
   if(start+QUARTER+SETTLE_MS>now)break;
   const slot=this.r.open[String(start)];
   const included=clamp(slot.importSec/900*100,0,100),valid=included>=coverage;
   const power=round(slot.importWs/900,1),date=vienna(start);
   const item={start,day:date.day,month:date.month,valid,coveragePct:round(included,1),
    averageW:power,importKWh:round(slot.importWs/3600000,5),
    exportKWh:round(slot.exportWs/3600000,5),pvKWh:round(slot.pvWs/3600000,5),houseKWh:round(slot.houseWs/3600000,5),
    coveredSec:{importKWh:clamp(slot.importSec,0,900),exportKWh:clamp(slot.exportSec,0,900),pvKWh:clamp(slot.pvSec,0,900),houseKWh:clamp(slot.houseSec,0,900)}};
   this.r.intervals.push(item);
   for(const [records,key] of [[this.r.days,date.day],[this.r.months,date.month]]){
    let day=records[key];
    if(!day)day=records[key]={importKWh:0,exportKWh:0,pvKWh:0,houseKWh:0,peakW:0,peakStart:0,valid:0,invalid:0,coveredSec:{importKWh:0,exportKWh:0,pvKWh:0,houseKWh:0}};
    else if(!day.coveredSec){day.legacyCoverage=true;day.coveredSec={importKWh:0,exportKWh:0,pvKWh:0,houseKWh:0};}
    for(const k of ['importKWh','exportKWh','pvKWh','houseKWh']){day[k]+=item[k];day.coveredSec[k]=(day.coveredSec[k]||0)+item.coveredSec[k];}
    if(valid){day.valid++;if(power>day.peakW){day.peakW=power;day.peakStart=start}}
    else day.invalid++;
   }
   if(valid)this.r.lastValid={value:power,start};else this.r.incomplete++;
   delete this.r.open[String(start)];completed++;this.dirty=true;
  }
  if(completed){
   this.r.intervals=this.r.intervals.slice(-8640);
   const days=Object.keys(this.r.days).sort();for(const key of days.slice(0,Math.max(0,days.length-450)))delete this.r.days[key];
   const months=Object.keys(this.r.months).sort();for(const key of months.slice(0,Math.max(0,months.length-30)))delete this.r.months[key];
  }
  return completed;
 }
 sample(now,measures,settings,sourceSignature=''){
  const coverage=clamp(numeric(settings.minCoveragePct,85),50,100),target=clamp(numeric(settings.targetW,9500),500,100000),reserve=clamp(numeric(settings.reserveW,500),0,20000);
  if(this.r.sourceSignature && this.r.sourceSignature!==sourceSignature){
   this.r.anchors={};this.r.open={};this.r.lastPower=null;this.r.invalidSamples++;
  }
  this.r.sourceSignature=sourceSignature;
  const importW=fresh(measures.importW,now)?clamp(measures.importW.value,0,100000):null;
  const exportW=fresh(measures.exportW,now)?clamp(measures.exportW.value,0,100000):null;
  const pvW=finite(measures.pvW)?clamp(measures.pvW,0,100000):null;
  const batteryW=fresh(measures.batteryW,now)?clamp(measures.batteryW.value,-50000,50000):null;
  const measuredHouse=fresh(measures.houseW,now)?measures.houseW.value:null;
  const houseW=finite(measuredHouse)?Math.max(0,measuredHouse):[
    importW,exportW,pvW,batteryW].every(finite)?Math.max(0,importW-exportW+pvW+batteryW):null;
  this._counter('import',measures.importKWh,now);
  this._counter('export',measures.exportKWh,now);
  this._power(now,pvW,houseW);
  const completed=this._finalize(now,coverage);
  const start=Math.floor(now/QUARTER)*QUARTER,slot=this._slot(now);
  const elapsed=Math.max(0.01,(now-start)/1000),remaining=Math.max(.01,900-elapsed);
  const currentCoverage=clamp(slot.importSec/elapsed*100,0,100);
  const dataOk=importW!==null&&fresh(measures.importKWh,now)&&currentCoverage>=coverage&&elapsed>=60;
  const preview=slot.importWs/elapsed;
  const projected=(slot.importWs+(importW||0)*remaining)/900;
  const allowedW=clamp((target*900-slot.importWs)/remaining,0,100000);
  const availableW=dataOk?Math.max(0,Math.floor(allowedW-importW-reserve)):0;
  const reductionW=dataOk?Math.max(0,Math.ceil(importW-allowedW+reserve)):0;
  const date=vienna(now),day=this.r.days[date.day]||{},month=this.r.months[date.month]||{};
  const currentDay=slot.start>=new Date(date.day+'T00:00:00+01:00').getTime(); // display only; month/day summaries track their own keys
  const fromBase=(current,baseline)=>fresh(current,now)&&finite(baseline)&&current.value>=baseline?round(current.value-baseline,3):null;
  return {completed,dataOk,houseSource:finite(measuredHouse)?'direct':finite(houseW)?'calculated':'unknown',
   live:{importW,exportW,pvW,batteryW,houseW,importKWh:measures.importKWh?.value??null,exportKWh:measures.exportKWh?.value??null},
   interval:{start,end:start+QUARTER,importKWh:round(slot.importWs/3600000,5),meanSoFarW:round(preview,1),forecastW:round(projected,1),coveragePct:round(currentCoverage,1),remainingSeconds:Math.max(0,Math.floor(remaining)),lastValid:this.r.lastValid||null},
   day:{...day,importKWh:fromBase(measures.importKWh,measures.dayBaseImport)??round((day.importKWh||0)+slot.importWs/3600000,4),
    exportKWh:fromBase(measures.exportKWh,measures.dayBaseExport)??round((day.exportKWh||0)+slot.exportWs/3600000,4)},
   month:{...month,importKWh:fromBase(measures.importKWh,measures.monthBaseImport)??round((month.importKWh||0)+slot.importWs/3600000,4),
    exportKWh:fromBase(measures.exportKWh,measures.monthBaseExport)??round((month.exportKWh||0)+slot.exportWs/3600000,4)},
   control:{ready:dataOk,targetW:target,reserveW:reserve,tariffThresholdW:settings.tariffThresholdW||10000,allowedW:Math.round(allowedW),availableW,reductionW},
   quality:dataOk?'OK':importW===null?'Netzbezugsleistung fehlt/veraltet':!fresh(measures.importKWh,now)?'Bezugszähler fehlt/veraltet':'15-Minuten-Messabdeckung noch unvollständig',
   counts:{intervals:this.r.intervals.length,invalidSamples:this.r.invalidSamples,incomplete:this.r.incomplete}};
 }
}
module.exports={EnergyEngine,createRuntime,vienna,round,fresh,QUARTER,SETTLE_MS};
