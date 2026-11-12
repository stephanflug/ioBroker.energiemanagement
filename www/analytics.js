'use strict';
/*
 * Energiemanagement – Energieauswertung & Berichtsgenerator.
 * Vollständig lokaler Browsercode: keine externen Bibliotheken, keine Gerätesteuerung.
 * Datenquelle: energiemanagement.0.history.days sowie analytics.consumerDays_JSON.
 */
(function(){
 let NS='energiemanagement.0.';
 const $=id=>document.getElementById(id);
 const escape=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
 const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
 const fmt=(v,d=2)=>num(v)===null?'–':new Intl.NumberFormat('de-AT',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
 const safeKWh=v=>num(v)===null?'–':fmt(v)+' kWh';
 const dayLocal=ts=>new Date(ts).toLocaleDateString('sv-SE',{timeZone:'Europe/Vienna'});
 const today=()=>dayLocal(Date.now());
 const currentYear=()=>Number(today().slice(0,4));
 const monthName=i=>new Date(2026,i-1,15).toLocaleDateString('de-AT',{month:'long',timeZone:'Europe/Vienna'});
 const makeMonth=(y,m)=>String(y)+'-'+String(m).padStart(2,'0');
 const daysInMonth=(y,m)=>new Date(y,m,0).getDate();
 const periodStart=(y,m)=>makeMonth(y,m)+'-01';
 const periodEnd=(y,m)=>makeMonth(y,m)+'-'+daysInMonth(y,m);
 const parse=(s,fallback)=>{try{const v=typeof s==='string'?JSON.parse(s):s;return v&&typeof v==='object'?v:fallback}catch{return fallback}};
 const allNumericKeys=['pvKWh','houseKWh','importKWh','exportKWh'];
 const labels={pvKWh:'PV-Erzeugung',houseKWh:'Hausverbrauch',importKWh:'Netzbezug',exportKWh:'Netzeinspeisung',device:'Geräteverbrauch'};
 let adapterStates={},formData={},allDayData={},deviceDayData={},utilityDayData={},fuelInventory={},devices=[],initialized=false,lastAnalytics=null,lastReport=null;
 const finite=value=>typeof value==='number'&&Number.isFinite(value);
 const resourceMeta={water:{name:'Wasser',unit:'m³'},rainwater:{name:'Regenwasser',unit:'m³'},pellets:{name:'Pellets',unit:'kg'},oil:{name:'Öl',unit:'l'},gas:{name:'Gas',unit:'m³'}};
 function source(id,def){
  const v=adapterStates[NS+id]?.val;
  return v===undefined||v===null?def:v;
 }
 function stateJSON(id,def){return parse(source(id,def),def)}
 function rainwaterEnabled(){return stateJSON('config.features_JSON',{}).rainwater===true}
 function syncReportTypes(){
  const select=$('reportType'),option=select?.querySelector('option[value="rainwater"]');
  if(option){option.hidden=!rainwaterEnabled();option.disabled=option.hidden;}
  if(select?.value==='rainwater'&&!rainwaterEnabled())select.value='balance';
 }
 function buildData(){
  allDayData=stateJSON('history.days',{});
  if(!allDayData||Array.isArray(allDayData))allDayData={};
  const doc=stateJSON('analytics.consumerDays_JSON',{version:1,days:{}});
  deviceDayData=doc&&doc.days&&!Array.isArray(doc.days)?doc.days:{};
  const conf=formData.consumers||stateJSON('config.consumers',{devices:[]});
  devices=Array.isArray(conf.devices)?conf.devices:[];
  const publishedArchive=stateJSON('analytics.utilitiesArchive_JSON',null);
  const utilityArchive=publishedArchive?.days?publishedArchive:stateJSON('internal.utilities',{days:{}});
  utilityDayData=utilityArchive&&utilityArchive.days&&typeof utilityArchive.days==='object'&&!Array.isArray(utilityArchive.days)?utilityArchive.days:{};
  const inventory=stateJSON('analytics.fuelInventory_JSON',{});
  fuelInventory=inventory&&typeof inventory==='object'&&!Array.isArray(inventory)?inventory:{};
 }
 function batterySnapshot(){
  const config=stateJSON('config.batteries_JSON',{batteries:[]});
  const measured=stateJSON('live.batteries_JSON',{batteries:[]});
  const live=new Map((Array.isArray(measured.batteries)?measured.batteries:[]).map(b=>[b.id,b]));
  return (Array.isArray(config.batteries)?config.batteries:[]).filter(b=>b.enabled===true).map(b=>{
   const data=live.get(b.id),v=data?.values||{},q=data?.quality||{};
   const read=key=>q[key]==='ok'?(key==='status'?String(v[key]??''):num(v[key])):null;
   return {id:b.id,name:b.name||b.id,soc:read('soc'),voltage:read('voltage'),current:read('current'),power:read('power'),status:read('status'),timestamp:measured.ts||null};
  });
 }
 function renderBatteries(){
  const rows=batterySnapshot();
  for(const id of ['analysisBatteries','reportBatteries']){
   const host=$(id);if(!host)continue;
   host.innerHTML=rows.length?'<div class="table-scroll"><table class="ana-table"><thead><tr><th>Speicher</th><th>SOC</th><th>Spannung</th><th>Strom</th><th>Leistung</th><th>Zustand</th></tr></thead><tbody>'+rows.map(b=>'<tr><td>'+escape(b.name)+'</td><td>'+escape(b.soc===null?'–':fmt(b.soc,1)+' %')+'</td><td>'+escape(b.voltage===null?'–':fmt(b.voltage,1)+' V')+'</td><td>'+escape(b.current===null?'–':fmt(b.current,1)+' A')+'</td><td>'+escape(b.power===null?'–':fmt(b.power,0)+' W')+'</td><td>'+escape(b.status??'–')+'</td></tr>').join('')+'</tbody></table></div><p class="footnote">Aktuelle Messwerte je aktivem Speicher. Noch keine historische Batterie-Energieaufzeichnung; die Werte sind keine Zeitraum-Summen.</p>':'<p class="footnote">Keine Batteriespeicher aktiviert.</p>';
  }
 }
 function availableDays(){
  return [...new Set([...Object.keys(allDayData),...Object.keys(deviceDayData)])]
   .filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
 }
 function validDayKey(day){
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
  const parsed=new Date(day+'T12:00:00Z');return finite(parsed.getTime())&&parsed.toISOString().slice(0,10)===day;
 }
 const validStamp=value=>finite(value)&&value>=0&&value<=Date.now()+15000&&finite(new Date(value).getTime());
 function inventoryFor(kind){return fuelInventory[kind]||fuelInventory.types?.[kind]||fuelInventory.tanks?.[kind]||{}}
 function availableReportDays(){
  const keys=[...availableDays()];
  for(const kind of Object.keys(resourceMeta))if(kind!=='rainwater'||rainwaterEnabled())keys.push(...Object.keys(utilityDayData[kind]||{}));
  for(const kind of ['pellets','oil']){const events=inventoryFor(kind).events;for(const event of Array.isArray(events)?events:[])if(validStamp(event?.ts))keys.push(dayLocal(event.ts));}
  return [...new Set(keys)].filter(key=>validDayKey(key)&&key<=today()).sort();
 }
 const midnightCache=new Map();
 function midnightOf(day){
  if(midnightCache.has(day))return midnightCache.get(day);
  let lo=Date.parse(day+'T00:00:00Z')-172800000,hi=lo+345600000;
  while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(dayLocal(mid)<day)lo=mid;else hi=mid;}
  midnightCache.set(day,hi);if(midnightCache.size>1500)midnightCache.delete(midnightCache.keys().next().value);return hi;
 }
 function expectedDaySeconds(day){
  const next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  return Math.max(0,(Math.min(Date.now(),midnightOf(next.toISOString().slice(0,10)))-midnightOf(day))/1000);
 }
 function utilityRows(kinds,from,to){
  const rows=[];
  for(const kind of kinds){
   const meta=resourceMeta[kind];
   for(const [day,record]of Object.entries(utilityDayData[kind]||{})){
    if(!validDayKey(day)||day<from||day>to||day>today()||!record||!finite(record.value)||record.value<0)continue;
    const coverage=finite(record.coveredSec)&&record.coveredSec>0?record.coveredSec:null;
    if(record.value===0&&coverage===null)continue;
    const partial=record.partial===true||record.estimatedBoundary===true||coverage===null||coverage+1<expectedDaySeconds(day);
    rows.push({day,kind,name:meta.name,value:record.value,unit:meta.unit,hours:coverage===null?null:coverage/3600,partial,estimatedBoundary:record.estimatedBoundary===true,
      quality:record.estimatedBoundary?'Zeitliche Zuordnung geschätzt':partial?'Teilweise erfasst':'Erfasst'});
   }
  }
  return rows.sort((a,b)=>a.day.localeCompare(b.day)||a.name.localeCompare(b.name,'de'));
 }
 const utilityColumns=[{key:'day',label:'Datum'},{key:'name',label:'Verbrauchsart'},{key:'value',label:'Verbrauch'},{key:'unit',label:'Einheit'},{key:'hours',label:'Gemessene Stunden'},{key:'quality',label:'Messqualität'}];
 function appendUtilityReport(result,type,from,to){
  if(!['balance','water','rainwater','fuel','resources'].includes(type))return;
  const rainEnabled=rainwaterEnabled();
  if(type==='rainwater'&&!rainEnabled)throw Error('Regenwasser zuerst unter Einstellungen freischalten.');
  const requested=(type==='water'?['water']:type==='rainwater'?['rainwater']:type==='fuel'?['pellets','oil','gas']:Object.keys(resourceMeta)).filter(kind=>kind!=='rainwater'||rainEnabled);
  const rows=utilityRows(requested,from,to),features=stateJSON('config.features_JSON',{}),config=stateJSON('config.utilities_JSON',{});
  const selectedFuel=Object.hasOwn(resourceMeta,config.fuel?.type)?config.fuel.type:'pellets';
  const kinds=requested.filter(kind=>rows.some(row=>row.kind===kind)||type==='water'&&kind==='water'||kind==='rainwater'&&rainEnabled||['fuel','resources'].includes(type)&&kind===selectedFuel||kind==='water'&&type==='resources'||kind==='water'&&features.water===true||kind===selectedFuel&&features.fuel===true);
  const totals=kinds.map(kind=>{const selected=rows.filter(row=>row.kind===kind),meta=resourceMeta[kind];return {kind,title:meta.name+'verbrauch',value:selected.length?selected.reduce((sum,row)=>sum+row.value,0):null,unit:meta.unit,days:selected.length,hours:selected.some(row=>row.hours!==null)?selected.reduce((sum,row)=>sum+(row.hours||0),0):null};});
  result.utilities={daysWithData:new Set(rows.map(row=>row.day)).size,summary:totals,rows};
  result.daysWithUtilityData=result.utilities.daysWithData;
  result.extraTables=[];
  for(const total of totals)result.summary.push({title:total.title,value:total.value,unit:total.unit});
  if(type==='balance'&&rows.length)result.extraTables.push({title:rainEnabled?'Wasser, Regenwasser und Brennstoff im Berichtszeitraum':'Wasser und Brennstoff im Berichtszeitraum',columns:utilityColumns,rows});
  if(['water','rainwater','fuel','resources'].includes(type)){
   result.title=type==='water'?'Wasserverbrauchsbericht':type==='rainwater'?'Regenwasserverbrauchsbericht':type==='fuel'?'Brennstoffverbrauchsbericht':rainEnabled?'Wasser-, Regenwasser- und Brennstoffbericht':'Wasser- und Brennstoffbericht';
   result.columns=utilityColumns;result.rows=rows;
   const dates=utilityRows(requested,'0000-01-01',today()).map(row=>row.day).sort();result.notes=['Verbrauchsaufzeichnung ab '+(dates[0]||'noch keine Aufzeichnung')+'. Es werden nur tatsächlich erfasste Verbräuche ausgewertet; fehlende Zeitabschnitte werden nicht hochgerechnet.'];
  }
  if(rows.length||type!=='balance')result.notes.push((rainEnabled?'Wasser und Regenwasser werden in m³, ':'Wasser wird in m³, ')+'Pellets in kg, Öl in l und Gas in m³ ausgewiesen. Verschiedene Verbrauchsarten und Einheiten werden nicht zusammengerechnet oder pauschal in kWh umgerechnet.');
  if(rows.some(row=>row.partial))result.notes.push('Mindestens ein Tag ist nur teilweise erfasst. Angezeigte Messstunden belegen keine lückenlose Versorgung des gesamten Berichtszeitraums.');
  if(rows.some(row=>row.estimatedBoundary))result.notes.push('Bei Zähleränderungen über eine Datumsgrenze ist die zeitliche Zuordnung geschätzt.');
  if(type==='water'||type==='rainwater')return;
  const inventoryRows=[],events=[];
  for(const kind of ['pellets','oil']){
   const item=inventoryFor(kind),meta=resourceMeta[kind],capacity=finite(item.capacity)&&item.capacity>0?item.capacity:null,remaining=finite(item.remaining)&&item.remaining>=0?item.remaining:null;
   const stamp=validStamp(item.updatedAt)?item.updatedAt:validStamp(fuelInventory.updatedAt)?fuelInventory.updatedAt:null;
   if(capacity!==null||remaining!==null||(Array.isArray(item.events)&&item.events.length))inventoryRows.push({kind,name:meta.name,remaining,capacity,unit:meta.unit,estimated:true,partial:item.partial===true,updatedAt:stamp,
    asOf:stamp===null?'Unbekannter Stand':new Date(stamp).toLocaleString('de-AT',{timeZone:'Europe/Vienna'}),quality:item.partial?'Berechneter Bestand · Messlücken möglich':'Berechneter Bestand'});
   for(const event of Array.isArray(item.events)?item.events:[]){
    if(!finite(event?.ts)||event.ts<0||event.ts>Date.now()+15000)continue;const day=dayLocal(event.ts);if(day<from||day>to)continue;
    const action=event.mode==='set'?'Bestandskorrektur':event.mode==='full'?'Vollgefüllt':'Nachgefüllt';
    events.push({ts:event.ts,day,time:new Date(event.ts).toLocaleString('de-AT',{timeZone:'Europe/Vienna'}),kind,name:meta.name,action,mode:event.mode||'add',amount:finite(event.amount)&&event.amount>=0?event.amount:null,unit:meta.unit,remainingAfter:finite(event.remainingAfter)&&event.remainingAfter>=0?event.remainingAfter:null,requestId:typeof event.requestId==='string'?event.requestId:null});
   }
  }
  result.currentInventory={asOf:result.generatedAt,note:'Aktueller berechneter Vorrat; kein historischer Bestand zum Ende des gewählten Berichtszeitraums.',rows:inventoryRows};
  result.refillEvents=events.sort((a,b)=>a.ts-b.ts||a.name.localeCompare(b.name,'de'));
  if(inventoryRows.length){
   result.extraTables.push({title:'Berechneter Vorrat – aktueller Stand',note:'Diese Bestandswerte gelten zum angegebenen Stand und sind unabhängig vom gewählten Berichtszeitraum.',columns:[{key:'name',label:'Brennstoff'},{key:'remaining',label:'Verbleibender Vorrat'},{key:'capacity',label:'Tankkapazität'},{key:'unit',label:'Einheit'},{key:'asOf',label:'Stand'},{key:'quality',label:'Einordnung'}],rows:inventoryRows});
   result.notes.push('Tankbestände sind berechnete Vorräte. Kapazität allein beweist keinen gefüllten Tank; ein unbekannter Bestand bleibt leer.');
  }
  if(events.length){
   result.extraTables.push({title:'Befüllungen und Bestandskorrekturen im Berichtszeitraum',columns:[{key:'time',label:'Zeitpunkt'},{key:'name',label:'Brennstoff'},{key:'action',label:'Vorgang'},{key:'amount',label:'Erfasste Menge'},{key:'unit',label:'Einheit'},{key:'remainingAfter',label:'Bestand danach'}],rows:result.refillEvents});
   result.notes.push('Befüllungen und Bestandskorrekturen werden getrennt dokumentiert und nicht zum Verbrauch addiert.');
  }
 }
 function validRecord(day,metric,deviceId){
  if(metric==='device'){
   const e=deviceDayData[day]?.[deviceId];
   if(!e||num(e.kWh)===null||num(e.coveredSec)===null||e.coveredSec<=0)return null;
   return {value:Number(e.kWh),hours:Number(e.coveredSec)/3600,source:e.sourceId||'',samples:e.samples||0};
  }
  const value=allDayData[day]?.[metric];
  return num(value)===null?null:{value:Number(value),valid:Number(allDayData[day]?.valid)||0,invalid:Number(allDayData[day]?.invalid)||0};
 }
 function accumulate(key,metric,deviceId){
  const days=availableDays().filter(d=>d===key||key.length<10&&d.startsWith(key+'-'));
  let sum=0,count=0,hours=0,valid=0,invalid=0;
  for(const day of days){
   const r=validRecord(day,metric,deviceId);if(!r)continue;
   sum+=r.value;count++;hours+=r.hours||0;valid+=r.valid||0;invalid+=r.invalid||0;
  }
  return count?{value:sum,count,hours,valid,invalid}:null;
 }
 function keyOfPrev(y,m,mode){
  if(mode==='yearbefore')return [y-1,m];
  const d=new Date(y,m-2,1);
  return [d.getFullYear(),d.getMonth()+1];
 }
 function series(){
  const metric=$('anaMetric').value;
  const gran=$('anaPeriod').value;
  const year=Number($('anaYear').value||currentYear());
  const month=Number($('anaMonth').value||Number(today().slice(5,7)));
  const compare=$('anaCompare').value;
  const device=$('anaDevice').value;
  const rows=[];
  if(gran==='day'){
   for(let d=1;d<=daysInMonth(year,month);d++){
    const name=String(d).padStart(2,'0'),key=makeMonth(year,month)+'-'+name;
    const [cy,cm]=compare==='none'?[0,0]:keyOfPrev(year,month,compare);
    const cKey=compare==='none'||d>daysInMonth(cy,cm)?null:makeMonth(cy,cm)+'-'+name;
    rows.push({label:name+'.'+String(month).padStart(2,'0')+'.',key,compareKey:cKey});
   }
  }else if(gran==='month'){
   for(let m=1;m<=12;m++)rows.push({label:monthName(m).slice(0,3),key:makeMonth(year,m),
     compareKey:compare==='none'?null:makeMonth(year-1,m)});
  }else{
   const years=[...new Set(availableDays().map(s=>Number(s.slice(0,4))).concat([currentYear()]))].sort((a,b)=>a-b);
   const lower=Math.max(years[0],currentYear()-14),upper=Math.max(currentYear(),...years);
   for(let y=lower;y<=upper;y++)rows.push({label:String(y),key:String(y),compareKey:compare==='none'?null:String(y-1)});
  }
  const data=rows.map(x=>{
   const a=accumulate(x.key,metric,device);
   const b=x.compareKey?accumulate(x.compareKey,metric,device):null;
   return {...x,current:a,compare:b,delta:a&&b&&b.value!==0?(a.value/b.value-1)*100:null};
  });
  return {metric,gran,year,month,compare,device,rows:data};
 }
 function refreshFilters(){
  const years=[...new Set(availableDays().map(s=>Number(s.slice(0,4))).concat([currentYear(),currentYear()-1]))].sort((a,b)=>b-a);
  const yearSelect=$('anaYear'),prevYear=yearSelect.value;
  yearSelect.innerHTML=years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
  yearSelect.value=years.includes(Number(prevYear))?prevYear:String(currentYear());
  const m=$('anaMonth'),prevMonth=m.value||today().slice(5,7);
  m.innerHTML=Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+escape(monthName(i+1))+'</option>').join('');
  m.value=String(Number(prevMonth));
  const d=$('anaDevice'),old=d.value;
  const archiveIDs=[...new Set(Object.values(deviceDayData).flatMap(x=>Object.keys(x||{})))];
  const entries=new Map();
  for(const dev of devices)entries.set(dev.id,dev.name||dev.id);
  for(const id of archiveIDs)if(!entries.has(id))entries.set(id,id+' (archiviert)');
  const options=[...entries.entries()];
  d.innerHTML=options.map(([id,label])=>'<option value="'+escape(id)+'">'+escape(label)+'</option>').join('');
  d.value=entries.has(old)?old:(devices.find(x=>x.measuredW)?.id||options[0]?.[0]||'');
  $('reportDevice').innerHTML='<option value="">Alle Verbraucher</option>'+options.map(([id,label])=>'<option value="'+escape(id)+'">'+escape(label)+'</option>').join('');
 }
 function update(states,forms,namespace){
  if(namespace)NS=namespace+'.';
  adapterStates=states||{};
  formData=forms||{};
  syncReportTypes();
  const wasDevice=$('anaDevice').value,wasReportDevice=$('reportDevice').value;
  buildData();
  // Neue Geräte nach dem Speichern automatisch in Auswahl und Auswertung übernehmen.
  if(initialized){
   const ids=[...new Set([...devices.map(x=>x.id),...Object.values(deviceDayData).flatMap(x=>Object.keys(x||{}))])];
   if(ids.length!==$('anaDevice').options.length||ids.some(id=>![...$('anaDevice').options].some(o=>o.value===id))){
    refreshFilters();
    if(ids.includes(wasDevice))$('anaDevice').value=wasDevice;
    $('reportDevice').value=wasReportDevice||'';
   }
  }
  renderBatteries();
  if(initialized&&$('page-reports')&&!$('page-reports').classList.contains('hidden')){if($('reportPreset').value!=='custom')setPreset();generateReport();}
 }
 function emptyChart(msg){$('anaChart').innerHTML='<div class="ana-empty">'+escape(msg)+'</div>'}
 function renderBars(rows,unit){
  const W=1040,H=326,L=68,R=20,T=20,B=53;
  const plotW=W-L-R,plotH=H-T-B;
  const values=rows.flatMap(r=>[r.current?.value,r.compare?.value].filter(x=>num(x)!==null));
  if(!values.length){emptyChart('Für diesen Zeitraum sind noch keine Messwerte vorhanden.');return}
  const max=Math.max(0,...values),step=max>=100?50:max>=10?5:max>=1?0.5:0.1;
  const ceiling=Math.max(step,Math.ceil(max*1.12/step)*step);
  const y=v=>T+plotH-Math.max(0,v)/ceiling*plotH;
  const band=plotW/Math.max(1,rows.length),barW=Math.max(3,Math.min(27,band*.35)),cmp=$('anaCompare').value!=='none';
  let svg='<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Energievergleich in kWh">';
  for(let i=0;i<=4;i++){
   const val=ceiling*i/4,yy=y(val);
   svg+='<line class="ana-gridline" x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'"/>'+
   '<text class="ana-axis" x="'+(L-11)+'" y="'+(yy+4)+'" text-anchor="end">'+escape(fmt(val,ceiling<5?2:1))+'</text>';
  }
  rows.forEach((item,i)=>{
   const mid=L+(i+.5)*band;
   function bar(v,x,color,title){
    if(num(v)===null)return '';
    const hh=Math.max(2,T+plotH-y(v));
    return '<rect class="'+color+'" x="'+(x-barW/2).toFixed(2)+'" y="'+(T+plotH-hh).toFixed(2)+'" width="'+barW.toFixed(2)+'" height="'+hh.toFixed(2)+'" rx="3"><title>'+
      escape(title+': '+fmt(v,3)+' '+unit)+'</title></rect>';
   }
   svg+=bar(item.current?.value,mid+(cmp?-barW*.56:0),'ana-bar-current',item.key);
   if(cmp)svg+=bar(item.compare?.value,mid+barW*.56,'ana-bar-compare',item.compareKey||'');
  });
  const every=Math.max(1,Math.ceil(rows.length/13));
  rows.forEach((item,i)=>{
   if(i%every!==0&&i!==rows.length-1)return;
   const xx=L+(i+.5)*band;
   svg+='<text class="ana-axis" x="'+xx.toFixed(2)+'" y="'+(H-22)+'" text-anchor="middle">'+escape(item.label)+'</text>';
  });
  svg+='<text class="ana-axis" x="'+(L+7)+'" y="13">'+escape(unit)+'</text></svg>';
  $('anaChart').innerHTML=svg;
 }
 function renderAnalytics(){
  if(!initialized||!formData)return;
  const metric=$('anaMetric').value,gran=$('anaPeriod').value;
  $('anaYearBox').classList.toggle('hidden',gran==='year');
  $('anaMonthBox').classList.toggle('hidden',gran!=='day');
  $('anaDeviceBox').classList.toggle('hidden',metric!=='device');
  const info=series();lastAnalytics=info;
  const rows=info.rows;
  const withData=rows.filter(r=>r.current);
  const compareRows=rows.filter(r=>r.current&&r.compare);
  const sum=withData.reduce((a,r)=>a+r.current.value,0);
  const cmpSum=compareRows.reduce((a,r)=>a+r.compare.value,0);
  const matchedSum=compareRows.reduce((a,r)=>a+r.current.value,0);
  const hasCmp=compareRows.length>0;
  const delta=hasCmp&&cmpSum!==0?(matchedSum/cmpSum-1)*100:null;
  $('anaCurrent').textContent=withData.length?safeKWh(sum):'–';
  $('anaCurrentInfo').textContent=withData.length?'Aus '+withData.length+' erfassten '+(gran==='day'?'Tagen':gran==='month'?'Monaten':'Jahren'):'Keine Messwerte';
  $('anaPrevious').textContent=hasCmp?safeKWh(cmpSum):'–';
  $('anaPreviousInfo').textContent=info.compare==='none'?'Kein Vergleich gewählt':hasCmp?compareRows.length+' vergleichbare Zeitabschnitte':'Keine Vergleichsdaten';
  $('anaDifference').textContent=delta===null?'–':(delta>0?'+':'')+fmt(delta,1)+' %';
  $('anaDifferenceInfo').textContent=hasCmp?'Nur Zeitabschnitte mit Daten in beiden Perioden':'Vergleich erst mit historischen Daten möglich';
  $('anaCoverage').textContent=withData.length+' / '+rows.length;
  $('anaCoverageInfo').textContent='Zeitabschnitte mit Aufzeichnungen, keine Vollständigkeitsgarantie';
  const name=info.metric==='device'?
    (devices.find(x=>x.id===info.device)?.name||info.device||'Verbraucher'):
    labels[info.metric];
  const context=gran==='day'?monthName(info.month)+' '+info.year:gran==='month'?String(info.year):'alle erfassten Jahre';
  $('anaChartTitle').textContent=name+' · '+context;
  $('anaChartDescription').textContent=info.compare==='none'?'Aufgezeichnete Energie pro '+(gran==='day'?'Tag':gran==='month'?'Monat':'Jahr'):
    'Vergleich mit '+(gran==='day'&&info.compare==='previous'?'Vormonat':'Vorjahr')+' – fehlende Werte werden nicht geschätzt';
  renderBars(rows,'kWh');
  $('anaRows').innerHTML=rows.map(r=>{
   const value=r.current?safeKWh(r.current.value):'–';
   const comp=r.compare?safeKWh(r.compare.value):'–';
   const deltaValue=r.delta===null?'–':(r.delta>0?'+':'')+fmt(r.delta,1)+' %';
   const quality=r.current?(info.metric==='device'?fmt(r.current.hours,1)+' h gemessen':
    r.current.count+' aufgezeichnete'+(r.current.count===1?'r Tag':' Tage')):'Keine Messung';
   return '<tr><td>'+escape(r.key)+'</td><td>'+escape(quality)+'</td>'+
    '<td class="right">'+escape(value)+'</td><td class="right">'+escape(comp)+'</td><td class="right">'+escape(deltaValue)+'</td></tr>';
  }).join('');
  $('anaTableInfo').textContent='Ausgewertet: '+withData.length+' / '+rows.length+' Zeitabschnitte. '+
    'Die aktuelle Periode ist gegebenenfalls unvollständig.';
  $('anaWarning').textContent='Beginn der Aufzeichnung: '+(availableDays()[0]||'noch keine Daten')+
    '. Fehlende historische Messungen bleiben leer. Bei Hausverbrauch und PV gelten die im Adapter konfigurierten Datenquellen und Berechnungsmethoden. Geräte-kWh stammen nur aus zugeordneten Istleistungs-Datenpunkten.';
 }
 function csvCell(x,isNumber=false){
  const value=String(x===null||x===undefined?'':x);
  const safe=!isNumber&&/^[=+\-@\t\r]/.test(value)?"'"+value:value;
  return '"'+safe.replace(/"/g,'""')+'"';
 }
 function download(contents,name,mime){
  const blob=new Blob([contents],{type:mime});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),300);
 }
 function csv(rows,headers){
  return '\uFEFF'+[headers.map(x=>csvCell(x.label)).join(';'),
   ...rows.map(r=>headers.map(x=>{
    const v=r[x.key];return csvCell(typeof v==='number'?String(v).replace('.',','):v,typeof v==='number');
   }).join(';'))].join('\r\n');
 }
 function exportAnalytics(as){
  if(!lastAnalytics){renderAnalytics();if(!lastAnalytics)return}
  const info=lastAnalytics;
  const result=info.rows.map(r=>({
   periode:r.key,aufzeichnungstage:r.current?.count??null,
   aufzeichnungStunden:r.current?.hours??null,kWh:r.current?.value??null,
   vergleichsperiode:r.compareKey,kWhVergleich:r.compare?.value??null,
   abweichungProzent:r.delta
  }));
  const filename='Energiemanagement-Energievergleich-'+info.metric+'-'+today();
  if(as==='json'){
   download(JSON.stringify({format:'energiemanagement.energycomparison',version:1,
    generatedAt:new Date().toISOString(),timezone:'Europe/Vienna',
    metric:info.metric,period:info.gran,year:info.year,month:info.month,comparison:info.compare,
    consumerId:info.metric==='device'?info.device:null,rows:result,
    caveat:'Nur erfasste Tage, kein Ersatz für Zählerabrechnung.'},null,2),filename+'.json','application/json');
  }else{
   const columns=[['periode','Zeitraum'],['aufzeichnungstage','Aufzeichnungstage'],['aufzeichnungStunden','Gemessene Stunden'],
    ['kWh','Energie kWh'],['vergleichsperiode','Vergleichszeitraum'],['kWhVergleich','Vergleich kWh'],['abweichungProzent','Abweichung %']]
    .map(([key,label])=>({key,label}));
   download(csv(result,columns),filename+'.csv','text/csv;charset=utf-8');
  }
 }
 function setPreset(){
  const preset=$('reportPreset').value;
  const now=today(),y=Number(now.slice(0,4)),m=Number(now.slice(5,7));
  let from='',to='';
  if(preset==='month'){from=periodStart(y,m);to=now}
  if(preset==='lastmonth'){
   const d=new Date(y,m-2,1);from=periodStart(d.getFullYear(),d.getMonth()+1);
   to=periodEnd(d.getFullYear(),d.getMonth()+1);
  }
  if(preset==='year'){from=y+'-01-01';to=now}
  if(preset==='lastyear'){from=(y-1)+'-01-01';to=(y-1)+'-12-31'}
  if(preset==='all'){const days=availableReportDays();from=days[0]||now;to=days.at(-1)||now}
  if(preset==='custom')return;
  $('reportFrom').value=from;$('reportTo').value=to;
 }
 function closeDateRange(from,to){
  if(!validDayKey(from)||!validDayKey(to)||from>to)
   throw Error('Bitte einen gültigen Zeitraum mit Startdatum vor Enddatum wählen.');
  return availableReportDays().filter(day=>day>=from&&day<=to);
 }
 function reportBase(type,from,to,deviceId){
  const selectedDays=closeDateRange(from,to);
  const meteredDays=selectedDays.filter(day=>!!allDayData[day]);
  const deviceDays=selectedDays.filter(day=>!!deviceDayData[day]);
  const result={format:'energiemanagement.report',version:1,type,generatedAt:new Date().toISOString(),
    timezone:'Europe/Vienna',range:{from,to},daysWithEnergyData:meteredDays.length,
    daysWithDeviceData:deviceDays.length,summary:[],columns:[],rows:[],notes:[]};
  const sumKey=key=>meteredDays.reduce((v,d)=>v+(num(allDayData[d]?.[key])||0),0);
  const totals={pv:sumKey('pvKWh'),house:sumKey('houseKWh'),import:sumKey('importKWh'),
   export:sumKey('exportKWh'),valid:sumKey('valid'),invalid:sumKey('invalid'),
   maxW:Math.max(0,...meteredDays.map(d=>num(allDayData[d]?.peakW)||0))};
  const consumers=new Map();
  for(const d of devices)consumers.set(d.id,{id:d.id,name:d.name||d.id,kWh:0,hours:0,samples:0,days:0});
  for(const day of selectedDays){
   for(const [id,item] of Object.entries(deviceDayData[day]||{})){
    if(!consumers.has(id))consumers.set(id,{id,name:item.name||id,kWh:0,hours:0,samples:0,days:0});
    const total=consumers.get(id);
    total.kWh+=num(item.kWh)||0;total.hours+=(num(item.coveredSec)||0)/3600;
    total.samples+=num(item.samples)||0;total.days++;
   }
  }
  result.notes.push('Datenbeginn: '+(availableDays()[0]||'noch keine Aufzeichnung')+
    '. Die Werte umfassen ausschließlich erfasste Tage/Intervalle. Fehlende Messungen werden nicht hochgerechnet.');
  result.notes.push('Geräteverbräuche stammen aus Istleistungs-Datenpunkten. Für Geräte ohne Messung ist kein verlässlicher kWh-Wert verfügbar.');
  result.notes.push('PV-/Hausverbrauchsdaten basieren auf den hinterlegten Energiequellen. Der Bericht ersetzt keine Abrechnung des Netzbetreibers.');
  const metric=(title,value,unit)=>result.summary.push({title,value:num(value),unit});
  if(type==='balance'){
   result.title='Energiebilanz';
   metric('PV-Erzeugung',meteredDays.length?totals.pv:null,'kWh');
   metric('Hausverbrauch',meteredDays.length?totals.house:null,'kWh');
   metric('Netzbezug',meteredDays.length?totals.import:null,'kWh');
   metric('Netzeinspeisung',meteredDays.length?totals.export:null,'kWh');
   result.columns=[{key:'month',label:'Monat'},{key:'pvKWh',label:'PV kWh'},
    {key:'houseKWh',label:'Haus kWh'},{key:'importKWh',label:'Bezug kWh'},
    {key:'exportKWh',label:'Einspeisung kWh'},{key:'days',label:'Erfasste Tage'}];
   const groups={};
   for(const day of meteredDays){
    const m=day.slice(0,7),r=allDayData[day];if(!groups[m])groups[m]={month:m,pvKWh:0,houseKWh:0,importKWh:0,exportKWh:0,days:0};
    const g=groups[m];for(const k of allNumericKeys)g[k]+=num(r[k])||0;g.days++;
   }
   result.rows=Object.values(groups).sort((a,b)=>a.month.localeCompare(b.month));
  }else if(type==='solar'){
   result.title='PV-Erzeugungsbericht';
   metric('Erfasste PV-Erzeugung',meteredDays.length?totals.pv:null,'kWh');
   metric('Netzeinspeisung',meteredDays.length?totals.export:null,'kWh');
   metric('Erfasste Tage',meteredDays.length,'Tage');
   result.columns=[{key:'day',label:'Datum'},{key:'pvKWh',label:'PV-Erzeugung kWh'},
    {key:'exportKWh',label:'Netzeinspeisung kWh'},{key:'valid',label:'Gültige 15-min-Intervalle'}];
   result.rows=meteredDays.map(day=>({day,pvKWh:num(allDayData[day].pvKWh),
    exportKWh:num(allDayData[day].exportKWh),valid:num(allDayData[day].valid)||0}));
  }else if(type==='peaks'){
   result.title='Netzbezug und Leistungsspitzen';
   metric('Netzbezug',meteredDays.length?totals.import:null,'kWh');
   metric('Höchster 15-Minuten-Mittelwert',totals.valid>0?totals.maxW:null,'W');
   metric('Gültige Viertelstunden',totals.valid,'Intervalle');
   metric('Ungültige Viertelstunden',totals.invalid,'Intervalle');
   result.columns=[{key:'day',label:'Datum'},{key:'peakW',label:'Tagesspitze W'},
    {key:'peakTime',label:'Zeit der Spitze'},{key:'importKWh',label:'Netzbezug kWh'},
    {key:'valid',label:'Gültige Intervalle'},{key:'invalid',label:'Ungültige Intervalle'}];
   result.rows=meteredDays.map(day=>{
    const r=allDayData[day];
    return {day,peakW:r.valid>0?num(r.peakW):null,
     peakTime:r.valid>0&&r.peakStart?new Date(r.peakStart).toLocaleString('de-AT',{timeZone:'Europe/Vienna'}):'',
     importKWh:num(r.importKWh),valid:num(r.valid)||0,invalid:num(r.invalid)||0};
   });
  }else if(type==='devices'){
   result.title='Verbraucher- und Gerätebericht';
   const filtered=[...consumers.values()].filter(x=>!deviceId||x.id===deviceId);
   metric('Erfasster Geräteverbrauch',filtered.some(x=>x.days)?filtered.reduce((v,x)=>v+x.kWh,0):null,'kWh');
   metric('Erfasste Messstunden',filtered.reduce((v,x)=>v+x.hours,0),'h');
   metric('Verbraucher mit Messdaten',filtered.filter(x=>x.days>0).length,'Geräte');
   if(deviceId){
    result.columns=[{key:'day',label:'Datum'},{key:'device',label:'Verbraucher'},
     {key:'kWh',label:'Energie kWh'},{key:'hours',label:'Gemessene Stunden'},
     {key:'samples',label:'Messintervalle'}];
    result.rows=selectedDays.filter(day=>deviceDayData[day]?.[deviceId]).map(day=>{
     const r=deviceDayData[day][deviceId];return {day,device:r.name||deviceId,
      kWh:num(r.kWh),hours:(num(r.coveredSec)||0)/3600,samples:num(r.samples)||0};
    });
   }else{
    result.columns=[{key:'name',label:'Verbraucher'},{key:'kWh',label:'Energie kWh'},
     {key:'hours',label:'Gemessene Stunden'},{key:'days',label:'Tage mit Messung'},
     {key:'source',label:'Datenquelle'}];
    result.rows=filtered.filter(x=>x.days>0).map(x=>({name:x.name,kWh:x.kWh,hours:x.hours,
      days:x.days,source:devices.find(d=>d.id===x.id)?.measuredW||'Archivquelle'}))
      .sort((a,b)=>b.kWh-a.kWh);
   }
  }
  if(['balance','solar'].includes(type)){const batteries=batterySnapshot();if(batteries.length){result.extraTables=result.extraTables||[];result.extraTables.push({title:'Batteriespeicher – Momentaufnahme',note:'Aktuelle Messwerte zum Erstellungszeitpunkt, keine historischen Werte für den Berichtszeitraum.',columns:[{key:'name',label:'Speicher'},{key:'soc',label:'SOC (%)'},{key:'voltage',label:'Spannung (V)'},{key:'current',label:'Strom (A)'},{key:'power',label:'Leistung (W)'},{key:'status',label:'Zustand'}],rows:batteries});}}
  appendUtilityReport(result,type,from,to);
  if(result.rows.length===0)result.notes.unshift('Für diesen Bericht wurden im gewählten Zeitraum keine passenden Messdaten gefunden.');
  return result;
 }
 function reportHTML(){
  if(!lastReport)return;
  const r=lastReport;
  $('reportTitle').textContent=r.title;
  $('reportSubtitle').textContent=r.range.from+' bis '+r.range.to+
   ' · erstellt '+new Date(r.generatedAt).toLocaleString('de-AT',{timeZone:'Europe/Vienna'});
  $('reportSummary').innerHTML=r.summary.map(x=>
   '<div class="report-number"><small>'+escape(x.title)+'</small><strong>'+
    (num(x.value)===null?'–':escape(fmt(x.value,x.unit==='W'||x.unit==='Intervalle'||x.unit==='Tage'||x.unit==='Geräte'?0:x.unit==='m³'?3:2))+
    ' '+escape(x.unit))+'</strong></div>').join('');
  $('reportTableHead').innerHTML='<tr>'+r.columns.map(x=>'<th>'+escape(x.label)+'</th>').join('')+'</tr>';
  $('reportRows').innerHTML=r.rows.map(row=>
   '<tr>'+r.columns.map(x=>{const val=row[x.key];
    const result=typeof val==='number'?fmt(val,x.key==='samples'||x.key==='days'||x.key==='valid'||x.key==='invalid'?0:3):String(val??'–');
    return '<td'+(typeof val==='number'?' class="right"':'')+'>'+escape(result)+'</td>';
   }).join('')+'</tr>').join('')||
   '<tr><td colspan="'+r.columns.length+'" class="ana-empty">Noch keine Messwerte für den ausgewählten Zeitraum.</td></tr>';
  let extra=$('reportExtra');
  if(!extra){extra=document.createElement('div');extra.id='reportExtra';$('reportPrint').insertBefore(extra,$('reportNotes'));}
  extra.innerHTML=(r.extraTables||[]).filter(table=>table.rows.length).map(table=>'<section style="margin-top:24px"><h3>'+escape(table.title)+'</h3>'+(table.note?'<p class="footnote">'+escape(table.note)+'</p>':'')+'<div class="table-scroll"><table class="ana-table"><thead><tr>'+table.columns.map(column=>'<th>'+escape(column.label)+'</th>').join('')+'</tr></thead><tbody>'+table.rows.map(row=>'<tr>'+table.columns.map(column=>{const value=row[column.key];return '<td'+(typeof value==='number'?' class="right"':'')+'>'+escape(typeof value==='number'?fmt(value,3):String(value??'–'))+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div></section>').join('');
  $('reportNotes').innerHTML=r.notes.map(x=>'<p>'+escape(x)+'</p>').join('');
  $('reportPeriodStatus').textContent=['water','rainwater','fuel','resources'].includes(r.type)?(r.daysWithUtilityData||0)+' Tage mit Verbrauchsmessungen':r.daysWithEnergyData+' Tage mit Netz/PV-Daten · '+r.daysWithDeviceData+' Tage mit Gerätemessungen'+(r.daysWithUtilityData?' · '+r.daysWithUtilityData+' Tage mit weiteren Verbrauchsmessungen':'');
 }
 function generateReport(){
  try{
   lastReport=reportBase($('reportType').value,$('reportFrom').value,$('reportTo').value,$('reportDevice').value);
   reportHTML();
  }catch(e){
   lastReport=null;
   $('reportPeriodStatus').textContent='Fehler: '+e.message;
   $('reportRows').innerHTML='<tr><td class="ana-empty">Bitte gültigen Zeitraum wählen.</td></tr>';
   $('reportSummary').replaceChildren();if($('reportExtra'))$('reportExtra').replaceChildren();$('reportNotes').replaceChildren();
  }
 }
 function reportDownload(format){
  if(!lastReport)generateReport();
  if(!lastReport)return;
  const r=lastReport,filename='Energiemanagement-Bericht-'+r.type+'-'+r.range.from+'-bis-'+r.range.to;
  if(format==='json')download(JSON.stringify(r,null,2),filename+'.json','application/json');
  else {let output=csv(r.rows,r.columns);for(const table of r.extraTables||[])if(table.rows.length)output+='\r\n\r\n'+csv([{section:table.title}],[{key:'section',label:'Zusatzbereich'}]).replace(/^\uFEFF/,'')+'\r\n'+csv(table.rows,table.columns).replace(/^\uFEFF/,'');download(output,filename+'.csv','text/csv;charset=utf-8');}
 }

 function renderOverviewEnergy(){
  if(!initialized)return;
  const date=today(),month=date.slice(0,7),year=date.slice(0,4);
  const base=[
   ['pvKWh','PV-Erzeugung'],['houseKWh','Hausverbrauch'],
   ['importKWh','Netzbezug'],['exportKWh','Netzeinspeisung']
  ];
  const archivedIDs=[...new Set(Object.values(deviceDayData).flatMap(x=>Object.keys(x||{})))];
  const dyn=new Map(devices.map(d=>[d.id,d.name||d.id]));
  for(const id of archivedIDs)if(!dyn.has(id))dyn.set(id,id+' (archiviert)');
  const rows=base.map(([key,name])=>({name,type:key,device:''}));
  for(const [id,name] of dyn)rows.push({name,type:'device',device:id});
  $('overviewEnergyRows').innerHTML=rows.map(row=>{
   const values=[date,month,year].map(key=>accumulate(key,row.type,row.device));
   const isDevice=row.type==='device';
   return '<tr><td>'+escape(isDevice?'Gerät: '+row.name:row.name)+'</td>'+
    values.map(r=>'<td class="right">'+escape(r?safeKWh(r.value):'–')+'</td>').join('')+'</tr>';
  }).join('');
  $('overviewEnergyNote').textContent='Daten seit '+(availableDays()[0]||'Beginn der Messung')+
    ' · Jahreswerte sind bisher erfasste Teiljahreswerte. Einzelverbraucher sind Teil des Hausverbrauchs und dürfen nicht dazuaddiert werden.';
 }

 function render(page){
  if(!initialized)initControls();
  if(page==='overview')renderOverviewEnergy();
  if(page==='analytics'||page==='reports')renderBatteries();
  if(page==='analytics')renderAnalytics();
  else if(page==='reports'){if($('reportPreset').value!=='custom')setPreset();generateReport()}
 }
 function initControls(){
  if(initialized)return;initialized=true;
  buildData();syncReportTypes();refreshFilters();
  $('anaMetric').addEventListener('change',()=>renderAnalytics());
  $('anaPeriod').addEventListener('change',()=>renderAnalytics());
  for(const id of ['anaYear','anaMonth','anaDevice','anaCompare'])
   $(id).addEventListener('change',renderAnalytics);
  $('anaRefresh').addEventListener('click',renderAnalytics);
  $('anaCSV').addEventListener('click',()=>exportAnalytics('csv'));
  $('anaJSON').addEventListener('click',()=>exportAnalytics('json'));
  $('reportType').addEventListener('change',()=>{
   $('reportDeviceBox').classList.toggle('hidden',$('reportType').value!=='devices');
   generateReport();
  });
  $('reportDevice').addEventListener('change',generateReport);
  $('reportPreset').addEventListener('change',()=>{setPreset();generateReport()});
  for(const id of ['reportFrom','reportTo'])$(id).addEventListener('change',()=>{
    $('reportPreset').value='custom';generateReport();
  });
  $('reportGenerate').addEventListener('click',generateReport);
  $('reportCSV').addEventListener('click',()=>reportDownload('csv'));
  $('reportJSON').addEventListener('click',()=>reportDownload('json'));
  $('reportPrintButton').addEventListener('click',()=>{if(!lastReport)generateReport();if(lastReport)window.print()});
  setPreset();generateReport();
 }
 window.EnergyAnalytics={update,render};
})();
