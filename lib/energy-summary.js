'use strict';
const DAY=86400000,MAX_GAP=90000,TIMEZONE='Europe/Vienna';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const METRICS={importKWh:['importWs','importSec'],exportKWh:['exportWs','exportSec'],pvKWh:['pvWs','pvSec'],houseKWh:['houseWs','houseSec']};
const BATTERY=['batteryChargeKWh','batteryDischargeKWh'];
const round=value=>Number(value.toFixed(9));
function dayKey(ts){const parts=Object.fromEntries(formatter.formatToParts(new Date(ts)).map(part=>[part.type,part.value]));return parts.year+'-'+parts.month+'-'+parts.day;}
function validDay(key){if(typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key))return false;const date=new Date(key+'T12:00:00Z');return finite(date.getTime())&&date.toISOString().slice(0,10)===key;}
function nextDay(key){const date=new Date(key+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);}
const midnightCache=new Map();
function midnight(key){
 if(midnightCache.has(key))return midnightCache.get(key);
 let lo=Date.parse(key+'T00:00:00Z')-2*DAY,hi=lo+4*DAY;
 while(hi-lo>1){const middle=Math.floor((lo+hi)/2);if(dayKey(middle)<key)lo=middle;else hi=middle;}
 midnightCache.set(key,hi);if(midnightCache.size>1500)midnightCache.delete(midnightCache.keys().next().value);return hi;
}
function periodsAt(now){
 const day=dayKey(now),month=day.slice(0,7),year=day.slice(0,4),monthEnd=new Date(Date.UTC(Number(year),Number(day.slice(5,7)),1)).toISOString().slice(0,10);
 return {day:{key:day,start:midnight(day),end:midnight(nextDay(day))},month:{key:month,start:midnight(month+'-01'),end:midnight(monthEnd)},year:{key:year,start:midnight(year+'-01-01'),end:midnight(String(Number(year)+1)+'-01-01')}};
}
const emptyMetric=()=>({value:null,coveredSec:0,knownCoveredSec:0,source:'missing',partial:true});
function accumulator(){return {value:0,knownSec:0,evidence:false,unknown:false,archive:false,open:false,from:null};}
function add(target,value,coverage,{archive=false,open=false,unknown=false,day}={}){
 if(!finite(value)||value<0)return;
 const known=finite(coverage)&&coverage>=0;
 if(!known||unknown)target.unknown=true;
 // Legacy zero placeholders do not prove that a source was actually measured.
 if(value===0&&!(known&&coverage>0))return;
 target.value+=value;target.knownSec+=known?coverage:0;target.evidence=true;
 target.archive ||= archive;target.open ||= open;
 if(day&&(!target.from||day<target.from))target.from=day;
}
function finish(target,elapsed,source){
 if(!target.evidence)return emptyMetric();
 const known=Math.max(0,target.knownSec),covered=target.unknown?null:known;
 return {value:round(target.value),coveredSec:covered===null?null:round(covered),knownCoveredSec:round(known),source:source||(target.archive?'archive':'current-intervals'),partial:target.unknown||known+1<elapsed,recordedFromKey:target.from};
}
class EnergySummary {
 constructor(runtime={}){
  this.days={};this.previous=null;this.sourceSignature=typeof runtime?.sourceSignature==='string'?runtime.sourceSignature:'';
  this.startedAt=finite(runtime?.startedAt)?runtime.startedAt:null;this.lastSampleAt=finite(runtime?.lastSampleAt)?runtime.lastSampleAt:null;
  if(runtime?.version===1&&runtime.days&&typeof runtime.days==='object'&&!Array.isArray(runtime.days)){
   for(const [day,record]of Object.entries(runtime.days))if(validDay(day)&&record&&BATTERY.every(metric=>finite(record[metric])&&record[metric]>=0)&&finite(record.coveredSec)&&record.coveredSec>0){
    this.days[day]={batteryChargeKWh:record.batteryChargeKWh,batteryDischargeKWh:record.batteryDischargeKWh,coveredSec:record.coveredSec,startedAt:finite(record.startedAt)?record.startedAt:midnight(day),updatedAt:finite(record.updatedAt)?record.updatedAt:midnight(nextDay(day))};
   }
  }
 }
 integrate(previous,current){
  const duration=current.ts-previous.ts,crossing=previous.w*current.w<0?previous.ts-duration*previous.w/(current.w-previous.w):null;
  let at=previous.ts;
  while(at<current.ts){
   const day=dayKey(at),boundary=midnight(nextDay(day));
   let end=Math.min(current.ts,boundary);if(crossing!==null&&crossing>at&&crossing<end)end=crossing;
   const p0=previous.w+(current.w-previous.w)*(at-previous.ts)/duration,p1=previous.w+(current.w-previous.w)*(end-previous.ts)/duration;
   const record=this.days[day] ||= {batteryChargeKWh:0,batteryDischargeKWh:0,coveredSec:0,startedAt:at,updatedAt:end};
   record.batteryChargeKWh+=(Math.max(0,-p0)+Math.max(0,-p1))/2*(end-at)/3600000000;
   record.batteryDischargeKWh+=(Math.max(0,p0)+Math.max(0,p1))/2*(end-at)/3600000000;
   record.coveredSec+=(end-at)/1000;record.updatedAt=end;at=end;
  }
 }
 sample(now,live={},options={}){
  if(!finite(now)||!finite(new Date(now).getTime()))throw TypeError('Gültiger Zeitstempel erforderlich.');
  if(this.startedAt===null)this.startedAt=now;
  const signature=typeof options.sourceSignature==='string'?options.sourceSignature:'';
  if(signature!==this.sourceSignature){this.previous=null;this.sourceSignature=signature;}
  // The caller supplies EnergyEngine.live, which has already checked freshness.
  const valid=finite(live?.batteryW)&&Math.abs(live.batteryW)<=50000;
  if(this.lastSampleAt!==null&&now<=this.lastSampleAt){this.previous=null;}
  else {
   const current=valid?{ts:now,w:live.batteryW}:null;
   if(current&&this.previous&&now-this.previous.ts<=MAX_GAP)this.integrate(this.previous,current);
   this.previous=current;this.lastSampleAt=now;
  }
  const keys=Object.keys(this.days).sort();for(const day of keys.slice(0,Math.max(0,keys.length-450)))delete this.days[day];
  return this.summary(now,options.engineRuntime||{});
 }
 summary(now,engineRuntime={}){
  const today=dayKey(now),periods=periodsAt(now),closed=engineRuntime.days&&typeof engineRuntime.days==='object'?engineRuntime.days:{},open=engineRuntime.open&&typeof engineRuntime.open==='object'?engineRuntime.open:{};
  for(const period of Object.values(periods)){
   const totals=Object.fromEntries([...Object.keys(METRICS),...BATTERY].map(metric=>[metric,accumulator()]));
   const matches=day=>validDay(day)&&(day===period.key||day.startsWith(period.key+'-'))&&day<=today;
   for(const [day,record]of Object.entries(closed))if(matches(day)&&record&&typeof record==='object'){
    for(const metric of Object.keys(METRICS))add(totals[metric],record[metric],record.coveredSec?.[metric],{archive:true,day,unknown:record.legacyCoverage===true||record.coverageUnknown===true});
   }
   for(const [key,slot]of Object.entries(open)){
    const start=finite(slot?.start)?slot.start:Number(key);if(!finite(start)||start>now)continue;
    const day=dayKey(start);if(!matches(day))continue;
    for(const [metric,[amount,coverage]]of Object.entries(METRICS))add(totals[metric],finite(slot[amount])?slot[amount]/3600000:null,slot[coverage],{open:true,day});
   }
   for(const [day,record]of Object.entries(this.days))if(matches(day))for(const metric of BATTERY)add(totals[metric],record[metric],record.coveredSec,{day});
   const elapsed=Math.max(0,(Math.min(now,period.end)-period.start)/1000);
   period.metrics=Object.fromEntries(Object.entries(totals).map(([metric,total])=>[metric,finish(total,elapsed,BATTERY.includes(metric)?'measured-power':null)]));
   period.recordedFromKey=Object.values(totals).map(total=>total.from).filter(Boolean).sort()[0]||null;
   period.partial=Object.keys(METRICS).some(metric=>period.metrics[metric].partial);
  }
  return {version:1,updatedAt:now,timezone:TIMEZONE,recordingStartedAt:this.startedAt,periods};
 }
 runtime(){return {version:1,startedAt:this.startedAt,lastSampleAt:this.lastSampleAt,sourceSignature:this.sourceSignature,days:JSON.parse(JSON.stringify(this.days))};}
}
module.exports={EnergySummary,dayKey,midnight,periodsAt};
