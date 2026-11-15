'use strict';
(()=>{
 const N='energiemanagement.1.',P=N+'test.', $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=(v,d=2)=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('de-AT',{maximumFractionDigits:d,minimumFractionDigits:d}).format(v):'–';
 const date=ts=>ts?new Date(ts).toLocaleString('de-AT',{timeZone:'Europe/Vienna'}):'–';
 const ymd=ts=>new Date(ts).toLocaleDateString('sv-SE',{timeZone:'Europe/Vienna'});
 let sock=null,data={},ready=false,connected=false,year=Number(ymd(Date.now()).slice(0,4));
 const defaults={baseC:20,limitC:12,enableHdd:4,disableHdd:2,windowDays:7,minHoldMinutes:60,invert:false,targetId:'',externalEnabled:false};
 function state(id){return data[id]?.val}
 function json(id,fallback={}){try{return JSON.parse(state(id))}catch{return fallback}}
 function setText(id,v){if($(id))$(id).textContent=String(v)}
 function call(cmd,...args){return new Promise((resolve,reject)=>{if(!sock?.connected){reject(Error('ioBroker nicht verbunden'));return}
  const t=setTimeout(()=>reject(Error('Zeitüberschreitung')),12000);
  sock.emit(cmd,...args,(error,value)=>{clearTimeout(t);if(error)reject(Error(typeof error==='string'?error:JSON.stringify(error)));else resolve(value)})})}
 async function fetchOne(id){const s=await call('getState',id);if(s)data[id]=s;return s}
 async function write(id,value){await call('setState',id,{val:JSON.stringify(value),ack:false});data[id]={val:JSON.stringify(value),ack:false}}
 function panel(title,subtitle,contents,id){return '<article class="panel" id="'+id+'"><div class="panel-head"><div><div class="eyebrow">TESTSYSTEM · INSTANZ 1</div><h2>'+title+'</h2><p>'+subtitle+'</p></div></div>'+contents+'</article>'}
 function setup(){
  if(ready)return;ready=true;
  const banner=document.createElement('div');banner.id='emTestBanner';banner.textContent='TEST-ENTWICKLUNG · energiemanagement.1 · keine Hardware-Schaltbefehle';document.body.append(banner);
  const overview=$('page-overview');
  if(overview)overview.insertAdjacentHTML('afterbegin',panel('Heizbedarf · Heizgradtage','Heizbedarf aus vorhandener Außentemperatur und gespeicherten Heizgradtagen – Anzeige ist kein Geräte-Istzustand.',
   '<div class="emtest-kpis"><strong id="emHgtDemand">Noch keine gültigen Daten</strong><span id="emHgtOutside">Außentemperatur: –</span><span id="emHgtScore">Heizgradtage: –</span></div><small id="emHgtInfo">Auswertung wird geladen.</small>','emHgtOverview'));
  const regulation=$('page-regulation');
  if(regulation)regulation.insertAdjacentHTML('beforeend',
   '<details class="source-manager-group" id="regulationHeatingDegree"><summary><span class="source-group-icon">♨</span><span><strong>Heizgradtage</strong><small>Heizbedarf berechnen und optionalen TRUE/FALSE-Ausgang zuordnen</small></span></summary><div class="source-manager-body">'+
   panel('Heizgradtage-Regelung','Bestehende Außentemperatur, Raumfühler und Region werden übernommen. Ein optionaler Ausgang bleibt im Test deaktiviert.',
    '<div class="settings-grid"><label>Bezugsinnentemperatur (°C)<input id="emBase" type="number" min="15" max="26" step=".5"></label>'+
    '<label>Heizgrenze (°C)<input id="emLimit" type="number" min="-5" max="22" step=".5"></label>'+
    '<label>Heizfreigabe ab HGT (K·d/Tag)<input id="emEnable" type="number" min="0" max="30" step=".5"></label>'+
    '<label>Heizfreigabe aus unter HGT<input id="emDisable" type="number" min="0" max="30" step=".5"></label>'+
    '<label>Betrachtungszeitraum (Tage)<input id="emWindow" type="number" min="1" max="30" step="1"></label>'+
    '<label>Mindesthaltezeit (Minuten)<input id="emHold" type="number" min="0" max="1440" step="5"></label></div>'+
    '<label class="checkbox-line"><input id="emInvert" type="checkbox"> TRUE/FALSE-Wirkweise umkehren</label>'+
    '<label>Optionaler, bereits vorhandener Boolean-Schaltausgang <div class="out-row"><input id="emTarget" placeholder="adapter.0.ausgang" readonly><button type="button" class="button ghost" id="emPick">Auswählen</button><button type="button" class="button ghost" id="emTargetClear">Entfernen</button></div></label>'+
    '<p class="footnote">Die echte Hardwaresteuerung ist in diesem Test ausdrücklich gesperrt. Es wird ausschließlich der interne virtuelle Status geschrieben.</p>'+
    '<div class="savebar"><span id="emHgtStatus">Keine Änderungen</span><button type="button" class="button primary" id="emSave">Heizgradtage-Einstellungen speichern</button></div>'+
    '<div id="emHgtDetail" class="emtest-info"></div>','emHeatingSettings')+'</div></details>');
  const fuelPage=$('page-fuel');
  if(fuelPage)fuelPage.insertAdjacentHTML('afterbegin',panel('Brennstoff – letzter bekannter Gesamtzähler','Bleibt bei unverändertem Pelletsverbrauch sichtbar, auch wenn die Datenpunkt-Aktualisierung älter als 24 Stunden ist.',
   '<div class="emtest-kpis"><strong id="emFuelCounter">–</strong><span id="emFuelCounterInfo">Warte auf den letzten Zählerstand.</span></div>','emFuelLastCounter'));
  const analytics=$('page-analytics');
  if(analytics)analytics.insertAdjacentHTML('beforeend',
    panel('Wasserverbrauch · <span id="emWaterYear">'+year+'</span>','Aufgezeichneter Verbrauch pro Monat (m³). Messlücken sind gekennzeichnet.',
     '<div id="emWaterChart" class="emtest-chart"></div>','emWaterAnalytics')+
    panel('Brennstoffverbrauch · <span id="emFuelYear">'+year+'</span>','Aufgezeichneter Verbrauch pro Monat in der Einheit der gewählten Brennstoffart.',
     '<div id="emFuelChart" class="emtest-chart"></div>','emFuelAnalytics')+
    panel('Heizgradtage · <span id="emHgtYear">'+year+'</span>','Blaue Balken: Heizgradtage pro Monat. Grüne Linie: Monatsmittel der Außentemperatur.',
     '<div class="controls"><label>Auswertungsjahr <select id="emYear"></select></label></div><div id="emHgtChart" class="emtest-chart"></div>','emHgtAnalytics'));
  const settings=$('page-settings');
  if(settings)settings.insertAdjacentHTML('afterbegin',panel('Wasser- und Brennstoffzähler','Testfunktionen: Tages-/Monatsverbrauch zurücksetzen und Wasserzähler austauschen. Rohwerte werden beim Reset niemals beschrieben.',
   '<div class="settings-grid"><label>Bereich<select id="emResetKind"><option value="water">Wasser</option><option value="fuel">Brennstoff</option></select></label>'+
   '<label>Zurücksetzen<select id="emResetScope"><option value="day">Tagesverbrauch</option><option value="month">Monatsverbrauch</option><option value="both">Tages- und Monatsverbrauch</option></select></label></div>'+
   '<p id="emResetCurrent">Aktuelle Werte werden geladen …</p><button type="button" class="button ghost" id="emReset">Ausgewählte Verbrauchswerte zurücksetzen</button>'+
   '<div class="utility-period-divider"></div><h3>Wasserzähler wechseln</h3>'+
   '<p>Der alte Messwert bleibt im Archiv erhalten; der neue Zähler beginnt mit einer eigenen Bezugsbasis.</p>'+
   '<label>Neuer Wasserzähler-Datenpunkt <input id="emNewCounter" placeholder="adapter.0.neuerWasserzaehler"></label>'+
   '<button type="button" class="button ghost" id="emCounterPick">Datenpunkt auswählen</button> '+
   '<button type="button" class="button primary" id="emCounterChange">Wasserzählerwechsel prüfen und übernehmen</button>'+
   '<p id="emUtilityStatus" role="status">Noch keine Änderungen.</p>','emUtilityActions'));
  const select=$('emYear');for(let y=year;y>=year-5;y--){const o=document.createElement('option');o.value=String(y);o.textContent=String(y);select?.append(o)}
  select?.addEventListener('change',()=>{year=Number(select.value);render()});
  $('emPick')?.addEventListener('click',()=>{if(window.EnergyStatePicker?.open){window.EnergyStatePicker.open({type:'boolean',write:true,
    title:'Heizgradtage – optionalen Geräteausgang wählen',currentId:$('emTarget').value,
    onSelect:id=>{$('emTarget').value=id;setText('emHgtStatus','Ungespeicherte Änderungen')}})}
    else setText('emHgtStatus','Datenpunktbrowser nicht geladen.')});
  $('emCounterPick')?.addEventListener('click',()=>{if(window.EnergyStatePicker?.open){window.EnergyStatePicker.open({type:'number',write:false,title:'Neuen Wasserzähler auswählen',onSelect:id=>{$('emNewCounter').value=id}})}});
  $('emTargetClear')?.addEventListener('click',()=>{$('emTarget').value='';setText('emHgtStatus','Ungespeicherte Änderungen')});
  $('emSave')?.addEventListener('click',saveHgt);
  $('emReset')?.addEventListener('click',reset);
  $('emCounterChange')?.addEventListener('click',changeMeter);
  $('emResetKind')?.addEventListener('change',render);
  window.addEventListener('hashchange',render);
 }
 async function saveHgt(){
  const conf={baseC:+$('emBase').value,limitC:+$('emLimit').value,enableHdd:+$('emEnable').value,disableHdd:+$('emDisable').value,
   windowDays:+$('emWindow').value,minHoldMinutes:+$('emHold').value,invert:$('emInvert').checked,targetId:$('emTarget').value.trim(),externalEnabled:false};
  if(!Number.isFinite(conf.baseC)||!Number.isFinite(conf.limitC)||conf.baseC<=conf.limitC||conf.enableHdd<conf.disableHdd||conf.windowDays<1||conf.windowDays>30||conf.minHoldMinutes<0){
   setText('emHgtStatus','Ungültige Grenzwerte: Bezugswert > Heizgrenze, Freigabeschwelle ≥ Sperrschwelle erforderlich.');return}
  if(conf.targetId){const obj=await call('getObject',conf.targetId).catch(()=>null);if(obj?.type!=='state'||obj.common?.type!=='boolean'||obj.common.write!==true){setText('emHgtStatus','Der Ziel-Datenpunkt ist nicht beschreibbar oder kein Boolean.');return}}
  try{await write(P+'hgtConfig_JSON',conf);setText('emHgtStatus','Gespeichert – Geräteausgang bleibt deaktiviert.')}catch(e){setText('emHgtStatus','Fehler: '+e.message)}
 }
 async function reset(){
  const kind=$('emResetKind').value,scope=$('emResetScope').value;
  const arc=json(N+'analytics.utilitiesArchive_JSON',{days:{}}),util=json(N+'config.utilities_JSON',{fuel:{type:'pellets'}});
  const bucket=kind==='water'?'water':util.fuel?.type||'pellets',records=arc.days?.[bucket]||{};
  const d=ymd(Date.now()),m=d.slice(0,7),dayBaseline=records[d]?.value||0,monthBaseline=Object.entries(records).filter(([k])=>k.startsWith(m)).reduce((a,[,v])=>a+(v?.value||0),0);
  if(!confirm('Testinstanz 1: '+kind+' '+scope+' zurücksetzen? Tagesbasis '+fmt(dayBaseline)+' / Monatsbasis '+fmt(monthBaseline)+'. Rohzähler und abgeschlossene Historie bleiben unverändert.'))return;
  const adj=json(P+'utilityAdjustments_JSON',{version:1,resets:[],meterChanges:[]});
  adj.resets.push({ts:Date.now(),kind,scope,day:d,month:m,dayBaseline,monthBaseline});
  try{await write(P+'utilityAdjustments_JSON',adj);setText('emUtilityStatus','Reset gespeichert – neue Bezugsbasis gilt für die Testauswertung.');await refresh()}catch(e){setText('emUtilityStatus','Reset fehlgeschlagen: '+e.message)}
 }
 async function changeMeter(){
  const id=$('emNewCounter').value.trim();
  if(!id){setText('emUtilityStatus','Bitte neuen Wasserzähler-Datenpunkt wählen.');return}
  try{
   const obj=await call('getObject',id),s=await call('getState',id);
   if(obj?.type!=='state'||obj.common?.type!=='number'||obj.common.read===false||typeof s?.val!=='number'||!Number.isFinite(s.val)||s.ack!==true)
    throw Error('Der neue Datenpunkt ist kein gültiger lesbarer Zähler.');
   const cfg=json(N+'config.utilities_JSON',{});
   const old=cfg.water?.counterId||cfg.water?.stateId||'';
   if(id===old)throw Error('Der neue Datenpunkt entspricht dem bisherigen Wasserzähler.');
   const oldReading=old?await call('getState',old).catch(()=>null):null;
   if(!confirm('Wasserzählerwechsel in energiemanagement.1 wirklich durchführen?\nALT: '+old+' ('+fmt(oldReading?.val)+')\nNEU: '+id+' ('+fmt(s.val)+')\nDer physische Zähler wird NICHT beschrieben.'))return;
   cfg.water={...cfg.water,mode:'counter',counterId:id,stateId:id,counterUnit:obj.common?.unit==='l'?'l':'m³',unit:obj.common?.unit==='l'?'l':'m³'};
   await write(N+'config.utilities_JSON',cfg);
   let confirmed=false;
   for(let attempt=0;attempt<12;attempt++){
    await new Promise(resolve=>setTimeout(resolve,250));
    const current=await fetchOne(N+'config.utilities_JSON');
    try{const applied=JSON.parse(current?.val||'{}');if(current?.ack===true&&applied.water?.counterId===id){confirmed=true;break}}catch{}
   }
   if(!confirmed)throw Error('Adapter hat die neue Wasserzähler-Zuordnung nicht bestätigt. Bitte Testkonfiguration kontrollieren.');
   const adj=json(P+'utilityAdjustments_JSON',{version:1,resets:[],meterChanges:[]});
   adj.meterChanges.push({ts:Date.now(),oldId:old,newId:id,oldValue:oldReading?.val??null,newValue:s.val});
   await write(P+'utilityAdjustments_JSON',adj);
   setText('emUtilityStatus','Neuer Wasserzähler zugeordnet. Alte Historie bleibt erhalten.');
   await refresh();
  }catch(e){setText('emUtilityStatus','Wechsel fehlgeschlagen: '+e.message)}
 }
 function bars(months,unit,selectedYear){
  const rows=Array.from({length:12},(_,i)=>months?.[selectedYear+'-'+String(i+1).padStart(2,'0')]||null);
  if(!rows.some(Boolean))return '<p class="footnote">Für '+selectedYear+' liegen noch keine aufgezeichneten Monatswerte vor.</p>';
  const max=Math.max(0.01,...rows.map(r=>r?.value||0));
  return '<div class="emtest-bars">'+rows.map((r,i)=>'<div class="emtest-col" title="'+esc((i+1)+'. Monat: '+(r?fmt(r.value)+' '+unit:'keine Messwerte'))+'"><div class="emtest-bar'+(r?.partial?' emtest-partial':'')+'" style="height:'+Math.max(0,(r?.value||0)/max*155)+'px"></div><small>'+['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][i]+'</small></div>').join('')+'</div><p class="footnote">Blaue Balken: '+unit+'; gestrichelte Kennzeichnung bei teilweiser Erfassung.</p>';
 }
 function hgtChart(months,y){
  const records=Array.from({length:12},(_,i)=>months?.[y+'-'+String(i+1).padStart(2,'0')]||null);
  if(!records.some(Boolean))return '<p class="footnote">Für '+y+' liegen noch keine vollständigen Heizgradtage vor. Die Aufzeichnung beginnt jetzt auf der Testinstanz.</p>';
  const max=Math.max(1,...records.map(x=>x?.hgt||0));const width=840,height=255,base=210;
  const xmin=30,dx=64;
  let svg='<svg viewBox="0 0 840 260" role="img" aria-label="Heizgradtage als blaue Monatsbalken und mittlere Außentemperatur als grüne Linie" preserveAspectRatio="xMidYMid meet">';
  svg+='<line x1="24" y1="210" x2="800" y2="210" stroke="#8296a7" opacity=".5"/>';
  svg+='<text x="3" y="45" font-size="13" fill="#2547ef">'+fmt(max,1)+'</text><text x="3" y="215" font-size="13" fill="#2547ef">0</text>';
  svg+='<text x="790" y="92" font-size="13" fill="#12c95b">20 °C</text><text x="790" y="164" font-size="13" fill="#12c95b">0 °C</text><text x="790" y="200" font-size="13" fill="#12c95b">-10 °C</text>';
  for(let i=0;i<12;i++){const r=records[i],x=xmin+i*dx;const h=Math.max(0,((r?.hgt||0)/max)*170);
   if(r?.hgt!==null&&r){svg+='<rect x="'+x+'" y="'+(base-h)+'" width="34" height="'+h+'" fill="#2547ef"><title>'+esc(fmt(r.hgt)+' Grad-Tage')+'</title></rect>'}
   svg+='<text x="'+(x+17)+'" y="237" text-anchor="middle" font-size="15" fill="currentColor">'+(i+1)+'</text>';
  }
  const points=records.map((r,i)=>r?.outdoorAvg===null||!r?null:[xmin+i*dx+17,160-r.outdoorAvg*3.6]).filter(Boolean);
  for(let i=1;i<points.length;i++)svg+='<line x1="'+points[i-1][0]+'" y1="'+points[i-1][1]+'" x2="'+points[i][0]+'" y2="'+points[i][1]+'" stroke="#12c95b" stroke-width="3"/>';
  for(const [x,y2] of points)svg+='<circle cx="'+x+'" cy="'+y2+'" r="4" fill="#12c95b"/>';
  svg+='</svg><p class="footnote">Blau: K·d (linke Skala relativ zum Jahresmaximum). Grün: °C (separate Temperaturskala). Unvollständige Monate nicht als sichere Null interpretieren.</p>';
  return svg;
 }
 function render(){
  const h=json(P+'hgtSummary_JSON',{}),o=json(P+'hgtConfig_JSON',defaults),u=json(P+'utilitySummary_JSON',{}),utility=json(N+'config.utilities_JSON',{fuel:{type:'pellets'}});
  setText('emHgtDemand',h.demand===true?'Heizen empfohlen':h.demand===false?'Kein Heizbedarf':'Keine gültigen Daten');
  setText('emHgtOutside','Außentemperatur: '+fmt(h.outdoorTemp,1)+' °C');
  setText('emHgtScore','Heizgradtage: '+fmt(h.score)+' K·d/Tag');
  setText('emHgtInfo',h.message||'Warten auf Messdaten');
  setText('emHgtDetail','Bestehender Sensor: '+(h.sourceId||'nicht zugeordnet')+' · Region: '+(h.region||'unbekannt')+' · Ausgang: '+(o.targetId||'keiner')+' · Schalten im Test gesperrt');
  for(const [id,key] of [['emBase','baseC'],['emLimit','limitC'],['emEnable','enableHdd'],['emDisable','disableHdd'],['emWindow','windowDays'],['emHold','minHoldMinutes']]){
   if($(id)&&document.activeElement!==$(id))$(id).value=o[key]??defaults[key]}
  if($('emInvert'))$('emInvert').checked=o.invert===true;
  if($('emTarget'))$('emTarget').value=o.targetId||'';
  const y=String(year);for(const id of ['emWaterYear','emFuelYear','emHgtYear'])setText(id,y);
  if($('emYear'))$('emYear').value=y;
  setText('emResetCurrent','Wasser: heute '+fmt(u.types?.water?.day)+' m³ / Monat '+fmt(u.types?.water?.month)+' m³; Brennstoff: heute '+fmt(u.types?.fuel?.day)+' '+(u.types?.fuel?.unit||'kg')+' / Monat '+fmt(u.types?.fuel?.month));
  const fuelId=utility.fuel?.stateId||'',last=fuelId?data[fuelId]:null;
  const age=last?.ts?Date.now()-last.ts:null;
  const unit=utility.fuel?.type==='oil'?'l':utility.fuel?.type==='gas'?'m³':'kg';
  const isReadable=last&&last.ack===true&&typeof last.val==='number'&&Number.isFinite(last.val);
  setText('emFuelCounter',isReadable?fmt(last.val*(utility.fuel?.factor||1),3)+' '+unit:'Kein gültiger letzter Zählerstand');
  setText('emFuelCounterInfo',isReadable
   ?(age!==null&&age>86400000?'Letzter bekannter Stand (veraltet)':'Zuletzt erfasster Zählerstand')+
    ' · '+date(last.ts)+' · Datenpunkt '+fuelId
   :'Datenpunkt '+(fuelId||'nicht zugeordnet')+' liefert noch keinen bestätigten Zahlenwert.');
  if($('emWaterChart'))$('emWaterChart').innerHTML=bars(u.types?.water?.months,'m³',y);
  if($('emFuelChart'))$('emFuelChart').innerHTML=bars(u.types?.fuel?.months,u.types?.fuel?.unit||'kg',y);
  if($('emHgtChart'))$('emHgtChart').innerHTML=hgtChart(h.months,y);
 }
 async function refresh(){
  if(!connected)return;
  const ids=[N+'config.utilities_JSON',N+'analytics.utilitiesArchive_JSON',P+'hgtConfig_JSON',P+'hgtSummary_JSON',P+'utilitySummary_JSON',P+'utilityAdjustments_JSON'];
  await Promise.all(ids.map(id=>fetchOne(id).catch(()=>null)));
  const fuelId=json(N+'config.utilities_JSON',{fuel:{}}).fuel?.stateId;
  if(fuelId)await fetchOne(fuelId).catch(()=>null);
  render();
 }
 document.addEventListener('DOMContentLoaded',()=>{
  if(new URLSearchParams(location.search).get('instance')!=='energiemanagement.1')return;
  setup();
  if(!window.io?.connect){setText('emHgtInfo','ioBroker-WebSocket ist nicht geladen.');return}
  sock=window.io.connect(location.origin,{name:'Energiemanagement Test-Erweiterungen',reconnection:true,timeout:12000});
  sock.on('connect',()=>{connected=true;refresh().catch(e=>setText('emHgtInfo',e.message))});
  sock.on('disconnect',()=>{connected=false;setText('emHgtInfo','ioBroker-Verbindung unterbrochen')});
  setInterval(()=>refresh().catch(()=>{}),30000);
 });
})();