'use strict';
(() => {
 const host=document.getElementById('storageSettings');if(!host)return;
 const $=id=>document.getElementById(id),readOnly=new URLSearchParams(location.search).has('embed');
 let api={},states={},namespace='energiemanagement.0',page='',instances=[],loaded=false,loading=false,busy=false,dirty=false,signature='';
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const parse=(id,fallback)=>{try{const value=states[namespace+'.'+id]?.val;return typeof value==='string'?JSON.parse(value):fallback;}catch{return fallback;}};
 const format=value=>typeof value==='number'&&Number.isFinite(value)?new Date(value).toLocaleString('de-AT',{timeZone:'Europe/Vienna',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Noch nicht erfolgt';
 host.classList.add('storage-ui');host.innerHTML='<article class="panel storage-panel" data-embed-hide><div class="panel-head wrap"><div><div class="eyebrow">DATENHALTUNG</div><h2>Intern oder Datenbank</h2><p>Verwende den internen Speicher oder eine bereits eingerichtete ioBroker-Datenbankinstanz.</p></div><span class="storage-icon" aria-hidden="true">▤</span></div><div class="storage-select-grid"><label>Speicher auswählen<select id="storageBackend"><option value="internal">Intern</option></select></label><button id="storageRefresh" type="button" class="button ghost">Instanzen aktualisieren</button></div><p id="storageSelectionInfo" class="footnote"></p><div class="storage-actions"><button id="storageTest" type="button" class="button ghost">Verbindung prüfen</button><button id="storageSave" type="button" class="button primary">Speicherwahl speichern</button><button id="storageDiscard" type="button" class="button ghost">Verwerfen</button></div><p id="storageFeedback" role="status" aria-live="polite">Intern ist voreingestellt. Eine Datenbank wird erst nach dem Speichern verwendet.</p><section class="storage-state" aria-label="Aktueller Speicherstatus"><div><span id="storageStatusBadge" class="storage-badge">Intern</span><strong id="storageStatusText">Status wird geladen …</strong></div><dl><div><dt>Letzte geprüfte Messwertarchivierung</dt><dd id="storageLastWrite">Noch nicht erfolgt</dd></div><div><dt>Letzter geprüfter Datenbankstand</dt><dd id="storageLastCheckpoint">Noch nicht erfolgt</dd></div></dl><p id="storageError" class="storage-error" role="status" hidden></p></section><p class="footnote storage-scope">Bei Datenbankbetrieb werden gültige Messwerte etwa jede Minute und ein vollständiger Sicherungsstand etwa stündlich archiviert. Sicherungsstände werden komprimiert in kleinen Teilen übertragen. Die Zeitpunkte werden erst nach geprüftem Zurücklesen aus der Datenbank bestätigt. Eine interne Kopie bleibt für Betrieb, Auswertungen und Ausfälle erhalten. Die gemeinsame Datensicherung enthält Einstellungen und alle intern erfassten Adapterdaten; andere Inhalte der Datenbank gehören nicht dazu.</p></article>';
 function status(text,error=false){$('storageFeedback').textContent=String(text);$('storageFeedback').classList.toggle('error',error);$('storageFeedback').setAttribute('role',error?'alert':'status');}
 function selected(){const value=$('storageBackend').value;return value==='internal'?{mode:'internal',instance:''}:{mode:'database',instance:value.replace(/^database:/,'')};}
 function saved(){const value=parse('config.storage_JSON',{mode:'internal',instance:''});return value?.mode==='database'&&typeof value.instance==='string'?{mode:'database',instance:value.instance}:{mode:'internal',instance:''};}
 function selectionInfo(){
  const value=selected();$('storageSelectionInfo').textContent=value.mode==='internal'?'Intern: Einstellungen, Archive und Lernwerte bleiben in den persistenten ioBroker-Datenpunkten dieses Adapters.':'Datenbank: Messverläufe und vollständige Sicherungsstände werden in '+value.instance+' archiviert. Zugangsdaten bleiben im vorhandenen Datenbankadapter.';
 }
 function sync(){const unavailable=readOnly||busy||typeof api.send!=='function';$('storageBackend').disabled=unavailable;$('storageRefresh').disabled=unavailable||loading;$('storageTest').disabled=unavailable||loading;$('storageSave').disabled=unavailable||loading||!dirty;$('storageDiscard').disabled=unavailable||loading||!dirty;host.setAttribute('aria-busy',String(busy||loading));selectionInfo();}
 function options(value){
  const current=value||$('storageBackend').value||'internal';
  const known=instances.some(item=>'database:'+item.id===current);
  $('storageBackend').innerHTML='<option value="internal">Intern</option>'+instances.map(item=>'<option value="database:'+escape(item.id)+'"'+(!item.available?' disabled':'')+'>'+escape(item.id+' · '+(item.type==='influxdb'?'InfluxDB':item.type==='sql'?'SQL':'History')+(item.available?' · bereit':' · nicht verfügbar'))+'</option>').join('')+(!known&&current!=='internal'?'<option value="'+escape(current)+'">'+escape(current.replace(/^database:/,''))+' · nicht gefunden</option>':'');
  $('storageBackend').value=current;selectionInfo();
 }
 async function refresh(){
  if(loading||busy||readOnly||typeof api.send!=='function')return;loading=true;sync();
  try{const result=await api.send('storageInstances',{});if(!result?.ok||!Array.isArray(result.instances))throw Error(result?.error||'Instanzen konnten nicht geladen werden.');instances=result.instances;loaded=true;options();status(instances.length?'Vorhandene Datenbankinstanzen aktualisiert.':'Keine unterstützte Datenbankinstanz gefunden. Richte zuerst influxdb, sql oder history in ioBroker ein.');}
  catch(error){status('Laden fehlgeschlagen: '+error.message,true);}finally{loading=false;sync();}
 }
 function renderStatus(){
  const config=saved(),value=parse('storage.status_JSON',{});$('storageStatusBadge').textContent=config.mode==='internal'?'Intern':config.instance;
  const code=value?.mode===config.mode&&value?.instance===config.instance?value.code:'waiting';$('storageStatusBadge').className='storage-badge '+(code==='error'?'error':code==='ok'?'good':'');
  $('storageStatusText').textContent=value?.mode===config.mode&&value?.instance===config.instance&&typeof value.message==='string'?value.message:config.mode==='internal'?'Interner Speicher aktiv.':'Datenbank ausgewählt; Archivierung wird vorbereitet.';
  $('storageLastWrite').textContent=format(value?.lastWriteAt);$('storageLastCheckpoint').textContent=format(value?.lastCheckpointAt);
  const error=typeof value?.error==='string'?value.error:'';$('storageError').hidden=!error;$('storageError').textContent=error+(typeof value.retryAt==='number'?' Nächster Versuch: '+format(value.retryAt)+'.':'');
 }
 function loadSaved(){const config=saved();options(config.mode==='internal'?'internal':'database:'+config.instance);dirty=false;signature=JSON.stringify(config);sync();}
 $('storageBackend').addEventListener('change',()=>{dirty=JSON.stringify(selected())!==JSON.stringify(saved());status(dirty?'Speicherwahl geändert. Zum Übernehmen speichern.':'Keine Änderungen.');sync();});
 $('storageRefresh').addEventListener('click',refresh);$('storageDiscard').addEventListener('click',()=>{if(readOnly||busy)return;loadSaved();status('Änderungen verworfen.');});
 $('storageTest').addEventListener('click',async()=>{
  if(readOnly||busy||typeof api.send!=='function')return;busy=true;sync();status('Verbindung wird ohne Schreibzugriff geprüft …');
  try{const config=selected();if(config.mode==='internal'){status('Der interne Speicher benötigt keine Datenbankverbindung.');return;}const result=await api.send('storageTest',{instance:config.instance});if(!result?.ok)throw Error(result?.error||'Keine Bestätigung erhalten.');status(result.message||'Lesezugriff auf die Datenbank bestätigt.');}
  catch(error){status('Verbindungsprüfung fehlgeschlagen: '+error.message,true);}finally{busy=false;sync();}
 });
 $('storageSave').addEventListener('click',async()=>{
  if(readOnly||busy||!dirty||typeof api.send!=='function')return;busy=true;sync();status('Speicherwahl wird geprüft und gespeichert …');
  try{const result=await api.send('storageConfigure',{config:selected()});if(!result?.ok||!result.config)throw Error(result?.error||'Keine Bestätigung erhalten.');states[namespace+'.config.storage_JSON']={val:JSON.stringify(result.config),ack:true,ts:Date.now()};loadSaved();status(result.config.mode==='internal'?'Interner Speicher aktiviert.':'Datenbank '+result.config.instance+' ausgewählt. Die nächste Archivierung startet im Messzyklus.');renderStatus();}
  catch(error){status('Speichern fehlgeschlagen: '+error.message,true);}finally{busy=false;sync();}
 });
 function update(nextStates,nextNamespace,nextPage,actions){states=nextStates||states;namespace=nextNamespace||namespace;page=nextPage||page;api=actions||api;const nextSignature=JSON.stringify(saved());if(!dirty&&!busy&&nextSignature!==signature)loadSaved();renderStatus();sync();if(page==='settings'&&!loaded&&!loading&&!busy&&!readOnly&&typeof api.send==='function')refresh();}
 function render(nextPage){page=nextPage||page;renderStatus();sync();if(page==='settings'&&!loaded&&!loading&&!busy&&!readOnly&&typeof api.send==='function')refresh();}
 if(readOnly)host.hidden=true;window.EnergyStorageUI={update,render};loadSaved();renderStatus();sync();
})();
