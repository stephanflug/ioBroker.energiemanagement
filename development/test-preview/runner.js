// Testsystem energiemanagement.1 – nur Berechnung, KEINE Geräte-Schreibbefehle
const N='energiemanagement.1.',P=N+'test.',TZ='Europe/Vienna';
const read=(id,d)=>{try{return JSON.parse(getState(id).val)}catch{return d}};
const raw=id=>{try{return getState(id)}catch{return null}};
const put=(id,v)=>setState(id,typeof v==='boolean'?v:JSON.stringify(v),true);
const date=t=>new Date(t).toLocaleDateString('sv-SE',{timeZone:TZ});
const rnd=n=>Math.round(n*1000)/1000;
function tick(){
 try{
 const t=Date.now(),today=date(t),month=today.slice(0,7);
 const opts=read(P+'hgtConfig_JSON',{baseC:20,limitC:12,enableHdd:4,disableHdd:2,windowDays:7,minHoldMinutes:60});
 const heat=read(N+'config.heating',{}),geo=read(N+'config.forecast',{}).location||{};
 const temp=heat.outdoorId?raw(heat.outdoorId):null;
 const fresh=!!temp&&typeof temp.val==='number'&&Number.isFinite(temp.val)&&temp.ack===true&&t-temp.ts<3600000&&t-temp.ts>=-15000;
 const arc=read(P+'hgtArchive_JSON',{version:1,days:{},lastTs:null});arc.days ||= {};
 const prev=arc.lastTs,minutes=prev===null?0:(t-prev)/60000;
 if(fresh&&minutes>0&&minutes<=10){
  const d=arc.days[today]||{temperatureSum:0,coveredMinutes:0};
  d.temperatureSum+=temp.val*minutes;d.coveredMinutes+=minutes;arc.days[today]=d;
 }
 arc.lastTs=t;for(const k of Object.keys(arc.days).sort().slice(0,-1100))delete arc.days[k];
 const days=Object.entries(arc.days).sort(([a],[b])=>a.localeCompare(b)).map(([day,v])=>{
  const avg=v.coveredMinutes?rnd(v.temperatureSum/v.coveredMinutes):null;
  const complete=v.coveredMinutes>=1080;
  return {day,temperature:avg,coverage:rnd(v.coveredMinutes/1440),
   hgt:complete&&avg!==null?rnd(avg<opts.limitC?Math.max(0,opts.baseC-avg):0):null,partial:!complete};
 });
 const finished=days.filter(x=>x.day<today&&x.hgt!==null),window=finished.slice(-Math.max(1,Math.min(30,+opts.windowDays||7)));
 const enough=window.length>=Math.min(3,Math.max(1,+opts.windowDays||7));
 const score=enough?rnd(window.reduce((a,b)=>a+b.hgt,0)/window.length):null;
 const old=read(P+'hgtSummary_JSON',{});let demand=typeof old.demand==='boolean'?old.demand:null;
 if(!fresh||!enough)demand=null;
 else if(demand===null)demand=score>=opts.enableHdd;
 else if(t-(old.lastSwitchAt||0)>=(+opts.minHoldMinutes||0)*60000){
  if(!demand&&score>=opts.enableHdd)demand=true;
  else if(demand&&score<=opts.disableHdd)demand=false;
 }
 const switched=typeof demand==='boolean'&&demand!==old.demand?t:old.lastSwitchAt||0;
 const months={};for(const row of days){
  const k=row.day.slice(0,7),m=months[k] ||= {hgt:0,days:0,tempSum:0,tempDays:0,partial:false};
  if(row.hgt!==null){m.hgt+=row.hgt;m.days++}else m.partial=true;
  if(row.temperature!==null){m.tempSum+=row.temperature;m.tempDays++}
 }
 for(const m of Object.values(months)){m.hgt=m.days?rnd(m.hgt):null;m.outdoorAvg=m.tempDays?rnd(m.tempSum/m.tempDays):null;delete m.tempSum}
 put(P+'hgtArchive_JSON',arc);
 put(P+'hgtSummary_JSON',{updatedAt:t,sourceId:heat.outdoorId||'',region:geo.name||'',outdoorTemp:fresh?temp.val:null,
  sourceTs:temp?.ts||null,score,demand,outputBoolean:demand===null?null:opts.invert?!demand:demand,
  outputId:opts.targetId||'',externalEnabled:false,lastSwitchAt:switched,months,days,
  message:!heat.outdoorId?'Außentemperatur nicht zugeordnet':!fresh?'Außentemperatur veraltet':!enough?'Aufzeichnung läuft – noch nicht genügend vollständige Tage':demand?'Heizen empfohlen':'Kein Heizbedarf'});
 put(P+'heatingDemand',demand===true);put(P+'heatingDemandValid',demand!==null);
 const archive=read(N+'analytics.utilitiesArchive_JSON',{days:{}}),adj=read(P+'utilityAdjustments_JSON',{resets:[],meterChanges:[]});
 const util=read(N+'config.utilities_JSON',{fuel:{type:'pellets'}}),result={updatedAt:t,year:today.slice(0,4),types:{},meterChanges:adj.meterChanges||[]};
 for(const [kind,bucket] of Object.entries({water:'water',fuel:util.fuel?.type||'pellets'})){
  const records=archive.days?.[bucket]||{},months={};
  for(const [k,v] of Object.entries(records)){if(typeof v?.value!=='number')continue;
   const m=months[k.slice(0,7)]||={value:0,days:0,partial:false,estimated:false};
   m.value+=v.value;m.days++;m.partial ||=v.coveredSec<86000;m.estimated ||=v.estimatedBoundary===true;
  }
  const daily=records[today]?.value??null,monthly=months[month]?.value??null;
  const resets=(adj.resets||[]).filter(x=>x.kind===kind);
  const d=resets.filter(x=>x.day===today&&['day','both'].includes(x.scope)).at(-1);
  const m=resets.filter(x=>x.month===month&&['month','both'].includes(x.scope)).at(-1);
  if(m&&months[month])months[month].value=Math.max(0,rnd(monthly-(m.monthBaseline||0)));
  result.types[kind]={bucket,unit:kind==='water'?'m³':bucket==='pellets'?'kg':bucket==='oil'?'l':'m³',
   rawDay:daily,rawMonth:monthly,day:daily===null?null:Math.max(0,rnd(daily-(d?.dayBaseline||0))),
   month:monthly===null?null:Math.max(0,rnd(monthly-(m?.monthBaseline||0))),months,resetCount:resets.length};
 }
 put(P+'utilitySummary_JSON',result);
 }catch(e){log('Energiemanagement .1 Testfunktionen: '+e.message,'warn')}
}
tick();setInterval(tick,300000);