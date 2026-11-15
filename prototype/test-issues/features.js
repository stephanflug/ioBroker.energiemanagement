'use strict';
/* Entwicklungsvorschau ausschließlich für energiemanagement.1. */
(() => {
 if(new URLSearchParams(location.search).get('instance')!=='energiemanagement.1')return;
 const PREFIX='0_userdata.0.EnergiemanagementTest',NS='energiemanagement.1',MONTHS=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const fmt=(v,dec=2)=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('de-AT',{maximumFractionDigits:dec,minimumFractionDigits:dec}).format(v):'–';
 const date=t=>t?new Date(t).toLocaleString('de-AT',{timeZone:'Europe/Vienna',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'–';
 const dateKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('/','-');
 const clone=v=>JSON.parse(JSON.stringify(v));
 let socket,model={},conf={},archive={},rawHistory={},referenceHistory=false,loaded=false,refreshBusy=false,selectedYear=new Date().getFullYear();
 let tab='consumers';
 function node(parent,markup){if(!parent)return null;parent.insertAdjacentHTML('beforeend',markup);return parent.lastElementChild;}
 function init(){
  node($('page-overview'),'<article class="emt-card" id="emtOverview"><div class="emt-head"><h2>Heizbedarf – Heizgradtage</h2><span class="emt-mark unknown" id="emtHeatBadge">Keine gültigen Daten</span></div><p class="emt-muted" id="emtHeatExplanation">Testberechnung lädt …</p><div class="emt-kpis"><div class="emt-kpi"><small>Außentemperatur</small><strong id="emtOutdoorNow">–</strong></div><div class="emt-kpi"><small>Heizgrenze</small><strong id="emtHeatLimit">–</strong></div><div class="emt-kpi"><small>Gerätefreigabe</small><strong id="emtHeatDecision">–</strong></div></div><p class="emt-testflag">Testmodus · kein Gerät wird geschaltet</p></article>');
  node($('page-fuel'),'<article class="emt-card"><div class="emt-head"><h2>Pellets – Gesamtzähler</h2><span class="emt-mark" id="emtFuelBadge">Lade …</span></div><div class="emt-kpis"><div class="emt-kpi"><small>Letzter bekannter Zählerstand</small><strong id="emtFuelCounter">–</strong></div><div class="emt-kpi"><small>Letzte Zählermeldung</small><strong id="emtFuelTime" style="font-size:.98rem">–</strong></div></div><p class="emt-muted" id="emtFuelInfo">Stale Zählerstände werden angezeigt, aber nicht als neue Verbrauchsmessung gezählt.</p></article>');
  const a=$('page-analytics');
  node(a,'<div class="emt-banner"><strong>Erweiterte Energieauswertung · Testinstanz 1</strong><div>Monatsdiagramme verwenden erfasste Messwerte. Unvollständige Zeiträume bleiben gekennzeichnet.</div></div>');
  node(a,'<div class="emt-head"><label class="emt-field" style="width:170px">Auswertungsjahr<select id="emtYear"></select></label></div>');
  node(a,'<article class="emt-card"><div class="emt-head"><div><h2>Wasserverbrauch · <span class="emtYearLabel">2026</span></h2><p class="emt-muted">Aufgezeichneter Wasserverbrauch pro Monat · m³</p></div></div><div id="emtWaterChart" class="emt-chart"></div><p id="emtWaterNote" class="emt-archive"></p></article>');
  node(a,'<article class="emt-card"><div class="emt-head"><div><h2>Brennstoffverbrauch · <span class="emtYearLabel">2026</span></h2><p class="emt-muted">Aufgezeichneter Verbrauch pro Monat · Pellets kg / Heizöl l / Gas m³</p></div></div><div id="emtFuelChart" class="emt-chart"></div><p id="emtFuelNote" class="emt-archive"></p></article>');
  node(a,'<article class="emt-card"><div class="emt-head"><div><h2>Heizgradtage · <span class="emtYearLabel">2026</span></h2><p class="emt-muted">Monatliche Heizgradtage (blau) und mittlere Außentemperatur (grün) · Jahresübersicht</p></div></div><div class="emt-legend"><span><i class="emt-color"></i>Heizgradtage (K·d)</span><span><i class="emt-color line"></i>Außentemperatur (°C)</span></div><div id="emtHddChart" class="emt-chart"></div><p id="emtHddNote" class="emt-archive"></p></article>');
  const reg=$('page-regulation');
  if(reg){
   const tabs=document.createElement('div');tabs.className='emt-tabs';tabs.id='emtRegTabs';
   tabs.innerHTML='<button type="button" id="emtTabConsumers" aria-selected="true">Verbraucher &amp; weitere Regelungen</button><button type="button" id="emtTabHdd" aria-selected="false">Heizgradtage</button>';
   const intro=reg.querySelector('.intro');intro?.after(tabs);
   node(reg,'<article class="emt-card emt-hidden" id="emtHddSettings"><div class="emt-head"><div><h2>Heizgradtage – Freigaberegelung</h2><p class="emt-muted">Die Messquellen kommen aus Heizung und PV-Prognose. Kein neuer Sensor nötig.</p></div><span class="emt-mark" id="emtHddStatus">Simulation</span></div><div class="emt-kpis"><div class="emt-kpi"><small>Heizgradtage im laufenden Jahr</small><strong id="emtHddTotal">–</strong></div><div class="emt-kpi"><small>Tagesmittel Außentemperatur</small><strong id="emtHddAvg">–</strong></div><div class="emt-kpi"><small>Regelstatus</small><strong id="emtHddDecision" style="font-size:.99rem">–</strong></div></div><div class="emt-grid"><label class="emt-field">Referenztemperatur (°C)<input type="number" id="emtReference" min="10" max="30" step="0.5" value="20"></label><label class="emt-field">Heizgrenze (°C)<input type="number" id="emtThreshold" min="-10" max="25" step="0.5" value="12"></label><label class="emt-field">Hysterese (K)<input type="number" id="emtHysteresis" min="0.1" max="8" step="0.1" value="1"></label><label class="emt-field">Mindestlaufzeit (min)<input type="number" id="emtMinOn" min="1" max="240" value="30"></label><label class="emt-field">Mindestsperrzeit (min)<input type="number" id="emtMinOff" min="1" max="240" value="30"></label></div><label class="emt-field">Geräteausgang (bestehender ioBroker-Boolean-Datenpunkt, optional)<div class="emt-inline"><input id="emtOutputId" placeholder="adapter.0.Geraet.Freigabe"><button class="button ghost" type="button" id="emtOutputPicker">Auswählen</button></div></label><p class="emt-testflag">Wichtig: Ausgang nur vorgemerkt. Die Testregelung schreibt ausschließlich den internen TRUE/FALSE-Status, niemals auf einen Hardwareausgang.</p><div class="emt-actions"><button id="emtSaveHdd" type="button">Regelparameter speichern</button></div><p class="emt-muted" id="emtHddSourceInfo">Quellen werden geladen …</p><p id="emtHddMessage" role="status" class="emt-info"></p></article>');
  }
  node($('page-settings'),'<article class="emt-card" id="emtUtilitiesSettings"><div class="emt-head"><h2>Wasser- und Brennstoffzähler · Reset / Wechsel</h2><span class="emt-mark">Testinstanz 1</span></div><p class="emt-muted">Nur die berechnete Testanzeige wird zurückgesetzt. Reale Zähler, abgeschlossene Archive und Tankbestände bleiben erhalten.</p><div class="emt-grid"><label class="emt-field">Verbrauchsbereich<select id="emtResetKind"><option value="water">Wasser</option><option value="fuel">Brennstoff</option></select></label><label class="emt-field">Zurücksetzen<select id="emtResetScope"><option value="day">Tagesverbrauch</option><option value="month">Monatsverbrauch</option><option value="both">Tages- und Monatsverbrauch</option></select></label></div><div class="emt-actions"><button type="button" id="emtResetApply">Verbrauchsanzeige zurücksetzen</button></div><hr style="border:0;border-top:1px solid #496b87;margin:22px 0"><h3>Wasserzähler wechseln</h3><p class="emt-muted" id="emtCurrentWater">Aktueller Zähler wird geladen …</p><label class="emt-field">Neuer Wasserzähler-Datenpunkt<div class="emt-inline"><input id="emtNewMeter" placeholder="z. B. hm-rega.0.12345"><button type="button" id="emtNewMeterPicker">Datenpunkt auswählen</button></div></label><p class="emt-muted">Der neue Stand wird als neue Bezugsbasis verwendet. Alt- und Neuzähler werden nicht voneinander subtrahiert. Der Wechsel wird protokolliert.</p><div class="emt-actions"><button type="button" id="emtSwapMeter">Zählerwechsel bestätigen</button></div><p id="emtSettingsMessage" role="status" class="emt-info"></p></article>');
  const banner=document.createElement('div');banner.className='emt-banner';banner.textContent='Entwicklungsvorschau für energiemanagement.1 · Issues #7–#11 · keine Hardwaresteuerung';
  const root=document.querySelector('main')||document.querySelector('.app-content')||$('page-overview')?.parentElement;
  root?.insertBefore(banner,$('page-overview'));
  $('emtYear')?.addEventListener('change',e=>{selectedYear=Number(e.target.value);renderCharts()});
  $('emtTabConsumers')?.addEventListener('click',()=>changeTab('consumers'));
  $('emtTabHdd')?.addEventListener('click',()=>changeTab('hdd'));
  $('emtOutputPicker')?.addEventListener('click',()=>choose('boolean',true,'emtOutputId'));
  $('emtNewMeterPicker')?.addEventListener('click',()=>choose('number',false,'emtNewMeter'));
  $('emtSaveHdd')?.addEventListener('click',saveHeating);
  $('emtResetApply')?.addEventListener('click',resetUtilities);
  $('emtSwapMeter')?.addEventListener('click',swapMeter);
  changeTab('consumers');
  connect();
 }
 function changeTab(next){
  tab=next;const reg=$('page-regulation');if(!reg)return;
  for(const el of Array.from(reg.children)){
   if(el.classList.contains('intro')||el.id==='emtRegTabs')continue;
   el.classList.toggle('emt-hidden',next==='hdd'?el.id!=='emtHddSettings':el.id==='emtHddSettings');
  }
  $('emtTabConsumers')?.setAttribute('aria-selected',String(next==='consumers'));
  $('emtTabHdd')?.setAttribute('aria-selected',String(next==='hdd'));
 }
 function connect(){
  if(!window.io?.connect){setTimeout(connect,1000);return;}
  try{
   socket=window.io.connect(location.origin,{name:'Energy Test Features',reconnection:true});
   socket.on('connect',()=>refresh());
   socket.on('disconnect',()=>message('emtHddMessage','Testverbindung unterbrochen',true));
   setTimeout(refresh,1500);
   setInterval(refresh,15000);
  }catch(err){message('emtHddMessage','Verbindung: '+err.message,true);setTimeout(connect,4000);}
 }
 function rpc(op,...args){
  return new Promise((resolve,reject)=>{
   if(!socket||socket.connected===false)return reject(Error('ioBroker-Websocket nicht verbunden'));
   const timer=setTimeout(()=>reject(Error('Zeitüberschreitung bei '+op)),9000);
   try{socket.emit(op,...args,(error,value)=>{clearTimeout(timer);if(error)return reject(Error(String(error.message||error)));resolve(value)});}
   catch(e){clearTimeout(timer);reject(e)}
  });
 }
 async function read(id){const x=await rpc('getState',id);return x?.val;}
 const decode=v=>{try{return JSON.parse(v||'{}')}catch{return {}}};
 function message(id,text,error=false){const el=$(id);if(!el)return;el.textContent=text;el.className=error?'emt-alert':'emt-info';}
 async function refresh(){
  if(refreshBusy||!socket||socket.connected===false)return;refreshBusy=true;
  try{
   const [data,settings,hddArchive,own,prod]=await Promise.all([
    read(PREFIX+'.data'),read(PREFIX+'.config'),read(PREFIX+'.archive'),
    read(NS+'.analytics.utilitiesArchive_JSON'),read('energiemanagement.0.analytics.utilitiesArchive_JSON')
   ]);
   model=decode(data);conf=decode(settings);archive=decode(hddArchive);
   const a=decode(own),b=decode(prod);
   referenceHistory=!Object.values(a.days||{}).some(x=>Object.keys(x||{}).length);
   rawHistory=referenceHistory?b:a;
   renderAll();
   if(!loaded){
    loaded=true;
    $('emtReference').value=conf.referenceC??20;$('emtThreshold').value=conf.heatLimitC??12;
    $('emtHysteresis').value=conf.hysteresisC??1;$('emtMinOn').value=conf.minOnMinutes??30;$('emtMinOff').value=conf.minOffMinutes??30;
    $('emtOutputId').value=conf.outputId||'';
   }
  }catch(e){message('emtHddMessage','Testdaten nicht erreichbar: '+e.message,true);}
  finally{refreshBusy=false;}
 }
 function showMark(id,text,type){const e=$(id);if(e){e.textContent=text;e.className='emt-mark '+type}}
 function renderAll(){
  const h=model.heat||{},f=model.fuel||{},w=model.water||{};
  showMark('emtHeatBadge',h.phase||'Keine gültigen Daten',!h.valid?'unknown':h.heatingRecommended?'yes':'no');
  $('emtHeatExplanation').textContent='Berechnet aus dem vorhandenen Außentemperaturfühler · Region: '+(h.location||'nicht konfiguriert')+' · Keine Hardware-Schaltung';
  $('emtOutdoorNow').textContent=fmt(h.outdoorC,1)+' °C';
  $('emtHeatLimit').textContent=fmt(h.heatLimitC,1)+' °C';
  $('emtHeatDecision').textContent=h.heatingRecommended===null?'Unbekannt':h.heatingRecommended?'TRUE':'FALSE';
  const counter=f.counter||{};
  showMark('emtFuelBadge',counter.status==='stale'?'Letzter bekannter Stand':counter.status==='current'?'Aktuell':'Kein gültiger Stand',counter.status==='current'?'yes':'no');
  $('emtFuelCounter').textContent=fmt(counter.value,3)+' '+(f.unit||'kg');
  $('emtFuelTime').textContent=date(counter.sourceTs);
  $('emtFuelInfo').textContent=counter.status==='stale'?'Zählerstand seit '+fmt(counter.ageHours,1)+' Stunden unverändert; keine künstlichen Verbrauchswerte.':'Der Zählerstand ist ein Rohwert. Verbrauch wird separat berechnet.';
  $('emtHddTotal').textContent=fmt(h.yearTotal,2)+' K·d';
  $('emtHddAvg').textContent=fmt(h.avgC,2)+' °C';
  $('emtHddDecision').textContent=h.phase||'Keine gültigen Daten';
  showMark('emtHddStatus',h.valid?'Temperatur vorhanden':'Temperatur fehlt',h.valid?'yes':'unknown');
  $('emtHddSourceInfo').textContent='Außenfühler: '+(h.outdoorId||'nicht eingestellt')+' · Standort: '+(h.location||'nicht hinterlegt')+' · Ausgang: '+(h.outputId||'nicht zugeordnet')+' (Simulation)';
  $('emtCurrentWater').textContent='Derzeitiger Wasserzähler: '+(w.counter?.id||'keiner')+' · Stand: '+fmt(w.counter?.value,3)+' '+(w.unit||'m³');
  renderYears();renderCharts();
 }
 function renderYears(){
  const a=$('emtYear');if(!a)return;
  const years=new Set([new Date().getFullYear(),selectedYear]);
  for(const rows of Object.values(rawHistory.days||{}))for(const k of Object.keys(rows||{}))if(/^\d{4}-\d{2}-\d{2}$/.test(k))years.add(Number(k.slice(0,4)));
  for(const k of Object.keys(archive.days||{}))if(/^\d{4}-\d{2}-\d{2}$/.test(k))years.add(Number(k.slice(0,4)));
  const values=[...years].sort((a,b)=>b-a),signature=values.join('|');
  if(a.dataset.years!==signature){a.dataset.years=signature;a.innerHTML=values.map(y=>'<option value="'+y+'">'+y+'</option>').join('');}
  a.value=String(selectedYear);
 }
 function histMonths(kind,year){
  const rows=rawHistory.days?.[kind]||{},v=MONTHS.map((label,i)=>({label,month:i+1,value:null,partial:false}));
  for(const [k,row] of Object.entries(rows)){
   if(!k.startsWith(year+'-')||typeof row?.value!=='number')continue;
   const i=Number(k.slice(5,7))-1;if(i<0||i>=12)continue;
   const x=v[i];x.value=(x.value??0)+row.value;x.partial||=row.estimatedBoundary||row.coveredSec<80000;
  }
  // Reset-Offsets gelten für die laufende Testperiode; historische Referenzdaten
  // aus Instanz 0 werden absichtlich nicht verändert oder überschrieben.
  if(!referenceHistory&&year===new Date().getFullYear()){
   const k=dateKey().slice(0,7),i=Number(k.slice(5,7))-1,offset=archive.resets?.[kind==='water'?'water':'fuel']?.month?.[k];
   if(Number.isFinite(offset)&&v[i].value!==null)v[i].value=Math.max(0,v[i].value-offset);
  }
  for(const x of v)if(x.value!==null)x.value=Number(x.value.toFixed(3));
  return v;
 }
 function hddMonths(year){
  const v=MONTHS.map((label,i)=>({label,month:i+1,value:null,temp:null,partial:false,samples:0}));
  const h=model.heat||{},ref=Number(h.referenceC??20),limit=Number(h.heatLimitC??12);
  for(const [k,day] of Object.entries(archive.days||{})){
   if(!k.startsWith(year+'-')||!day?.samples)continue;
   const i=Number(k.slice(5,7))-1;if(i<0||i>=12)continue;
   const avg=day.sum/day.samples,x=v[i];
   x.value=(x.value??0)+(avg<limit?Math.max(0,ref-avg):0);
   x.temp=(x.temp??0)+day.sum;x.samples+=day.samples;x.partial||=day.samples<200;
  }
  for(const x of v){if(x.value!==null)x.value=Number(x.value.toFixed(2));if(x.temp!==null)x.temp=Number((x.temp/x.samples).toFixed(2));}
  return v;
 }
 function graph(rows,{unit,dual=false}){
  const vals=rows.map(x=>x.value).filter(Number.isFinite),upper=Math.max(1,...vals)*1.12;
  const w=1000,h=320,top=26,bottom=262,left=62,right=dual?925:980,height=bottom-top,step=(right-left)/12;
  let p=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Monatsdiagramm '+esc(unit)+'">'];
  for(let i=0;i<=4;i++){const y=bottom-height*i/4;p.push('<line class="gridline" x1="'+left+'" y1="'+y+'" x2="'+right+'" y2="'+y+'"/><text x="'+(left-8)+'" y="'+(y+5)+'" text-anchor="end">'+esc(fmt(upper*i/4,1))+'</text>');}
  rows.forEach((x,i)=>{
   const xPos=left+(i+.2)*step,bw=step*.62,v=x.value;
   if(Number.isFinite(v)){const bh=height*v/upper;p.push('<rect class="bar" x="'+xPos+'" y="'+(bottom-bh)+'" width="'+bw+'" height="'+Math.max(1,bh)+'" rx="3"><title>'+esc(x.label+': '+fmt(v,2)+' '+unit+(x.partial?' · Teilweise erfasst':''))+'</title></rect>');}
   else p.push('<line class="nodata" x1="'+xPos+'" x2="'+(xPos+bw)+'" y1="'+bottom+'" y2="'+(bottom-4)+'"><title>Kein Messwert</title></line>');
   p.push('<text x="'+(left+(i+.5)*step)+'" y="289" text-anchor="middle">'+x.label+'</text>');
  });
  if(dual){
   const temperatures=rows.map(x=>x.temp).filter(Number.isFinite),minT=Math.min(-10,...temperatures),maxT=Math.max(20,...temperatures),range=Math.max(10,maxT-minT);
   let points=[];
   rows.forEach((x,i)=>{
    if(!Number.isFinite(x.temp)){if(points.length>1)p.push('<polyline class="line" points="'+points.join(' ')+'"/>');points=[];return;}
    const px=left+(i+.5)*step,py=bottom-(x.temp-minT)/range*height;
    points.push(px+','+py);p.push('<circle class="dot" cx="'+px+'" cy="'+py+'" r="4"><title>'+esc(x.label+': '+fmt(x.temp,1)+' °C')+'</title></circle>');
   });
   if(points.length>1)p.push('<polyline class="line" points="'+points.join(' ')+'"/>');
   for(let i=0;i<=4;i++){const y=bottom-i*height/4;p.push('<text x="944" y="'+(y+4)+'">'+fmt(minT+range*i/4,0)+'°</text>');}
  }
  p.push('<text x="'+left+'" y="314">'+(dual?'Balken: K·d · Linie: °C':'Einheit: '+esc(unit))+'</text></svg>');
  return p.join('');
 }
 function renderCharts(){
  if(!$('emtWaterChart'))return;
  for(const e of document.querySelectorAll('.emtYearLabel'))e.textContent=String(selectedYear);
  const w=histMonths('water',selectedYear),fuelType=model.fuel?.type||'pellets',f=histMonths(fuelType,selectedYear),h=hddMonths(selectedYear);
  $('emtWaterChart').innerHTML=graph(w,{unit:'m³'});
  $('emtFuelChart').innerHTML=graph(f,{unit:fuelType==='oil'?'l':fuelType==='gas'?'m³':'kg'});
  $('emtHddChart').innerHTML=graph(h,{unit:'K·d',dual:true});
  const note=referenceHistory?'Testinstanz besitzt noch kein eigenes Verbrauchsarchiv. Zur Ansicht werden die vorhandenen historischen Daten von Instanz 0 ausschließlich gelesen.':'Historie der Testinstanz 1; keine Schätzung fehlender Messwerte.';
  $('emtWaterNote').textContent=note;
  $('emtFuelNote').textContent=note;
  $('emtHddNote').textContent='Aufzeichnung der Heizgradtage beginnt mit der Testfunktion. Teilweise erfasste Tage und Monate sind markiert; frühere Werte werden nicht erfunden.';
 }
 function choose(type,write,target){
  if(!window.EnergyStatePicker?.open){message('emtHddMessage','Datenpunktbrowser nicht bereit. Bitte ID direkt eingeben.',true);return;}
  const input=$(target);
  window.EnergyStatePicker.open({type,write,currentId:input?.value||'',title:write?'Gerätefreigabe – optionaler Ausgang':'Neuer Wasserzähler',
   saveHint:'Ziel im Testbereich bestätigen.',onSelect:(id)=>{if(input)input.value=id;}});
 }
 async function setState(id,value){return rpc('setState',id,{val:value,ack:false})}
 async function saveHeating(){
  const data={...conf,
   referenceC:Number($('emtReference').value),heatLimitC:Number($('emtThreshold').value),
   hysteresisC:Number($('emtHysteresis').value),minOnMinutes:Number($('emtMinOn').value),minOffMinutes:Number($('emtMinOff').value),
   outputId:$('emtOutputId').value.trim(),outputEnabled:false};
  if(!Number.isFinite(data.referenceC)||data.referenceC<10||data.referenceC>30||!Number.isFinite(data.heatLimitC)||data.heatLimitC< -10||data.heatLimitC>25||!Number.isFinite(data.hysteresisC)||data.hysteresisC<.1||data.hysteresisC>8||!(data.minOnMinutes>=1&&data.minOnMinutes<=240)||!(data.minOffMinutes>=1&&data.minOffMinutes<=240))return message('emtHddMessage','Parameter außerhalb des gültigen Bereichs.',true);
  if(data.outputId&&!/^[a-zA-Z0-9_][\w.:-]{2,254}$/.test(data.outputId))return message('emtHddMessage','Ungültige Ausgangs-ID.',true);
  try{await setState(PREFIX+'.config',JSON.stringify(data));conf=data;message('emtHddMessage','Regelparameter gespeichert. Hardwareausgang bleibt deaktiviert.');setTimeout(refresh,1000);}
  catch(e){message('emtHddMessage','Speichern fehlgeschlagen: '+e.message,true)}
 }
 async function command(payload,id){
  const requestId=Date.now()+'_'+Math.floor(Math.random()*999999),stamp=Date.now(),cmd={...payload,requestId};
  try{
   message(id,'Änderung wird auf der Testinstanz geprüft …');
   await setState(PREFIX+'.command',JSON.stringify(cmd));
   for(let i=0;i<12;i++){
    await new Promise(r=>setTimeout(r,450));
    const result=decode(await read(PREFIX+'.result'));
    if(result.at>=stamp){
     message(id,result.message||'Keine Antwort',!result.ok);
     await refresh();return;
    }
   }
   message(id,'Keine Bestätigung erhalten. Bitte Testzustände prüfen.',true);
  }catch(e){message(id,'Fehler: '+e.message,true)}
 }
 function resetUtilities(){
  const kind=$('emtResetKind').value,scope=$('emtResetScope').value,label=kind==='water'?'Wasser':'Brennstoff';
  if(!window.confirm(label+'-Verbrauch '+(scope==='day'?'heute':scope==='month'?'im laufenden Monat':'heute und im laufenden Monat')+' in der TESTAUSWERTUNG zurücksetzen? Reale Zähler und Historie bleiben unverändert.'))return;
  command({type:'reset',kind,scope},'emtSettingsMessage');
 }
 function swapMeter(){
  const id=$('emtNewMeter').value.trim();if(!id)return message('emtSettingsMessage','Bitte neuen Wasserzähler-Datenpunkt auswählen.',true);
  if(!window.confirm('TESTINSTANZ 1: Wasserzähler wechseln zu '+id+'? Die bestehenden historischen Werte bleiben bestehen, und die Berechnung erhält eine neue Bezugsbasis.'))return;
  command({type:'waterSwap',stateId:id},'emtSettingsMessage');
 }
 document.addEventListener('DOMContentLoaded',init,{once:true});
})();
