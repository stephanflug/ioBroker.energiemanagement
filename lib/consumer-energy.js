'use strict';
const {vienna}=require('./engine');
const finite=v=>typeof v==='number'&&Number.isFinite(v);
class ConsumerEnergy {
 constructor(archive={}){this.days=archive?.version===1&&archive.days&&typeof archive.days==='object'?archive.days:{};this.previous={};}
 sample(now,devices,measured){
  const active=new Set();let integrated=0,valid=0;
  for(const d of devices){
   active.add(d.id);const w=measured[d.id],prev=this.previous[d.id];
   if(!finite(w)){delete this.previous[d.id];continue}valid++;
   const curr={time:now,w,sourceId:d.measuredW};
   if(prev&&prev.sourceId===d.measuredW&&now>prev.time&&now-prev.time<=90000){
    let end=now;
    // Locate midnight in the same timezone as the core energy archive, including DST.
    if(vienna(prev.time).day!==vienna(now).day){
     let lo=prev.time,hi=now;
     while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(vienna(mid).day===vienna(prev.time).day)lo=mid;else hi=mid;}end=hi;
    }
    this.add(d,prev,curr,prev.time,end);
    if(end<now)this.add(d,prev,curr,end,now);
    integrated++;
   }
   this.previous[d.id]=curr;
  }
  for(const id of Object.keys(this.previous))if(!active.has(id))delete this.previous[id];
  const configured=devices.filter(d=>d.measuredW).length;
  return {version:1,updatedAt:now,devicesConfigured:devices.length,devicesWithMeasurement:configured,currentlyValid:valid,
   intervalsIntegrated:integrated,stale:Math.max(0,configured-valid),storedDays:Object.keys(this.days).length,maxGapSeconds:90,
   note:'Integration gültiger Istleistungen, Lücken über 90 Sekunden ausgeschlossen. Keine rückwirkenden Gerätedaten.'};
 }
 add(d,prev,curr,start,end){
  const dt=curr.time-prev.time,p0=prev.w+(curr.w-prev.w)*(start-prev.time)/dt,p1=prev.w+(curr.w-prev.w)*(end-prev.time)/dt;
  const day=vienna(start).day;this.days[day] ||= {};
  const r=this.days[day][d.id] ||= {name:d.name,sourceId:d.measuredW,kWh:0,coveredSec:0,samples:0};
  if(r.sourceId!==d.measuredW)r.sourceChanged=true;
  r.kWh=Number((r.kWh+Math.max(0,(p0+p1)/2*(end-start)/3600000000)).toFixed(9));
  r.coveredSec+=(end-start)/1000;r.samples++;r.updatedAt=curr.time;r.name=d.name;r.sourceId=d.measuredW;
 }
 archive(){return {version:1,days:this.days};}
}
module.exports={ConsumerEnergy};
