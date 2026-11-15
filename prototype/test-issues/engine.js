'use strict';
// Isolierte Test-Erweiterung für energiemanagement.1, Issues #7 bis #11.
// KEINE Hardware-Schreibzugriffe. Einzig 0_userdata-Testzustände und
// nach bestätigtem Wasserzählerwechsel energiemanagement.1.config.utilities_JSON.
const BASE='0_userdata.0.EnergiemanagementTest';
const NS='energiemanagement.1';
const TZ='Europe/Vienna';
const DEFAULT={referenceC:20,heatLimitC:12,hysteresisC:1,minOnMinutes:30,minOffMinutes:30,outputId:'',outputEnabled:false};
const seenCommands=new Set();
const now=()=>Date.now();
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const fmtKey=(ts,part)=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts)).replaceAll('/','-').slice(0,part==='month'?7:10);
const safe= (id,def=null)=>{try{const s=getState(id);return s?.val===undefined?def:s.val;}catch{return def;}};
const json=(id,def={})=>{try{return JSON.parse(safe(id,'')||'')||def;}catch{return def;}};
const store=(id,val)=>setState(BASE+'.'+id,typeof val==='string'?val:JSON.stringify(val),true);
const OUT_KEYS=['water','fuel'];
function normalizeArchive(raw){
 const a=raw&&typeof raw==='object'?raw:{};
 a.days=a.days&&typeof a.days==='object'?a.days:{};
 a.resets=a.resets&&typeof a.resets==='object'?a.resets:{};
 for(const k of OUT_KEYS){a.resets[k] ||= {day:{},month:{}};a.resets[k].day ||= {};a.resets[k].month ||= {};}
 a.events=Array.isArray(a.events)?a.events:[];
 a.lastCounter=a.lastCounter&&typeof a.lastCounter==='object'?a.lastCounter:{};
 a.lastHeat=a.lastHeat&&typeof a.lastHeat==='object'?a.lastHeat:{decision:null,changedAt:0};
 return a;
}
let archive=normalizeArchive(json(BASE+'.archive',{}));
function config(){const x=json(BASE+'.config',{});return {...DEFAULT,...x,outputEnabled:false};}
function readCounter(id,kind,unit){
 if(!id)return {id:'',status:'unconfigured',value:null,unit};
 let state;try{state=getState(id);}catch{}
 const valid=state&&finite(state.val)&&state.val>=0&&(state.ack===undefined||state.ack===true)&&(state.q===undefined||state.q===0);
 if(valid){archive.lastCounter[kind]={id,value:state.val,ts:state.ts||now(),unit};}
 const last=valid?archive.lastCounter[kind]:archive.lastCounter[kind]?.id===id?archive.lastCounter[kind]:null;
 const age=last?now()-last.ts:null;
 return {id,value:last?.value??null,unit,sourceTs:last?.ts||null,status:!last?'missing':age>86400000?'stale':'current',stale:age!==null&&age>86400000,ageHours:age===null?null:Math.round(age/3600000*10)/10};
}
function getArchive(){
 const own=json(NS+'.analytics.utilitiesArchive_JSON',{});
 const hasOwn=Object.values(own.days||{}).some(rows=>Object.keys(rows||{}).length>0);
 // Testinstanz hat noch keine historische Daten; die bestehenden Messdaten von
 // Instanz 0 werden nur als gekennzeichnete Vorschau gelesen, niemals geändert.
 const reference=hasOwn?own:json('energiemanagement.0.analytics.utilitiesArchive_JSON',{});
 return {data:reference,reference:!hasOwn&&Object.values(reference.days||{}).some(v=>Object.keys(v||{}).length>0)};
}
function monthBars(records,year){
 const bars=Array.from({length:12},(_,i)=>({month:i+1,label:['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][i],value:null,days:0,partial:false}));
 for(const [key,day] of Object.entries(records||{})){
  if(!key.startsWith(String(year)+'-')||!day||!finite(day.value))continue;
  const m=Number(key.slice(5,7));if(m<1||m>12)continue;
  const b=bars[m-1];b.value=(b.value??0)+day.value;b.days++;if(day.estimatedBoundary||day.coveredSec<80000)b.partial=true;
 }
 for(const b of bars)if(b.value!==null)b.value=Number(b.value.toFixed(3));
 return bars;
}
function periodValues(kind,analysis,month){
 const sec=kind==='water'?analysis?.water:analysis?.fuel;
 const result={};
 for(const p of ['day','month','year'])result[p]=sec?.periods?.[p]||{};
 const today=fmtKey(now()),thisMonth=fmtKey(now(),'month');
 for(const p of ['day','month']){
  const key=p==='day'?today:thisMonth;
  const raw=result[p]?.key===key&&finite(result[p].value)?result[p].value:null;
  const baseline=archive.resets[kind][p][key];
  result[p]={...result[p],value:raw===null?null:Math.max(0,raw-(finite(baseline)?baseline:0)),wasReset:finite(baseline)};
 }
 return result;
}
function observeTemperature(ts,value){
 const date=fmtKey(ts),d=archive.days[date]||{sum:0,samples:0,firstAt:ts,lastAt:ts};
 // Maximal eine Probe pro 5 Minuten, um den Tagesmittelwert unabhängig
 // von der Browser-Abfrage zu machen.
 if(d.samples===0||ts-d.lastAt>=240000){
  d.sum+=value;d.samples++;d.lastAt=ts;d.firstAt=Math.min(d.firstAt,ts);
  archive.days[date]=d;
 }
}
function heatStats(cfg,heating){
 const stateId=heating.outdoorId||'';
 const input=stateId?getState(stateId):null,ts=input?.ts||0;
 const valid=stateId&&input&&finite(input.val)&&input.val>=-45&&input.val<=55&&ts&&now()-ts<3600000;
 if(valid)observeTemperature(now(),input.val);
 const day=fmtKey(now()),d=archive.days[day];
 const avg=d?.samples?d.sum/d.samples:null;
 const current=valid?input.val:null;
 const previous=archive.lastHeat;
 let decision=valid?previous.decision:null;
 const threshold=cfg.heatLimitC,band=cfg.hysteresisC;
 if(valid){
  const target=avg===null?current:avg;
  const next=decision===null?target<threshold:decision?target<threshold+band/2:target<threshold-band/2;
  if(next!==decision){
   const minWait=decision===true?cfg.minOnMinutes:cfg.minOffMinutes;
   if(decision===null||now()-(previous.changedAt||0)>=minWait*60000){decision=next;previous.changedAt=now();}
  }
  previous.decision=decision;
 }
 const byMonth=Array.from({length:12},(_,i)=>({month:i+1,label:['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][i],degreeDays:null,averageC:null,days:0,partial:false}));
 const year=new Date().toLocaleDateString('en-CA',{year:'numeric',timeZone:TZ}).slice(0,4);
 let total=0;
 for(const [key,s] of Object.entries(archive.days)){
  if(!key.startsWith(year+'-')||!s?.samples)continue;
  const month=Number(key.slice(5,7))-1;if(month<0||month>=12)continue;
  const avgTemp=s.sum/s.samples,hgt=avgTemp<cfg.heatLimitC?Math.max(0,cfg.referenceC-avgTemp):0;
  const b=byMonth[month];b.degreeDays=(b.degreeDays??0)+hgt;
  b.averageC=(b.averageC??0)+s.sum;b.days++;
  b._samples=(b._samples||0)+s.samples;
  b.partial ||= s.samples<200;total+=hgt;
 }
 for(const b of byMonth){if(b.averageC!==null)b.averageC=Number((b.averageC/b._samples).toFixed(2));if(b.degreeDays!==null)b.degreeDays=Number(b.degreeDays.toFixed(2));delete b._samples;}
 return {outdoorId:stateId,outdoorC:current,outdoorTs:ts||null,avgC:avg===null?null:Number(avg.toFixed(2)),referenceC:cfg.referenceC,heatLimitC:cfg.heatLimitC,
  valid:!!valid,heatingRecommended:valid?decision:null,phase:!valid?'Keine gültigen Daten':decision?'Heizen empfohlen':'Kein Heizbedarf',
  year:Number(year),months:byMonth,yearTotal:Number(total.toFixed(2)),outputId:cfg.outputId||'',outputEnabled:false,daysRecorded:Object.keys(archive.days).length};
}
function publish(){
 try{
  const cfg=config(),u=json(NS+'.config.utilities_JSON',{}),features=json(NS+'.config.features_JSON',{}),heat=json(NS+'.config.heating',{}),forecast=json(NS+'.config.forecast',{});
  const analysis=json(NS+'.analytics.utilities_JSON',{}),hist=getArchive(),year=Number(fmtKey(now()).slice(0,4)),fuel=u.fuel||{},water=u.water||{};
  const w=readCounter(water.counterId||water.stateId,'water',water.counterUnit||'m³'),f=readCounter(fuel.stateId,'fuel',fuel.type==='oil'?'l':fuel.type==='gas'?'m³':'kg');
  const h=heatStats(cfg,heat);
  const waterBars=monthBars(hist.data?.days?.water,year),fuelBars=monthBars(hist.data?.days?.[fuel.type||'pellets'],year);
  function adjustCurrent(bars,kind){
   const m=Number(fmtKey(now()).slice(5,7))-1,key=fmtKey(now(),'month'),offset=archive.resets[kind].month[key];
   if(bars[m]?.value!==null&&finite(offset))bars[m].value=Math.max(0,Number((bars[m].value-offset).toFixed(3)));
   if(bars[m]&&finite(offset))bars[m].wasReset=true;
  }
  if(!hist.reference){adjustCurrent(waterBars,'water');adjustCurrent(fuelBars,'fuel');}
  const state={version:1,updatedAt:now(),testOnly:true,instance:NS,sourceArchiveReference:hist.reference,
   water:{enabled:features.water===true,counter:w,periods:periodValues('water',analysis),months:waterBars,unit:'m³',mode:water.mode},
   fuel:{enabled:features.fuel===true,counter:f,periods:periodValues('fuel',analysis),months:fuelBars,unit:f.unit,type:fuel.type},
   heat:{...h,location:forecast.location?.name||'',regionConfigured:Number.isFinite(forecast.location?.latitude)&&Number.isFinite(forecast.location?.longitude)},
   events:archive.events.slice(-8)};
  store('data',state);
  setState(BASE+'.heatDemand',h.heatingRecommended===true,true);
  store('archive',archive);
 }catch(error){store('result',{ok:false,at:now(),message:'Aktualisierung: '+error.message});log('Energiemanagement Test: '+error.message,'warn');}
}
function result(ok,message,details){store('result',{ok,at:now(),message,...(details||{})});}
function runCommand(raw){
 let command;try{command=JSON.parse(raw||'');}catch{return result(false,'Ungültiges Kommandoformat.');}
 const requestId=String(command.requestId||'');if(!requestId||seenCommands.has(requestId))return;
 seenCommands.add(requestId);if(seenCommands.size>100)seenCommands.clear();
 if(command.type==='reset'){
  const kind=command.kind,scope=command.scope;
  if(!OUT_KEYS.includes(kind)||!['day','month','both'].includes(scope))return result(false,'Ungültiger Reset-Bereich.');
  const metrics=json(NS+'.analytics.utilities_JSON',{}),entry=metrics[kind];
  if(!entry?.enabled)return result(false,'Auswertung ist nicht aktiviert.');
  const scopes=scope==='both'?['day','month']:[scope];
  const baselines={};
  for(const s of scopes){
   const key=fmtKey(now(),s),period=entry.periods?.[s];
   if(period?.key!==key||!finite(period?.value))return result(false,'Kein gültiger '+s+'-Verbrauch verfügbar. Es wurde nichts verändert.');
   baselines[s]={key,value:period.value};
  }
  for(const [s,v] of Object.entries(baselines))archive.resets[kind][s][v.key]=v.value;
  archive.events.push({at:now(),type:'reset',kind,scope,baselines});
  store('archive',archive);publish();return result(true,'Berechnete '+kind+'-Verbrauchsanzeige zurückgesetzt; Rohzähler und Historie unverändert.');
 }
 if(command.type==='waterSwap'){
  const id=String(command.stateId||'').trim(),old=json(NS+'.config.utilities_JSON',{}),prior=old.water||{};
  if(!/^[A-Za-z0-9_][A-Za-z0-9_.:-]{2,254}$/.test(id)||id.startsWith('system.')||id.startsWith('energiemanagement.'))return result(false,'Ungültige Wasserzähler-ID.');
  if(id===(prior.counterId||prior.stateId))return result(false,'Dieser Wasserzähler ist bereits zugeordnet.');
  const obj=getObject(id),s=getState(id);
  if(obj?.type!=='state'||obj.common?.type!=='number'||obj.common?.read===false||!finite(s?.val)||s.val<0||s.ack!==true)return result(false,'Neuer Wasserzähler muss ein lesbarer, gültiger Zahlen-Datenpunkt sein.');
  const unit=String(obj.common.unit||'').replace('m3','m³');
  if(!['m³','l','L'].includes(unit))return result(false,'Wasserzähler benötigt die Einheit m³ oder l.');
  const next=JSON.parse(JSON.stringify(old));
  next.water={...prior,mode:'counter',counterId:id,stateId:id,counterUnit:unit==='L'?'l':unit,counterFactor:1,unit:unit==='L'?'l':unit,factor:1};
  const event={at:now(),type:'waterSwap',oldId:prior.counterId||prior.stateId,oldValue:readCounter(prior.counterId||prior.stateId,'water',prior.counterUnit||'m³').value,newId:id,newValue:s.val,newUnit:unit};
  setState(NS+'.config.utilities_JSON',JSON.stringify(next),false);
  setTimeout(()=>{
   const received=getState(NS+'.config.utilities_JSON');
   if(received?.ack===true&&received.val===JSON.stringify(next)){
    archive.events.push(event);archive.lastCounter.water={id,value:s.val,ts:s.ts||now(),unit};store('archive',archive);publish();result(true,'Neuer Wasserzähler in Testinstanz 1 gespeichert. Alte Historie bleibt erhalten.');
   }else result(false,'Der Adapter hat den neuen Wasserzähler nicht bestätigt. Konfiguration prüfen.');
  },1800);
  return;
 }
 return result(false,'Unbekannter Testbefehl.');
}
on({id:BASE+'.command',change:'ne'},event=>{
 if(event?.state?.ack===true||!event?.state?.val)return;
 runCommand(event.state.val);
});
on({id:BASE+'.config',change:'ne'},event=>{if(event?.state?.ack===true)publish();});
publish();
setInterval(publish,60000);
log('Energiemanagement Test-Erweiterung für Instanz 1 gestartet (ohne Hardware-Schreibzugriffe).','info');
