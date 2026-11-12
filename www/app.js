'use strict';
(() => {
 const instance=new URLSearchParams(location.search).get('instance');
 const N=/^energiemanagement\.\d+$/.test(instance||'')?instance:'energiemanagement.0';
 const $=id=>document.getElementById(id);
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
 const format=(v,d=0)=>n(v)===null?'–':new Intl.NumberFormat('de-AT',{maximumFractionDigits:d,minimumFractionDigits:d}).format(Number(v));
 const watt=x=>n(x)===null?'–':format(x)+' W';
 const kwh=x=>n(x)===null?'–':format(x,3)+' kWh';
 const percent=x=>n(x)===null?'–':format(x,1)+' %';
 const date=ts=>ts?new Date(ts).toLocaleString('de-AT',{timeZone:'Europe/Vienna',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'–';
 const dayKey=ts=>new Date(ts).toLocaleDateString('sv-SE',{timeZone:'Europe/Vienna'});
 const hashToPage={'#overview':'overview','#history':'history','#analytics':'analytics','#forecast':'forecast','#battery':'battery','#heating':'heating','#water':'water','#rainwater':'rainwater','#fuel':'fuel','#reports':'reports','#sources':'sources','#devices':'devices','#outputs':'outputs','#settings':'settings','#about':'about'};
 const saveJSON=val=>JSON.stringify(val);
 const copy=x=>JSON.parse(JSON.stringify(x));
 let io,connected=false,states={},page='overview',adapterNames=[],objectCache=new Map(),picker=null,pickerLimit=150,pickerLoading=false;
 let forms={sources:null,consumers:null,settings:null,outputs:null},dirty={sources:false,consumers:false,outputs:false,settings:false},masterDraft=false;
 let installedIds=new Set(),deviceFeedback=new Map(),devicePowerCache=new Map(),feedbackReading=false;
 let autoUpdate=true,pollRunning=false,hasLoadedOnce=false,sourceReadingsRunning=false;
 let requestEpoch=0,pollTicket=0,suspended=document.hidden,suspendedAt=0,retryTimer=null,retryReset=false,libraryLoading=false;
 const pendingRequests=new Set();
 const SRC_GROUPS=[
  {title:'Smart Meter / Netzanschlusspunkt',keys:[['importW','Netzbezug aktuell','W',true],['importKWh','Bezugszählerstand gesamt','kWh',true],['exportW','Netzeinspeisung aktuell','W'],['exportKWh','Einspeisezählerstand','kWh']]},
  {title:'Tages- und Monatsreferenzen',keys:[['dayBaseImport','Bezugszählerstand Tagesbeginn','kWh'],['monthBaseImport','Bezugszählerstand Monatsbeginn','kWh'],['dayBaseExport','Einspeisezählerstand Tagesbeginn','kWh'],['monthBaseExport','Einspeisezählerstand Monatsbeginn','kWh']]},
  {title:'Hausverbrauch',keys:[['houseW','Hausverbrauch direkt (optional)','W']]},
  {title:'Phasenwerte',keys:[['phase1W','Phase L1','W'],['phase2W','Phase L2','W'],['phase3W','Phase L3','W']]}
 ];
 const FACTORS=[[1,'× 1'],[1000,'× 1000'],[.001,'× 0,001'],[-1,'× −1'],[-1000,'× −1000'],[-.001,'× −0,001']];
 let noticeTimer=null;
 const clearNotice=()=>{
  if(noticeTimer!==null){clearTimeout(noticeTimer);noticeTimer=null;}
  $('notice').classList.add('hidden');
 };
 const showNotice=(msg,error=false,origin='user')=>{
  // Alte Zeitsteuerung beenden, damit eine neue Meldung nicht vorzeitig verschwindet.
  if(noticeTimer!==null){clearTimeout(noticeTimer);noticeTimer=null;}
  const el=$('notice');
  el.dataset.origin=origin;
  $('noticeText').textContent=String(msg);
  el.classList.remove('hidden');
  el.style.background=error?'#552f3b':'#1b4a3f';
  el.style.borderColor=error?'#984c5f':'#46896b';
  el.setAttribute('role',error?'alert':'status');
  // Erfolgs- und Hinweismeldungen verschwinden nach 6 Sekunden.
  // Fehler bleiben sichtbar, bis sie manuell geschlossen werden.
  if(!error){
   noticeTimer=setTimeout(()=>{noticeTimer=null;el.classList.add('hidden');},6000);
  }
 };
 $('noticeDismiss').addEventListener('click',clearNotice);
 function navigate(to){
  const changed=page!==to;
  page=to;
  history.replaceState(null,'','#'+to);
  renderPage();
  // Nur ein bewusster Seitenwechsel darf an den Seitenanfang springen.
  if(changed)window.scrollTo({top:0,behavior:'instant'});
 }
 let featureFlags={water:false,rainwater:false,fuel:false,heating:true},featuresLoaded=false;
 window.EnergyFeatureVisibility=()=>({...featureFlags});
 window.EnergyBatteryHouse=()=>{const value=state('live.houseW');return value===null||!Number.isFinite(Number(value))?null:Number(value)};
 function applyFeatures(features){
  featuresLoaded=true;
  featureFlags={water:features?.water===true,rainwater:features?.rainwater===true,fuel:features?.fuel===true,heating:features?.heating===true};
  for(const key of ['water','rainwater','fuel','heating'])for(const button of document.querySelectorAll('[data-page="'+key+'"],[data-goto="'+key+'"]')){button.hidden=!featureFlags[key];button.setAttribute('aria-hidden',String(!featureFlags[key]));}
  document.querySelector('.mobile-tabbar')?.style.setProperty('--mobile-tabs',featureFlags.heating?'5':'4');
  if(['water','rainwater','fuel','heating'].includes(page)&&!featureFlags[page]){page='overview';history.replaceState(null,'','#overview');renderPage();}
  window.EnergyEmbed?.render(page);
 }
 function renderPage(){
  if(featuresLoaded&&['water','rainwater','fuel','heating'].includes(page)&&!featureFlags[page]){page='overview';history.replaceState(null,'','#overview');}
  if(window.EnergyInsightsUI)window.EnergyInsightsUI.render(page);
  if(window.EnergyForecastUI)window.EnergyForecastUI.render(page);
  if(window.EnergyDashboard)window.EnergyDashboard.render(page);
  if(window.EnergyHeatingUI)window.EnergyHeatingUI.render(page);
  for(const section of document.querySelectorAll('.page'))section.classList.toggle('hidden',section.id!=='page-'+page);
  for(const btn of document.querySelectorAll('[data-page]')){const active=btn.dataset.page===page;btn.classList.toggle('active',active);if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');}
  const titles={overview:'Übersicht',history:'Viertelstunden / Verlauf',analytics:'Energieauswertung',forecast:'PV-Ertragsprognose',battery:'Speicher und Hausverbrauch',heating:'Heizung & Gebäudepuffer',water:'Wasserverbrauch',rainwater:'Regenwasserverbrauch',fuel:'Brennstoffverbrauch',reports:'Berichte',sources:'Datenquellen',devices:'Verbraucher & Prioritäten',outputs:'Geräteausgänge',settings:'Einstellungen',about:'Über & Lizenzen'};
  $('pageTitle').textContent=titles[page]||'Energiemanagement';
  if(page==='overview'){renderOverview();if(window.EnergyAnalytics)window.EnergyAnalytics.render('overview')};if(page==='history')renderHistory();
  if(page==='sources')renderSources();if(page==='devices')renderConsumers();if(page==='outputs')renderOutputs();if(page==='settings')renderSettings();
  if((page==='analytics'||page==='reports')&&window.EnergyAnalytics)window.EnergyAnalytics.render(page);
  window.EnergySummaryUI?.render(page);
  window.EnergyUtilitiesUI?.render(page);
  window.EnergyRainwaterUI?.render(page);
  window.EnergyDayComparisonUI?.render(page);
  window.EnergyAnalysisLayout?.render(page);
  window.EnergyStorageUI?.render(page);
  window.EnergyTankUI?.render(page);
  window.EnergySourcesUI?.render(page);
  window.EnergyBatteriesUI?.render(page);
  window.EnergyBackupUI?.render(page);
  window.EnergyAboutUI?.render(page);
  window.EnergyVersionUI?.render(page);
  window.EnergyEmbed?.render(page);
 }
 function state(id,def=null){const s=states[N+'.'+id];return s&&s.val!==undefined?s.val:def;}
 function jsonState(id,def){try{return JSON.parse(state(id,JSON.stringify(def)))}catch{return copy(def)}}
 const stale=(s,limit=30000)=>!s||!Number.isFinite(s.ts)||Date.now()-s.ts>limit;
 function connection(ok){
  connected=ok===true;
  if(window.EnergyDashboard)window.EnergyDashboard.connection(connected);
  if(!connected&&hasLoadedOnce&&page==='overview')renderFlow();
  $('navStatus').classList.toggle('off',!connected);
  $('navStatusText').textContent=connected?'ioBroker verbunden':suspended?'Verbindung pausiert':'Verbindung wird hergestellt';
 }
 function connectionBanner(message=''){
  const banner=$('connectionBanner');if(banner)banner.hidden=!message;
  if($('connectionMessage'))$('connectionMessage').textContent=message;
  if(!banner&&message)$('navStatusText').textContent=message;
 }
 function requestError(message,options={}){return Object.assign(Error(message),{request:true,...options})}
 function cancelRequests(reason){
  requestEpoch++;pollTicket++;pollRunning=false;feedbackReading=false;sourceReadingsRunning=false;
  for(const entry of [...pendingRequests])entry.cancel(reason);
  // This is our dedicated UI socket. Never let disconnected commands be replayed later.
  if(Array.isArray(io?.sendBuffer))io.sendBuffer.length=0;
  if(Array.isArray(io?.pending))io.pending.length=0;
 }
 function request(name,args,{write=false,singleReply=false,label=name,timeoutMs=20000}={}){
  return new Promise((resolve,reject)=>{
   if(suspended)return reject(requestError('Anfrage pausiert, weil die Seite im Hintergrund ist.',{cancelled:true,transient:true}));
   if(!connected||!io||io.connected===false||navigator.onLine===false)return reject(requestError('ioBroker-Verbindung nicht verfügbar. Bitte nach dem Verbinden erneut versuchen.',{transport:true,transient:true}));
   const epoch=requestEpoch;let timer,done=false;
   const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);pendingRequests.delete(entry);error?reject(error):resolve(value)};
   const entry={cancel:reason=>finish(requestError(write?'Verbindung unterbrochen. Ob der Befehl übernommen wurde, ist unklar; bitte den aktuellen Status prüfen. Er wird nicht automatisch wiederholt.':reason,{cancelled:!write,transport:true,transient:true,uncertain:write}))};
   pendingRequests.add(entry);
   timer=setTimeout(()=>finish(requestError(write?label+' wurde nicht rechtzeitig bestätigt. Bitte den aktuellen Status prüfen; der Befehl wird nicht automatisch wiederholt.':label+' dauert zu lange. Die Datenabfrage wird erneut versucht.',{transient:true,uncertain:write,timeout:true})),timeoutMs);
   const callback=(error,value)=>{
    if(done||epoch!==requestEpoch)return;
    if(singleReply){finish(null,error);return}
    const message=error&&(typeof error==='string'?error:error.message||JSON.stringify(error));
    finish(message?requestError(message,{transient:/timeout|timed out|not connected|disconnect/i.test(message),timeout:/timeout|timed out/i.test(message),uncertain:write}):null,value);
   };
   try{
    const sender=write&&io.volatile?.emit?io.volatile:io;
    sender.emit(name,...args,callback);
   }catch(error){finish(requestError(String(error?.message||error),{transport:true,transient:true,uncertain:write}))}
  });
 }
 function rpc(name,...args){return request(name,args,{write:name==='setState'})}
 function forecastSend(command,payload){return request('sendTo',[N,command,payload],{write:!['forecastGeocode','heatingObjects','utilityObjects','sourceObjects','backupExport','backupPreview','storageInstances','storageTest','versionCheck'].includes(command),singleReply:true,label:'Adapteranfrage',timeoutMs:command.startsWith('backup')?120000:20000})}
 const setVal=(id,val)=>rpc('setState',N+'.'+id,{val,ack:false});
 const readVal=id=>rpc('getState',N+'.'+id);
 const readObj=id=>rpc('getObject',id);
 const findObjects=(type,range)=>rpc('getObjectView','system',type,range);
 // Aktualisiert Daten ohne Navigation, Scrollen oder Neubau von Eingabefeldern.
 async function poll(){
  if(suspended||document.hidden||!connected||pollRunning)return;
  pollRunning=true;const ticket=++pollTicket,epoch=requestEpoch;
  try{
   const results=await rpc('getStates',N+'.*');
   if(epoch!==requestEpoch||ticket!==pollTicket||suspended)return;
   if(results&&typeof results==='object')states=results;
   applyFeatures(jsonState('config.features_JSON',{water:false,rainwater:false,fuel:false,heating:true}));
   $('lastUpdate').textContent='Stand: '+date(Date.now());
   // Ungespeicherte Änderungen in den Formularen nie überschreiben.
   if(!dirty.sources)forms.sources=jsonState('config.sources',{pv:[]});
   if(!dirty.consumers)forms.consumers=jsonState('config.consumers',{master:false,maxParallel:3,devices:[]});
   if(!dirty.settings)forms.settings=jsonState('config.settings',{targetW:9500,reserveW:500,tariffThresholdW:10000,minCoveragePct:85});
   if(!dirty.outputs){
    forms.outputs=jsonState('config.consumers',{master:false,maxParallel:3,devices:[]});
    masterDraft=state('config.hardwareMaster',false)===true;
   }
   if(window.EnergyAnalytics)window.EnergyAnalytics.update(states,forms,N);
   window.EnergySummaryUI?.update(states,N,page,{setVal,readVal});
   window.EnergyUtilitiesUI?.update(states,N,page,{setVal,readVal,send:forecastSend});
   window.EnergyRainwaterUI?.update(states,N,page,{send:forecastSend});
   window.EnergyDayComparisonUI?.update(states,N,page);
   window.EnergyAnalysisLayout?.update(states,N,page);
   window.EnergyStorageUI?.update(states,N,page,{send:forecastSend});
   window.EnergyTankUI?.update(states,N,page,{send:forecastSend});
   window.EnergySourcesUI?.update(states,N,page,{send:forecastSend});
   window.EnergyBatteriesUI?.update(states,N,page,{setVal,send:forecastSend});
   window.EnergyBackupUI?.update(states,N,page,{send:forecastSend});
   window.EnergyAboutUI?.update(states,N,page);
   window.EnergyVersionUI?.update(states,N,page,{send:forecastSend});
   if(window.EnergyInsightsUI)window.EnergyInsightsUI.update(states,forms,N,page);
   if(window.EnergyDashboard)window.EnergyDashboard.update(states,forms,N,page);
   if(window.EnergyForecastUI)window.EnergyForecastUI.update(states,forms,N,page,{setVal,readVal,send:forecastSend});
   if(window.EnergyHeatingUI)window.EnergyHeatingUI.update(states,forms,N,page,{setVal,readVal,send:forecastSend});
   if(!hasLoadedOnce){
    // Beim ersten erfolgreichen Laden müssen die Daten einmal in die Formulare.
    hasLoadedOnce=true;
    renderPage();
   }else if(page==='overview'){
    renderOverview();
    if(window.EnergyAnalytics)window.EnergyAnalytics.render('overview');
   }else if(page==='history'){
    renderHistory();
   }else if(page==='analytics'){
    if(window.EnergyAnalytics)window.EnergyAnalytics.render('analytics');
   }else if(page==='sources'){
    // Nur die Messwert-Beschriftungen aktualisieren. Datenpunkt-Editor bleibt stehen.
    await refreshSourceReadings();
   }
   // Berichte und sämtliche Konfigurationsseiten werden nicht automatisch neu aufgebaut.
   if(epoch!==requestEpoch||ticket!==pollTicket||suspended)return;
   await refreshFeedbackSignals();
   if(epoch!==requestEpoch||ticket!==pollTicket||suspended)return;
   connectionBanner('');
   if($('notice').dataset.origin==='connection')clearNotice();
  }catch(e){
   if(epoch!==requestEpoch||ticket!==pollTicket||e.cancelled||suspended)return;
   if(e.transient){
    if(io?.connected===false)connection(false);
    connectionBanner('Datenverbindung wird wiederhergestellt. Erneuter Versuch läuft automatisch.');
    retryConnection(1500,e.timeout===true);
   }else showNotice((e.request?'Daten konnten nicht geladen werden: ':'Ansicht konnte nicht aktualisiert werden: ')+e.message,true);
  }finally{if(ticket===pollTicket)pollRunning=false}

 }
 function retryConnection(delay=1500,reset=false){
  retryReset=retryReset||reset;
  if(retryTimer!==null||suspended||navigator.onLine===false)return;
  retryTimer=setTimeout(()=>{retryTimer=null;const reset=retryReset;retryReset=false;ensureConnection(reset)},delay);
 }
 function transportLost(message){
  cancelRequests(message);connection(false);
  if(!suspended){connectionBanner(navigator.onLine===false?'Keine Netzwerkverbindung. Sobald das Gerät wieder online ist, wird neu verbunden.':'Verbindung zu ioBroker unterbrochen. Es wird automatisch neu verbunden.');retryConnection(3000)}
 }
 function socketReady(){
  if(suspended||io?.connected===false)return;
  connection(true);connectionBanner('Verbindung steht. Aktuelle Daten werden geladen …');
  poll();loadAdapters();
 }
 function ensureConnection(reset=false){
  if(suspended||document.hidden)return;
  if(navigator.onLine===false){transportLost('Keine Netzwerkverbindung.');return;}
  if(!io){openSocket();return;}
  if(reset){
   cancelRequests('Verbindung wird nach der Pause erneuert.');connection(false);
   const previous=io;io=null;
   // The web.0 pure WebSocket client and Socket.IO have different lifecycles.
   // Retire the old client before creating another; late events cannot affect it.
   if(previous.socket&&typeof previous.destroy==='function'){
    previous.socket.onclose=null;previous.socket.onerror=null;previous.socket.onmessage=null;previous.socket.onopen=null;
   }
   if(typeof previous.destroy==='function')previous.destroy();else previous.disconnect?.();
   openSocket();return;
  }
  if(io.connected===false||!connected){
   connectionBanner('Verbindung zu ioBroker wird hergestellt …');
   try{if(!io.socket&&!io.connectTimer&&!io.connectingTimer)io.connect?.()}catch{retryConnection(3000)}
  }else{connection(true);poll()}
 }
 async function openSocket(){
  if(suspended||io)return;
  if(!window.io?.connect){
   connectionBanner('ioBroker-Verbindungsbibliothek fehlt. Sie wird erneut geladen …');
   if(!libraryLoading){
    libraryLoading=true;const script=document.createElement('script');
    script.src='/lib/js/socket.io.js?energyRetry='+Date.now();
    script.onload=()=>{libraryLoading=false;script.remove();if(window.io?.connect)openSocket();else retryConnection(5000)};
    script.onerror=()=>{libraryLoading=false;script.remove();retryConnection(5000)};
    document.head.appendChild(script);
   }
   return;
  }
  try{
   io=window.io.connect(window.location.origin,{name:'Energiemanagement UI',reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000,reconnectionDelayMax:10000,timeout:20000,connectTimeout:20000,authTimeout:20000});
   const client=io,guard=fn=>(...args)=>{if(io===client)fn(...args)};
   io.on('connect',guard(socketReady));io.on('reconnect',guard(socketReady));
   io.io?.on?.('reconnect',guard(socketReady));
   io.on('disconnect',guard(()=>transportLost('Verbindung unterbrochen.')));
   io.on('connect_error',guard(()=>{if(io?.connected!==true)transportLost('Verbindung konnte nicht hergestellt werden.');else retryConnection()}));
   io.on('error',guard(()=>{
    if(io?.connected===false)transportLost('Transportfehler.');
    else{connectionBanner('Datenverbindung wird geprüft. Erneuter Versuch läuft automatisch.');retryConnection()}
   }));
  }catch{io=null;connection(false);connectionBanner('Verbindung zu ioBroker fehlgeschlagen. Automatischer Wiederholungsversuch …');retryConnection(3000)}
 }
 function suspendConnection(){
  if(suspended&&suspendedAt)return;
  suspended=true;suspendedAt=Date.now();
  if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null;}
  cancelRequests('Datenabfrage wegen Hintergrundpause beendet.');
  window.EnergyDashboard?.connection(false);
 }
 function resumeConnection(force=false){
  if(document.hidden)return;
  const longPause=suspendedAt&&Date.now()-suspendedAt>30000,wasSuspended=suspended;
  suspended=false;suspendedAt=0;
  if(force||longPause)ensureConnection(true);
  else if(wasSuspended||!connected)ensureConnection();
  else poll();
 }


 async function refreshFeedbackSignals(){
  if(feedbackReading||!connected)return;
  const configured=(forms.outputs?.devices||forms.consumers?.devices||[]);
  const list=configured.filter(d=>typeof d.statusId==='string'&&d.statusId.trim()||
    typeof d.measuredW==='string'&&d.measuredW.trim());
  if(!list.length){deviceFeedback.clear();devicePowerCache.clear();return}
  feedbackReading=true;const epoch=requestEpoch;
  try{
   const freshFeedback=new Map(),freshPower=new Map();
   const now=Date.now();
   for(let i=0;i<list.length;i+=24){
    await Promise.all(list.slice(i,i+24).map(async d=>{
     if(d.statusId){
      try{
       const state=await rpc('getState',d.statusId);
       const age=now-Number(state?.ts||0);
       const hasValue=typeof state?.val==='boolean';
       // Boolesche Zustände werden oft nur bei Änderung geschrieben.
       // Alte Werte dürfen als "zuletzt gemeldet" erscheinen,
       // sind aber ausdrücklich nicht als aktuelle Rückmeldung markiert.
       freshFeedback.set(d.id,{
        value:hasValue?state.val:null,
        stale:!hasValue||age>120000||age< -15000,
        ts:state?.ts||0,id:d.statusId
       });
      }catch{freshFeedback.set(d.id,{value:null,stale:true,id:d.statusId})}
     }
     if(d.measuredW){
      try{
       const state=await rpc('getState',d.measuredW);
       const age=now-Number(state?.ts||0);
       const validNumber=typeof state?.val==='number'&&Number.isFinite(state.val);
       // Den letzten gültigen Zahlenwert auch nach Ablauf der Frischefrist
       // anzeigen; ausdrücklich als veraltet kennzeichnen. Nicht als aktuelle
       // Leistung für Regelung oder Energiemengenberechnung verwenden.
       const value=validNumber?Math.max(0,state.val):null;
       const stale=!validNumber||!Number.isFinite(Number(state?.ts))||
        age>120000||age< -15000;
       freshPower.set(d.id,{value,stale,ageMinutes:age>=0?Math.round(age/60000):null,
        ts:state?.ts||0,id:d.measuredW});
      }catch{freshPower.set(d.id,{value:null,id:d.measuredW})}
     }
    }));
   }
   if(epoch!==requestEpoch||suspended)return;
   deviceFeedback=freshFeedback;
   devicePowerCache=freshPower;
   if(page==='overview')renderFlow();
   // Andere Formulare nicht neu erzeugen: unfertige Eingaben erhalten.
   if(page==='outputs')for(const d of list){
    const status=document.getElementById('readFeedback_'+d.id);
    if(status){
     const v=freshFeedback.get(d.id);
     status.textContent=!d.statusId?'Statusrückmeldung nicht zugeordnet':
      v?.value===true?(v.stale?'Zuletzt gemeldet EIN':'Aktuell EIN'):
      v?.value===false?(v.stale?'Zuletzt gemeldet AUS':'Aktuell AUS'):'Status nicht verfügbar';
    }
   }
  }finally{if(epoch===requestEpoch)feedbackReading=false}
 }

 function overviewLiveValues(){
  const snapshot=jsonState('live.snapshot',null),hasSnapshot=state('live.snapshot',null)!==null;
  const age=Date.now()-Number(snapshot?.ts||0),fresh=connected&&Number.isFinite(snapshot?.ts)&&age>=-15000&&age<90000;
  const read=key=>hasSnapshot?(fresh?n(snapshot?.values?.[key]):null):n(state('live.'+key));
  return {pv:read('pvW'),import:read('importW'),export:read('exportW'),battery:read('batteryW'),house:read('houseW'),fresh:hasSnapshot?fresh:connected};
 }
 function renderFlow(){
  const nums=overviewLiveValues();
  const measureValid=nums.fresh&&state('status.dataOk',false)===true;
  const set=(id,text)=>$(id).textContent=text;
  set('flowPv',watt(nums.pv));set('flowGrid',nums.import===null||nums.export===null?'–':nums.import>0?watt(nums.import):watt(nums.export));
  set('flowBattery',watt(nums.battery===null?null:Math.abs(nums.battery)));set('flowHouse',watt(nums.house));
  set('flowGridDetail',nums.import===null||nums.export===null?'Messung fehlt':nums.import>0?'Netzbezug':nums.export>0?'Netzeinspeisung':'Kein Netzfluss');
  set('flowBatteryDetail',nums.battery===null?'Messung fehlt':nums.battery>0?'Entladen':nums.battery<0?'Laden':'Ruhezustand');
  const pvSources=Array.isArray(forms.sources?.pv)?forms.sources.pv.filter(x=>x.id):[];
  set('flowPvDetail',pvSources.length+' PV-Quelle'+(pvSources.length===1?'':'n'));
  set('flowHouseQuality',nums.house===null?'Messung nicht verfügbar':['direct','measured'].includes(state('live.houseQuality'))?'Direkt gemessen':'Berechnete Energiebilanz');
  set('flowStatus',!nums.fresh?'Keine aktuellen Messwerte':measureValid?'Live · alle 10 Sekunden':'Messwerte werden geprüft');
  const active=(id,power,reverse=false)=>{
   const el=$(id);el.classList.toggle('active',measureValid&&n(power)!==null&&Math.abs(power)>20);
   el.classList.toggle('reverse',reverse);
  };
  active('flowPvLine',nums.pv,false);
  active('flowGridLine',(nums.import??0)-(nums.export??0),(nums.export??0)>(nums.import??0));
  active('flowBatteryLine',nums.battery,(nums.battery??0)<0);
  const devices=Array.isArray(forms.consumers?.devices)?[...forms.consumers.devices]:[];
  const status=jsonState('control.summary',[]);
  const map=new Map((Array.isArray(status)?status:[]).map(x=>[x.id,x]));
  devices.sort((a,b)=>Number(a.priority)-Number(b.priority)||String(a.name).localeCompare(String(b.name)));
  set('flowDeviceCount',String(devices.length));
  $('flowConsumers').innerHTML=devices.length?devices.map(d=>{
    const v=map.get(d.id)||{},reported=n(v.measuredW),target=n(v.targetW);
    const direct=devicePowerCache.get(d.id);
    // Falls die Adapter-Matrix den Wert noch nicht übernommen hat,
    // den zugeordneten Istleistungs-Datenpunkt direkt verwenden.
    const measured=reported!==null?reported:n(direct?.value);
    const signal=deviceFeedback.get(d.id);
    const hasStatus=d.statusId&&typeof signal?.value==='boolean';
    const actualSwitch=d.statusId?(signal?.value===true?
      (signal.stale?' · Status zuletzt EIN':' · Iststatus EIN'):
      signal?.value===false?(signal.stale?' · Status zuletzt AUS':' · Iststatus AUS'):
      ' · Status nicht verfügbar'):'';
    const lastOnly=reported===null&&direct?.stale===true&&measured!==null;
    const real=measured!==null&&!lastOnly;
    const numericPower=measured!==null?
      (measured>0&&measured<10?format(measured,1)+' W':watt(measured)):null;
    const power=lastOnly?'Zuletzt '+numericPower:
      real?numericPower:
      target!==null&&target>0?'Soll: '+watt(target):
      hasStatus?(signal.value?'EIN':'AUS'):'Ohne Istmessung';
    const ageText=Number.isFinite(direct?.ageMinutes)?
      (direct.ageMinutes<2?'vor kurzem':'vor '+direct.ageMinutes+' Min.'):'Zeit unbekannt';
    const detail=lastOnly?'Messwert veraltet ('+ageText+')':
      real?'Istleistung gemessen':
      target>0?'Nur Sollwert – nicht gemessen':
      d.measuredW?'Istleistung aktuell nicht verfügbar':
      d.statusId?'Keine Leistungsmessung zugeordnet':'Istleistungs-Datenpunkt fehlt';
    const isActive=hasStatus&&!signal.stale?signal.value:real?measured>20:!!v.allow&&target>0;
    const cls=(isActive?' active':d.enabled?' configured':' inactive')+(lastOnly?' stale':'');
    return '<div class="flow-device'+cls+'"><div class="flow-device-main"><strong>'+
      escape(d.name||d.id)+'</strong><span>'+escape(power)+'</span></div>'+
      '<div class="flow-device-meta"><span>Prio '+escape(d.priority||'–')+' · '+
      escape(detail+actualSwitch)+'</span><small>'+escape(v.allow?'Freigabe TRUE':'Freigabe FALSE')+'</small></div></div>';
  }).join(''):'<div class="flow-placeholder">Unter „Verbraucher & Prioritäten“ lassen sich beliebig weitere Geräte hinzufügen.</div>';
 }

 function renderOverview(){
  const val=(id,display)=>{$(id).textContent=display};
  const day=Number(state('day.validIntervals',0)),month=Number(state('month.validIntervals',0));
  val('kDayPeak',day?watt(state('day.peakW')):'–');val('kDayTime',day?date(state('day.peakStart')):'Noch keine gültige Viertelstunde');
  val('kMonthPeak',month?watt(state('month.peakW')):'–');val('kMonthTime',month?date(state('month.peakStart')):'Noch keine gültige Viertelstunde');
  const live=overviewLiveValues();
  val('kGrid',watt(live.import));val('kMonthEnergy',kwh(state('month.importKWh')));
  val('kDayEnergy','Heute: '+kwh(state('day.importKWh')));
  val('slotRange',date(state('interval.start'))+' bis '+date(state('interval.end')));
  val('slotForecast',watt(state('interval.forecastW')));val('slotTarget',watt(forms.settings?.targetW));
  val('slotMean',watt(state('interval.currentMeanW')));val('slotCoverage',percent(state('interval.coveragePct')));
  val('slotBudget',state('control.ready',false)?watt(state('control.availableW')):'Keine Freigabe');
  val('slotReduce',watt(state('control.reductionW')));
  const ratio=n(state('interval.forecastW'))/Math.max(1,n(forms.settings?.targetW)||9500);
  $('slotProgress').style.width=(Math.max(0,Math.min(100,ratio*100)))+'%';
  $('slotProgress').className=ratio>1?'bad':ratio>.83?'warn':'';
  for(const [id,key] of [['lPv','pv'],['lImport','import'],['lExport','export'],['lBattery','battery'],['lHouse','house']])val(id,watt(live[key]));
  val('houseQuality','Hausverbrauch: '+(state('live.houseQuality','unbekannt')));
  const summary=jsonState('control.summary',[]);
  $('overviewDevices').innerHTML=summary.length?summary.slice(0,12).map(x=>'<div><span>'+escape(x.name)+' <small>Priorität '+x.priority+'</small></span><span class="status-tag '+(x.allow?'yes':'')+'">'+(x.allow?'TRUE · '+watt(x.targetW):'FALSE')+'</span></div>').join(''):
   '<div><span>Noch keine Verbraucher eingerichtet</span></div>';
  renderChart('overviewChart',historyData().slice(-48),forms.settings?.targetW||9500);
  renderFlow();
 }
 const historyData=()=>{const raw=jsonState('history.intervals',[]);return Array.isArray(raw)?raw.filter(x=>Number.isFinite(Number(x.start))).sort((a,b)=>a.start-b.start):[]};
 function chartItems(){
  const range=$('chartRange').value,today=dayKey(Date.now()),yesterday=dayKey(Date.now()-86400000);
  const raw=historyData();
  if(range==='today')return raw.filter(x=>x.day===today);
  if(range==='yesterday')return raw.filter(x=>x.day===yesterday);
  if(range==='week')return raw.filter(x=>x.start>=Date.now()-7*86400000);
  return raw.filter(x=>x.day?.startsWith(today.slice(0,7)));
 }
 function renderChart(container,entries,target){
  const node=$(container);
  if(!entries?.length){node.innerHTML='<div class="empty">Noch keine aufgezeichneten Viertelstunden für diesen Zeitraum.</div>';return}
  const W=990,H=280,L=62,R=16,T=18,B=38,w=W-L-R,h=H-T-B;
  const max=Math.max(target,...entries.map(x=>x.valid?x.averageW:0),1000),ceil=Math.ceil(max*1.18/1000)*1000;
  const y=x=>T+h-Math.max(0,Math.min(1,Number(x||0)/ceil))*h;
  const step=w/entries.length,bar=Math.max(1,Math.min(18,step*.68));
  let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="Leistungsspitzen">';
  for(let i=0;i<=4;i++){const value=ceil*i/4,Y=y(value);svg+='<line class="gridline" x1="'+L+'" x2="'+(W-R)+'" y1="'+Y+'" y2="'+Y+'"/>'+
   '<text class="axis-text" x="'+(L-9)+'" y="'+(Y+4)+'" text-anchor="end">'+format(value/1000,1)+' kW</text>'}
  svg+='<line class="goal-line" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(target)+'" y2="'+y(target)+'"/>';
  const high=Math.max(0,...entries.filter(x=>x.valid).map(x=>x.averageW));
  const labelEach=Math.max(1,Math.ceil(entries.length/8));
  for(let i=0;i<entries.length;i++){
   const a=entries[i],Y=y(a.averageW),x=L+step*i+(step-bar)/2;
   svg+='<rect class="chart-bar '+(!a.valid?'invalid':a.averageW===high?'max':'')+'" x="'+x+'" y="'+Math.min(Y,T+h-2)+'" width="'+bar+'" height="'+Math.max(2,T+h-Y)+'" rx="2"><title>'+escape(date(a.start))+' · '+watt(a.averageW)+' · Abdeckung '+percent(a.coveragePct)+'</title></rect>';
   if(i%labelEach===0||i===entries.length-1)svg+='<text class="axis-text" x="'+(x+bar/2)+'" y="'+(H-13)+'" text-anchor="middle">'+escape(date(a.start))+'</text>';
  }
  node.innerHTML=svg+'</svg>';
 }
 function renderHistory(){
  const items=chartItems(),all=historyData();
  renderChart('historyChart',items.slice(-600),forms.settings?.targetW||9500);
  $('historyCount').textContent=items.length+' Intervalle, davon '+items.filter(x=>x.valid).length+' gültig';
  $('historyRows').innerHTML=items.slice().reverse().slice(0,200).map(x=>'<tr><td>'+escape(date(x.start))+'</td><td>'+watt(x.averageW)+'</td><td>'+kwh(x.importKWh)+'</td><td>'+percent(x.coveragePct)+'</td><td><span class="status-tag '+(x.valid?'yes':'')+'">'+(x.valid?'gültig':'unvollständig')+'</span></td></tr>').join('')||'<tr><td colspan="5">Keine Werte</td></tr>';
  const days=jsonState('history.days',{});
  $('dayRows').innerHTML=Object.keys(days).sort().reverse().slice(0,40).map(key=>{const x=days[key];return '<tr><td>'+escape(key)+'</td><td>'+watt(x.peakW)+'</td><td>'+kwh(x.importKWh)+'</td><td>'+Number(x.valid||0)+'</td></tr>'}).join('')||'<tr><td colspan="4">Noch keine Tagesdaten</td></tr>';
 }
 const srcKey=(a,b)=>Object.prototype.hasOwnProperty.call(a||{},b);
 function sourceRow(key,title,unit,required=false,pvIndex=-1){
  let o=pvIndex>=0?forms.sources.pv[pvIndex]:forms.sources[key]||{id:'',factor:1};
  const id=String(o.id||''),selector=pvIndex>=0?'pv-'+pvIndex:key;
  return '<div class="source-row" data-source="'+escape(selector)+'"><div class="name"><strong>'+escape(title)+'</strong><small>'+escape(unit)+(required?' · Pflicht':' · optional')+'</small></div>'+
  '<div class="id">'+escape(id||'Kein Datenpunkt')+'<span class="sample" data-live-source="'+escape(selector)+'">'+(id?'…':'Nicht zugeordnet')+'</span></div>'+
  '<label><span>Faktor</span><select data-factor="'+escape(selector)+'">'+FACTORS.map(([factor,label])=>'<option value="'+factor+'"'+(Number(o.factor)===factor?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
  '<div class="buttons"><button class="button small" data-source-pick="'+escape(selector)+'">Auswählen</button>'+
  '<button class="button small ghost" data-source-clear="'+escape(selector)+'"'+(required?' disabled':'')+'>×</button>'+ (pvIndex>=0?'<button class="button small danger" data-pv-delete="'+pvIndex+'">Löschen</button>':'')+'</div></div>';
 }
 async function refreshSourceReadings(){
  if(sourceReadingsRunning||page!=='sources'||!connected||!forms.sources)return;
  sourceReadingsRunning=true;const epoch=requestEpoch;
  try{
   const nodes=[...document.querySelectorAll('[data-live-source]')];
   await Promise.all(nodes.map(async node=>{
    const key=node.dataset.liveSource;
    const entry=key.startsWith('pv-')?forms.sources.pv?.[Number(key.slice(3))]:forms.sources[key];
    if(!entry?.id){node.textContent='Nicht zugeordnet';return}
    try{
     const data=await rpc('getState',entry.id);
     if(epoch!==requestEpoch||suspended)return;
     const age=Date.now()-Number(data?.ts||0);
     node.textContent=(data?.val===undefined?'Kein Wert':format(data.val,2)+' (roh)')+
      (age>180000?' · veraltet':' · aktuell');
    }catch{if(epoch===requestEpoch&&!suspended)node.textContent='Wert nicht lesbar'}
   }));
  }finally{if(epoch===requestEpoch)sourceReadingsRunning=false}
 }
 function renderSources(){
  if(!forms.sources)return;
  $('sourceRows').innerHTML=SRC_GROUPS.map(g=>'<div class="source-group"><h3>'+escape(g.title)+'</h3>'+g.keys.map(([key,title,unit,required])=>sourceRow(key,title,unit,required)).join('')+'</div>').join('');
  $('pvRows').innerHTML=Array.isArray(forms.sources.pv)?forms.sources.pv.map((x,i)=>sourceRow('pv',x.name||'PV '+(i+1),'W',false,i)).join(''):' ';
  refreshSourceReadings();
  $('sourceDirty').textContent=dirty.sources?'Nicht gespeicherte Änderungen':'Keine Änderungen';
 }
 function consumerCard(d,idx,length,output=false){
  const pick=(id,label,type)=>{
   const raw=output&&!['measuredW','statusId'].includes(id)?d.output||{}:d;
   return '<label class="span2">'+escape(label)+'<div class="out-row"><code>'+escape(raw[id]||'Nicht zugeordnet')+'</code><button type="button" class="button small" data-pick="'+escape(d.id)+'.'+escape(id)+'" data-pick-type="'+type+'" data-pick-output="'+(output?'yes':'no')+'">Auswählen</button></div></label>';
  };
  const option=(key,arr,value)=>'<select data-device="'+escape(d.id)+'" data-field="'+key+'">'+arr.map(([v,label])=>'<option value="'+v+'"'+(String(value)===String(v)?' selected':'')+'>'+escape(label)+'</option>').join('')+'</select>';
  const input=(key,number,min,max)=>'<input data-device="'+escape(d.id)+'" data-field="'+key+'" type="number" min="'+min+'" max="'+max+'" value="'+escape(number)+'">';
  const check=(key,val)=>'<input data-device="'+escape(d.id)+'" data-field="'+key+'" type="checkbox"'+(val?' checked':'')+'>';
  const rows=output?[
   '<label class="checkbox-line">'+check('output.armed',d.output?.armed)+' Diesen Ausgang freigeben</label>',
   '<label class="checkbox-line">'+check('output.enableOn',d.output?.enableOn!==false)+' true = EIN (ansonsten false = EIN)</label>',
   pick('enableId','Freigabedatenpunkt (boolesch)','boolean'),
   d.type==='variable'?pick('powerId','Ladestrom-/Leistungssollwert (Zahl)','number'):'',
   '<label class="span2">Istleistungs-Rückmeldung (Watt)'+
   '<div class="out-row"><code>'+escape(d.measuredW||'Nicht zugeordnet')+'</code><button class="button small" data-pick="'+escape(d.id)+'.measuredW" data-pick-type="number" data-pick-output="measured">Auswählen</button></div></label>',
   '<label class="span2">Statusrückmeldung EIN/AUS (Boolean, auch schreibgeschützt)'+
   '<div class="out-row"><code>'+escape(d.statusId||'Nicht zugeordnet')+'</code><button class="button small" data-pick="'+escape(d.id)+'.statusId" data-pick-type="boolean" data-pick-output="measured">Auswählen</button></div>'+
   '<small id="readFeedback_'+escape(d.id)+'" class="device-feedback">'+
   escape(d.statusId?(deviceFeedback.get(d.id)?.value===true?'Aktuell EIN':
     deviceFeedback.get(d.id)?.value===false?'Aktuell AUS':'Kein aktueller Status'):'Optional · auch für schreibgeschützte Datenpunkte')+
   '</small></label>',
   d.type==='variable'?'<label>Einheit Sollwert'+option('output.powerUnit',[['A','Ampere'],['W','Watt']],d.output?.powerUnit||'A')+'</label>':'',
   d.type==='variable'?'<label>Phasen'+option('output.phases',[[1,'1 Phase'],[3,'3 Phasen']],d.output?.phases||3)+'</label>':'',
   d.type==='variable'?'<label>Spannung (V)'+input('output.voltage',d.output?.voltage||230,200,250)+'</label>':'',
   d.type==='variable'?'<label>Min. Ladestrom (A)'+input('output.minA',d.output?.minA||6,6,32)+'</label>':'',
   d.type==='variable'?'<label>Max. Ladestrom (A)'+input('output.maxA',d.output?.maxA||16,6,80)+'</label>':''
  ]:[
   '<label class="namewide">Bezeichnung<input data-device="'+escape(d.id)+'" data-field="name" maxlength="100" value="'+escape(d.name)+'"></label>',
   '<label>Typ'+option('type',[['switch','Ein / Aus'],['variable','Regelbar']],d.type)+'</label>',
   '<label>Priorität (1 zuerst)'+input('priority',d.priority,1,99999)+'</label>',
   '<label class="checkbox-line">'+check('enabled',d.enabled)+' Aktiv</label>',
   '<label class="checkbox-line">'+check('requested',d.requested)+' Anforderung</label>',
   '<label>Betriebsart'+option('mode',[['auto','Automatik'],['on','Ein-Anforderung'],['off','Aus']],d.mode)+'</label>',
   '<label>Mindestleistung W'+input('minW',d.minW,100,50000)+'</label>',
   '<label>Maximalleistung W'+input('maxW',d.maxW,100,50000)+'</label>',
   '<label>Wiedereinschaltsperre (s)'+input('minOffSec',d.minOffSec,0,3600)+'</label>'
  ];
  return '<article class="consumer-card" data-card="'+escape(d.id)+'"><div class="consumer-head"><div><h3>'+escape(d.name)+'</h3><small>ID '+escape(d.id)+' · Priorität '+d.priority+'</small></div>'+
   (output?'<span class="status-tag '+(state('consumers.'+d.id+'.allow',false)?'yes':'')+'">'+escape(state('consumers.'+d.id+'.hardwareStatus','Keine Steuerung'))+'</span>':
    '<div class="device-actions"><button class="button small ghost" data-order="'+escape(d.id)+'" data-step="-1"'+(idx===0?' disabled':'')+'>↑</button><button class="button small ghost" data-order="'+escape(d.id)+'" data-step="1"'+(idx===length-1?' disabled':'')+'>↓</button><button class="button small danger" data-delete="'+escape(d.id)+'">Löschen</button></div>')+
   '</div><div class="device-grid">'+rows.filter(Boolean).join('')+'</div></article>';
 }
 function renderConsumers(){
  if(!forms.consumers)return;
  $('virtualMaster').checked=forms.consumers.master===true;
  $('maxParallel').value=forms.consumers.maxParallel||3;
  const list=[...forms.consumers.devices].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  $('consumerCards').innerHTML=list.length?list.map((d,i)=>consumerCard(d,i,list.length)).join(''):'<div class="panel">Noch keine Verbraucher vorhanden. Über „Verbraucher hinzufügen“ beginnen.</div>';
  $('consDirty').textContent=dirty.consumers?'Nicht gespeicherte Änderungen':'Keine Änderungen';
 }
 function renderOutputs(){
  if(!forms.outputs)return;
  $('hardwareMaster').checked=masterDraft;
  $('outputCards').innerHTML=forms.outputs.devices.length?forms.outputs.devices.map((d,i)=>consumerCard(d,i,forms.outputs.devices.length,true)).join(''):'<div class="panel">Noch keine Verbraucher. Zuerst Prioritätenmatrix anlegen.</div>';
  $('outputDirty').textContent=dirty.outputs?'Nicht gespeicherte Änderungen':'Keine Änderungen';
 }
 function renderSettings(){if(!forms.settings)return;
  for(const [id,k] of [['sTarget','targetW'],['sReserve','reserveW'],['sTariff','tariffThresholdW'],['sCoverage','minCoveragePct']])$(id).value=forms.settings[k];
  // Die Umstiegsfunktion gehört nicht mehr zur regulären Bedienoberfläche.
 }
 function mark(key){dirty[key]=true;renderDirtyOnly();}
 function renderDirtyOnly(){
  $('sourceDirty').textContent=dirty.sources?'Nicht gespeicherte Änderungen':'Keine Änderungen';
  $('consDirty').textContent=dirty.consumers?'Nicht gespeicherte Änderungen':'Keine Änderungen';
  $('outputDirty').textContent=dirty.outputs?'Nicht gespeicherte Änderungen':'Keine Änderungen';
 }
 function sourceFor(key){if(key.startsWith('pv-'))return forms.sources?.pv?.[Number(key.slice(3))];return forms.sources?.[key]}
 function setPick(target,id,meta){
  if(target.kind==='source'){
   const x=sourceFor(target.key);if(!x)return;
   x.id=id;
   const unit=String(meta?.common?.unit||'');x.factor=unit==='kW'||unit==='MWh'?1000:unit==='Wh'?.001:1;
   mark('sources');renderSources();return;
  }
  const doc=forms.outputs,d=doc?.devices.find(x=>x.id===target.id);if(!d)return;
  if(target.field==='measuredW'||target.field==='statusId')d[target.field]=id;
  else{d.output=d.output||{};d.output[target.field]=id;
   if(target.field==='powerId'&&['A','W'].includes(meta?.common?.unit))d.output.powerUnit=meta.common.unit;}
  mark('outputs');renderOutputs();
 }
 function bindDelegated(container,callback){$(container).addEventListener('click',e=>callback(e))}
 bindDelegated('sourceRows',e=>{const pick=e.target.closest('[data-source-pick]'),clear=e.target.closest('[data-source-clear]');if(clear){const x=sourceFor(clear.dataset.sourceClear);if(x){x.id='';x.factor=1;mark('sources');renderSources()}}});
 bindDelegated('pvRows',e=>{const del=e.target.closest('[data-pv-delete]'),pick=e.target.closest('[data-source-pick]');if(del){forms.sources.pv.splice(Number(del.dataset.pvDelete),1);mark('sources');renderSources()}
 });
 document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-source-pick]');if(btn){openPicker({kind:'source',key:btn.dataset.sourcePick,type:'number',write:false});return}
  const route=e.target.closest('[data-goto]');if(route)navigate(route.dataset.goto);
  const nav=e.target.closest('[data-page]');if(nav)navigate(nav.dataset.page);
 });
 for(const id of ['sourceRows','pvRows'])$(id).addEventListener('change',e=>{const key=e.target.dataset.factor;if(key){const x=sourceFor(key);if(x){x.factor=Number(e.target.value);mark('sources')}}});
 $('addPv').addEventListener('click',()=>{if(!forms.sources)return;
  forms.sources.pv=forms.sources.pv||[];forms.sources.pv.push({id:'',factor:1,name:'PV '+(forms.sources.pv.length+1)});mark('sources');renderSources()});
 let deviceDialogBusy=false;
 function openNewConsumerDialog(){
  if(!forms.consumers||!Array.isArray(forms.consumers.devices)){
   showNotice('Verbraucherliste noch nicht geladen. Bitte ioBroker-Verbindung prüfen.',true);return;
  }
  if(forms.consumers.devices.length>=250){showNotice('Die maximale Anzahl von 250 Verbrauchern ist erreicht.',true);return;}
  if(dirty.outputs){showNotice('Bitte zuerst die noch offenen Änderungen unter Geräteausgänge speichern oder verwerfen.',true);return;}
  $('deviceNewName').value='';
  $('deviceNewType').value='switch';
  $('deviceNewMax').value='1000';
  $('deviceNewMin').value='1000';
  $('deviceNewMinGroup').classList.add('hidden');
  $('deviceNewPriority').value=String(Math.min(99999,Math.max(0,...forms.consumers.devices.map(d=>Number(d.priority)||0))+1));
  $('deviceDialogError').classList.add('hidden');
  $('deviceCreate').disabled=false;
  $('deviceDialog').classList.remove('hidden');
  $('deviceNewName').focus();
 }
 function closeNewConsumerDialog(){
  if(deviceDialogBusy)return;
  $('deviceDialog').classList.add('hidden');
 }
 for(const button of ['addDevice','overviewAddDevice','deviceIntroAdd'])
  $(button).addEventListener('click',openNewConsumerDialog);
 for(const button of ['deviceDialogCancel','deviceDialogCancelTop'])
  $(button).addEventListener('click',closeNewConsumerDialog);
 $('deviceDialog').addEventListener('click',e=>{
  if(e.target===$('deviceDialog'))closeNewConsumerDialog();
 });
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('deviceDialog').classList.contains('hidden'))closeNewConsumerDialog();
 });
 $('deviceNewType').addEventListener('change',()=>{
  const variable=$('deviceNewType').value==='variable';
  $('deviceNewMinGroup').classList.toggle('hidden',!variable);
  if(variable && Number($('deviceNewMax').value)===1000){
   $('deviceNewMax').value='11000';$('deviceNewMin').value='4140';
  }
 });
 $('deviceForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(deviceDialogBusy)return;
  const fail=msg=>{
   const el=$('deviceDialogError');
   el.textContent=msg;el.classList.remove('hidden');
  };
  const name=String($('deviceNewName').value||'').trim();
  const type=$('deviceNewType').value,maximum=Number($('deviceNewMax').value);
  const minimum=type==='variable'?Number($('deviceNewMin').value):maximum;
  const priority=Number($('deviceNewPriority').value);
  if(!name||name.length>100)return fail('Bitte eine Bezeichnung mit maximal 100 Zeichen eingeben.');
  if(!['switch','variable'].includes(type))return fail('Unbekannter Verbrauchertyp.');
  if(!Number.isInteger(maximum)||maximum<100||maximum>50000)return fail('Die Maximalleistung muss zwischen 100 und 50.000 Watt liegen.');
  if(!Number.isInteger(minimum)||minimum<100||minimum>maximum)return fail('Die Mindestleistung muss mindestens 100 Watt betragen und darf die Maximalleistung nicht übersteigen.');
  if(!Number.isInteger(priority)||priority<1||priority>99999)return fail('Die Priorität muss zwischen 1 und 99.999 liegen.');
  if(!connected)return fail('Keine Verbindung zu ioBroker. Bitte erneut versuchen.');
  deviceDialogBusy=true;$('deviceCreate').disabled=true;
  try{
   // Neueste gespeicherte Konfiguration lesen. Ungespeicherte Änderungen in
   // der Prioritätenmatrix werden ausdrücklich in denselben Speichervorgang einbezogen.
   const latest=await readVal('config.consumers');
   const onServer=JSON.parse(String(latest?.val||'{}'));
   const doc=dirty.consumers?copy(forms.consumers):onServer;
   isAllowedShape(doc);
   if(doc.devices.length>=250)throw Error('Maximal 250 Verbraucher pro Instanz.');
   if(doc.devices.some(d=>String(d.name||'').trim().toLowerCase()===name.toLowerCase())){
    throw Error('Ein Verbraucher mit diesem Namen existiert bereits.');
   }
   let next=1;const ids=new Set(doc.devices.map(d=>d.id));
   while(ids.has('verbraucher_'+next))next++;
   const newId='verbraucher_'+next;
   doc.devices.push({id:newId,name,type,enabled:false,requested:true,mode:'auto',
    priority,minW:minimum,maxW:maximum,minOffSec:30,measuredW:'',
    output:{armed:false,enableId:'',enableOn:true,powerId:'',powerUnit:'A',
     phases:3,voltage:230,minA:6,maxA:16}});
   isAllowedShape(doc);
   const payload=JSON.stringify(doc);
   await setVal('config.consumers',payload);
   const confirmState=await readVal('config.consumers');
   if(confirmState?.val!==payload)throw Error('Der neue Verbraucher wurde noch nicht vom ioBroker bestätigt.');
   dirty.consumers=false;
   forms.consumers=copy(doc);
   states[N+'.config.consumers']={val:payload,ack:true,ts:Date.now()};
   $('deviceDialog').classList.add('hidden');
   showNotice('Verbraucher „'+name+'“ wurde gespeichert. Die zugehörigen Datenpunkte werden durch den Adapter angelegt. Die Hardwaresteuerung bleibt ausgeschaltet.');
   navigate('devices');
   await poll();
  }catch(err){fail('Verbraucher konnte nicht angelegt werden: '+String(err.message||err))}
  finally{deviceDialogBusy=false;$('deviceCreate').disabled=false}
 });
 function deviceChange(e,output){
  const el=e.target,id=el.dataset.device,key=el.dataset.field;
  if(!id||!key)return;
  const doc=output?forms.outputs:forms.consumers;
  const d=doc?.devices.find(x=>x.id===id);if(!d)return;
  const keyParts=key.split('.');let ref=d;
  for(let i=0;i<keyParts.length-1;i++)ref=ref[keyParts[i]]||(ref[keyParts[i]]={});
  const field=keyParts.at(-1);
  ref[field]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;
  if(!output&&d.type==='switch')d.minW=d.maxW;
  mark(output?'outputs':'consumers');
 }
 $('consumerCards').addEventListener('change',e=>deviceChange(e,false));
 $('consumerCards').addEventListener('input',e=>{if(e.target.type==='text')deviceChange(e,false)});
 $('outputCards').addEventListener('change',e=>deviceChange(e,true));
 $('consumerCards').addEventListener('click',e=>{
  const del=e.target.closest('[data-delete]'),ord=e.target.closest('[data-order]');const doc=forms.consumers;
  if(!doc)return;
  if(del){const d=doc.devices.find(x=>x.id===del.dataset.delete);if(d&&confirm('Verbraucher „'+d.name+'“ aus der Matrix entfernen?')){doc.devices=doc.devices.filter(x=>x.id!==d.id);mark('consumers');renderConsumers()}}
  if(ord){const list=[...doc.devices].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));const i=list.findIndex(x=>x.id===ord.dataset.order),next=i+Number(ord.dataset.step);
   if(i>=0&&next>=0&&next<list.length){[list[i],list[next]]=[list[next],list[i]];list.forEach((d,j)=>d.priority=j+1);doc.devices=list;mark('consumers');renderConsumers()}}
 });
 $('outputCards').addEventListener('click',e=>{const btn=e.target.closest('[data-pick]');if(!btn)return;
  const dot=btn.dataset.pick.lastIndexOf('.'),id=btn.dataset.pick.slice(0,dot),field=btn.dataset.pick.slice(dot+1);
  openPicker({kind:'output',id,field,type:btn.dataset.pickType||'number',write:btn.dataset.pickOutput!=='measured'});
 });
 $('virtualMaster').addEventListener('change',e=>{forms.consumers.master=e.target.checked;mark('consumers')});
 $('maxParallel').addEventListener('input',e=>{forms.consumers.maxParallel=Number(e.target.value);mark('consumers')});
 $('hardwareMaster').addEventListener('change',e=>{masterDraft=e.target.checked;mark('outputs')});
 async function readValidSelected(id,expected,write){
  if(!id)return null;
  const obj=await readObj(id);
  if(obj?.type!=='state'||obj.common?.type!==expected||write&&obj.common?.write!==true||!write&&obj.common?.read===false)throw Error('Ungültiger '+expected+'-Datenpunkt: '+id);
  return obj;
 }
 function isAllowedShape(doc){if(!doc||!Array.isArray(doc.devices))throw Error('Verbraucherliste nicht lesbar');
  if(doc.devices.length>250)throw Error('Maximal 250 Verbraucher');
  if(new Set(doc.devices.map(x=>x.id)).size!==doc.devices.length)throw Error('Doppelte Verbraucher-IDs');
  for(const d of doc.devices){if(!/^[a-z][a-z0-9_]{1,47}$/.test(d.id))throw Error('Ungültige ID: '+d.id)}
 }
 async function save(id,payload,label){
  await setVal(id,JSON.stringify(payload));
  const confirmed=await readVal(id);
  if(confirmed?.val!==JSON.stringify(payload))throw Error('Der neue Zustand wurde nicht bestätigt');
  dirty[label]=false;clearNotice();showNotice('Einstellungen wurden gespeichert.');await poll();
 }
 $('saveSources').addEventListener('click',async()=>{
  try{if(!forms.sources)return;
   for(const g of SRC_GROUPS)for(const [key,description,,required] of g.keys){const x=forms.sources[key]||{};if(required&&!x.id)throw Error('Pflichtquelle fehlt: '+description);if(x.id)await readValidSelected(x.id,'number',false)}
   for(const pv of forms.sources.pv||[]){if(!pv.id)throw Error('Bei PV-Quellen muss ein Datenpunkt ausgewählt werden');await readValidSelected(pv.id,'number',false)}
   const old=jsonState('config.sources',{});
   if(JSON.stringify(old.importKWh)!==JSON.stringify(forms.sources.importKWh)||JSON.stringify(old.exportKWh)!==JSON.stringify(forms.sources.exportKWh)){
    if(!confirm('Der Zähler wurde verändert. Die laufende Viertelstunde wird verworfen, historische Spitzen bleiben erhalten. Fortfahren?'))return;
   }
   await save('config.sources',forms.sources,'sources');
  }catch(e){showNotice('Datenquellen konnten nicht gespeichert werden: '+e.message,true)}
 });
 $('resetSources').addEventListener('click',()=>{dirty.sources=false;forms.sources=jsonState('config.sources',{});renderSources()});
 $('saveConsumers').addEventListener('click',async()=>{
  try{const doc=copy(forms.consumers);doc.maxParallel=Number($('maxParallel').value);isAllowedShape(doc);
   const fresh=await readVal('config.consumers'),current=JSON.parse(fresh?.val||'{}');isAllowedShape(current);
   const measurementSources=new Map(current.devices.map(device=>[device.id,device]));
   for(const device of doc.devices){const source=measurementSources.get(device.id);device.measuredW=source?.measuredW||'';device.statusId=source?.statusId||'';}
   await save('config.consumers',doc,'consumers')}
  catch(e){showNotice('Verbraucher konnten nicht gespeichert werden: '+e.message,true)}
 });
 $('resetConsumers').addEventListener('click',()=>{dirty.consumers=false;forms.consumers=jsonState('config.consumers',{});renderConsumers()});
 $('saveOutputs').addEventListener('click',async()=>{
  try{
   const fresh=await readVal('config.consumers'),current=JSON.parse(fresh?.val||'{}');isAllowedShape(current);
   const pending=new Map(forms.outputs.devices.map(x=>[x.id,x]));
   for(const d of current.devices){const changed=pending.get(d.id);if(changed)d.output=copy(changed.output)}
   const used=new Set();
   for(const d of current.devices){
    if(d.statusId)await readValidSelected(d.statusId,'boolean',false);
    const a=d.output||{};if(!a.armed)continue;
    if(!a.enableId)throw Error('Freigabedatenpunkt fehlt bei '+d.name);
    if(!d.measuredW)throw Error('Istleistungsmessung fehlt bei '+d.name);
    await readValidSelected(a.enableId,'boolean',true);await readValidSelected(d.measuredW,'number',false);
    if(d.type==='variable'){if(!a.powerId)throw Error('Sollwert fehlt bei '+d.name);const p=await readValidSelected(a.powerId,'number',true);
     if(p.common?.unit&&p.common.unit!==a.powerUnit)throw Error('Sollwert-Einheit stimmt nicht: '+d.name);}
    for(const id of [a.enableId,a.powerId]){if(!id)continue;if(used.has(id))throw Error('Mehrfach zugewiesener Ausgang '+id);used.add(id)}
   }
   if(masterDraft&&current.devices.some(x=>x.output?.armed)){
    if(!confirm('SICHERHEITSABFRAGE: Jetzt können echte Schaltbefehle an die zugeordneten Geräte gesendet werden. Sind Schutzeinrichtungen, Schnittstellen, Phasenzahl, Grenzwerte und konkurrierende Automationen geprüft?'))return;
    if(!confirm('Hardwaresteuerung endgültig aktivieren? Geräte können unmittelbar geschaltet werden.'))return;
   }
   await setVal('config.consumers',saveJSON(current));
   const check=await readVal('config.consumers');if(check?.val!==saveJSON(current))throw Error('Zuordnungen wurden nicht bestätigt');
   // Hardware-Master immer zuletzt einschalten.
   await setVal('config.hardwareMaster',masterDraft);
   const master=await readVal('config.hardwareMaster');if(master?.val!==masterDraft)throw Error('Hardware-Master wurde nicht bestätigt');
   forms.outputs=copy(current);dirty.outputs=false;showNotice('Geräteausgänge gespeichert; Hardware-Master '+(masterDraft?'EIN':'AUS')+'.');await poll();
  }catch(e){showNotice('Geräteausgänge konnten nicht gespeichert werden: '+e.message,true)}
 });
 $('resetOutputs').addEventListener('click',()=>{dirty.outputs=false;forms.outputs=jsonState('config.consumers',{});masterDraft=state('config.hardwareMaster',false)===true;renderOutputs()});
 $('saveSettings').addEventListener('click',async()=>{
  try{const values={targetW:Number($('sTarget').value),reserveW:Number($('sReserve').value),tariffThresholdW:Number($('sTariff').value),minCoveragePct:Number($('sCoverage').value)};
   if(!Number.isFinite(values.targetW)||values.targetW<500||values.targetW>100000)throw Error('Leistungsziel außerhalb des zulässigen Bereichs');
   if(values.minCoveragePct<50||values.minCoveragePct>100)throw Error('Messabdeckung ungültig');
   await save('config.settings',values,'settings');
  }catch(e){showNotice('Einstellungen konnten nicht gespeichert werden: '+e.message,true)}
 });
 const sourceFilter=id=>!id.startsWith('energiemanagement.')&&!id.startsWith('system.');
 async function loadAdapters(){
  try{const rows=(await findObjects('instance',{startkey:'system.adapter.',endkey:'system.adapter.\u9999'}))?.rows||[];
   adapterNames=[...new Set(rows.map(x=>x.id.replace(/^system\.adapter\./,'')))].filter(x=>/^[\w-]+\.\d+$/.test(x)).sort();
   if(!adapterNames.includes('0_userdata.0'))adapterNames.unshift('0_userdata.0');
   $('pickerAdapter').innerHTML=adapterNames.map(id=>'<option value="'+escape(id)+'">'+escape(id)+'</option>').join('');
  }catch(e){console.warn('Adapterliste',e)}
 }
 function openPicker(details){
  picker=details;pickerLimit=150;
  $('picker').classList.remove('hidden');
  $('pickerHint').textContent=(details.write?'Beschreibbaren':'Lesbaren')+' '+(details.type==='boolean'?'Boolean-':'numerischen')+'-Datenpunkt wählen. Unpassende Zustände werden auf Wunsch ebenfalls angezeigt, aber nicht zugeordnet.';
  $('pickerSearch').value='';
  $('pickerShowAll').checked=false;
  const value=details.kind==='source'?sourceFor(details.key)?.id:
   (()=>{const d=forms.outputs?.devices.find(x=>x.id===details.id);return ['measuredW','statusId'].includes(details.field)?d?.[details.field]:d?.output?.[details.field]})();
  const adapter=String(value||'').split('.').slice(0,2).join('.');
  if(adapterNames.includes(adapter))$('pickerAdapter').value=adapter;
  else if(adapterNames.length)$('pickerAdapter').value=adapterNames[0];
  loadPicker();
 }
 function compatiblePicker(x){
  return x&&x.obj?.type==='state'&&x.obj.common?.type===picker?.type&&
   (picker.write?x.obj.common.write===true:x.obj.common.read!==false)&&sourceFilter(x.id);
 }
 async function loadPicker(){
  if(!picker||pickerLoading)return;
  const instance=$('pickerAdapter').value;
  pickerLoading=true;
  $('pickerCount').textContent='Lade Datenpunkte aus '+instance+' …';
  if(!objectCache.has(instance)){
   try{
    // Eine vollständige Objektabfrage; erst die Browseransicht wird in Seiten geteilt.
    const rows=(await findObjects('state',{startkey:instance+'.',endkey:instance+'.\u9999'}))?.rows||[];
    objectCache.set(instance,rows.map(x=>({id:x.id,obj:x.value})).filter(x=>x.obj?.type==='state'));
   }catch(e){
    $('pickerCount').textContent='Adapter konnte nicht gelesen werden: '+e.message;
    pickerLoading=false;return;
   }
  }
  pickerLoading=false;renderPicker();
 }
 function renderPicker(){
  if(!picker)return;
  const inst=$('pickerAdapter').value,q=$('pickerSearch').value.toLowerCase().trim();
  const showAll=$('pickerShowAll').checked;
  const rows=objectCache.get(inst)||[];
  const entries=rows.filter(x=>{
   if(!showAll&&!compatiblePicker(x))return false;
   const name=x.obj?.common?.name;
   const label=typeof name==='string'?name:Object.values(name||{}).join(' ');
   return (x.id+' '+label).toLowerCase().includes(q);
  }).sort((a,b)=>{
    const aOk=compatiblePicker(a)?0:1,bOk=compatiblePicker(b)?0:1;
    if(aOk!==bOk)return aOk-bOk;
    const aStart=a.id.toLowerCase().startsWith(q)?0:1,bStart=b.id.toLowerCase().startsWith(q)?0:1;
    return aStart-bStart||a.id.localeCompare(b.id);
  });
  const count=Math.min(entries.length,pickerLimit);
  $('pickerCount').textContent=rows.length+' Datenpunkte aus '+inst+' · '+entries.length+
   (showAll?' Suchtreffer insgesamt':' passende Suchtreffer')+' · '+count+' angezeigt';
  $('pickerResults').innerHTML=entries.slice(0,pickerLimit).map(x=>{
   const name=x.obj.common?.name;
   const label=typeof name==='string'?name:name?.de||name?.en||x.id;
   const ok=compatiblePicker(x);
   const reason=ok?'Auswählbar':x.obj.common?.type!==picker.type?
      'Datentyp '+(x.obj.common?.type||'unbekannt')+' (benötigt '+picker.type+')':
      picker.write?'Nur lesbar – kein Schaltausgang':'Nicht als Datenquelle lesbar';
   return '<button type="button" class="picker-result'+(ok?'':' picker-incompatible')+
    '" data-selected="'+escape(x.id)+'"'+(ok?'':' disabled')+
    ' title="'+escape(reason)+'"><span>'+escape(label)+'<small>'+escape(x.id)+
    '</small></span><i>'+escape(x.obj.common.unit||x.obj.common.type||'')+
    ' · '+escape(reason)+'</i></button>';
  }).join('')||'<div class="empty">Keine Datenpunkte gefunden. Adapter oder Suche ändern.</div>';
  $('pickerMore').classList.toggle('hidden',count>=entries.length);
 }
 $('pickerAdapter').addEventListener('change',()=>{pickerLimit=150;loadPicker()});
 $('pickerSearch').addEventListener('input',()=>{pickerLimit=150;renderPicker()});
 $('pickerShowAll').addEventListener('change',()=>{pickerLimit=150;renderPicker()});
 $('pickerMore').addEventListener('click',()=>{pickerLimit+=150;renderPicker()});
 $('pickerResults').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-selected]');if(!btn||btn.disabled)return;
  try{
   const id=btn.dataset.selected,meta=await readObj(id);
   const x={id,obj:meta};
   if(!compatiblePicker(x))throw Error('Dieser Datenpunkt ist für die Zuordnung nicht kompatibel.');
   setPick(picker,id,meta);closePicker();
  }catch(e){showNotice(e.message,true)}
 });
 function closePicker(){picker=null;$('picker').classList.add('hidden')}
 $('pickerClose').addEventListener('click',closePicker);
 $('pickerClear').addEventListener('click',()=>{if(!picker)return;setPick(picker,'',null);closePicker()});
 $('picker').addEventListener('click',e=>{if(e.target===$('picker'))closePicker()});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&picker)closePicker()});
 $('chartRange').addEventListener('change',renderHistory);
 $('exportCsv').addEventListener('click',()=>{
  const rows=chartItems(),lines=['Start;Durchschnitt_W;Netzbezug_kWh;Abdeckung_Prozent;Gueltig',...rows.map(x=>[new Date(x.start).toISOString(),x.averageW,x.importKWh,x.coveragePct,x.valid?1:0].join(';'))];
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Energiemanagement-Viertelstunden.csv';a.click();URL.revokeObjectURL(url);
 });
 $('refresh').addEventListener('click',poll);
 $('autoRefresh').addEventListener('click',()=>{
  autoUpdate=!autoUpdate;
  const button=$('autoRefresh');
  button.textContent=autoUpdate?'Live: EIN':'Live: PAUSE';
  button.setAttribute('aria-pressed',String(autoUpdate));
  button.title=autoUpdate?'Automatische Aktualisierung aktiv – nur Messwerte und Diagramme':
   'Automatische Aktualisierung pausiert. Manuell über „Aktualisieren“ möglich.';
  if(autoUpdate)poll();
 });

 window.addEventListener('energy-features-updated',event=>{applyFeatures(event.detail);if(!event.detail?.heating)readVal('config.heating').then(s=>{if(s?.val)window.EnergyHeatingUI?.loadConfig(JSON.parse(s.val));}).catch(()=>{});});
 window.addEventListener('hashchange',()=>{
  const next=hashToPage[location.hash]||'overview';
  const changed=next!==page;
  page=next;renderPage();
  if(changed)window.scrollTo({top:0,behavior:'instant'});
 });
 document.addEventListener('visibilitychange',()=>document.hidden?suspendConnection():resumeConnection());
 window.addEventListener('pagehide',suspendConnection);
 window.addEventListener('pageshow',event=>resumeConnection(event.persisted===true));
 window.addEventListener('offline',()=>{suspendConnection();transportLost('Keine Netzwerkverbindung.');});
 window.addEventListener('online',()=>resumeConnection(true));
 $('connectionRetry')?.addEventListener('click',()=>resumeConnection(true));
 page=hashToPage[location.hash]||'overview';renderPage();openSocket();
 setInterval(()=>{if(autoUpdate&&!document.hidden&&!suspended)ensureConnection()},10000);
})();
