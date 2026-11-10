'use strict';
/* Independent rainwater consumption: measurements stay separate from tap water. */
(() => {
 const $=id=>document.getElementById(id),host=$('rainwaterContent');if(!host)return;
 const finite=v=>typeof v==='number'&&Number.isFinite(v),copy=v=>JSON.parse(JSON.stringify(v));
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=(v,d=2)=>finite(v)?new Intl.NumberFormat('de-AT',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v):'–';
 const readOnly=new URLSearchParams(location.search).has('embed'),zone='Europe/Vienna';
 const defaults=()=>({mode:'flow',stateId:'',unit:'l/min',factor:1,flowId:'',flowUnit:'l/min',flowFactor:1,counterId:'',counterUnit:'m³',counterFactor:1});
 const aliases=c=>Object.assign(c,{stateId:c[c.mode+'Id'],unit:c[c.mode+'Unit'],factor:c[c.mode+'Factor']});
 let states={},N='energiemanagement.0',page=location.hash.slice(1)||'overview',api={},stored=defaults(),draft=defaults(),doc=null,enabled=false,dirty=false,saving=false,initialized=false,signature='',pickerTarget=null,pickerOpener=null,results=[],searching=false;
 function json(id,fallback){try{const value=states[N+'.'+id]?.val;return typeof value==='string'?JSON.parse(value):value??fallback}catch{return fallback}}
 function validate(config){return window.EnergyUtilitiesUI.validateImport({water:config}).water;}
 function note(text,error=false){$('rainwaterUtilityStatus').textContent=String(text);$('rainwaterUtilityStatus').classList.toggle('utility-error',error);}
 function sourceMarkup(mode,title){const prefix='rainwater'+(mode==='flow'?'Flow':'Counter'),units=mode==='flow'?['l/min','l/h','m³/h']:['m³','l'];return '<section class="utility-source-block"><h3>'+title+' <small>(optional)</small></h3><label class="utility-state-label">Datenpunkt<span class="utility-source-input"><input id="'+prefix+'Source" type="text" maxlength="255" placeholder="Datenpunkt-ID"><button id="'+prefix+'Pick" type="button" class="button ghost">Auswählen</button></span></label><div class="utility-form-grid"><label>Einheit des Datenpunkts<select id="'+prefix+'Unit">'+units.map(u=>'<option value="'+u+'">'+u+'</option>').join('')+'</select></label><label>Umrechnungsfaktor<input id="'+prefix+'Factor" type="number" min="0" max="1000000" step="any" inputmode="decimal" value="1"></label></div></section>';}
 host.classList.add('utility-ui','rainwater-ui');
 host.innerHTML='<article id="utilityRainwaterLivePanel" class="panel rainwater-live-panel"><div class="utility-card-heading"><div><div class="eyebrow">REGENWASSER IM ÜBERBLICK</div><h2>Regenwasserverbrauch</h2><p class="rainwater-intro">Regenwassernutzung getrennt vom Trinkwasser erfassen.</p></div><span class="utility-card-icon" aria-hidden="true">☂</span></div><div class="rainwater-live-grid"><div><span>Aktueller Durchfluss</span><strong id="rainwaterUtilityLiveValue">–</strong><small id="rainwaterUtilityLiveDetail">Noch kein Durchfluss-Datenpunkt zugeordnet</small></div><div><span>Regenwasserzähler gesamt</span><strong id="rainwaterUtilityCounterValue">–</strong><small id="rainwaterUtilityCounterDetail">Der Gesamtzähler bleibt unverändert</small></div></div><p id="rainwaterUtilityLiveStatus" class="utility-reading-status" role="status">Messung noch nicht eingerichtet.</p></article><article id="utilityRainwaterPeriodsPanel" class="panel rainwater-period-panel"><div class="eyebrow">ERFASSTER VERBRAUCH</div><h2>Tag, Monat und Jahr</h2><div class="utility-period-values">'+[['day','Heute'],['month','Dieser Monat'],['year','Dieses Jahr']].map(([kind,label])=>'<div><span>'+label+'</span><strong id="rainwaterPage-'+kind+'">–</strong><small id="rainwaterPage-'+kind+'-note"></small></div>').join('')+'</div><p class="utility-footnote">Kalenderperioden wechseln automatisch nach Wiener Ortszeit. Regenwasser und Trinkwasser werden getrennt erfasst; Messlücken werden nicht als Verbrauch geschätzt.</p></article><article id="rainwaterConfigPanel" class="panel utility-config rainwater-ui" data-embed-hide><div class="panel-head"><div><div class="eyebrow">REGENWASSER-DATENQUELLEN</div><h2>Durchfluss und Zählerstand</h2><p>Ordne beide Werte unabhängig zu. Eine gewählte Methode berechnet den Verbrauch; der zusätzliche Messwert wird zur Anzeige verwendet.</p></div></div><form id="rainwaterUtilityForm"><div class="utility-form-grid"><label>Verbrauch berechnen aus<select id="rainwaterUtilityMode"><option value="flow">Durchfluss über die Zeit</option><option value="counter">Differenz des Gesamtzählers</option></select></label></div>'+sourceMarkup('flow','Aktueller Regenwasser-Durchfluss')+'<div class="utility-period-divider"></div>'+sourceMarkup('counter','Regenwasserzählerstand')+'<p id="rainwaterUtilityHelp" class="utility-footnote"></p><div class="utility-save-bar"><span id="rainwaterUtilityStatus" role="status" aria-live="polite">Daten werden geladen …</span><button id="rainwaterUtilityDiscard" type="button" class="button ghost">Verwerfen</button><button id="rainwaterUtilitySave" type="submit" class="button primary">Einstellungen speichern</button></div></form></article>';
 function bind(){
  $('rainwaterUtilityMode').value=draft.mode;
  for(const mode of ['flow','counter']){const prefix='rainwater'+(mode==='flow'?'Flow':'Counter');$(prefix+'Source').value=draft[mode+'Id'];$(prefix+'Unit').value=draft[mode+'Unit'];$(prefix+'Factor').value=draft[mode+'Factor'];}
  $('rainwaterUtilityHelp').textContent=draft.mode==='counter'?'Verbrauch ausschließlich aus der Zählerdifferenz. Der Durchfluss bleibt zusätzlich sichtbar. Ein Füllstand ist kein Verbrauchszähler.':'Verbrauch ausschließlich aus dem Durchfluss über die Zeit. Der Gesamtzähler bleibt zusätzlich sichtbar.';
 }
 function availability(){for(const el of $('rainwaterUtilityForm').querySelectorAll('input,select,button'))el.disabled=readOnly||!initialized||saving||!enabled;}
 function sync(){if(dirty||saving)return;const next=JSON.stringify(stored);if(signature!==next){signature=next;draft=copy(stored);bind();}}
 function mark(){dirty=true;note('Ungespeicherte Änderungen');}
 function loadConfig(config){stored=validate(config||{});dirty=false;signature='';sync();render(page);}
 function render(next){
  page=next||page;if(page!=='rainwater'&&page!=='sources')return;
  const current=doc?.rainwater,source=current&&current.enabled!==false?current:null,age=Date.now()-doc?.updatedAt,fresh=finite(doc?.updatedAt)&&age>=-15000&&age<90000,live=fresh?source?.live||{}:{};
  const flow=live.flowPerHour,counter=finite(live.counterValue)?live.counterValue:live.counter;
  $('rainwaterUtilityLiveValue').textContent=finite(flow)?fmt(flow*1000/60)+' l/min':'–';
  $('rainwaterUtilityLiveDetail').textContent=finite(flow)?fmt(flow,3)+' m³/h':stored.flowId?'Auf aktuelle Durchflussmessung warten':'Kein Durchfluss-Datenpunkt zugeordnet';
  $('rainwaterUtilityCounterValue').textContent=finite(counter)?fmt(counter,3)+' m³':'–';
  $('rainwaterUtilityCounterDetail').textContent=finite(counter)?fmt(counter*1000,1)+' l gesamt':stored.counterId?'Auf aktuellen Zählerstand warten':'Kein Zähler-Datenpunkt zugeordnet';
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),keys={day,month:day.slice(0,7),year:day.slice(0,4)};
  for(const kind of ['day','month','year']){const p=source?.periods?.[kind],valid=p?.key===keys[kind]&&finite(p.value)&&p.value>=0;$('rainwaterPage-'+kind).textContent=valid?fmt(p.value,3)+' m³':'–';$('rainwaterPage-'+kind+'-note').textContent=!valid?'Noch keine Messwerte':fmt(p.value*1000,1)+' l'+(p.estimatedBoundary?' · Zeitliche Zuordnung geschätzt':p.partial?' · Teilweise erfasst':'');}
  let message=!enabled?'Regenwasser ist unter Einstellungen ausgeblendet.':source?.message||(!stored.stateId?'Regenwasser-Messquelle unter Datenquellen zuordnen.':'Warte auf gültige Messwerte.');
  if(enabled&&source&&!fresh)message='Aktuelle Regenwasser-Messdaten sind veraltet. Verbrauchsarchive bleiben erhalten.';
  $('rainwaterUtilityLiveStatus').textContent=message+' Verbrauchsberechnung: '+(stored.mode==='counter'?'Zählerdifferenz.':'Durchfluss.');
 }
 async function save(){
  if(saving||readOnly||!initialized||!enabled)return;let config;
  try{config=validate(draft);}catch(error){note(error.message,true);return;}if(!$('rainwaterUtilityForm').reportValidity())return;
  saving=true;for(const el of $('rainwaterUtilityForm').querySelectorAll('input,select,button'))el.disabled=true;note('Regenwasser-Zuordnungen werden geprüft …');
  try{if(!api.send)throw Error('ioBroker-Verbindung noch nicht bereit.');const response=await api.send('utilitiesConfigure',{section:'rainwater',config});if(!response?.ok||!response.config)throw Error(response?.error||'Keine gültige Bestätigung.');stored=validate(response.config.rainwater);states[N+'.config.utilities_JSON']={val:JSON.stringify(response.config),ack:true,ts:Date.now()};dirty=false;signature='';note('Gespeichert. Die nächste Messung verwendet deine Auswahl.');}
  catch(error){note('Speichern fehlgeschlagen: '+error.message,true);}finally{saving=false;availability();sync();render(page);}
 }
 $('rainwaterUtilityForm').addEventListener('submit',event=>{event.preventDefault();save();});
 $('rainwaterUtilityMode').addEventListener('change',event=>{draft.mode=event.target.value;aliases(draft);bind();mark();});
 $('rainwaterUtilityDiscard').addEventListener('click',()=>{if(saving)return;dirty=false;signature='';sync();note('Gespeicherte Einstellungen geladen.');});
 for(const mode of ['flow','counter']){const prefix='rainwater'+(mode==='flow'?'Flow':'Counter');
  $(prefix+'Source').addEventListener('input',event=>{draft[mode+'Id']=event.target.value;aliases(draft);mark();});
  $(prefix+'Unit').addEventListener('change',event=>{draft[mode+'Unit']=event.target.value;aliases(draft);mark();});
  $(prefix+'Factor').addEventListener('input',event=>{draft[mode+'Factor']=event.target.value.trim()===''?NaN:Number(event.target.value);aliases(draft);mark();});
  $(prefix+'Pick').addEventListener('click',event=>openPicker(mode,event.currentTarget));
 }
 function ensurePicker(){
  if($('rainwaterStatePicker'))return;const dialog=document.createElement('dialog');dialog.id='rainwaterStatePicker';dialog.className='utility-picker';dialog.setAttribute('aria-labelledby','rainwaterPickerTitle');dialog.innerHTML='<div class="panel-head wrap"><h2 id="rainwaterPickerTitle">Regenwasser-Messwert suchen</h2><button id="rainwaterPickerClose" type="button" class="button ghost">Schließen</button></div><form id="rainwaterPickerForm"><label for="rainwaterPickerQuery">Name oder Datenpunkt-ID</label><div class="utility-picker-search"><input id="rainwaterPickerQuery" type="search" maxlength="100" placeholder="Mindestens 2 Zeichen"><button id="rainwaterPickerSearch" type="submit" class="button primary">Suchen</button></div></form><p id="rainwaterPickerStatus" class="utility-footnote" role="status"></p><div id="rainwaterPickerResults" class="utility-picker-results"></div>';document.body.append(dialog);
  $('rainwaterPickerClose').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{pickerTarget=null;pickerOpener?.focus();});$('rainwaterPickerForm').addEventListener('submit',event=>{event.preventDefault();search();});
  $('rainwaterPickerResults').addEventListener('click',event=>{const button=event.target.closest('[data-rainwater-result]');if(!button||!pickerTarget||readOnly||saving||!enabled)return;const result=results[Number(button.dataset.rainwaterResult)];if(!result)return;draft[pickerTarget+'Id']=String(result.id);aliases(draft);bind();mark();dialog.close();});
 }
 function openPicker(mode,opener){if(readOnly||saving||!initialized||!enabled)return;ensurePicker();pickerTarget=mode;pickerOpener=opener;$('rainwaterPickerTitle').textContent=mode==='flow'?'Regenwasser-Durchfluss suchen':'Regenwasserzähler suchen';$('rainwaterPickerQuery').value='';$('rainwaterPickerResults').replaceChildren();$('rainwaterPickerStatus').textContent='Lesbare Zahlen-Datenpunkte suchen.';$('rainwaterStatePicker').showModal();$('rainwaterPickerQuery').focus();}
 async function search(){
  if(searching||!pickerTarget||readOnly||!enabled)return;const query=$('rainwaterPickerQuery').value.trim();if(query.length<2){$('rainwaterPickerStatus').textContent='Mindestens 2 Zeichen eingeben.';return;}const target=pickerTarget;searching=true;$('rainwaterPickerSearch').disabled=true;$('rainwaterPickerStatus').textContent='Messwerte werden gesucht …';
  try{if(!api.send)throw Error('ioBroker-Verbindung noch nicht bereit.');const response=await api.send('utilityObjects',{query});if(pickerTarget!==target)return;if(response?.ok===false)throw Error(response.error||'Suche nicht verfügbar.');results=(Array.isArray(response?.results)?response.results:[]).filter(result=>!result.type||result.type==='number');$('rainwaterPickerResults').innerHTML=results.map((result,index)=>'<button type="button" data-rainwater-result="'+index+'"><strong>'+esc(result.name||result.id)+'</strong><small>'+esc(result.id)+'</small><small>'+esc(result.unit||'Ohne Einheit')+'</small></button>').join('');$('rainwaterPickerStatus').textContent=results.length?results.length+' Treffer. Passenden Datenpunkt auswählen.':'Keine passenden Datenpunkte gefunden.';}
  catch(error){$('rainwaterPickerStatus').textContent='Suche fehlgeschlagen: '+error.message;}finally{searching=false;$('rainwaterPickerSearch').disabled=false;}
 }
 function update(nextStates,namespace,nextPage,actions){
  states=nextStates||{};N=namespace||N;api=actions||api;enabled=json('config.features_JSON',{}).rainwater===true;doc=json('analytics.utilities_JSON',null);
  try{stored=validate(json('config.utilities_JSON',{}).rainwater||{});initialized=!!states[N+'.config.utilities_JSON'];}catch(error){initialized=false;note('Ungültige Regenwasser-Einstellungen: '+error.message,true);}
  sync();availability();if(!enabled&&$('rainwaterStatePicker')?.open)$('rainwaterStatePicker').close();
  if(initialized&&!dirty&&!saving&&$('rainwaterUtilityStatus').textContent==='Daten werden geladen …')note('Keine Änderungen');render(nextPage);
 }
 if(readOnly)$('rainwaterConfigPanel').hidden=true;
 window.addEventListener('energy-features-updated',event=>{enabled=event.detail?.rainwater===true;availability();if(!enabled&&$('rainwaterStatePicker')?.open)$('rainwaterStatePicker').close();render(page);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render(page);});setInterval(()=>{if(!document.hidden)render(page);},15000);
 window.EnergyRainwaterUI={update,render,loadConfig};bind();for(const el of $('rainwaterUtilityForm').querySelectorAll('input,select,button'))el.disabled=true;
})();
