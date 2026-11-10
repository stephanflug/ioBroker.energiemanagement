'use strict';
/* Calendar energy cards. Values come from the adapter archive; this UI does not
 * estimate missing energy or reset cumulative meter readings. */
(() => {
 const $=id=>document.getElementById(id),host=$('energySummary');if(!host)return;
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const format=(v,d=2)=>finite(v)?new Intl.NumberFormat('de-AT',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v):'–';
 const energy=v=>finite(v)?format(v)+' kWh':'–';
 const watts=v=>!finite(v)?'–':Math.abs(v)>=1000?format(v/1000,1)+' kW':format(v,0)+' W';
 const timezone='Europe/Vienna',readOnly=new URLSearchParams(location.search).has('embed');
 const icons={house:'⌂',solar:'☀',import:'↙',export:'↗',battery:'▰',calendar:'▦',meter:'↔'};
 const metrics=[{key:'houseKWh',label:'Hausverbrauch',tone:'house',icon:'house'},{key:'pvKWh',label:'PV-Erzeugung',tone:'solar',icon:'solar'},{key:'importKWh',label:'Netzbezug',tone:'import',icon:'import'},{key:'exportKWh',label:'Einspeisung',tone:'export',icon:'export'}];
 let states={},N='energiemanagement.0',page=location.hash==='#analytics'?'analytics':'overview',api={},doc=null,config={monthlyPvTargetKWh:0},dirty=false,saving=false,lastDraftConfig=null;
 function jsonState(id,fallback){try{const v=states[N+'.'+id]?.val;return typeof v==='string'?JSON.parse(v):v??fallback}catch{return fallback}}
 function calendar(now=Date.now()){
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  return {day,month:day.slice(0,7),year:day.slice(0,4),monthLabel:new Date(day+'T12:00:00Z').toLocaleDateString('de-AT',{timeZone:timezone,month:'long',year:'numeric'}),dayLabel:new Date(now).toLocaleDateString('de-AT',{timeZone:timezone,day:'2-digit',month:'2-digit',year:'numeric'})};
 }
 function metricValue(period,key){const value=period?.metrics?.[key]?.value;return finite(value)&&value>=0?value:null}
 function currentPeriod(kind,keys){const p=doc?.periods?.[kind];return p&&p.key===keys[kind]?p:null}
 function metricTitle(period,key){
  const metric=period?.metrics?.[key];if(!metric||metricValue(period,key)===null)return 'Für diesen Zeitraum noch keine Messwerte vorhanden.';
  if(finite(metric.coveredSec)&&metric.coveredSec>0)return format(metric.coveredSec/3600,1)+' Stunden Messabdeckung'+(metric.partial?' · Teilweise erfasst':'');
  return 'Historische Aufzeichnung; die Messabdeckung ist nicht vollständig verfügbar.';
 }
 function metricMarkup(kind,item,hero=false){return '<div class="energy-summary-metric energy-tone-'+item.tone+(hero?' energy-metric-hero':'')+'" data-energy-metric="'+kind+'-'+item.key+'"><div class="energy-metric-line"><span><i aria-hidden="true">'+icons[item.icon]+'</i>'+item.label+'</span><strong id="es-'+kind+'-'+item.key+'">–</strong></div><div class="energy-metric-track" aria-hidden="true"><i id="es-bar-'+kind+'-'+item.key+'"></i></div></div>'}
 function periodMarkup(kind,title,id){return '<article id="'+id+'" class="panel energy-summary-panel energy-period-panel"><div class="energy-panel-head"><div><div class="energy-eyebrow">ERFASSTE ENERGIE</div><h3>'+title+'</h3></div><span id="es-label-'+kind+'" class="energy-calendar-label">–</span></div><div class="energy-period-values">'+metrics.map((item,i)=>metricMarkup(kind,item,i===0)).join('')+'</div><p id="es-note-'+kind+'" class="energy-summary-note">Noch keine Messwerte vorhanden.</p></article>'}
 host.classList.add('energy-summary');
 host.innerHTML='<div class="energy-summary-heading"><div><div class="eyebrow">TAG · MONAT · JAHR</div><h2>Kalenderübersicht</h2><p>Die Tages-, Monats- und Jahresansicht wechseln automatisch zum neuen Kalenderzeitraum. Vergangene Werte bleiben im Archiv erhalten.</p></div><span id="energySummaryFreshness" class="energy-summary-status" role="status">Messdaten werden geladen</span></div><div class="energy-summary-grid">'+
  periodMarkup('year','Jahresüberblick','energyYearPanel')+periodMarkup('month','Monatsüberblick','energyMonthPanel')+periodMarkup('day','Tagesüberblick','energyDayPanel')+
  '<article id="energyPvTargetPanel" class="panel energy-summary-panel energy-pv-target"><div class="energy-panel-head"><div><div class="energy-eyebrow">DEIN SOLARZIEL</div><h3>PV-Monatsziel</h3></div><span class="energy-panel-icon energy-tone-solar" aria-hidden="true">☀</span></div><span id="energyPvTargetMonth" class="energy-period-context">–</span><div class="energy-goal-value energy-tone-solar"><strong id="energyPvTargetActual">–</strong><span id="energyPvTargetTotal">Noch kein Ziel festgelegt</span></div><div id="energyPvTargetProgress" class="energy-goal-track" role="progressbar" aria-label="Erreichtes PV-Monatsziel" aria-valuemin="0" aria-valuemax="100"><i></i></div><div class="energy-goal-caption"><strong id="energyPvTargetPercent">–</strong><span id="energyPvTargetRemaining">Monatsziel frei festlegen</span></div><p id="energyPvTargetNote" class="energy-summary-note">Das Ziel wird jeden neuen Monat erneut verwendet.</p><details class="energy-goal-editor energy-summary-config" data-embed-hide><summary>Monatsziel einstellen <span aria-hidden="true">⌄</span></summary><form id="energyPvTargetForm"><label for="energyPvTargetInput">Monatliches PV-Ziel in kWh</label><div class="energy-goal-input-row"><input id="energyPvTargetInput" type="number" min="0" max="1000000" step="any" inputmode="decimal" placeholder="Kein Ziel" aria-describedby="energyPvTargetHelp"><button id="energyPvTargetSave" class="button primary" type="submit">Speichern</button></div><small id="energyPvTargetHelp">Gilt für jeden Monat. Leer oder 0 entfernt das Ziel.</small><div class="energy-goal-editor-bottom"><button id="energyPvTargetDiscard" class="button ghost" type="button">Verwerfen</button><span id="energyPvTargetSaveStatus" role="status" aria-live="polite">Keine Änderungen</span></div></form></details></article>'+
  '<article id="energyBatteryPanel" class="panel energy-summary-panel energy-battery-panel"><div class="energy-panel-head"><div><div class="energy-eyebrow">SPEICHERENERGIE</div><h3>Batterie heute</h3></div><span class="energy-panel-icon energy-tone-battery" aria-hidden="true">▰</span></div><span id="energyBatteryDate" class="energy-period-context">–</span><div class="energy-battery-values"><div class="energy-battery-value energy-tone-battery"><span><i aria-hidden="true">↓</i> Geladen</span><strong id="energyBatteryCharge">–</strong><div class="energy-metric-track" aria-hidden="true"><i id="energyBatteryChargeBar"></i></div></div><div class="energy-battery-value energy-tone-house"><span><i aria-hidden="true">↑</i> Entladen</span><strong id="energyBatteryDischarge">–</strong><div class="energy-metric-track" aria-hidden="true"><i id="energyBatteryDischargeBar"></i></div></div></div><div class="energy-battery-live"><span>Aktuelle Leistung</span><strong id="energyBatteryPower">–</strong><small id="energyBatteryDirection">Auf aktuelle Batteriemessung warten</small></div><p id="energyBatteryNote" class="energy-summary-note">Nur gültige Batteriemessungen werden erfasst.</p></article>'+
  '<article id="energyMeterPanel" class="panel energy-summary-panel energy-meter-panel"><div class="energy-panel-head"><div><div class="energy-eyebrow">AM NETZANSCHLUSS</div><h3>Smart Meter</h3></div><span class="energy-panel-icon energy-tone-import" aria-hidden="true">↔</span></div><div class="energy-meter-powers"><div class="energy-tone-import"><span>Netzbezug jetzt</span><strong id="energyMeterImportW">–</strong></div><div class="energy-tone-export"><span>Einspeisung jetzt</span><strong id="energyMeterExportW">–</strong></div></div><div class="energy-meter-counters"><div><span>Bezugszähler gesamt</span><strong id="energyMeterImportKWh">–</strong></div><div><span>Einspeisezähler gesamt</span><strong id="energyMeterExportKWh">–</strong></div></div><div class="energy-meter-phases" aria-label="Phasenleistungen"><div><small>L1</small><strong id="energyMeterPhase1">–</strong></div><div><small>L2</small><strong id="energyMeterPhase2">–</strong></div><div><small>L3</small><strong id="energyMeterPhase3">–</strong></div></div><p id="energyMeterNote" class="energy-summary-note">Gesamtzähler bleiben unverändert; Phasen zeigen Leistung in Watt.</p></article></div>';
 function validateImport(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Energieübersicht muss ein Konfigurationsobjekt sein.');
  const value=raw.monthlyPvTargetKWh??0;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000)throw Error('PV-Monatsziel muss eine Zahl zwischen 0 und 1.000.000 kWh sein.');
  return {monthlyPvTargetKWh:Math.round(value*1000)/1000};
 }
 function targetValue(raw){try{return validateImport(raw).monthlyPvTargetKWh}catch{return 0}}
 function syncTargetEditor(){
  const target=targetValue(config);if(dirty||saving)return;
  if(lastDraftConfig!==target){$('energyPvTargetInput').value=target>0?String(target):'';lastDraftConfig=target;}
 }
 function renderPeriod(kind,keys){
  const period=currentPeriod(kind,keys),values=metrics.map(item=>metricValue(period,item.key)),max=Math.max(1,...values.filter(finite));
  $('es-label-'+kind).textContent=kind==='year'?keys.year:kind==='month'?keys.monthLabel:keys.dayLabel;
  for(const item of metrics){const v=metricValue(period,item.key),element=$('es-'+kind+'-'+item.key);element.textContent=energy(v);element.title=metricTitle(period,item.key);$('es-bar-'+kind+'-'+item.key).style.width=(v===null?0:Math.min(100,v/max*100))+'%';}
  const hasData=values.some(finite),partial=metrics.some(item=>metricValue(period,item.key)===null||period?.metrics?.[item.key]?.partial===true),note=$('es-note-'+kind);
  note.classList.toggle('energy-summary-partial',hasData&&partial);
  note.textContent=!hasData?'Noch keine Messwerte in diesem Zeitraum.':partial?'Teilweise erfasst · fehlende Messungen werden nicht ergänzt.':'Erfasste Messwerte dieses Kalenderzeitraums.';
  if(hasData&&/^\d{4}-\d{2}-\d{2}$/.test(period?.recordedFromKey||''))note.textContent+=' Aufzeichnung ab '+period.recordedFromKey.split('-').reverse().join('.')+'.';
 }
 function renderGoal(keys){
  const month=currentPeriod('month',keys),actual=metricValue(month,'pvKWh'),target=targetValue(config),ratio=target>0&&actual!==null?actual/target*100:null;
  $('energyPvTargetMonth').textContent=keys.monthLabel;
  $('energyPvTargetActual').textContent=energy(actual);
  $('energyPvTargetTotal').textContent=target>0?'von '+energy(target)+' Monatsziel':'Noch kein Ziel festgelegt';
  const progress=$('energyPvTargetProgress');progress.classList.toggle('unset',ratio===null);progress.querySelector('i').style.width=(ratio===null?0:Math.max(0,Math.min(100,ratio)))+'%';
  if(ratio===null){progress.removeAttribute('aria-valuenow');progress.setAttribute('aria-valuetext',target>0?'Noch keine PV-Messwerte':'Kein Monatsziel festgelegt');}
  else {progress.setAttribute('aria-valuenow',Math.max(0,Math.min(100,ratio)));progress.setAttribute('aria-valuetext',format(ratio,1)+' Prozent des Monatsziels erreicht');}
  $('energyPvTargetPercent').textContent=ratio===null?'–':format(ratio,1)+' %';
  $('energyPvTargetRemaining').textContent=target<=0?'Monatsziel frei festlegen':actual===null?'Auf PV-Messwerte warten':actual>=target?'Monatsziel erreicht':'Noch '+energy(Math.max(0,target-actual));
  $('energyPvTargetNote').textContent=month?.metrics?.pvKWh?.partial&&actual!==null?'Fortschritt aus vorhandenen Messwerten · dieser Monat ist teilweise erfasst.':'Der Fortschritt beginnt jeden Monat neu; dein Ziel bleibt gespeichert.';
 }
 function freshLive(now){const age=now-Number(doc?.updatedAt);return finite(doc?.updatedAt)&&age>=-15000&&age<90000?doc.live||{}:{}}
 function renderBattery(keys,live){
  const period=currentPeriod('day',keys),charge=metricValue(period,'batteryChargeKWh'),discharge=metricValue(period,'batteryDischargeKWh'),max=Math.max(1,...[charge,discharge].filter(finite));
  $('energyBatteryDate').textContent=keys.dayLabel;
  $('energyBatteryCharge').textContent=energy(charge);$('energyBatteryDischarge').textContent=energy(discharge);
  $('energyBatteryChargeBar').style.width=(charge===null?0:charge/max*100)+'%';$('energyBatteryDischargeBar').style.width=(discharge===null?0:discharge/max*100)+'%';
  const power=finite(live.batteryW)?live.batteryW:null;
  $('energyBatteryPower').textContent=watts(power===null?null:Math.abs(power));
  $('energyBatteryDirection').textContent=power===null?'Keine aktuelle Batteriemessung':power<0?'Speicher wird geladen':power>0?'Speicher versorgt das Haus':'Speicher im Ruhezustand';
  $('energyBatteryNote').textContent=charge===null&&discharge===null?'Noch keine Batterieenergie aufgezeichnet. Batterieleistung unter Datenquellen zuordnen.':period?.metrics?.batteryChargeKWh?.partial||period?.metrics?.batteryDischargeKWh?.partial?'Aus gültigen Batteriemessungen · Messlücken bleiben unberücksichtigt.':'Tageswerte aus gültigen Batteriemessungen.';
 }
 function renderMeter(live){
  $('energyMeterImportW').textContent=watts(live.importW);$('energyMeterExportW').textContent=watts(live.exportW);
  $('energyMeterImportKWh').textContent=energy(live.importKWh);$('energyMeterExportKWh').textContent=energy(live.exportKWh);
  for(let i=1;i<=3;i++)$('energyMeterPhase'+i).textContent=watts(live['phase'+i+'W']);
  const anyPhase=[live.phase1W,live.phase2W,live.phase3W].some(finite);
  $('energyMeterNote').textContent=anyPhase?'Gesamtzähler bleiben unverändert · L1–L3 zeigen gemessene Leistung.':'Gesamtzähler bleiben unverändert · Phasenleistungen sind optional.';
 }
 function render(nextPage){
  page=nextPage||page;if(page!=='analytics')return;
  const now=Date.now(),keys=calendar(now),age=now-Number(doc?.updatedAt),fresh=finite(doc?.updatedAt)&&age>=-15000&&age<90000;
  for(const kind of ['year','month','day'])renderPeriod(kind,keys);
  renderGoal(keys);const live=freshLive(now);renderBattery(keys,live);renderMeter(live);syncTargetEditor();
  const status=$('energySummaryFreshness');status.classList.toggle('warn',!fresh);status.textContent=!doc?'Noch keine Aufzeichnung':fresh?'Messdaten aktuell':'Messdaten nicht aktuell';
  status.title=finite(doc?.updatedAt)?'Stand: '+new Date(doc.updatedAt).toLocaleString('de-AT',{timeZone:timezone}):'Die Aufzeichnung beginnt mit gültigen Messungen.';
 }
 function update(nextStates,namespace,nextPage,actions){
  states=nextStates||{};N=namespace||N;api=actions||api;doc=jsonState('analytics.energySummary_JSON',null);config=jsonState('config.energySummary_JSON',{monthlyPvTargetKWh:0});syncTargetEditor();render(nextPage);
 }
 function note(text,error=false){$('energyPvTargetSaveStatus').textContent=text;$('energyPvTargetSaveStatus').classList.toggle('error',error);}
 $('energyPvTargetInput').addEventListener('input',()=>{dirty=true;note('Ungespeicherte Änderungen');});
 $('energyPvTargetDiscard').addEventListener('click',()=>{dirty=false;lastDraftConfig=null;syncTargetEditor();note('Gespeichertes Monatsziel geladen.');});
 $('energyPvTargetForm').addEventListener('submit',async event=>{
  event.preventDefault();if(saving||readOnly)return;
  const input=$('energyPvTargetInput'),value=input.value.trim()===''?0:Number(input.value);
  if(!finite(value)||value<0||value>1000000||!input.validity.valid){input.focus();note('Bitte ein Monatsziel zwischen 0 und 1.000.000 kWh eingeben.',true);return;}
  saving=true;$('energyPvTargetSave').disabled=true;note('Monatsziel wird gespeichert …');
  try{
   if(typeof api.setVal!=='function')throw Error('ioBroker-Verbindung noch nicht bereit.');
   const next=validateImport({monthlyPvTargetKWh:value});await api.setVal('config.energySummary_JSON',JSON.stringify(next));
   if(typeof api.readVal==='function'){
    let confirmed=false;for(let attempt=0;attempt<6;attempt++){
     const state=await api.readVal('config.energySummary_JSON');let saved;try{saved=typeof state?.val==='string'?JSON.parse(state.val):state?.val}catch{}
     if(state?.ack===true&&saved?.monthlyPvTargetKWh===next.monthlyPvTargetKWh){confirmed=true;break;}
     if(attempt<5)await new Promise(resolve=>setTimeout(resolve,150));
    }
    if(!confirmed)throw Error('Das gespeicherte Ziel wurde noch nicht bestätigt. Bitte den aktuellen Wert prüfen.');
   }
   config=next;dirty=false;lastDraftConfig=null;note(value>0?'Monatsziel gespeichert.':'Monatsziel entfernt.');
  }catch(error){note('Speichern fehlgeschlagen: '+error.message,true)}finally{saving=false;$('energyPvTargetSave').disabled=false;syncTargetEditor();render(page);}
 });
 if(readOnly)host.querySelector('.energy-goal-editor').hidden=true;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render(page)});
 setInterval(()=>{if(!document.hidden)render(page)},15000);
 window.EnergySummaryUI={update,render,validateImport};
 render(page);
})();
