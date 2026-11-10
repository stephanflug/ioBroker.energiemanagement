'use strict';
(() => {
 const views={overview:'Übersicht',history:'Viertelstunden',analytics:'Energieauswertung',forecast:'PV-Ertragsprognose',water:'Wasser',rainwater:'Regenwasser',fuel:'Brennstoff',heating:'Heizung & Gebäudepuffer'};
 const definitions=[
 ['water-calendar','analytics','#utilityWaterCalendarPanel','Wasserverbrauch'],
 ['fuel-calendar','analytics','#utilityFuelCalendarPanel','Brennstoffverbrauch'],
 ['water-live','water','#utilityWaterLivePanel','Wasser im Überblick'],
 ['rainwater-live','rainwater','#utilityRainwaterLivePanel','Regenwasser im Überblick'],
 ['rainwater-periods','rainwater','#utilityRainwaterPeriodsPanel','Regenwasserverbrauch'],
 ['today-comparison','analytics','#dayComparisonContent','Heute im Energievergleich'],
 ['fuel-live','fuel','#utilityFuelLivePanel','Brennstoff im Überblick'],
 ['fuel-stock','fuel','#fuelTankPanel','Pellets- / Ölvorrat'],
 ['energy-year','analytics','#energyYearPanel','Jahresüberblick'],
 ['energy-month','analytics','#energyMonthPanel','Monatsüberblick'],
 ['energy-day','analytics','#energyDayPanel','Tagesüberblick'],
 ['energy-battery','analytics','#energyBatteryPanel','Batterie heute'],
 ['energy-meter','analytics','#energyMeterPanel','Smart Meter'],
 ['energy-pv-target','analytics','#energyPvTargetPanel','PV-Monatsziel'],
 ['live-power','overview','.dashboard-power-grid','Aktuelle Leistung'],
 ['energy-flow','overview','.dashboard-flow','Energiefluss & Verbraucher'],
 ['energy-advice','overview','.dashboard-guidance:not(.dashboard-forecast)','Energie-Assistent'],
 ['pv-summary','overview','.dashboard-forecast','PV-Ertrag kompakt'],
 ['energy-periods','overview','.dashboard-period-grid','Verbrauch & Lastspitzen'],
 ['energy-balance','overview','.dashboard-details:nth-of-type(1)','Energiebilanz'],
 ['heating-summary','heating','.heating-overview','Heizung & Gebäudepuffer'],
 ['heating-trend','heating','#heatingTrendPanel','Temperaturverlauf'],
 ['pv-forecast','forecast','#forecastChart','PV-Ertragsprognose'],
 ['power-trend','analytics','#powerChart','Leistungsverlauf'],
 ['consumer-advice','analytics','.insight-advice','Verbraucher-Empfehlungen'],
 ['energy-chart','analytics','#anaChartTitle','Energieverlauf'],
 ['quarter-hours','history','#historyChart','Viertelstunden-Verlauf'],
 ['interval-table','history','#historyRows','Viertelstunden-Tabelle'],
 ['daily-maxima','history','#dayRows','Tagesmaxima']
 ];
 const entries=definitions.map(([id,page,selector,label])=>{let el=document.querySelector(selector);if(el&&['pv-forecast','power-trend','energy-chart','quarter-hours','interval-table','daily-maxima'].includes(id))el=el.closest('.panel');return {id,page,label,el}}).filter(x=>x.el);
 const requested=new URLSearchParams(location.search).get('embed'),isEmbed=requested!==null,requestedPage=location.hash.slice(1)||'overview';
 function pageAllowed(page){const features=window.EnergyFeatureVisibility?.()||{water:false,rainwater:false,fuel:false,heating:true};return !['water','rainwater','fuel','heating'].includes(page)||features[page]===true;}
 function entryAllowed(entry){const features=window.EnergyFeatureVisibility?.()||{water:false,fuel:false,heating:true};return pageAllowed(entry.page)&&(entry.id!=='water-calendar'||features.water===true)&&(entry.id!=='fuel-calendar'||features.fuel===true)&&(entry.id!=='fuel-stock'||window.EnergyTankUI?.available()===true);}
 const instance=new URLSearchParams(location.search).get('instance');
 const N=/^energiemanagement\.\d+$/.test(instance||'')?instance:'energiemanagement.0';
 const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function url(id,page){const entry=entries.find(x=>x.id===id);if(!entry&&!(id==='page'&&views[page]))return '';if(entry&&!entryAllowed(entry)||id==='page'&&!pageAllowed(page))return '';const u=new URL(location.pathname,location.origin);u.searchParams.set('instance',N);u.searchParams.set('embed',id);u.hash=entry?entry.page:page;return u.href}
 function normalUrl(page){const u=new URL(location.pathname,location.origin);u.searchParams.set('instance',N);u.hash=page;return u.href}
 let dialog,opener;
 function createDialog(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.className='embed-dialog';dialog.setAttribute('aria-labelledby','embedTitle');
  dialog.innerHTML='<div class="panel-head wrap"><h2 id="embedTitle">Ansicht einbetten</h2><button type="button" class="button ghost" id="embedClose">Schließen</button></div><label>Fenster oder Ansicht<select id="embedChoice"></select></label><label>Direkter Link<textarea id="embedUrl" rows="3" readonly></textarea></label><button type="button" class="button ghost" id="embedCopyUrl">Link kopieren</button><label>iframe-Code<textarea id="embedCode" rows="5" readonly></textarea></label><button type="button" class="button primary" id="embedCopyCode">iframe-Code kopieren</button><p id="embedCopyStatus" role="status"></p><p class="footnote">Die Einbettung zeigt Messwerte und Diagrammfilter. Einstellungen öffnest du im Energiemanagement. Die bestehende ioBroker-Anmeldung gilt auch im iframe. Das andere System muss diese ioBroker-Adresse erreichen können; bei HTTPS auch hier eine HTTPS-Adresse verwenden.</p>';
  document.body.append(dialog);
  const $=id=>document.getElementById(id);
  $('embedClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>opener?.focus());
  $('embedChoice').onchange=fill;
  async function copy(id){const field=$(id);try{if(!navigator.clipboard?.writeText)throw Error('manual');await navigator.clipboard.writeText(field.value);$('embedCopyStatus').textContent='Kopiert.'}catch{field.focus();field.select();let copied=false;try{copied=document.execCommand('copy')}catch{}$('embedCopyStatus').textContent=copied?'Kopiert.':'Text ist markiert. Bitte mit der Kopierfunktion deines Geräts kopieren.'}}
  $('embedCopyUrl').onclick=()=>copy('embedUrl');$('embedCopyCode').onclick=()=>copy('embedCode');
 }
 function fill(){const choice=document.getElementById('embedChoice').value,[id,page]=choice.split('|'),src=url(id,page),entry=entries.find(x=>x.id===id),label=entry?.label||views[page];document.getElementById('embedUrl').value=src;document.getElementById('embedCode').value='<iframe src="'+esc(src)+'" title="'+esc(label)+'" width="100%" height="'+(id==='heating-trend'?'900':'620')+'" loading="lazy" style="border:0;border-radius:12px"></iframe>';document.getElementById('embedCopyStatus').textContent=''}
 function open(id,page,event){createDialog();opener=event.currentTarget;document.getElementById('embedChoice').innerHTML=entries.filter(entryAllowed).map(x=>'<option value="'+x.id+'|'+x.page+'">'+esc(x.label)+'</option>').join('')+Object.entries(views).filter(([key])=>pageAllowed(key)).map(([key,name])=>'<option value="page|'+key+'">Gesamte Ansicht: '+esc(name)+'</option>').join('');document.getElementById('embedChoice').value=id+'|'+page;fill();dialog.showModal()}
 function addButton(el,id,page,label='Einbetten'){
  if(el.querySelector(':scope > .embed-tools'))return;const row=document.createElement('div');row.className='embed-tools';const button=document.createElement('button');button.type='button';button.className='button ghost embed-button';button.textContent='⧉ '+label;button.setAttribute('aria-label',(id==='page'?views[page]:entries.find(x=>x.id===id)?.label)+' einbetten');button.addEventListener('click',event=>open(id,page,event));row.append(button);el.prepend(row);
 }
 function markPath(el){el.dataset.embedTarget='';for(let p=el.parentElement;p&&p!==document.documentElement;p=p.parentElement)p.dataset.embedPath='';if(el.tagName==='DETAILS')el.open=true;for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}
 function render(page){
  if(!isEmbed){for(const entry of entries.filter(entryAllowed))addButton(entry.el,entry.id,entry.page);if(views[page])addButton(document.getElementById('page-'+page),'page',page,'Ansicht einbetten');return;}
  document.body.classList.add('embed-mode');
  document.querySelectorAll('[data-embed-path],[data-embed-target]').forEach(el=>{delete el.dataset.embedPath;delete el.dataset.embedTarget});
  const selected=entries.find(x=>x.id===requested),embedPage=selected?.page||(requested==='page'&&views[requestedPage]?requestedPage:null);
  delete document.body.dataset.embedInvalid;
  if(!embedPage||!pageAllowed(embedPage)||selected&&!entryAllowed(selected)){document.body.dataset.embedInvalid='';let message=document.getElementById('embedInvalid');if(!message){message=document.createElement('p');message.id='embedInvalid';message.textContent='Dieses Fenster ist nicht für die Einbettung verfügbar.';document.body.append(message)}message.textContent=embedPage?'Diesen Bereich zuerst unter Einstellungen freischalten.':'Dieses Fenster ist nicht für die Einbettung verfügbar.';return;}
  if(page!==embedPage){location.hash=embedPage;return;}
  if(selected)markPath(selected.el);else for(const entry of entries.filter(x=>x.page===embedPage&&entryAllowed(x)))markPath(entry.el);
  let link=document.getElementById('embedOpen');if(!link){link=document.createElement('a');link.id='embedOpen';link.target='_blank';link.rel='noopener';link.textContent='Im Energiemanagement öffnen ↗';document.querySelector('main').append(link)}link.href=normalUrl(embedPage);link.dataset.embedTarget='';
  const banner=document.getElementById('connectionBanner');if(banner)banner.dataset.embedTarget='';
 }
 window.EnergyEmbed={render,url};
 window.addEventListener('hashchange',()=>render(location.hash.slice(1)||'overview'));
 render(location.hash.slice(1)||'overview');
})();
