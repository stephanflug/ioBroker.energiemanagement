'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const copy=x=>JSON.parse(JSON.stringify(x));
 const format=(x,d=1)=>finite(x)?new Intl.NumberFormat('de-AT',{maximumFractionDigits:d,minimumFractionDigits:d}).format(x):'–';
 const temp=x=>finite(x)?format(x)+' °C':'–';
 const watt=x=>finite(x)?format(x,0)+' W':'–';
 function defaults(){return {enabled:false,hardwareEnabled:false,mode:'observe',rooms:[],outdoorId:'',pump:{lockId:'',lockOn:true,statusId:'',powerId:'',armed:false},circuits:[],sensorMaxAgeSec:1800,outdoorMaxAgeSec:3600,minValidRooms:1,minCoveragePct:80,hysteresisC:0.4,coldRoomToleranceC:0.7,frostOutdoorC:3,minRoomC:18,minOnMin:30,minOffMin:20,maxLockMin:120,learningEnabled:true,pv:{enabled:false,minExportW:800,minCoveragePct:80,reserveW:300,heatPumpPowerW:2000,boostC:1,maxRoomC:23,maxFloorC:28,floorId:'',allowEstimatedFloor:false,startHour:10,endHour:16,eveningHour:18,stableMin:5}};}
 let states={},N='energiemanagement.0',api={},page='overview',draft=defaults(),loaded=false,dirty=false,saving=false,savedSignature='',pickerTarget=null,pickerOpener=null,pickerResults=[],searching=false;
 const state=(id,def)=>states[N+'.'+id]?.val??def;
 function json(id,def){try{const value=state(id,null);return typeof value==='string'?JSON.parse(value):value??def}catch{return def}}
 function getPath(obj,path){return path.split('.').reduce((o,k)=>o?.[k],obj)}
 function setPath(obj,path,value){const parts=path.split('.');let into=obj;for(const key of parts.slice(0,-1))into=into[key];into[parts.at(-1)]=value;}
 function note(text,error=false){for(const el of new Set([$('heatingConfigStatus'),...document.querySelectorAll('[data-heating-config-status]')]))if(el){el.textContent=text;el.classList.toggle('heating-error',error)}}
 function dirtyText(text){for(const el of new Set([$('heatingDirty'),...document.querySelectorAll('[data-heating-dirty]')]))if(el)el.textContent=text}
 function savingControls(value){for(const el of new Set([$('heatingSave'),...document.querySelectorAll('[data-heating-save]')]))if(el)el.disabled=value}
 function markDirty(){dirty=true;dirtyText('Ungespeicherte Änderungen')}
 function bindValues(root){for(const input of root.querySelectorAll('[data-h-path]')){const value=getPath(draft,input.dataset.hPath);if(input.type==='checkbox')input.checked=value===true;else input.value=value??'';}}
 function field(path,label,type='number',writable=false,help=''){
  const wrapper=document.createElement('div');wrapper.className='heating-field';
  wrapper.innerHTML='<label>'+esc(label)+'<span class="heating-state-input"><input type="text" maxlength="255" data-h-path="'+esc(path)+'" placeholder="Datenpunkt-ID"><button type="button" class="button ghost" data-h-pick="'+esc(path)+'" data-h-type="'+type+'" data-h-write="'+writable+'">Auswählen</button></span></label>'+(help?'<small>'+esc(help)+'</small>':'');
  return wrapper;
 }
 function input(path,label,min,max,step='0.1'){
  return '<label>'+esc(label)+'<input type="number" data-h-path="'+esc(path)+'" min="'+min+'" max="'+max+'" step="'+step+'"></label>';
 }
 function roomCard(room,index){
  const card=document.createElement('div');card.className='heating-editor-card';card.dataset.roomId=room.id;
  card.innerHTML='<div class="heating-editor-head"><strong>Raumfühler '+(index+1)+'</strong><button type="button" class="button ghost" data-h-remove-room="'+index+'">Entfernen</button></div><div class="heating-grid"><label>Beschriftung<input type="text" maxlength="80" data-h-path="rooms.'+index+'.name"></label>'+input('rooms.'+index+'.targetC','Raumziel (°C)',10,28)+input('rooms.'+index+'.weight','Gewichtung',0.1,100,'0.1')+'</div><label class="heating-check"><input type="checkbox" data-h-path="rooms.'+index+'.enabled"> Diesen Raum einbeziehen</label>';
  card.append(field('rooms.'+index+'.stateId','Raumtemperatur (°C)','number',false));
  const reading=document.createElement('small');reading.className='heating-row-reading';reading.dataset.hRoomReading=room.id;reading.textContent='Noch keine aktuelle Auswertung';card.append(reading);return card;
 }
 function circuitCard(circuit,index){
  const card=document.createElement('div');card.className='heating-editor-card';
  card.innerHTML='<div class="heating-editor-head"><strong>Heizkreis '+(index+1)+'</strong><button type="button" class="button ghost" data-h-remove-circuit="'+index+'">Entfernen</button></div><div class="heating-grid"><label>Beschriftung<input type="text" maxlength="80" data-h-path="circuits.'+index+'.name"></label>'+input('circuits.'+index+'.baseC','Normaler Raumsollwert (°C)',10,30)+input('circuits.'+index+'.minC','Minimaler Raumsollwert (°C)',5,30)+input('circuits.'+index+'.maxC','Maximaler Raumsollwert (°C)',10,35)+input('circuits.'+index+'.stepC','Schrittweite je Anpassung (°C)',0.1,2)+input('circuits.'+index+'.gain','Korrektur je Raum-Abweichung',0,3,'0.1')+'</div>';
  card.append(field('circuits.'+index+'.setpointId','Beschreibbarer Regelungs-Raumsollwert (°C)','number',true,'Nur zentrale Raum-Solltemperatur zuordnen, keine Vorlauf-, Kessel- oder Warmwassertemperatur.'));
  const arm=document.createElement('label');arm.className='heating-check';arm.innerHTML='<input type="checkbox" data-h-path="circuits.'+index+'.armed"> Automatische Sollwertänderungen für diesen Heizkreis freigeben';card.append(arm);return card;
 }
 function renderEditors(){
  $('heatingRooms').replaceChildren(...draft.rooms.map(roomCard));
  if(!draft.rooms.length)$('heatingRooms').innerHTML='<div class="heating-empty">Noch keine Raumfühler angelegt. Füge die für dein Gebäude wichtigen Räume hinzu.</div>';
  $('heatingCircuits').replaceChildren(...draft.circuits.map(circuitCard));
  if(!draft.circuits.length)$('heatingCircuits').innerHTML='<div class="heating-empty">Keine Heizkreise zugeordnet. Raumbeobachtung funktioniert auch ohne Sollwert-Ausgänge.</div>';
  bindValues(document);updateControls();
 }
 function loadConfig(raw){
  const base=defaults(),c=raw&&typeof raw==='object'?raw:base;
  draft={...base,...copy(c),pump:{...base.pump,...copy(c.pump||{})},pv:{...base.pv,...copy(c.pv||{})},rooms:Array.isArray(c.rooms)?copy(c.rooms):[],circuits:Array.isArray(c.circuits)?copy(c.circuits):[]};
  loaded=true;dirty=false;savedSignature=JSON.stringify(c);renderEditors();dirtyText('Keine Änderungen');
 }
 function updateControls(){
  $('heatingHardwareEnabled').disabled=!draft.enabled||draft.mode!=='auto';
  $('heatingAddRoom').disabled=draft.rooms.length>=64;$('heatingAddCircuit').disabled=draft.circuits.length>=16;
 }
 function uniqueId(prefix,items){for(let i=1;i<=1000;i++)if(!items.some(x=>x.id===prefix+i))return prefix+i;return prefix+Date.now();}
 function validateConfig(config){
  if(!config||typeof config!=='object'||!Array.isArray(config.rooms)||!Array.isArray(config.circuits)||!config.pump||!config.pv)throw Error('Ungültige Heizungs-Konfiguration.');
  if(!['observe','auto'].includes(config.mode))throw Error('Ungültige Betriebsart.');
  if(config.rooms.length>64||config.circuits.length>16)throw Error('Maximal 64 Raumfühler und 16 Heizkreise sind möglich.');
  const ids=new Set();for(const room of config.rooms){if(!/^[a-z][a-z0-9_]{1,47}$/.test(room.id)||ids.has(room.id))throw Error('Raum-IDs müssen eindeutig sein.');ids.add(room.id);if(!finite(room.weight)||room.weight<=0||!finite(room.targetC))throw Error('Gewichtung und Zieltemperatur aller Räume prüfen.');}
  ids.clear();for(const circuit of config.circuits){if(!/^[a-z][a-z0-9_]{1,47}$/.test(circuit.id)||ids.has(circuit.id))throw Error('Heizkreis-IDs müssen eindeutig sein.');ids.add(circuit.id);if(![circuit.baseC,circuit.minC,circuit.maxC,circuit.stepC,circuit.gain].every(finite)||circuit.minC>circuit.baseC||circuit.baseC>circuit.maxC||circuit.stepC<=0)throw Error('Heizkreis-Grenzen prüfen: Minimum ≤ Normalwert ≤ Maximum und positive Schrittweite.');}
  const numbers=['sensorMaxAgeSec','outdoorMaxAgeSec','minValidRooms','minCoveragePct','hysteresisC','coldRoomToleranceC','frostOutdoorC','minRoomC','minOnMin','minOffMin','maxLockMin'];
  for(const key of numbers)if(!finite(config[key]))throw Error('Komfort- und Laufzeitgrenzen vollständig eingeben.');
  for(const [key,val]of Object.entries(config.pv))if(!['enabled','floorId','allowEstimatedFloor'].includes(key)&&!finite(val))throw Error('PV-Puffergrenzen vollständig eingeben.');
  if(config.pv.startHour>=config.pv.endHour)throw Error('Das Ende des Vorwärmfensters muss nach dem Beginn liegen.');
  if(config.enabled&&!config.rooms.some(r=>r.enabled&&r.stateId))throw Error('Mindestens einen aktivierten Raumfühler mit Temperatur-Datenpunkt zuordnen.');
  if(config.enabled&&!config.outdoorId)throw Error('Für die Heizungsbewertung einen Außenfühler zuordnen.');
  return config;
 }
 async function save(){
  if(saving)return;saving=true;savingControls(true);
  try{
   const config=validateConfig(copy(draft));
   const invalid=[...document.querySelectorAll('input[type=number][data-h-path]')].find(input=>!input.validity.valid);
   if(invalid){for(let node=invalid.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;const section=invalid.closest('.page');if(section?.classList.contains('hidden')){location.hash=section.id.replace('page-','');requestAnimationFrame(()=>invalid.focus());}else invalid.focus();throw Error('Ein Zahlenwert liegt außerhalb des angezeigten Bereichs.');}
   if(!api.send)throw Error('ioBroker-Verbindung noch nicht bereit.');
   note('Einstellungen werden geprüft und gespeichert …');
   const response=await api.send('heatingConfigure',{config});
   if(!response?.ok||!response.config)throw Error(response?.error||'Keine gültige Bestätigung des Adapters.');
   loadConfig(response.config);note(response.config.enabled?'Gespeichert. Die nächste Auswertung verwendet deine Einstellungen.':'Gespeichert. Die Heizungsfunktion ist deaktiviert.');
  }catch(e){note('Speichern fehlgeschlagen: '+e.message,true)}finally{saving=false;savingControls(false)}
 }
 function readingRows(status){
  const rooms=Array.isArray(status.rooms)?status.rooms:[];
  $('heatingRoomReadings').innerHTML=rooms.length?rooms.map(r=>'<div class="heating-reading'+(r.valid?'':' warn')+'"><strong>'+esc(r.name||r.id)+'</strong><span>'+esc(r.valid?temp(r.valueC):'–')+'</span><small>'+esc(r.valid?'Raumziel '+temp(r.targetC)+' · Gewichtung '+format(r.weight,1):r.reason||'Keine gültige Messung')+'</small></div>').join(''):'';
  for(const element of $('heatingRooms').querySelectorAll('[data-h-room-reading]')){const r=rooms.find(x=>x.id===element.dataset.hRoomReading);element.textContent=r?(r.valid?'Aktuell '+temp(r.valueC)+' · Ziel '+temp(r.targetC):r.reason||'Messung nicht verfügbar'):'Noch keine aktuelle Auswertung';element.classList.toggle('warn',!r?.valid)}
  const circuits=Array.isArray(status.circuits)?status.circuits:[];
  $('heatingCircuitReadings').innerHTML=circuits.map(c=>'<div class="heating-reading"><strong>'+esc(c.name||c.id)+'</strong><span>Empfohlen: '+esc(temp(c.targetC))+'</span><small>'+esc(c.reason||'')+'</small></div>').join('');
 }
 function renderTrend(){
  if(window.EnergyHeatingTrend){window.EnergyHeatingTrend.update(states,N);return;}
  const raw=json('heating.history',[]),now=Date.now(),points=(Array.isArray(raw)?raw:[]).filter(p=>p&&finite(p.ts)&&p.ts>=now-86400000&&p.ts<=now+15000).sort((a,b)=>a.ts-b.ts);
  const series=[{key:'meanC',name:'Raummittelwert',color:'#78d9ce'},{key:'targetC',name:'Raumziel',color:'#e8c17a',dash:true}];
  if($('heatingTrendOutdoor').checked)series.push({key:'outdoorC',name:'Außentemperatur',color:'#87bcf0'});
  const values=points.flatMap(p=>series.map(s=>p[s.key]).filter(finite)),host=$('heatingTrend');
  if(!points.length||!values.length){host.innerHTML='<div class="heating-empty">Noch kein Temperaturverlauf vorhanden. Die Aufzeichnung beginnt mit gültigen Raumwerten.</div>';return;}
  const W=1000,H=230,L=60,R=18,T=15,B=35,min=values.reduce((a,b)=>Math.min(a,b),values[0])-0.5,max=values.reduce((a,b)=>Math.max(a,b),values[0])+0.5;
  const start=points[0].ts,end=Math.max(start+60000,points.at(-1).ts),x=ts=>L+(ts-start)/(end-start)*(W-L-R),y=v=>H-B-(v-min)/(max-min)*(H-T-B);
  let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Temperaturverlauf von Räumen und Raumziel"><title>Temperaturverlauf in Grad Celsius</title>';
  for(let i=0;i<=3;i++){const v=min+(max-min)*i/3,yy=y(v);svg+='<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="#34516a"/><text x="'+(L-8)+'" y="'+(yy+4)+'" text-anchor="end">'+esc(format(v))+' °C</text>';}
  for(const s of series){let path='',last=null;for(const p of points){const value=p[s.key];if(!finite(value)){last=null;continue;}path+=(last&&p.ts-last<=180000?'L':'M')+x(p.ts).toFixed(1)+','+y(value).toFixed(1)+' ';last=p.ts;}
   svg+='<path d="'+path+'" stroke="'+s.color+'" stroke-width="2"'+(s.dash?' stroke-dasharray="7 5"':'')+' fill="none" vector-effect="non-scaling-stroke"><title>'+esc(s.name)+'</title></path>';
   if(points.length===1&&finite(points[0][s.key]))svg+='<circle cx="'+x(start)+'" cy="'+y(points[0][s.key])+'" r="3" fill="'+s.color+'"/>';
  }
  for(let i=0;i<=4;i++){const ts=start+(end-start)*i/4;svg+='<text x="'+x(ts)+'" y="'+(H-10)+'" text-anchor="'+(i===0?'start':i===4?'end':'middle')+'">'+esc(new Date(ts).toLocaleTimeString('de-AT',{timeZone:'Europe/Vienna',hour:'2-digit',minute:'2-digit'}))+'</text>';}
  host.innerHTML=svg+'</svg>';
 }
 function renderStatus(){
  const config=json('config.heating',defaults()),status=json('heating.status',{}),hardware=json('heating.hardware',{}),now=Date.now();
  const fresh=finite(status.ts)&&now-status.ts>=-15000&&now-status.ts<180000;
  const mapped=Array.isArray(status.rooms)&&config.rooms?.every(room=>status.rooms.some(r=>r.id===room.id&&r.stateId===room.stateId));
  const current=fresh&&config.enabled===true&&status.enabled!==false&&mapped;
  const badge=$('heatingModeBadge');badge.textContent=!config.enabled?'Ausgeschaltet':!current?'Warte auf aktuelle Messung':config.mode==='observe'?'Beobachtungsbetrieb':config.hardwareEnabled?'Automatik mit Gerätefreigabe':'Automatik ohne Gerätefreigabe';badge.classList.toggle('active',current);
  $('heatingMean').textContent=current?temp(status.meanC):'–';$('heatingMin').textContent=current?temp(status.minC):'–';$('heatingOutdoor').textContent=current?temp(status.outdoorC):'–';
  $('heatingCoverage').textContent=current?'Gültige Fühler-Gewichtung: '+format(status.coveragePct,0)+' %':config.rooms?.length?config.rooms.length+' Raumfühler konfiguriert':'Noch keine Raumfühler';
  const coldest=current?(status.rooms||[]).filter(r=>r.valid&&finite(r.valueC)).sort((a,b)=>a.valueC-b.valueC)[0]:null;
  $('heatingMinName').textContent=coldest?coldest.name||coldest.id:'Komfortschutz je Raum';
  $('heatingTarget').textContent='Gewichtetes Raumziel: '+(current?temp(status.targetMeanC):'–');
  const learning=current?status.learning||{}:{};const confidence={insufficient:'Noch wenig Lerndaten',developing:'Gebäudemodell lernt',usable:'Gebäudemodell auswertbar'};
  $('heatingEvening').textContent=current?temp(learning.predictedEveningC):'–';$('heatingModelConfidence').textContent=config.learningEnabled?confidence[learning.confidence]||'Gebäudemodell lernt noch':'Lernen deaktiviert';
  $('heatingReason').textContent=!config.enabled?'Diese optionale Funktion ist ausgeschaltet. Raumfühler und Außenfühler zuordnen und zunächst die Beobachtung aktivieren.':!current?'Auf aktuelle, zur gespeicherten Fühlerauswahl passende Messungen warten.':status.reason||'Heizbedarf wird ausgewertet.';
  $('heatingPumpAdvice').textContent=!current?'Keine aktuelle Empfehlung':status.pumpLock?'Heizpause empfohlen':'Heizung nicht sperren';
  $('heatingPumpState').textContent=current&&typeof status.pump?.running==='boolean'?(status.pump.running?'Raumheizbetrieb ist aktiv':'Raumheizbetrieb ist nicht aktiv')+' · seit '+format(status.pump.observedMinutes,0)+' Min.':'Betriebsrückmeldung fehlt oder ist veraltet';
  const pv=current?status.pv||{}:{},pvReady=pv.active===true||pv.eligible===true&&pv.stable===true&&finite(pv.boostC)&&pv.boostC>0;
  $('heatingPvAdvice').textContent=!config.pv?.enabled?'Deaktiviert':!current?'Warte auf aktuelle Auswertung':pvReady?(pv.hardwareAllowed?'Vorwärmung empfohlen':'Nur Empfehlung – Freigabe fehlt'):pv.reason||'Vorwärmung aktuell nicht empfohlen';
  $('heatingPvPower').textContent=current&&config.pv?.enabled?'Verfügbar '+watt(pv.availableW)+' · PV-Anteil '+format(pv.coveragePct,0)+' % · Anhebung '+format(pv.boostC)+' °C'+(pv.reason?' · '+pv.reason:''):'Überschuss und Komfortgrenzen werden gemeinsam bewertet';
  const hardwareCandidate=typeof hardware==='string'?hardware:hardware.summary||hardware.message||hardware.status||'';
  const hardwareMessage=typeof hardwareCandidate==='string'?hardwareCandidate:'';
  $('heatingHardwareStatus').textContent=hardwareMessage||(!config.hardwareEnabled||config.mode==='observe'?'Beobachtungsbetrieb: Es werden keine Geräte verändert.':'Gerätesteuerung nur für einzeln freigegebene und gültige Ausgänge.');
  const moduleError=state('heating.error','');$('heatingError').textContent=String(moduleError||'');$('heatingError').classList.toggle('hidden',!moduleError);
  $('heatingOutputDetails').innerHTML=(Array.isArray(hardware.outputs)?hardware.outputs:[]).map(o=>{const label=config.pump?.lockId===o.id?'Wärmepumpen-Freigabe':config.circuits?.find(c=>c.setpointId===o.id)?.name||o.id;return '<div class="heating-reading"><strong>'+esc(label)+'</strong><small>'+esc(o.status||'')+(o.value===undefined?'':' · '+esc(typeof o.value==='number'?temp(o.value):String(o.value)))+'</small></div>'}).join('');
  readingRows(current?status:{});
  const heatSamples=finite(learning.heatingSamples)?learning.heatingSamples:0,coolSamples=finite(learning.coolingSamples)?learning.coolingSamples:0;
  $('heatingLearningStatus').innerHTML='<div><small>Auswertbare Heizphasen</small><strong>'+heatSamples+'</strong></div><div><small>Auswertbare Abkühlphasen</small><strong>'+coolSamples+'</strong></div><div><small>Beobachtetes Aufheizen</small><strong>'+esc(finite(learning.heatingRateKph)?format(learning.heatingRateKph)+' °C/h':'Noch nicht bestimmt')+'</strong></div><p>'+esc(learning.note||'Für das Lernen sind gültige Raum- und Außenwerte sowie eine eindeutige Raumheizungs-Rückmeldung erforderlich.')+(learning.windowSuspected?' Auffälliger Temperaturabfall: mögliches Lüften.':'')+'</p>';
  if(page==='heating')renderTrend();
  $('heatingUpdated').textContent=fresh?'Auswertung: '+new Date(status.ts).toLocaleString('de-AT',{timeZone:'Europe/Vienna',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Noch keine aktuelle Heizungs-Auswertung';
 }
 function render(next){page=next||page;if(page==='heating'||page==='sources')renderStatus();else if(pickerTarget)pickerClose(false);}
 function update(next,forms,namespace,nextPage,actions){
  states=next||{};N=namespace||N;api=actions||api;
  const stored=json('config.heating',null);if(stored&&(!loaded||!dirty&&savedSignature!==JSON.stringify(stored)))loadConfig(stored);
  render(nextPage);
 }
 function pickerClose(restore=true){$('heatingStatePicker').classList.add('hidden');document.body.classList.remove('heating-picker-open');pickerTarget=null;pickerResults=[];if(restore&&pickerOpener?.isConnected)pickerOpener.focus({preventScroll:true});}
 async function pickerSearch(){
  if(searching||!pickerTarget)return;
  const query=$('heatingPickerQuery').value.trim();if(query.length<2){$('heatingPickerInfo').textContent='Mindestens zwei Zeichen für die Suche eingeben.';return;}
  searching=true;$('heatingPickerSearch').disabled=true;$('heatingPickerInfo').textContent='Datenpunkte werden gesucht …';
  const target=pickerTarget;
  try{
   if(!api.send)throw Error('ioBroker-Verbindung noch nicht bereit.');
   const response=await api.send('heatingObjects',{query,type:target.type,write:target.write,limit:30});
   if(pickerTarget!==target)return;
   if(response?.ok===false)throw Error(response.error||'Suche nicht verfügbar.');
   pickerResults=Array.isArray(response)?response:Array.isArray(response?.results)?response.results:[];
   $('heatingPickerResults').innerHTML=pickerResults.map((r,i)=>'<button type="button" class="heating-picker-result" data-h-result="'+i+'"><strong>'+esc(r.name||r.id)+'</strong><small>'+esc(r.id)+'</small><small>'+esc([r.type,r.unit,r.write?'beschreibbar':'Messwert'].filter(Boolean).join(' · '))+'</small></button>').join('');
   $('heatingPickerInfo').textContent=pickerResults.length?pickerResults.length+' Treffer. Passenden Datenpunkt auswählen.':'Keine passenden Datenpunkte gefunden. Suchbegriff ändern oder ID direkt eingeben.';
  }catch(e){$('heatingPickerInfo').textContent='Suche fehlgeschlagen: '+e.message}finally{searching=false;$('heatingPickerSearch').disabled=false;}
 }
 function pickerOpen(button){
  pickerOpener=button;pickerTarget={path:button.dataset.hPick,type:button.dataset.hType,write:button.dataset.hWrite==='true'};
  $('heatingPickerTitle').textContent=pickerTarget.write?'Beschreibbaren Datenpunkt auswählen':'Messwert-Datenpunkt auswählen';$('heatingPickerQuery').value=getPath(draft,pickerTarget.path)||'';$('heatingPickerResults').replaceChildren();$('heatingPickerInfo').textContent=pickerTarget.type==='boolean'?'Boolean-Zustand suchen. Bedeutung des Wertes am Gerät prüfen.':'Temperatur in °C beziehungsweise elektrische Leistung in W passend zum Feld auswählen.';
  $('heatingStatePicker').classList.remove('hidden');document.body.classList.add('heating-picker-open');$('heatingPickerQuery').focus();
 }
 document.addEventListener('input',event=>{
  const input=event.target.closest('[data-h-path]');if(!input)return;
  let val=input.type==='checkbox'?input.checked:input.type==='number'?(input.value===''?null:Number(input.value)):input.value;
  if(input.dataset.hPath==='pump.lockOn')val=input.value==='true';
  setPath(draft,input.dataset.hPath,val);
  if(['enabled','mode'].includes(input.dataset.hPath)&&(!draft.enabled||draft.mode!=='auto')){draft.hardwareEnabled=false;$('heatingHardwareEnabled').checked=false;}
  updateControls();markDirty();
 });
 document.addEventListener('change',event=>{if(event.target.matches('select[data-h-path]'))event.target.dispatchEvent(new Event('input',{bubbles:true}));});
 document.addEventListener('click',event=>{
  const pick=event.target.closest('[data-h-pick]');if(pick){pickerOpen(pick);return;}
  const removeRoom=event.target.closest('[data-h-remove-room]');if(removeRoom){draft.rooms.splice(Number(removeRoom.dataset.hRemoveRoom),1);renderEditors();markDirty();return;}
  const removeCircuit=event.target.closest('[data-h-remove-circuit]');if(removeCircuit){draft.circuits.splice(Number(removeCircuit.dataset.hRemoveCircuit),1);renderEditors();markDirty();}
 });
 $('heatingAddRoom').addEventListener('click',()=>{if(draft.rooms.length>=64)return;draft.rooms.push({id:uniqueId('room_',draft.rooms),name:'Raum '+(draft.rooms.length+1),stateId:'',enabled:true,weight:1,targetC:21});renderEditors();markDirty();});
 $('heatingAddCircuit').addEventListener('click',()=>{if(draft.circuits.length>=16)return;draft.circuits.push({id:uniqueId('kreis_',draft.circuits),name:'Heizkreis '+(draft.circuits.length+1),setpointId:'',baseC:21,minC:18,maxC:24,stepC:0.5,gain:0.5,armed:false});renderEditors();markDirty();});
 $('heatingTrendOutdoor')?.addEventListener('change',renderTrend);
 function discard(){loadConfig(json('config.heating',defaults()));note('Gespeicherte Einstellungen geladen.');}
 $('heatingSave').addEventListener('click',save);$('heatingReset').addEventListener('click',discard);
 $('heatingResetLearning').addEventListener('click',async()=>{try{if(!api.setVal)throw Error('Keine Verbindung.');await api.setVal('commands.heatingResetLearning',true);note('Zurücksetzen der Lernwerte angefordert. Die Fühler- und Geräteeinstellungen bleiben erhalten.');}catch(e){note(e.message,true)}});
 $('heatingPickerSearch').addEventListener('click',pickerSearch);$('heatingPickerClose').addEventListener('click',()=>pickerClose());
 $('heatingPickerQuery').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();pickerSearch();}});
 $('heatingPickerResults').addEventListener('click',event=>{const button=event.target.closest('[data-h-result]');if(!button||!pickerTarget)return;const result=pickerResults[Number(button.dataset.hResult)];if(!result)return;const target=pickerTarget.path;setPath(draft,target,String(result.id));const input=document.querySelector('[data-h-path="'+CSS.escape(target)+'"]');if(input)input.value=result.id;markDirty();pickerClose();});
 $('heatingStatePicker').addEventListener('click',event=>{if(event.target===$('heatingStatePicker'))pickerClose();});
 document.addEventListener('keydown',event=>{if($('heatingStatePicker').classList.contains('hidden'))return;if(event.key==='Escape'){event.preventDefault();pickerClose();return;}if(event.key==='Tab'){const items=[...$('heatingStatePicker').querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}});
 $('heatingOutdoorField').append(field('outdoorId','Außentemperatur (°C)','number',false));
 $('heatingPumpLockField').append(field('pump.lockId','Hersteller-Heizsperre oder Heizfreigabe (Boolean)','boolean',true));
 $('heatingPumpStatusField').append(field('pump.statusId','Raumheizbetrieb aktiv (Boolean: true = heizt)','boolean',false,'Möglichst eine Rückmeldung verwenden, die Warmwasserbereitung und Abtauen nicht als Raumheizung meldet.'));
 $('heatingPumpPowerField').append(field('pump.powerId','Elektrische Leistungsaufnahme der Wärmepumpe (W)','number',false,'Keine thermische Heizleistung zuordnen.'));
 $('heatingFloorField').append(field('pv.floorId','Boden-/Estrichtemperatur (°C, optional)','number',false));
 loadConfig(defaults());loaded=false;
 function validateImport(raw){
  if(!raw||typeof raw!=='object')throw Error('Heizungskonfiguration im Import fehlt.');
  const base=defaults(),out={...base};
  for(const key of Object.keys(base))if(!['pump','pv','rooms','circuits','enabled','hardwareEnabled','mode'].includes(key)&&raw[key]!==undefined)out[key]=raw[key];
  out.rooms=Array.isArray(raw.rooms)?raw.rooms.map((r,i)=>({id:String(r?.id||'room_'+(i+1)),name:String(r?.name||'Raum '+(i+1)).slice(0,80),stateId:String(r?.stateId||''),enabled:r?.enabled!==false,weight:r?.weight??1,targetC:r?.targetC??21})):[];
  out.circuits=Array.isArray(raw.circuits)?raw.circuits.map((c,i)=>({id:String(c?.id||'kreis_'+(i+1)),name:String(c?.name||'Heizkreis '+(i+1)).slice(0,80),setpointId:String(c?.setpointId||''),baseC:c?.baseC??21,minC:c?.minC??18,maxC:c?.maxC??24,stepC:c?.stepC??0.5,gain:c?.gain??0.5,armed:false})):[];
  for(const key of Object.keys(base.pump))if(raw.pump?.[key]!==undefined)out.pump={...out.pump,[key]:raw.pump[key]};
  out.pv={...base.pv};for(const key of Object.keys(base.pv))if(raw.pv?.[key]!==undefined)out.pv[key]=raw.pv[key];
  out.pump.armed=false;out.enabled=false;out.hardwareEnabled=false;out.mode='observe';
  return validateConfig(out);
 }
 window.EnergyHeatingUI={update,render,loadConfig,validateImport,save,discard};
})();
