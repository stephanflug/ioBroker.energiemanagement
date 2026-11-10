'use strict';
const crypto=require('node:crypto');
const {dayKey,midnight}=require('./energy-summary');
const TIMEZONE='Europe/Vienna',BUCKET_SECONDS=900,BUCKET_MS=BUCKET_SECONDS*1000,MAX_GAP_MS=90000,MAX_DAYS=35,MAX_SERIES=251,MAX_BUCKETS=300000,BASELINE_DAYS=7,MIN_COVERAGE_PCT=90;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&finite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const validTime=value=>Number.isSafeInteger(value)&&value>=0&&finite(new Date(value).getTime());
const clone=value=>JSON.parse(JSON.stringify(value));
const round=value=>Number(value.toFixed(9));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex').slice(0,24);
function shiftDay(day,offset){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);}
function duration(day){return (midnight(shiftDay(day,1))-midnight(day))/1000;}
const identity=meta=>meta.id+'@'+hash(meta.sourceId);
const emptyRuntime=()=>({version:1,bucketSeconds:BUCKET_SECONDS,lastSampleAt:null,days:{}});
function validateDayComparisonRuntime(input={}){
 if(plain(input)&&Object.keys(input).length===0)return emptyRuntime();
 if(!plain(input)||input.version!==1||input.bucketSeconds!==BUCKET_SECONDS||!plain(input.days)||Object.keys(input).some(key=>!['version','bucketSeconds','lastSampleAt','days'].includes(key)))throw Error('Ungültiges Tagesvergleichsarchiv.');
 if(input.lastSampleAt!==undefined&&input.lastSampleAt!==null&&!validTime(input.lastSampleAt))throw Error('Ungültiger Zeitpunkt im Tagesvergleichsarchiv.');
 const entries=Object.entries(input.days);if(entries.length>MAX_DAYS)throw Error('Tagesvergleich enthält mehr als 35 Tage.');
 if(entries.length&&!validTime(input.lastSampleAt))throw Error('Tagesvergleich mit Messdaten benötigt einen gültigen Erfassungszeitpunkt.');
 let populatedBuckets=0;
 for(const [day,record]of entries){
  if(!validDay(day)||!plain(record)||!plain(record.series)||Object.keys(record).some(key=>key!=='series'))throw Error('Ungültiger Tag im Tagesvergleichsarchiv.');
  const series=Object.entries(record.series);if(series.length>MAX_SERIES)throw Error('Zu viele Reihen im Tagesvergleich.');
  const dayStart=midnight(day),maxBuckets=duration(day)/BUCKET_SECONDS;
  if(dayStart>input.lastSampleAt)throw Error('Tagesvergleich enthält Messdaten nach dem Erfassungszeitpunkt.');
  for(const [key,row]of series){
   if(!plain(row)||Object.keys(row).some(field=>!['id','kind','name','sourceId','buckets'].includes(field))||!['house','consumer'].includes(row.kind)||typeof row.id!=='string'||!(row.kind==='house'?row.id==='house':/^device:[a-z][a-z0-9_]{1,47}$/.test(row.id))||typeof row.name!=='string'||row.name.length>160||typeof row.sourceId!=='string'||row.sourceId.length>512||!row.sourceId||key!==identity(row)||!Array.isArray(row.buckets)||row.buckets.length>maxBuckets)throw Error('Ungültige Messreihe im Tagesvergleichsarchiv.');
   for(const [index,bucket]of row.buckets.entries())if(bucket!==null){
    if(!Array.isArray(bucket)||bucket.length!==2||!finite(bucket[0])||bucket[0]<0||bucket[0]>100000000||!finite(bucket[1])||bucket[1]<=0||bucket[1]>BUCKET_SECONDS+.001||bucket[1]>(input.lastSampleAt-dayStart-index*BUCKET_MS)/1000+.001)throw Error('Ungültige Messabdeckung im Tagesvergleichsarchiv.');
    if(++populatedBuckets>MAX_BUCKETS)throw Error('Tagesvergleich enthält mehr als 300.000 erfasste Viertelstundenwerte.');
   }
  }
 }
 return {version:1,bucketSeconds:BUCKET_SECONDS,lastSampleAt:input.lastSampleAt??null,days:clone(input.days)};
}
function metadata(devices,options={}){
 const signature=typeof options.houseSignature==='string'?options.houseSignature:'house';
 const list=[{id:'house',kind:'house',name:'Hausverbrauch',sourceId:'sha256:'+hash(signature),rawSource:signature}];
 const seen=new Set();
 for(const device of Array.isArray(devices)?devices.slice(0,MAX_SERIES-1):[]){
  if(!device||typeof device.id!=='string'||!/^[a-z][a-z0-9_]{1,47}$/.test(device.id)||seen.has(device.id))continue;seen.add(device.id);
  list.push({id:'device:'+device.id,deviceId:device.id,kind:'consumer',name:String(device.name||device.id).slice(0,160),sourceId:typeof device.measuredW==='string'?device.measuredW.slice(0,512):'',rawSource:device.measuredW});
 }
 return list;
}
function currentValue(meta,live,measured){const value=meta.kind==='house'?live?.houseW:measured?.[meta.deviceId];return meta.sourceId&&finite(value)&&value>=0&&value<=100000000?value:null;}
const fullyCovered=bucket=>Array.isArray(bucket)&&finite(bucket[0])&&finite(bucket[1])&&bucket[1]>=BUCKET_SECONDS-.01;
class DayComparison{
 constructor(runtime={},history=[]){
  let parsed;try{parsed=validateDayComparisonRuntime(runtime);}catch{parsed=emptyRuntime();}
  this.days=parsed.days;this.lastSampleAt=parsed.lastSampleAt;this.previous={};this.bucketCount=0;
  for(const day of Object.values(this.days))for(const row of Object.values(day.series))this.bucketCount+=row.buckets.filter(Boolean).length;
  this.history=Array.isArray(history)&&Object.keys(this.days).length===0?history.filter(point=>validTime(point?.ts)).slice(-2880):[];this.seeded=false;
 }
 reset(){this.previous={};}
 add(meta,previous,current){
  const span=current.ts-previous.ts;let start=previous.ts;
  while(start<current.ts){
   const day=dayKey(start),dayStart=midnight(day),index=Math.floor((start-dayStart)/BUCKET_MS),end=Math.min(current.ts,dayStart+(index+1)*BUCKET_MS,midnight(shiftDay(day,1)));
   if(end<=start)break;
   const p0=previous.w+(current.w-previous.w)*(start-previous.ts)/span,p1=previous.w+(current.w-previous.w)*(end-previous.ts)/span;
   const record=this.days[day] ||= {series:{}};
   const key=identity(meta);if(!record.series[key]&&Object.keys(record.series).length>=MAX_SERIES){start=end;continue;}
   const row=record.series[key] ||= {id:meta.id,kind:meta.kind,name:meta.name,sourceId:meta.sourceId,buckets:[]};row.name=meta.name;
   if(!row.buckets[index]){row.buckets[index]=[0,0];this.bucketCount++;}
   const bucket=row.buckets[index];bucket[0]+=(p0+p1)/2*(end-start)/3600000000;bucket[1]+=(end-start)/1000;
   // Sequential sampling cannot cover a quarter twice; retain only roundoff tolerance.
   if(bucket[1]>BUCKET_SECONDS&&bucket[1]<BUCKET_SECONDS+.001)bucket[1]=BUCKET_SECONDS;
   start=end;
  }
 }
 record(now,metas,valueFor){
  const active=new Set();
  for(const meta of metas){
   active.add(meta.id);const w=valueFor(meta),previous=this.previous[meta.id],key=identity(meta);
   if(w===null){delete this.previous[meta.id];continue;}
   const current={ts:now,w,key};
   if(previous&&previous.key===key&&now>previous.ts&&now-previous.ts<=MAX_GAP_MS)this.add(meta,previous,current);
   this.previous[meta.id]=current;
  }
  for(const key of Object.keys(this.previous))if(!active.has(key))delete this.previous[key];
 }
 seed(now,metas){
  if(this.seeded)return;this.seeded=true;
  if(this.lastSampleAt!==null||!this.history.length){this.history=[];return;}
  let last=null;
  for(const point of this.history.filter(point=>point.ts<=now&&point.ts>now-48*3600000).sort((a,b)=>a.ts-b.ts)){
   if(last!==null&&point.ts<=last)continue;
   this.record(point.ts,metas,meta=>{
    const declared=meta.kind==='house'?(point.sourceIds?.house??point.houseSignature):point.sourceIds?.[meta.id];
    if(declared!==meta.rawSource)return null;
    const value=point.values?.[meta.kind==='house'?'houseW':meta.id];return finite(value)&&value>=0&&value<=100000000?value:null;
   });last=point.ts;
  }
  // The watermark also prevents subsequently replayed historical samples.
  if(last!==null)this.lastSampleAt=last;this.history=[];
 }
 sample(now,live={},devices=[],measured={},options={}){
  if(!validTime(now))throw TypeError('Gültiger Zeitstempel für den Tagesvergleich erforderlich.');
  const metas=metadata(devices,options);this.seed(now,metas);
  if(this.lastSampleAt===null||now>=this.lastSampleAt){
   this.record(now,metas,meta=>currentValue(meta,live,measured));this.lastSampleAt=now;
  }else this.previous={};
  const today=dayKey(now),first=shiftDay(today,-MAX_DAYS+1);
  const removeDay=day=>{for(const row of Object.values(this.days[day].series))this.bucketCount-=row.buckets.filter(Boolean).length;delete this.days[day];};
  for(const day of Object.keys(this.days))if(day<first)removeDay(day);
  // At many configured meters retain fewer complete profile days so a full
  // adapter backup stays bounded. Main energy/day archives are separate.
  for(const day of Object.keys(this.days).sort()){if(this.bucketCount<=MAX_BUCKETS)break;removeDay(day);}
  return this.summary(now,metas,options);
 }
 row(now,meta,count){
  const today=dayKey(now),todayBuckets=this.days[today]?.series?.[identity(meta)]?.buckets||[],elapsed=count*BUCKET_SECONDS;
  const observed=todayBuckets.slice(0,count).filter(Array.isArray),todayValue=observed.length?observed.reduce((sum,bucket)=>sum+bucket[0],0):null,covered=observed.reduce((sum,bucket)=>sum+bucket[1],0);
  const row={id:meta.id,kind:meta.kind,name:meta.name,status:'insufficient',basis:null,todayKWh:todayValue===null?null:round(todayValue),baselineKWh:null,deltaKWh:null,deltaPct:null,baselineDays:[],coveredSec:round(covered),coveragePct:elapsed?round(Math.min(100,covered/elapsed*100)):0,partial:covered+1<elapsed,reason:'Für den Vergleich zur gleichen Uhrzeit werden weitere ausreichend gemessene Tage benötigt.',referenceWindow:null};
  if(meta.kind==='consumer'&&!meta.sourceId){row.reason='Für diesen Verbraucher ist keine Istleistungsquelle hinterlegt.';return row;}
  if(!count){row.reason='Der Vergleich beginnt nach der ersten vollständig erfassten Viertelstunde.';return row;}
  const eligible=Array.from({length:count},(_,index)=>index).filter(index=>fullyCovered(todayBuckets[index])),required=Math.ceil(count*MIN_COVERAGE_PCT/100);
  if(eligible.length<required){row.reason='Heute sind für einen Vergleich zur gleichen Uhrzeit noch zu wenige Viertelstunden vollständig erfasst.';return row;}
  const candidates=[];
  for(let offset=1;offset<=BASELINE_DAYS;offset++){
   const day=shiftDay(today,-offset);if(duration(day)!==86400)continue;
   const buckets=this.days[day]?.series?.[identity(meta)]?.buckets;if(!buckets)continue;
   const common=eligible.filter(index=>fullyCovered(buckets[index]));if(common.length>=required)candidates.push({day,buckets,common});
  }
  candidates.sort((a,b)=>b.common.length-a.common.length||b.day.localeCompare(a.day));
  let common=eligible;const selected=[];
  for(const candidate of candidates){const intersection=common.filter(index=>fullyCovered(candidate.buckets[index]));if(intersection.length>=required){common=intersection;selected.push(candidate);}}
  if(!selected.length)return row;
  const sum=(buckets)=>common.reduce((value,index)=>value+buckets[index][0],0),todayKWh=sum(todayBuckets),baselineKWh=selected.reduce((value,candidate)=>value+sum(candidate.buckets),0)/selected.length,delta=todayKWh-baselineKWh;
  return {...row,status:'comparable',basis:'same-time',todayKWh:round(todayKWh),baselineKWh:round(baselineKWh),deltaKWh:round(delta),deltaPct:baselineKWh>0?round(delta/baselineKWh*100):null,baselineDays:selected.map(candidate=>candidate.day).sort(),coveredSec:common.length*BUCKET_SECONDS,coveragePct:round(common.length/count*100),partial:common.length<count,reason:'Verglichen werden dieselben vollständig gemessenen Viertelstunden heute und an den Vergleichstagen.',referenceWindow:{label:'Gleiche gemessene Viertelstunden',startMinute:0,endMinute:count*15}};
 }
 fallback(now,meta,row,archive){
  if(row.status==='comparable'||meta.kind!=='consumer'||!meta.sourceId||archive?.version!==1||!plain(archive.days))return row;
  const today=dayKey(now),secondsToday=Math.max(0,(now-midnight(today))/1000);
  const valid=(record,day)=>plain(record)&&record.sourceId===meta.sourceId&&!record.sourceChanged&&!record.mixedSources&&!record.coverageUnknown&&finite(record.kWh)&&record.kWh>=0&&finite(record.coveredSec)&&record.coveredSec>0&&record.coveredSec<=duration(day)+1;
  const current=archive.days[today]?.[meta.deviceId];if(!valid(current,today)||current.coveredSec>secondsToday+1)return row;
  const baselines=[];
  for(let offset=1;offset<=BASELINE_DAYS;offset++){const day=shiftDay(today,-offset),record=archive.days[day]?.[meta.deviceId];if(valid(record,day)&&!record.partial&&record.coveredSec>=duration(day)*MIN_COVERAGE_PCT/100)baselines.push({day,record});}
  if(!baselines.length)return row;
  const average=baselines.reduce((value,baseline)=>value+baseline.record.kWh,0)/baselines.length;if(current.kWh<=average+.000000001)return row;
  const delta=current.kWh-average;
  return {...row,status:'comparable',basis:'full-day-exceeded',todayKWh:round(current.kWh),baselineKWh:round(average),deltaKWh:round(delta),deltaPct:average>0?round(delta/average*100):null,baselineDays:baselines.map(baseline=>baseline.day).sort(),coveredSec:round(current.coveredSec),coveragePct:secondsToday?round(Math.min(100,current.coveredSec/secondsToday*100)):0,partial:current.partial===true||current.coveredSec+1<secondsToday,reason:'Heute bereits mehr als ein ganzer Vergleichstag. Der Referenzwert ist das Mittel ausreichend vollständig erfasster ganzer Tage.',referenceWindow:{label:'Ganze Vergleichstage',startMinute:0,endMinute:1440}};
 }
 summary(now,metas,options={}){
  const day=dayKey(now),start=midnight(day),count=Math.floor((now-start)/BUCKET_MS),excludedDstDays=[];
  for(let offset=0;offset<=BASELINE_DAYS;offset++){const candidate=shiftDay(day,-offset);if(duration(candidate)!==86400)excludedDstDays.push(candidate);}
  const dst=duration(day)!==86400;
  const result=metas.map(meta=>{
   const row=this.row(now,meta,count);
   if(dst)return {...row,status:'insufficient',basis:null,baselineKWh:null,deltaKWh:null,deltaPct:null,baselineDays:[],referenceWindow:null,reason:'Am Tag der Zeitumstellung wird kein Vergleich zur gleichen Uhrzeit berechnet.'};
   return this.fallback(now,meta,row,options.consumerArchive);
  });
  const house=result.find(row=>row.kind==='house')||null,rows=result.filter(row=>row.kind==='consumer').sort((a,b)=>(b.status==='comparable')-(a.status==='comparable')||(b.deltaKWh??-Infinity)-(a.deltaKWh??-Infinity)||a.name.localeCompare(b.name,'de'));
  const comparable=result.filter(row=>row.status==='comparable'),increases=comparable.filter(row=>row.deltaKWh>0).sort((a,b)=>b.deltaKWh-a.deltaKWh);
  const baselineDays=[...new Set(comparable.flatMap(row=>row.baselineDays))].sort();
  return {version:1,updatedAt:now,timezone:TIMEZONE,day,cutoffMinutes:count*15,window:{start,end:start+count*BUCKET_MS,elapsedSec:count*BUCKET_SECONDS},baselineWindowDays:BASELINE_DAYS,minCoveragePct:MIN_COVERAGE_PCT,status:dst?'dst-day':comparable.length?'ok':'insufficient',message:dst?'Heute ist Zeitumstellung. Der Vergleich zur gleichen Uhrzeit pausiert.':!comparable.length?'Für einen verlässlichen Tagesvergleich werden noch ausreichend gemessene Vergleichstage gesammelt.':increases.length?'Es gibt einen höheren erfassten Verbrauch gegenüber den Vergleichstagen.':'Der vergleichbare erfasste Verbrauch liegt innerhalb oder unter dem bisherigen Mittel.',house,rows,increases,baselineDays,excludedDstDays};
 }
 runtime(){
  const days=clone(this.days);for(const record of Object.values(days))for(const row of Object.values(record.series))row.buckets=Array.from(row.buckets,bucket=>bucket?[round(bucket[0]),Number(bucket[1].toFixed(3))]:null);
  return {version:1,bucketSeconds:BUCKET_SECONDS,lastSampleAt:this.lastSampleAt,days};
 }
}
module.exports={DayComparison,validateDayComparisonRuntime,BUCKET_SECONDS,MAX_DAYS,MAX_BUCKETS,MAX_GAP_MS,MIN_COVERAGE_PCT};
