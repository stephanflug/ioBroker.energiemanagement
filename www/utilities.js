'use strict';
/* Optional read-only consumption views; only configuration is written. */
(() => {
 const $=id=>document.getElementById(id),settingsHost=$('optionalFeaturesSettings'),waterHost=$('waterContent'),fuelHost=$('fuelContent'),calendarHost=$('utilitiesCalendar');
 if(!settingsHost&&!waterHost&&!fuelHost&&!calendarHost)return;
 const finite=v=>typeof v==='number'&&Number.isFinite(v),copy=v=>JSON.parse(JSON.stringify(v));
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=(v,d=2)=>finite(v)?new Intl.NumberFormat('de-AT',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v):'–';
 const readOnly=new URLSearchParams(location.search).has('embed'),zone='Europe/Vienna';
 const fuelMeta={pellets:{name:'Pellets',unit:'kg',icon:'◉',tone:'pellets'},oil:{name:'Öl',unit:'l',icon:'◒',tone:'oil'},gas:{name:'Gas',unit:'m³',icon:'♨',tone:'gas'}};
 const defaults=()=>({water:{mode:'flow',stateId:'',unit:'l/min',factor:1,flowId:'',flowUnit:'l/min',flowFactor:1,counterId:'',counterUnit:'m³',counterFactor:1},fuel:{type:'pellets',mode:'counter',stateId:'',factor:1,rateTime:'h'}});
 const featureDefaults=()=>({water:false,rainwater:false,fuel:false,heating:false});
 let states={},N='energiemanagement.0',page=location.hash.slice(1)||'overview',api={},doc=null,stored=defaults(),features=featureDefaults(),draft=defaults(),featureDraft=featureDefaults();
 const dirty={water:false,fuel:false,features:false},saving={water:false,fuel:false,features:false},signatures={water:'',fuel:'',features:''};
 let initialized=false;
 let picker=null,pickerOpener=null,pickerResults=[],pickerLoading=false;
 const unitsFor=mode=>mode==='counter'?['m³','l']:['l/min','l/h','m³/h'];
 const idValid=id=>id===''||typeof id==='string'&&id.length<=255&&/^[A-Za-z0-9_][\w.:-]*$/.test(id)&&!id.startsWith('system.')&&!id.startsWith('energiemanagement.');
 function validateFeatures(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Optionale Bereiche müssen ein Konfigurationsobjekt sein.');
  const result=featureDefaults();for(const key of Object.keys(result)){if(raw[key]!==undefined&&typeof raw[key]!=='boolean')throw Error('Die Bereichsauswahl muss Boolean-Werte enthalten.');result[key]=raw[key]===true;}return result;
 }
 function syncWaterAliases(water){water.stateId=water[water.mode+'Id'];water.unit=water[water.mode+'Unit'];water.factor=water[water.mode+'Factor'];return water;}
 function validateImport(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Wasser und Brennstoff müssen ein Konfigurationsobjekt sein.');
  for(const kind of ['water','fuel'])if(raw[kind]!==undefined&&(!raw[kind]||typeof raw[kind]!=='object'||Array.isArray(raw[kind])))throw Error('Ungültige '+kind+'-Konfiguration.');
  const input=raw.water||{},fuel={...defaults().fuel,...(raw.fuel||{})},mode=input.mode===undefined?'flow':input.mode;
  if(!['flow','counter'].includes(mode))throw Error('Wasser: Bitte Durchfluss oder Zählerstand als Verbrauchsquelle wählen.');
  const canonicalUnit=value=>String(value).replace(/m3/g,'m³').trim();
  const validSource=(value,label)=>{if(typeof value!=='string'||!idValid(value.trim()))throw Error(label+': Bitte eine gültige externe Datenpunkt-ID verwenden.');return value.trim();};
  const validFactor=(value,label)=>{if(!finite(value)||value<=0||value>1000000)throw Error(label+': Der Faktor muss größer als 0 und höchstens 1.000.000 sein.');return value;};
  if(input.enabled!==undefined&&typeof input.enabled!=='boolean'||fuel.enabled!==undefined&&typeof fuel.enabled!=='boolean')throw Error('Freigaben müssen Boolean-Werte sein.');
  const legacyId=validSource(input.stateId===undefined?'':input.stateId,'Wasser'),legacyFactor=validFactor(input.factor===undefined?1:input.factor,'Wasser');
  const dual=['flowId','counterId','flowUnit','counterUnit','flowFactor','counterFactor'].some(key=>Object.hasOwn(input,key));
  const water={mode,
   flowId:validSource(dual?(input.flowId===undefined?'':input.flowId):mode==='flow'?legacyId:'','Durchfluss'),
   counterId:validSource(dual?(input.counterId===undefined?'':input.counterId):mode==='counter'?legacyId:'','Wasserzählerstand'),
   flowUnit:canonicalUnit(dual?(input.flowUnit===undefined?'l/min':input.flowUnit):mode==='flow'?(input.unit===undefined?'l/min':input.unit):'l/min'),
   counterUnit:canonicalUnit(dual?(input.counterUnit===undefined?'m³':input.counterUnit):mode==='counter'?(input.unit===undefined?'m³':input.unit):'m³'),
   flowFactor:validFactor(dual?(input.flowFactor===undefined?1:input.flowFactor):mode==='flow'?legacyFactor:1,'Durchfluss'),
   counterFactor:validFactor(dual?(input.counterFactor===undefined?1:input.counterFactor):mode==='counter'?legacyFactor:1,'Wasserzählerstand')};
  if(!unitsFor('flow').includes(water.flowUnit)||!unitsFor('counter').includes(water.counterUnit))throw Error('Wasser: Messart und Einheit passen nicht zusammen.');
  if(!['flow','counter'].includes(fuel.mode)||!Object.hasOwn(fuelMeta,fuel.type))throw Error('Brennstoff oder Messart ist ungültig.');
  fuel.stateId=validSource(fuel.stateId,'Brennstoff');fuel.factor=validFactor(fuel.factor,'Brennstoff');
  if(fuel.rateTime!=='h')throw Error('Brennstoff-Verbrauchsraten müssen je Stunde vorliegen.');
  const rainwater=raw.rainwater===undefined?{...defaults().water}:validateImport({water:raw.rainwater}).water;
  return {water:syncWaterAliases(water),rainwater,fuel:{type:fuel.type,mode:fuel.mode,stateId:fuel.stateId,factor:fuel.factor,rateTime:'h'}};
 }
 function json(id,fallback){try{const value=states[N+'.'+id]?.val;return typeof value==='string'?JSON.parse(value):value??fallback}catch{return fallback}}
 function keys(){const day=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return {day,month:day.slice(0,7),year:day.slice(0,4)}}
 const valueText=(value,unit)=>finite(value)?fmt(value,unit==='m³'?3:2)+' '+unit:'–';
 function amount(period){return finite(period?.value)&&period.value>=0?period.value:null}
 function validPeriod(source,kind,dateKeys){const item=source?.periods?.[kind];return item&&item.key===dateKeys[kind]?item:null}
 function status(id,text,error=false){const el=$(id);if(!el)return;el.textContent=String(text);el.classList.toggle('utility-error',error)}
 function metricRows(prefix){return '<div class="utility-period-values">'+[['day','Heute'],['month','Dieser Monat'],['year','Dieses Jahr']].map(([kind,label])=>'<div><span>'+label+'</span><strong id="'+prefix+'-'+kind+'">–</strong><small id="'+prefix+'-'+kind+'-note"></small></div>').join('')+'</div>'}
 function calendarCard(id,kind,title,icon){return '<article id="'+id+'" class="panel utility-calendar-card utility-tone-'+kind+'"><div class="utility-card-heading"><div><div class="eyebrow">WEITERE VERBRÄUCHE</div><h3 id="'+id+'Title">'+title+'</h3></div><span class="utility-card-icon" aria-hidden="true">'+icon+'</span></div>'+metricRows(kind+'Calendar')+'<p id="'+kind+'CalendarNote" class="utility-footnote">Die Kalenderperioden wechseln automatisch.</p></article>'}
 function saveBar(kind){return '<p id="'+kind+'UtilityHelp" class="utility-footnote"></p><div class="utility-save-bar"><span id="'+kind+'UtilityStatus" role="status" aria-live="polite">Keine Änderungen</span><button id="'+kind+'UtilityDiscard" type="button" class="button ghost">Verwerfen</button><button id="'+kind+'UtilitySave" type="submit" class="button primary">Einstellungen speichern</button></div>'}
 function waterInputMarkup(mode,title){const prefix='water'+(mode==='flow'?'Flow':'Counter');return '<section class="utility-source-block"><div class="eyebrow">'+(mode==='flow'?'DURCHFLUSS':'GESAMTZÄHLER')+'</div><h3>'+title+' <small>(optional)</small></h3><label class="utility-state-label">Datenpunkt<span class="utility-source-input"><input id="'+prefix+'Source" type="text" maxlength="255" placeholder="Datenpunkt-ID"><button id="'+prefix+'Pick" type="button" class="button ghost">Auswählen</button></span></label><div class="utility-form-grid"><label>Einheit des Datenpunkts<select id="'+prefix+'Unit">'+unitsFor(mode).map(unit=>'<option value="'+unit+'">'+unit+'</option>').join('')+'</select></label><label>Umrechnungsfaktor<input id="'+prefix+'Factor" type="number" min="0" max="1000000" step="any" value="1" inputmode="decimal"></label></div></section>'}
 function configMarkup(kind){
  if(kind==='water')return '<article class="panel utility-config" data-embed-hide><div class="panel-head"><div><div class="eyebrow">WASSER-DATENQUELLEN</div><h2>Durchfluss und Zählerstand</h2><p>Beide Messwerte können getrennt zugeordnet werden. Wähle eine Quelle für die Verbrauchsberechnung; der zweite Messwert dient zur Anzeige und wird nicht addiert.</p></div></div><form id="waterUtilityForm"><div class="utility-form-grid"><label>Verbrauch berechnen aus<select id="waterUtilityMode"><option value="flow">Durchfluss über die Zeit</option><option value="counter">Differenz des Gesamtzählers</option></select></label></div>'+waterInputMarkup('flow','Aktueller Durchfluss')+'<div class="utility-period-divider"></div>'+waterInputMarkup('counter','Wasserzählerstand')+saveBar('water')+'</form></article>';
  return '<article class="panel utility-config" data-embed-hide><div class="panel-head"><div><div class="eyebrow">MESSUNG EINRICHTEN</div><h2>Brennstoff-Datenpunkt</h2><p>Brennstoff auswählen und einen aufsummierten Verbrauchszähler oder eine Verbrauchsrate zuordnen.</p></div></div><form id="fuelUtilityForm"><div class="utility-form-grid"><label>Brennstoff<select id="fuelUtilityType"><option value="pellets">Pellets · kg</option><option value="oil">Öl · l</option><option value="gas">Gas · m³</option></select></label></div><div class="utility-form-grid"><label>Verbrauchsermittlung<select id="fuelUtilityMode"><option value="flow">Aus Verbrauchsrate berechnen</option><option value="counter">Aus Zählerstand berechnen</option></select></label><div class="utility-input-context"><span>Einheit des Datenpunkts</span><strong id="fuelUtilityInputUnit">kg</strong></div><label>Umrechnungsfaktor<input id="fuelUtilityFactor" type="number" min="0" max="1000000" step="any" value="1" inputmode="decimal"></label></div><label class="utility-state-label">Verbrauchszähler oder Verbrauchsrate<span class="utility-source-input"><input id="fuelUtilitySource" type="text" maxlength="255" placeholder="Datenpunkt-ID"><button id="fuelUtilityPick" type="button" class="button ghost">Auswählen</button></span></label>'+saveBar('fuel')+'</form></article>';
 }
 function liveMarkup(kind){const water=kind==='water';return '<article id="'+(water?'utilityWaterLivePanel':'utilityFuelLivePanel')+'" class="panel utility-live-card utility-tone-'+(water?'water':'pellets')+'"><div class="utility-card-heading"><div><div class="eyebrow">'+(water?'WASSER IM ÜBERBLICK':'BRENNSTOFF IM ÜBERBLICK')+'</div><h2 id="'+kind+'UtilityLiveTitle">'+(water?'Wasserverbrauch':'Pelletsverbrauch')+'</h2></div><span id="'+kind+'UtilityIcon" class="utility-card-icon" aria-hidden="true">'+(water?'◈':'◉')+'</span></div><div class="utility-live-values'+(water?' utility-water-live-values':'')+'"><div><span id="'+kind+'UtilityLiveLabel">Aktueller Messwert</span><strong id="'+kind+'UtilityLiveValue">–</strong><small id="'+kind+'UtilityLiveDetail">Noch kein Datenpunkt zugeordnet</small></div>'+(water?'<div><span>Wasserzähler gesamt</span><strong id="waterUtilityCounterValue">–</strong><small id="waterUtilityCounterDetail">Gesamtzähler wird nicht zurückgesetzt</small></div>':'')+'<div><span>Heute verbraucht</span><strong id="'+kind+'UtilityToday">–</strong><small id="'+kind+'UtilityTodayDetail">Aus gültigen Messungen</small></div></div><p id="'+kind+'UtilityLiveStatus" class="utility-reading-status" role="status">Messung noch nicht eingerichtet.</p><div class="utility-period-divider"></div>'+metricRows(kind+'Page')+'<p class="utility-footnote">Tag, Monat und Jahr wechseln automatisch nach Wiener Ortszeit. Gesamtzähler werden nicht zurückgesetzt.</p></article>'}
 if(settingsHost){settingsHost.classList.add('utility-ui');settingsHost.innerHTML='<article class="panel utility-feature-panel" data-embed-hide><div class="panel-head"><div><div class="eyebrow">OPTIONALE BEREICHE</div><h2>Deine Verbrauchsbereiche</h2><p>Aktiviere die Bereiche, die du im Menü und in der Energieauswertung sehen möchtest.</p></div></div><form id="utilityFeaturesForm"><div class="utility-feature-grid"><label><input id="featureWater" type="checkbox"><span><strong>Wasser freischalten</strong><small>Durchfluss, Zählerstand und Kalenderverbrauch</small></span></label><label><input id="featureRainwater" type="checkbox"><span><strong>Regenwasser freischalten</strong><small>Eigener Durchfluss, Zählerstand und Regenwasserverbrauch</small></span></label><label><input id="featureFuel" type="checkbox"><span><strong>Brennstoff freischalten</strong><small>Pellets in kg, Öl in l oder Gas in m³</small></span></label><label><input id="featureHeating" type="checkbox"><span><strong>Heizung & Gebäudepuffer freischalten</strong><small>Raumtemperaturen und Heizungsoptimierung</small></span></label></div><p class="utility-footnote">Ausblenden deaktiviert die Heizungsoptimierung. Beim Einblenden den Betrieb im Heizungsbereich einstellen.</p><div class="utility-save-bar"><span id="utilityFeaturesStatus" role="status" aria-live="polite">Keine Änderungen</span><button id="utilityFeaturesDiscard" type="button" class="button ghost">Verwerfen</button><button id="utilityFeaturesSave" type="submit" class="button primary">Bereichsauswahl speichern</button></div></form></article>';}
 if(waterHost){waterHost.classList.add('utility-ui');waterHost.innerHTML=liveMarkup('water')+configMarkup('water');}
 if(fuelHost){fuelHost.classList.add('utility-ui');fuelHost.innerHTML=liveMarkup('fuel')+configMarkup('fuel');}
 if(calendarHost){calendarHost.classList.add('utility-ui','utility-calendar-grid');calendarHost.innerHTML=calendarCard('utilityWaterCalendarPanel','water','Wasserverbrauch','◈')+calendarCard('utilityFuelCalendarPanel','fuel','Pelletsverbrauch','◉');}
 function bindForm(kind){
  if(!$(kind+'UtilityForm'))return;const value=draft[kind];
  $(kind+'UtilityMode').value=value.mode;
  if(kind==='water')for(const mode of ['flow','counter']){const prefix='water'+(mode==='flow'?'Flow':'Counter');$(prefix+'Source').value=value[mode+'Id'];$(prefix+'Unit').value=value[mode+'Unit'];$(prefix+'Factor').value=value[mode+'Factor'];}
  else {$('fuelUtilitySource').value=value.stateId;$('fuelUtilityFactor').value=value.factor;$('fuelUtilityType').value=value.type;}
  updateContext(kind);
 }
 function updateContext(kind){
  const c=draft[kind],isCounter=c.mode==='counter';
  if(kind==='water'){
   $('waterUtilityHelp').textContent=isCounter?'Der Verbrauch wird ausschließlich aus der Differenz des Wasserzählers berechnet. Ein zugeordneter Durchfluss bleibt zusätzlich sichtbar.':'Der Verbrauch wird ausschließlich aus dem Durchfluss berechnet. Ein zugeordneter Gesamtzähler bleibt zusätzlich sichtbar. Messlücken werden nicht überbrückt.';
  }else {const meta=fuelMeta[c.type];$('fuelUtilityInputUnit').textContent=meta.unit+(isCounter?'':'/h');$('fuelUtilityHelp').textContent=isCounter?'Der Datenpunkt muss den aufaddierten Verbrauch in '+meta.unit+' enthalten. Füllstand oder Restvorrat sind keine Verbrauchszähler.':'Der Datenpunkt muss die aktuelle Verbrauchsrate in '+meta.unit+'/h enthalten. Es erfolgt keine Umrechnung in kWh.';}
 }
 function syncForms(){
  for(const kind of ['water','fuel']){if(dirty[kind]||saving[kind])continue;const signature=JSON.stringify(stored[kind]);if(signature!==signatures[kind]){draft[kind]=copy(stored[kind]);signatures[kind]=signature;bindForm(kind);}}
  if(settingsHost&&!dirty.features&&!saving.features){const signature=JSON.stringify(features);if(signature!==signatures.features){featureDraft=copy(features);signatures.features=signature;for(const [key,id]of [['water','featureWater'],['rainwater','featureRainwater'],['fuel','featureFuel'],['heating','featureHeating']])$(id).checked=featureDraft[key];}}
 }
 function loadConfig(config){stored=validateImport(config);window.EnergyRainwaterUI?.loadConfig(stored.rainwater);for(const kind of ['water','fuel']){dirty[kind]=false;signatures[kind]='';}dirty.features=false;signatures.features='';syncForms();render(page);}
 function renderPeriods(prefix,source,unit,dateKeys){
  if(!$(prefix+'-day'))return;for(const kind of ['day','month','year']){const p=validPeriod(source,kind,dateKeys),value=amount(p);$(prefix+'-'+kind).textContent=valueText(value,unit);$(prefix+'-'+kind+'-note').textContent=value===null?'Noch keine Messwerte':p?.estimatedBoundary?'Zeitliche Zuordnung geschätzt':p?.partial?'Teilweise erfasst':'';}
 }
 function safeSource(kind){const source=doc?.[kind];if(!source||source.enabled===false)return null;if(kind==='fuel'&&source.type&&source.type!==stored.fuel.type)return null;return source;}
 function sourceFresh(source){const ts=finite(doc?.updatedAt)?doc.updatedAt:source?.updatedAt,age=Date.now()-ts;return finite(ts)&&age>=-15000&&age<90000;}
 function renderLive(kind,dateKeys){
  if(!$(kind+'UtilityLiveTitle'))return;const c=kind==='fuel'&&dirty.fuel?draft.fuel:stored[kind],meta=kind==='water'?{name:'Wasser',unit:'m³',icon:'◈',tone:'water'}:fuelMeta[c.type];
  let source=safeSource(kind);if(kind==='fuel'&&c.type!==stored.fuel.type)source=null;
  const mode=c.mode,live=sourceFresh(source)?source?.live||{}:{},counter=finite(live.counterValue)?live.counterValue:null,flow=finite(live.flowPerHour)?live.flowPerHour:null,day=validPeriod(source,'day',dateKeys),today=amount(day);
  const panel=$(kind==='water'?'utilityWaterLivePanel':'utilityFuelLivePanel');if(kind==='fuel'){panel.className=panel.className.replace(/utility-tone-(pellets|oil|gas)/g,'').trim()+' utility-tone-'+meta.tone;}
  $(kind+'UtilityLiveTitle').textContent=kind==='water'?'Wasserverbrauch':meta.name+'verbrauch';$(kind+'UtilityIcon').textContent=meta.icon;
  $(kind+'UtilityLiveLabel').textContent=kind==='water'?'Aktueller Durchfluss':mode==='counter'?'Aktueller Gesamtzähler':'Aktuelle Verbrauchsrate';
  $(kind+'UtilityLiveValue').textContent=kind==='water'?finite(flow)?fmt(flow*1000/60,2)+' l/min':'–':mode==='counter'?valueText(counter,meta.unit):valueText(flow,meta.unit+'/h');
  $(kind+'UtilityLiveDetail').textContent=kind==='water'?finite(flow)?valueText(flow,'m³/h'):stored.water.flowId?'Auf aktuelle Durchflussmessung warten':'Kein Durchfluss-Datenpunkt zugeordnet':mode==='counter'?'Der Gesamtzähler bleibt unverändert.':meta.unit+' pro Stunde';
  if(kind==='water'){$('waterUtilityCounterValue').textContent=valueText(counter,'m³');$('waterUtilityCounterDetail').textContent=counter!==null?fmt(counter*1000,1)+' l gesamt':stored.water.counterId?'Auf aktuellen Zählerstand warten':'Kein Zähler-Datenpunkt zugeordnet';}
  $(kind+'UtilityToday').textContent=valueText(today,meta.unit);$(kind+'UtilityTodayDetail').textContent=kind==='water'&&today!==null?fmt(today*1000,1)+' l':day?.partial?'Teilweise erfasst':'Aus gültigen Messungen';
  let message=source?.message||(!stored[kind].stateId?'Datenpunkt zuordnen und Einstellungen speichern.':'Warte auf gültige Messwerte.');
  if(kind==='fuel'&&c.type!==stored.fuel.type)message='Brennstoffauswahl geändert. Passenden Datenpunkt zuordnen und speichern.';
  else if(source&&!sourceFresh(source))message='Die aktuellen Messdaten sind veraltet. Verbrauchsarchive bleiben erhalten.';
  if(kind==='water')message+=' Verbrauchsberechnung: '+(stored.water.mode==='counter'?'Zählerdifferenz.':'Durchfluss.');
  $(kind+'UtilityLiveStatus').textContent=String(message);renderPeriods(kind+'Page',source,meta.unit,dateKeys);
 }
 function renderCalendar(kind,dateKeys){
  const panel=$(kind==='water'?'utilityWaterCalendarPanel':'utilityFuelCalendarPanel');if(!panel)return;panel.hidden=!features[kind];
  const meta=kind==='water'?{name:'Wasser',unit:'m³',tone:'water',icon:'◈'}:fuelMeta[stored.fuel.type],source=safeSource(kind);
  if(kind==='fuel'){panel.className=panel.className.replace(/utility-tone-(pellets|oil|gas)/g,'').trim()+' utility-tone-'+meta.tone;}
  $(panel.id+'Title').textContent=meta.name+'verbrauch';panel.querySelector('.utility-card-icon').textContent=meta.icon;
  renderPeriods(kind+'Calendar',source,meta.unit,dateKeys);
  const known=['day','month','year'].map(k=>validPeriod(source,k,dateKeys)).filter(p=>amount(p)!==null),partial=known.some(p=>p.partial),from=known.map(p=>p.recordedFromKey).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k||'')).sort()[0];
  $(kind+'CalendarNote').textContent=known.length?(partial?'Teilweise erfasst · fehlende Werte werden nicht ergänzt.':'Erfasster Verbrauch nach Kalenderzeitraum.')+(from?' Aufzeichnung ab '+from.split('-').reverse().join('.')+'.':''):'Die Aufzeichnung beginnt mit gültigen Messungen.';
 }
 function render(next){page=next||page;if(calendarHost)calendarHost.hidden=!features.water&&!features.fuel;const dateKeys=keys();if(page==='water')renderLive('water',dateKeys);if(page==='fuel')renderLive('fuel',dateKeys);if(page==='analytics'){renderCalendar('water',dateKeys);renderCalendar('fuel',dateKeys);}syncForms();}
 for(const id of ['featureWater','featureRainwater','featureFuel','featureHeating','utilityFeaturesSave','waterUtilitySave','fuelUtilitySave'])if($(id))$(id).disabled=true;
 function update(nextStates,namespace,nextPage,actions){
  states=nextStates||{};N=namespace||N;api=actions||api;doc=json('analytics.utilities_JSON',null);
  try{stored=validateImport(json('config.utilities_JSON',defaults()));}catch{stored=defaults();}
  const rawFeatures=json('config.features_JSON',null);try{features=rawFeatures?validateFeatures(rawFeatures):{water:false,rainwater:false,fuel:false,heating:true};}catch{features=featureDefaults();}
  initialized=true;for(const id of ['featureWater','featureRainwater','featureFuel','featureHeating'])if($(id))$(id).disabled=saving.features;for(const [kind,id]of [['features','utilityFeaturesSave'],['water','waterUtilitySave'],['fuel','fuelUtilitySave']])if($(id))$(id).disabled=saving[kind];
  syncForms();render(nextPage);
 }
 function writeLocal(id,value){states[N+'.'+id]={val:JSON.stringify(value),ack:true,ts:Date.now()};}
 async function saveSection(kind){
  if(saving[kind]||readOnly||!initialized)return;let config;try{config=validateImport({...stored,[kind]:draft[kind]})[kind];}catch(error){status(kind+'UtilityStatus',error.message,true);return;}
  const form=$(kind+'UtilityForm');if(!form.reportValidity())return;
  saving[kind]=true;for(const control of form.querySelectorAll('input,select,button'))control.disabled=true;status(kind+'UtilityStatus','Einstellungen werden geprüft …');
  try{if(!api.send)throw Error('ioBroker-Verbindung noch nicht bereit.');const response=await api.send('utilitiesConfigure',{section:kind,config});if(!response?.ok||!response.config)throw Error(response?.error||'Keine gültige Bestätigung.');stored=validateImport(response.config);writeLocal('config.utilities_JSON',stored);dirty[kind]=false;signatures[kind]='';status(kind+'UtilityStatus','Gespeichert. Die nächste Messung verwendet deine Auswahl.');}
  catch(error){status(kind+'UtilityStatus','Speichern fehlgeschlagen: '+error.message,true)}finally{saving[kind]=false;for(const control of form.querySelectorAll('input,select,button'))control.disabled=false;syncForms();render(page);}
 }
 const markSection=kind=>{dirty[kind]=true;status(kind+'UtilityStatus','Ungespeicherte Änderungen');};
 for(const kind of ['water','fuel'])if($(kind+'UtilityForm')){
  $(kind+'UtilityMode').addEventListener('change',event=>{draft[kind].mode=event.target.value;if(kind==='water')syncWaterAliases(draft.water);bindForm(kind);markSection(kind);render(page)});
  $(kind+'UtilityDiscard').addEventListener('click',()=>{dirty[kind]=false;signatures[kind]='';syncForms();status(kind+'UtilityStatus','Gespeicherte Einstellungen geladen.');render(page)});
  $(kind+'UtilityForm').addEventListener('submit',event=>{event.preventDefault();saveSection(kind)});
 }
 for(const mode of ['flow','counter']){const prefix='water'+(mode==='flow'?'Flow':'Counter');if(!$(prefix+'Source'))continue;
  $(prefix+'Source').addEventListener('input',event=>{draft.water[mode+'Id']=event.target.value;syncWaterAliases(draft.water);markSection('water')});
  $(prefix+'Unit').addEventListener('change',event=>{draft.water[mode+'Unit']=event.target.value;syncWaterAliases(draft.water);markSection('water')});
  $(prefix+'Factor').addEventListener('input',event=>{draft.water[mode+'Factor']=Number(event.target.value);syncWaterAliases(draft.water);markSection('water')});
  $(prefix+'Pick').addEventListener('click',event=>openPicker(mode==='flow'?'waterFlow':'waterCounter',event.currentTarget));
 }
 if($('fuelUtilityForm')){
  $('fuelUtilitySource').addEventListener('input',event=>{draft.fuel.stateId=event.target.value;markSection('fuel')});$('fuelUtilityFactor').addEventListener('input',event=>{draft.fuel.factor=Number(event.target.value);markSection('fuel')});
  $('fuelUtilityPick').addEventListener('click',event=>openPicker('fuel',event.currentTarget));
 }
 if($('fuelUtilityType'))$('fuelUtilityType').addEventListener('change',event=>{draft.fuel.type=event.target.value;draft.fuel.stateId='';bindForm('fuel');dirty.fuel=true;status('fuelUtilityStatus','Brennstoff geändert. Bitte den passenden Datenpunkt neu zuordnen.');render(page)});
 if(settingsHost){
  for(const [key,id]of [['water','featureWater'],['rainwater','featureRainwater'],['fuel','featureFuel'],['heating','featureHeating']])$(id).addEventListener('change',event=>{featureDraft[key]=event.target.checked;dirty.features=true;status('utilityFeaturesStatus','Ungespeicherte Änderungen')});
  $('utilityFeaturesDiscard').addEventListener('click',()=>{dirty.features=false;signatures.features='';syncForms();status('utilityFeaturesStatus','Gespeicherte Bereichsauswahl geladen.')});
  $('utilityFeaturesForm').addEventListener('submit',async event=>{
   event.preventDefault();if(saving.features||readOnly||!initialized)return;saving.features=true;for(const control of $('utilityFeaturesForm').querySelectorAll('input,button'))control.disabled=true;status('utilityFeaturesStatus','Bereichsauswahl wird gespeichert …');
   try{if(!api.send)throw Error('ioBroker-Verbindung noch nicht bereit.');const response=await api.send('featuresConfigure',{config:validateFeatures(featureDraft)});if(!response?.ok||!response.config)throw Error(response?.error||'Keine gültige Bestätigung.');features=validateFeatures(response.config);writeLocal('config.features_JSON',features);dirty.features=false;signatures.features='';status('utilityFeaturesStatus','Bereichsauswahl gespeichert.');window.dispatchEvent(new CustomEvent('energy-features-updated',{detail:copy(features)}));}
   catch(error){status('utilityFeaturesStatus','Speichern fehlgeschlagen: '+error.message,true)}finally{saving.features=false;for(const control of $('utilityFeaturesForm').querySelectorAll('input,button'))control.disabled=false;syncForms();render(page);}
  });
 }
 function ensurePicker(){
  if($('utilityStatePicker'))return;const dialog=document.createElement('dialog');dialog.id='utilityStatePicker';dialog.className='utility-picker';dialog.setAttribute('aria-labelledby','utilityPickerTitle');dialog.innerHTML='<div class="panel-head wrap"><div><div class="eyebrow">DATENPUNKT AUSWÄHLEN</div><h2 id="utilityPickerTitle">Messwert suchen</h2></div><button id="utilityPickerClose" type="button" class="button ghost">Schließen</button></div><form id="utilityPickerForm"><label for="utilityPickerQuery">Name oder Datenpunkt-ID</label><div class="utility-picker-search"><input id="utilityPickerQuery" type="search" maxlength="100" placeholder="Mindestens 2 Zeichen"><button id="utilityPickerSearch" type="submit" class="button primary">Suchen</button></div></form><p id="utilityPickerStatus" class="utility-footnote" role="status">Es werden lesbare Zahlen-Datenpunkte angezeigt.</p><div id="utilityPickerResults" class="utility-picker-results"></div>';document.body.append(dialog);
  $('utilityPickerClose').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{picker=null;pickerOpener?.focus()});$('utilityPickerForm').addEventListener('submit',event=>{event.preventDefault();searchPicker()});
  $('utilityPickerResults').addEventListener('click',event=>{const button=event.target.closest('[data-utility-result]');if(!button||!picker)return;const result=pickerResults[Number(button.dataset.utilityResult)];if(!result)return;const kind=picker==='fuel'?'fuel':'water';if(kind==='water'){draft.water[picker==='waterFlow'?'flowId':'counterId']=String(result.id);syncWaterAliases(draft.water);}else draft.fuel.stateId=String(result.id);dirty[kind]=true;bindForm(kind);status(kind+'UtilityStatus','Ungespeicherte Änderungen');dialog.close();});
 }
 function openPicker(kind,opener){if(readOnly)return;ensurePicker();picker=kind;pickerOpener=opener;$('utilityPickerTitle').textContent=kind==='waterFlow'?'Durchfluss-Datenpunkt suchen':kind==='waterCounter'?'Wasserzähler-Datenpunkt suchen':'Brennstoff-Datenpunkt suchen';$('utilityPickerQuery').value='';$('utilityPickerResults').replaceChildren();status('utilityPickerStatus','Es werden lesbare Zahlen-Datenpunkte angezeigt.');$('utilityStatePicker').showModal();$('utilityPickerQuery').focus();}
 async function searchPicker(){
  if(pickerLoading||!picker)return;const query=$('utilityPickerQuery').value.trim();if(query.length<2){status('utilityPickerStatus','Mindestens 2 Zeichen eingeben.');return;}pickerLoading=true;$('utilityPickerSearch').disabled=true;const target=picker;status('utilityPickerStatus','Messwerte werden gesucht …');
  try{if(!api.send)throw Error('Keine ioBroker-Verbindung.');const response=await api.send('utilityObjects',{query});if(picker!==target)return;if(response?.ok===false)throw Error(response.error||'Suche nicht verfügbar.');pickerResults=Array.isArray(response?.results)?response.results:[];$('utilityPickerResults').innerHTML=pickerResults.map((result,i)=>'<button type="button" data-utility-result="'+i+'"><strong>'+esc(result.name||result.id)+'</strong><small>'+esc(result.id)+'</small><small>'+esc((result.unit||'Ohne Einheit')+(finite(result.value)?' · '+fmt(result.value,3):''))+'</small></button>').join('');status('utilityPickerStatus',pickerResults.length?pickerResults.length+' Treffer. Passenden Messwert auswählen.':'Keine passenden Datenpunkte gefunden. Die ID kann auch direkt eingetragen werden.');}
  catch(error){status('utilityPickerStatus','Suche fehlgeschlagen: '+error.message,true)}finally{pickerLoading=false;$('utilityPickerSearch').disabled=false;}
 }
 if(readOnly)for(const el of document.querySelectorAll('.utility-config,.utility-feature-panel'))el.hidden=true;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render(page)});setInterval(()=>{if(!document.hidden)render(page)},15000);
 window.EnergyUtilitiesUI={update,render,validateImport,validateFeatures,loadConfig};syncForms();render(page);
})();
