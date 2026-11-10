'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const kwh=x=>finite(x)?new Intl.NumberFormat('de-AT',{maximumFractionDigits:1,minimumFractionDigits:1}).format(x)+' kWh':'–';
 const defaults=()=>({enabled:false,provider:'open-meteo',location:{name:'',latitude:null,longitude:null,timezone:'Europe/Vienna'},arrays:[{name:'Dach 1',peakKwp:0,tilt:30,azimuth:180}],performanceRatio:0.8,weatherFactor:0.7});
 let states={},N='energiemanagement.0',api={},loaded=false,dirty=false,saving=false,searching=false,results=[],page='overview';
 const state=(id,def)=>states[N+'.'+id]?.val??def;
 const parse=(id,def)=>{try{return JSON.parse(state(id,''))}catch{return def}};
 const numeric=id=>$(id).value.trim()===''?null:Number($(id).value);
 const day=(ts,tz)=>new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts));
 const formatTime=(ts,tz)=>new Intl.DateTimeFormat('de-AT',{timeZone:tz,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(ts));
 function notice(message,error=false){$('forecastConfigStatus').textContent=message;$('forecastConfigStatus').classList.toggle('forecast-error',error)}
 function markDirty(){dirty=true;$('forecastDirty').textContent='Ungespeicherte Änderungen'}
 function arrayRow(d,i){
  const row=document.createElement('div');row.className='forecast-array';
  row.innerHTML='<label>Teilfläche / Dach<input data-f-field="name" type="text" maxlength="80" value="'+esc(d.name||'Dach '+(i+1))+'"></label>'+
   '<label>Nennleistung (kWp)<input data-f-field="peakKwp" type="number" min="0.1" max="1000" step="0.1" value="'+esc(d.peakKwp??'')+'" placeholder="z. B. 6,5"></label>'+
   '<label>Dachneigung (°)<input data-f-field="tilt" type="number" min="0" max="90" step="1" value="'+esc(d.tilt??30)+'"></label>'+
   '<label>Ausrichtung (°)<input data-f-field="azimuth" type="number" min="0" max="360" step="1" value="'+esc(d.azimuth??180)+'"></label>'+
   '<button type="button" class="button ghost forecast-remove" aria-label="Teilfläche entfernen">Entfernen</button>';
  row.querySelector('button').addEventListener('click',()=>{row.remove();markDirty()});
  row.addEventListener('input',markDirty);return row;
 }
 function loadConfig(config){
  const c=config&&typeof config==='object'?config:defaults();
  $('forecastEnabled').checked=c.enabled===true;
  $('forecastProvider').value=c.provider||'open-meteo';
  providerControls();
  $('forecastLocationName').value=c.location?.name||'';
  $('forecastLatitude').value=c.location?.latitude??'';
  $('forecastLongitude').value=c.location?.longitude??'';
  $('forecastPerformance').value=c.performanceRatio??0.8;
  $('forecastWeatherFactor').value=c.weatherFactor??0.7;
  $('forecastTimezone').value=c.location?.timezone||'Europe/Vienna';
  $('forecastArrays').replaceChildren(...(Array.isArray(c.arrays)?c.arrays:defaults().arrays).map(arrayRow));
  loaded=true;dirty=false;$('forecastDirty').textContent='Keine Änderungen';
 }
 function readConfig(){
  const location={name:$('forecastLocationName').value.trim().slice(0,120),latitude:numeric('forecastLatitude'),longitude:numeric('forecastLongitude'),timezone:$('forecastTimezone').value.trim()};
  const arrays=[...$('forecastArrays').children].map((row,i)=>{
   const value=key=>row.querySelector('[data-f-field="'+key+'"]');
   const number=key=>value(key).value.trim()===''?null:Number(value(key).value);
   return {name:value('name').value.trim().slice(0,80)||'Dach '+(i+1),peakKwp:number('peakKwp'),tilt:number('tilt'),azimuth:number('azimuth')};
  });
  const config={enabled:$('forecastEnabled').checked,provider:$('forecastProvider').value,location,arrays,performanceRatio:numeric('forecastPerformance'),weatherFactor:numeric('forecastWeatherFactor')};
  return validateConfig(config);
 }
 function validateConfig(config){
  const {location,arrays}=config;
  if(!['open-meteo','local'].includes(config.provider))throw Error('Unbekannte Prognosemethode.');
  if(location.latitude!==null&&(!finite(location.latitude)||location.latitude< -90||location.latitude>90)||location.longitude!==null&&(!finite(location.longitude)||location.longitude< -180||location.longitude>180))throw Error('Koordinaten sind ungültig.');
  if(config.enabled&&(!finite(location.latitude)||location.latitude< -90||location.latitude>90||!finite(location.longitude)||location.longitude< -180||location.longitude>180))throw Error('Bitte einen Standort auswählen oder gültige Koordinaten eingeben.');
  if(arrays.length===0)throw Error('Mindestens eine PV-Teilfläche einrichten.');
  if(arrays.length>4)throw Error('Maximal vier PV-Teilflächen sind möglich.');
  for(const a of arrays)if(!finite(a.peakKwp)||a.peakKwp<(config.enabled?0.01:0)||a.peakKwp>1000||!finite(a.tilt)||a.tilt<0||a.tilt>90||!finite(a.azimuth)||a.azimuth<0||a.azimuth>360)throw Error('Teilflächen benötigen gültige Nennleistung (größer 0 bis 1000 kWp bei aktivierter Berechnung), Neigung (0–90°) und Ausrichtung (0–360°).');
  for(const a of arrays)a.azimuth%=360;
  if(!finite(config.performanceRatio)||config.performanceRatio<0.5||config.performanceRatio>1)throw Error('Der Anlagenfaktor muss zwischen 0,5 und 1 liegen.');
  if(!finite(config.weatherFactor)||config.weatherFactor<0.05||config.weatherFactor>1)throw Error('Der Wetterfaktor muss zwischen 0,05 und 1 liegen.');
  try{new Intl.DateTimeFormat('de',{timeZone:location.timezone}).format(new Date())}catch{throw Error('Bitte eine gültige IANA-Zeitzone eingeben, z. B. Europe/Vienna.')}
  return config;
 }
 async function save(){
  if(saving)return;saving=true;$('forecastSave').disabled=true;
  try{
   const config=readConfig();if(!api.setVal||!api.readVal)throw Error('ioBroker-Verbindung noch nicht bereit.');
   await api.setVal('config.forecast',JSON.stringify(config));
   let accepted=null;
   for(let i=0;i<25;i++){
    const result=await api.readVal('config.forecast');
    if(result?.ack===true){accepted=JSON.parse(result.val);if(JSON.stringify(accepted)!==JSON.stringify(config))throw Error('Der Adapter hat die Einstellungen nicht übernommen. Bitte Eingaben prüfen.');break}
    await new Promise(resolve=>setTimeout(resolve,200));
   }
   if(!accepted)throw Error('Bestätigung durch den Adapter fehlt. Bitte Status prüfen.');
   loadConfig(accepted);notice(config.enabled?'Gespeichert. Die PV-Prognose wird im Hintergrund aktualisiert.':'Gespeichert. Die PV-Prognose ist deaktiviert.');
  }catch(e){notice('Speichern fehlgeschlagen: '+e.message,true)}finally{saving=false;$('forecastSave').disabled=false}
 }
 const locations=[
  ['Wien','Österreich',48.2082,16.3738,'Europe/Vienna'],['Salzburg','Österreich',47.8095,13.0550,'Europe/Vienna'],['Linz','Österreich',48.3069,14.2858,'Europe/Vienna'],['Graz','Österreich',47.0707,15.4395,'Europe/Vienna'],['Innsbruck','Österreich',47.2692,11.4041,'Europe/Vienna'],['Klagenfurt','Österreich',46.6247,14.3053,'Europe/Vienna'],['St. Pölten','Österreich',48.2047,15.6256,'Europe/Vienna'],['Bregenz','Österreich',47.5031,9.7471,'Europe/Vienna'],['Eisenstadt','Österreich',47.8457,16.5233,'Europe/Vienna'],['Steyr','Österreich',48.0427,14.4213,'Europe/Vienna'],['Wels','Österreich',48.1575,14.0289,'Europe/Vienna'],
  ['Berlin','Deutschland',52.5200,13.4050,'Europe/Berlin'],['München','Deutschland',48.1351,11.5820,'Europe/Berlin'],['Hamburg','Deutschland',53.5511,9.9937,'Europe/Berlin'],['Köln','Deutschland',50.9375,6.9603,'Europe/Berlin'],['Frankfurt am Main','Deutschland',50.1109,8.6821,'Europe/Berlin'],['Stuttgart','Deutschland',48.7758,9.1829,'Europe/Berlin'],['Dresden','Deutschland',51.0504,13.7373,'Europe/Berlin'],['Leipzig','Deutschland',51.3397,12.3731,'Europe/Berlin'],['Nürnberg','Deutschland',49.4521,11.0767,'Europe/Berlin'],['Regensburg','Deutschland',49.0134,12.1016,'Europe/Berlin'],['Passau','Deutschland',48.5667,13.4319,'Europe/Berlin'],['Freiburg','Deutschland',47.9990,7.8421,'Europe/Berlin'],['Zürich','Schweiz',47.3769,8.5417,'Europe/Zurich'],['Bern','Schweiz',46.9480,7.4474,'Europe/Zurich'],['Basel','Schweiz',47.5596,7.5886,'Europe/Zurich'],['Genf','Schweiz',46.2044,6.1432,'Europe/Zurich'],['Bozen','Italien',46.4983,11.3548,'Europe/Rome'],['Vaduz','Liechtenstein',47.1410,9.5209,'Europe/Vaduz']
 ].map(([name,country,latitude,longitude,timezone])=>({name,country,latitude,longitude,timezone}));
 function search(){
  const query=$('forecastLocationSearch').value.trim().toLocaleLowerCase('de');
  results=locations.filter(r=>(r.name+' '+r.country).toLocaleLowerCase('de').includes(query));
  $('forecastSearchResults').innerHTML=results.map((r,i)=>'<button type="button" class="forecast-location-result" data-location="'+i+'"><strong>'+esc(r.name)+'</strong><span>'+esc(r.country)+' · '+esc(r.latitude)+', '+esc(r.longitude)+'</span></button>').join('');
  notice(results.length?'Ort aus der lokalen Liste auswählen oder genaue Koordinaten selbst eingeben.':'Kein Ort in der lokalen Liste gefunden. Standortbezeichnung und Koordinaten unten selbst eingeben.');
 }
 function providerControls(){
  const local=$('forecastProvider').value==='local';
  $('forecastLocalTimezone').classList.toggle('hidden',!local);
  $('forecastWeatherFactorBox').classList.toggle('hidden',!local);
 }
 async function searchOnline(){
  if(searching)return;const query=$('forecastLocationSearch').value.trim();
  if(query.length<3){notice('Bitte mindestens drei Zeichen für Ort oder Postleitzahl eingeben.',true);return}
  searching=true;$('forecastSearchOnline').disabled=true;notice('Standorte werden über Open-Meteo gesucht …');
  try{
   if(!api.send)throw Error('ioBroker-Verbindung noch nicht bereit.');
   const response=await api.send('forecastGeocode',{query});
   if(!response?.ok)throw Error(response?.error||'Standortsuche nicht verfügbar.');
   results=Array.isArray(response.results)?response.results:[];
   $('forecastSearchResults').innerHTML=results.map((r,i)=>'<button type="button" class="forecast-location-result" data-location="'+i+'"><strong>'+esc(r.name)+'</strong><span>'+esc([r.admin1,r.country].filter(Boolean).join(', '))+' · '+esc(r.latitude)+', '+esc(r.longitude)+'</span></button>').join('');
   notice(results.length?'Treffer auswählen, Anlagendaten prüfen und speichern.':'Keine Treffer gefunden. Ortsname und Land versuchen oder Koordinaten eingeben.');
  }catch(e){notice('Standortsuche fehlgeschlagen: '+e.message,true)}finally{searching=false;$('forecastSearchOnline').disabled=false}
 }
 function configurationGaps(config){
  const gaps=[];
  if(!finite(config.location?.latitude)||config.location.latitude< -90||config.location.latitude>90||!finite(config.location?.longitude)||config.location.longitude< -180||config.location.longitude>180)gaps.push('Standort');
  if(!Array.isArray(config.arrays)||config.arrays.length===0||config.arrays.some(a=>!finite(a.peakKwp)||a.peakKwp<=0))gaps.push('PV-Nennleistung in kWp');
  return gaps;
 }
 function currentForecast(){
  const config=parse('config.forecast',defaults()),data=parse('forecast.data',{}),now=Date.now();
  const matches=data.configSignature===JSON.stringify(config);
  const fresh=finite(data.fetchedAt)&&now-data.fetchedAt>=-15000&&now-data.fetchedAt<3*3600000;
  const timezone=typeof data.timezone==='string'?data.timezone:'Europe/Vienna';
  let tz=timezone;try{day(now,tz)}catch{tz='Europe/Vienna'}
  const valid=config.enabled===true&&configurationGaps(config).length===0&&matches&&fresh&&Array.isArray(data.days)&&Array.isArray(data.hours);
  return {config,data,now,timezone:tz,valid};
 }
 function drawChart(hours,tz){
  const host=$('forecastChart');
  const rows=hours.filter(h=>finite(h.start)&&finite(h.end)&&h.end>h.start);
  const values=rows.filter(h=>finite(h.averageW));
  if(!rows.length||!values.length){host.innerHTML='<div class="empty">Keine gültigen Stundenwerte verfügbar.</div>';return}
  const W=1050,H=245,L=75,R=20,T=15,B=42,max=values.reduce((m,h)=>Math.max(m,h.averageW),100);
  const start=rows[0].start,end=rows.at(-1).end;
  const x=ts=>L+(ts-start)/(end-start)*(W-L-R),y=v=>H-B-(v/max)*(H-T-B);
  let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Prognose der mittleren PV-Leistung je Stunde"><title>Geschätzte mittlere PV-Leistung je Stunde in Watt</title>';
  for(let i=0;i<=3;i++){const v=max*i/3,yy=y(v);svg+='<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="#344653"/><text x="'+(L-9)+'" y="'+(yy+4)+'" text-anchor="end">'+Math.round(v).toLocaleString('de-AT')+' W</text>'}
  for(const h of rows){if(!finite(h.averageW))continue;svg+='<rect x="'+x(h.start).toFixed(1)+'" y="'+y(h.averageW).toFixed(1)+'" width="'+Math.max(1,x(h.end)-x(h.start)-1).toFixed(1)+'" height="'+(H-B-y(h.averageW)).toFixed(1)+'" fill="#ffd166" opacity="0.8"><title>'+esc(formatTime(h.start,tz))+' – '+esc(formatTime(h.end,tz))+' · '+esc(kwh(h.kWh))+'</title></rect>'}
  for(let i=0;i<=4;i++){const ts=start+(end-start)*i/4;svg+='<text x="'+x(ts)+'" y="'+(H-13)+'" text-anchor="'+(i===0?'start':i===4?'end':'middle')+'">'+esc(formatTime(ts,tz))+'</text>'}
  host.innerHTML=svg+'</svg>';
 }
 function renderForecast(){
  const f=currentForecast(),{config,data,now,timezone:tz,valid}=f;
  const error=state('forecast.error',''),status=state('forecast.status','');
  const gaps=configurationGaps(config),needsSetup=gaps.length>0||!config.enabled;
  const message=gaps.length?'Noch nicht eingerichtet: '+gaps.join(' und ')+' fehlen. Im Menü „PV-Ertragsprognose“ unten eintragen, aktivieren und speichern.':!config.enabled?'PV-Ertragsprognose ist deaktiviert. Im Menü „PV-Ertragsprognose“ unter „Standort & PV-Anlage“ aktivieren und speichern.':valid?
   (config.location?.name||'Gewählter Standort')+(data.method==='open-meteo'?' · Wetterprognose von Open-Meteo':' · Lokales Sonnenstandsmodell')+(error?' · Letzte Berechnung; Aktualisierung fehlgeschlagen: '+error:''):error?'Prognose nicht aktuell verfügbar: '+error:status||'Ertragsprognose wird berechnet …';
  $('forecastSetupNotice').classList.toggle('hidden',!needsSetup);
  $('forecastSetupTitle').textContent=gaps.length?'Noch nicht eingerichtet':'PV-Ertragsprognose deaktiviert';
  $('forecastSetupDescription').textContent=gaps.length?'Für erwartete Ertragswerte fehlen noch '+gaps.join(' und ')+'. Wähle unten deinen Standort, trage die tatsächliche Nennleistung je Dachfläche ein und aktiviere die Prognose.':'Standort und Anlagendaten sind gespeichert. Aktiviere die Prognose unten und speichere die Einstellungen.';
  $('forecastSetup').textContent=gaps.length?'Standort & PV-Anlage einrichten':'PV-Prognose aktivieren';
  for(const id of ['forecastOverviewStatus','forecastStatus'])$(id).textContent=message;
  let todayKWh=null,tomorrowKWh=null,remainingKWh=null;
  if(valid){
   const today=day(now,tz),tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
   todayKWh=data.days.find(d=>d.date===today)?.kWh??null;
   tomorrowKWh=data.days.find(d=>d.date===tomorrow)?.kWh??null;
   const remaining=data.hours.filter(h=>h.end>now&&day(h.start,tz)===today);
   remainingKWh=remaining.length&&remaining.every(h=>finite(h.kWh))?remaining.reduce((sum,h)=>sum+h.kWh*Math.max(0,Math.min(1,(h.end-Math.max(now,h.start))/(h.end-h.start))),0):now>0&&todayKWh===0?0:null;
  }
  for(const [id,value]of [['forecastToday',todayKWh],['forecastTomorrow',tomorrowKWh],['forecastRemaining',remainingKWh],['forecastOverviewToday',todayKWh],['forecastOverviewTomorrow',tomorrowKWh]])$(id).textContent=kwh(value);
  $('forecastClearSky').textContent=valid&&data.method!=='open-meteo'?'Zum Vergleich: sonniger Modelltag heute '+kwh(data.days.find(d=>d.date===day(now,tz))?.clearSkyKWh)+' · eingestellter Wetterfaktor '+String(config.weatherFactor):'';
  $('forecastModelNote').textContent=(valid?data.method==='open-meteo':config.provider!=='local')?'Wetterbasierte Schätzung aus Strahlungsprognose und deinen Anlagendaten. Verschattung, Schnee und Abregelung können den Ertrag verändern. Erwartete Erzeugung ist kein verfügbarer Überschuss und löst keine Schaltung aus.':'Lokale Sonnenstandsberechnung mit festem Wetterfaktor. Aktuelle Wolken werden nicht automatisch erfasst. Die Schätzung ist keine wetterbasierte Prognose und löst keine Schaltung aus.';
  $('forecastFetched').textContent=valid?'Stand '+formatTime(data.fetchedAt,tz)+' · Standortzeitzone '+tz:'Keine aktuelle, zur gespeicherten Anlage passende Prognose.';
  $('forecastRefresh').disabled=!config.enabled;
  if(page==='forecast'){
   if(valid)drawChart(data.hours.filter(h=>h.end>now&&h.start<now+48*3600000),tz);
   else $('forecastChart').innerHTML='<div class="empty">'+esc(gaps.length?'Noch nicht eingerichtet. Standort und PV-Anlage unten ergänzen.':config.enabled?'Keine aktuelle Prognose verfügbar.':'PV-Ertragsprognose deaktiviert.')+'</div>';
  }
 }
 function render(nextPage){page=nextPage||page;renderForecast()}
 function update(next,forms,namespace,nextPage,actions){
  states=next||{};N=namespace||N;api=actions||api;
  if(!loaded&&states[N+'.config.forecast'])loadConfig(parse('config.forecast',defaults()));
  render(nextPage);
 }
 $('forecastSetup').addEventListener('click',()=>{
  $('forecastConfiguration').scrollIntoView({behavior:'smooth',block:'start'});
  const config=parse('config.forecast',defaults()),gaps=configurationGaps(config);
  const control=gaps.includes('Standort')?$('forecastLocationSearch'):gaps.length?$('forecastArrays').querySelector('[data-f-field="peakKwp"]'):$('forecastEnabled');
  control?.focus({preventScroll:true});
 });
 for(const id of ['forecastEnabled','forecastLocationName','forecastLatitude','forecastLongitude','forecastTimezone','forecastPerformance','forecastWeatherFactor'])$(id).addEventListener('input',markDirty);
 $('forecastAddArray').addEventListener('click',()=>{if($('forecastArrays').children.length>=4){notice('Maximal vier Teilflächen möglich.',true);return}$('forecastArrays').append(arrayRow({name:'Dach '+($('forecastArrays').children.length+1),peakKwp:0,tilt:30,azimuth:180},$('forecastArrays').children.length));markDirty()});
 $('forecastSave').addEventListener('click',save);
 $('forecastReset').addEventListener('click',()=>{loadConfig(parse('config.forecast',defaults()));notice('Gespeicherte Einstellungen geladen.')});
 $('forecastSearch').addEventListener('click',search);
 $('forecastSearchOnline').addEventListener('click',searchOnline);
 $('forecastProvider').addEventListener('change',()=>{providerControls();markDirty()});
 $('forecastLocationSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchOnline()}});
 $('forecastSearchResults').addEventListener('click',e=>{const button=e.target.closest('[data-location]');if(!button)return;const r=results[Number(button.dataset.location)];if(!r)return;$('forecastLocationName').value=[r.name,r.admin1,r.country].filter(Boolean).join(', ').slice(0,120);$('forecastLatitude').value=r.latitude;$('forecastLongitude').value=r.longitude;$('forecastTimezone').value=r.timezone;markDirty();notice('Standort übernommen. PV-Daten prüfen und speichern.')});
 $('forecastRefresh').addEventListener('click',async()=>{try{if(!api.setVal)throw Error('Keine Verbindung.');await api.setVal('commands.forecastRefresh',true);$('forecastStatus').textContent='Aktualisierung angefordert …'}catch(e){$('forecastStatus').textContent=e.message}});
 loadConfig(defaults());loaded=false;
 function validateImport(raw){
  if(!raw||typeof raw!=='object'||!raw.location||!Array.isArray(raw.arrays))throw Error('PV-Prognosekonfiguration im Import ist ungültig.');
  const config={enabled:false,provider:raw.provider||'open-meteo',location:{name:String(raw.location.name||'').slice(0,120),latitude:raw.location.latitude??null,longitude:raw.location.longitude??null,timezone:String(raw.location.timezone||'Europe/Vienna')},arrays:raw.arrays.map((a,i)=>({name:String(a?.name||'Dach '+(i+1)).slice(0,80),peakKwp:a?.peakKwp,tilt:a?.tilt,azimuth:a?.azimuth})),performanceRatio:raw.performanceRatio??0.8,weatherFactor:raw.weatherFactor??0.7};
  return validateConfig(config);
 }
 window.EnergyForecastUI={update,render,validateImport,loadConfig};
})();
