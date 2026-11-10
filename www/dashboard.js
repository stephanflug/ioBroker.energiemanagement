'use strict';
/* Overview presentation only: no writes, device control, or invented measurements. */
(() => {
 const $=id=>document.getElementById(id);
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const format=(v,decimals=0)=>new Intl.NumberFormat('de-AT',{maximumFractionDigits:decimals,minimumFractionDigits:decimals}).format(v);
 const watts=v=>!finite(v)?'–':Math.abs(v)>=1000?format(v/1000,1)+' kW':format(v)+' W';
 const energy=v=>finite(v)?format(v,2)+' kWh':'–';
 let states={},N='energiemanagement.0',forms={},page='overview',connected=null;
 const value=(id,def=null)=>states[N+'.'+id]?.val??def;
 function render(nextPage){
  page=nextPage||page;if(page!=='overview')return;
  const raw=value('live.snapshot');let snapshot=null;
  try{snapshot=typeof raw==='string'?JSON.parse(raw):raw}catch{}
  const hasSnapshot=raw!==null&&raw!==undefined;
  const sample=hasSnapshot?snapshot?.ts:Date.parse(value('status.lastSample','')),age=Date.now()-sample;
  const fresh=finite(sample)&&age>=-15000&&age<90000;
  const valid=connected!==false&&fresh&&(hasSnapshot||value('status.dataOk',false)===true);
  const quality=$('dashboardQuality');if(!quality)return;
  quality.classList.toggle('warn',!valid);
  $('dashboardQualityText').textContent=connected===false?'Keine Verbindung':valid?'Aktuelle Messwerte':fresh?'Messung wird geprüft':'Keine aktuellen Messwerte';
  quality.title=connected===false?'Verbindung zu ioBroker unterbrochen.':valid?'Letzte Messung '+new Date(sample).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):value('status.message','Auf aktuelle Messdaten warten.');
  const current=key=>{const v=hasSnapshot?snapshot?.values?.[key]:value('live.'+key);return valid&&finite(v)?v:null};
  const pv=current('pvW'),house=current('houseW'),battery=current('batteryW'),importW=current('importW'),exportW=current('exportW');
  if(valid&&[pv,house,importW,exportW].some(v=>v===null)){quality.classList.add('warn');$('dashboardQualityText').textContent='Einzelne Messwerte fehlen';}
  $('dashboardPvValue').textContent=watts(pv);
  $('dashboardHouseValue').textContent=watts(house);
  $('dashboardBatteryValue').textContent=watts(battery===null?null:Math.abs(battery));
  const grid=importW===null||exportW===null?null:importW-exportW;
  $('dashboardGridValue').textContent=watts(grid===null?null:Math.abs(grid));
  $('dashboardGridLabel').textContent=grid===null?'Stromnetz':grid>0?'Netzbezug':grid<0?'Einspeisung':'Stromnetz';
  $('dashboardGridDirection').textContent=grid===null?'Aktuelle Netzmessung fehlt':grid>0?'Strom kommt aus dem Netz':grid<0?'Überschuss fließt ins Netz':'Kein Netzfluss';
  $('dashboardBatteryDirection').textContent=battery===null?'Keine aktuelle Batteriemessung':battery>0?'Speicher versorgt das Haus':battery<0?'Speicher wird geladen':'Speicher im Ruhezustand';
  const count=Array.isArray(forms.sources?.pv)?forms.sources.pv.filter(s=>s.id).length:0;
  $('dashboardPvDetail').textContent=pv===null?'Aktuelle PV-Messung fehlt':count?count+' PV-Quelle'+(count===1?'':'n')+' insgesamt':'Leistung deiner Solaranlage';
  const houseQuality=hasSnapshot?snapshot?.houseQuality:value('live.houseQuality','unknown');
  $('dashboardHouseDetail').textContent=house===null?'Aktuelle Hausmessung fehlt':['direct','measured'].includes(houseQuality)?'Direkt gemessener Verbrauch':'Aus Energiebilanz berechnet';
  $('dashboardTodayImport').textContent=energy(value('day.importKWh'));
 }
 function update(nextStates,nextForms,namespace,nextPage){states=nextStates||{};forms=nextForms||{};N=namespace||N;render(nextPage)}
 function connection(ok){connected=ok===true;render(page)}
 window.EnergyDashboard={update,render,connection};
})();
