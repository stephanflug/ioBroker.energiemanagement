'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 const fields={soc:['SOC','%'],voltage:['Spannung','V'],current:['Strom','A'],power:['Leistung','W'],status:['Zustand','']};
 let config={batteries:[]},signature='',dirty=false,saving=false,api={},namespace='energiemanagement.0',live=[],history=new Map(),picker=null;
 const parse=(value,fallback)=>{try{return JSON.parse(value)}catch{return fallback}};
 const format=(v,unit)=>v===null||v===undefined||v===''?'–':(typeof v==='number'?new Intl.NumberFormat('de-AT',{maximumFractionDigits:2}).format(v):String(v))+(unit?' '+unit:'');
 function sync(states){
  const saved=parse(states?.[namespace+'.config.batteries_JSON']?.val||'{"batteries":[]}',{batteries:[]});
  const next=JSON.stringify(saved);
  if(!dirty&&next!==signature){signature=next;config={batteries:(saved.batteries||[]).map(b=>({...b,sources:{...b.sources}}))};if($('batteryEditor'))renderEditor();}
  const measured=parse(states?.[namespace+'.live.batteries_JSON']?.val||'{}',{});
  live=Array.isArray(measured.batteries)?measured.batteries:[];
  for(const b of live){
   const soc=b.values?.soc;
   if(typeof soc!=='number')continue;
   const series=history.get(b.id)||[];
   const stamp=Number(measured.ts)||Date.now();
   if(!series.length||series.at(-1).ts!==stamp)series.push({ts:stamp,soc});
   while(series.length>720)series.shift();
   history.set(b.id,series);
  }
  renderLive();
 }
 function renderLive(){
  const enabled=config.batteries.filter(b=>b.enabled);
  const house=$('batteryHouseValue');
  if(house){const val=window.EnergyBatteryHouse?.();house.textContent=val===null||val===undefined?'–':format(val,'W');}
  const calendar=$('calendarBatterySoc');
  if(calendar){
   calendar.innerHTML=enabled.length?enabled.map(b=>{
    const measured=live.find(x=>x.id===b.id);
    const soc=measured?.quality?.soc==='ok'&&typeof measured?.values?.soc==='number'?measured.values.soc:null;
    return '<div class="battery-card panel"><strong>'+esc(b.name)+'</strong><div><strong>'+esc(soc===null?'–':format(soc,'%'))+'</strong></div><div class="battery-progress" role="progressbar" aria-label="SOC '+esc(b.name)+'" aria-valuemin="0" aria-valuemax="100" '+(soc===null?'':'aria-valuenow="'+soc+'"')+'><span style="width:'+(soc??0)+'%"></span></div></div>';
   }).join(''):'<p>Keine Batteriespeicher aktiviert.</p>';
  }
  for(const target of ['batteryCards','batteryOverviewCards']){
   const host=$(target);if(!host)return;
   host.innerHTML=enabled.length?enabled.map(b=>{
    const data=live.find(x=>x.id===b.id),v=data?.values||{},soc=typeof v.soc==='number'?v.soc:null;
    const metrics=Object.entries(fields).filter(([key])=>key!=='soc'&&b.sources[key]).map(([key,[label,unit]])=>'<div><small>'+esc(label)+'</small><strong>'+esc(format(v[key],unit))+'</strong></div>').join('');
    return '<article class="panel battery-card"><div class="panel-head"><h3>'+esc(b.name)+'</h3><span>'+ (soc===null?'Keine SOC-Daten':esc(format(soc,'%')))+'</span></div><div class="battery-progress" role="progressbar" aria-label="SOC '+esc(b.name)+'" aria-valuemin="0" aria-valuemax="100" '+(soc===null?'':'aria-valuenow="'+soc+'"')+'><span style="width:'+(soc??0)+'%"></span></div><div class="battery-metrics">'+metrics+'</div>'+(target==='batteryCards'?chart(b.id):'')+'</article>';
   }).join(''):(target==='batteryCards'?'<p>Noch keine Batteriespeicher aktiviert. Unter „Datenquellen“ kannst du Speicher hinzufügen.</p>':'');
  }
 }
 function chart(id){
  const series=history.get(id)||[];
  if(series.length<2)return '<p class="footnote">SOC-Verlauf wird während der Verbindung aufgezeichnet.</p>';
  const lo=series[0].ts,span=Math.max(1,series.at(-1).ts-lo);
  const pts=series.map(x=>((x.ts-lo)/span*300).toFixed(1)+','+(100-x.soc).toFixed(1)).join(' ');
  return '<div class="battery-chart"><small>SOC-Verlauf (aktuelle Sitzung)</small><svg viewBox="0 0 300 100" preserveAspectRatio="none" role="img" aria-label="SOC-Verlauf"><polyline fill="none" stroke="#2d9b76" stroke-width="2" points="'+pts+'"/></svg></div>';
 }
 function renderEditor(){
  const host=$('batteryEditor');if(!host)return;
  host.innerHTML=config.batteries.map((b,i)=>'<article class="panel battery-edit" data-battery="'+i+'"><div class="panel-head"><h3>'+esc(b.name||'Batterie '+(i+1))+'</h3><button class="button small danger" type="button" data-remove="'+i+'">Entfernen</button></div><label><input type="checkbox" data-enable="'+i+'" '+(b.enabled?'checked':'')+'> Batterie anzeigen</label><label>Name<input type="text" maxlength="80" data-name="'+i+'" value="'+esc(b.name)+'"></label><div class="battery-source-grid">'+Object.entries(fields).map(([key,[label,unit]])=>'<label>'+esc(label)+(unit?' ('+unit+')':'')+'<div class="battery-source-control"><input type="text" data-source="'+i+'" data-field="'+key+'" value="'+esc(b.sources[key]||'')+'" placeholder="ioBroker-Datenpunkt"><button type="button" class="button small ghost" data-pick="'+i+'" data-field="'+key+'">Auswählen</button></div></label>').join('')+'</div></article>').join('');
  $('batteryDirty').textContent=dirty?'Nicht gespeicherte Änderungen':'Keine Änderungen';
 }
 function mark(){dirty=true;$('batteryDirty').textContent='Nicht gespeicherte Änderungen';}
 function init(){
  $('batteryAdd')?.addEventListener('click',()=>{
   const used=new Set(config.batteries.map(b=>b.id));let n=1;while(used.has('battery_'+n))n++;
   config.batteries.push({id:'battery_'+n,name:'Batterie '+n,enabled:false,sources:{soc:'',voltage:'',current:'',power:'',status:''}});mark();renderEditor();
  });
  $('batteryEditor')?.addEventListener('input',e=>{
   const t=e.target,i=Number(t.dataset.name??t.dataset.source);
   if(t.dataset.name!==undefined){config.batteries[i].name=t.value;mark();}
   if(t.dataset.source!==undefined){config.batteries[i].sources[t.dataset.field]=t.value.trim();mark();}
  });
  $('batteryEditor')?.addEventListener('change',e=>{if(e.target.dataset.enable!==undefined){config.batteries[Number(e.target.dataset.enable)].enabled=e.target.checked;mark();renderLive();}});
  $('batteryEditor')?.addEventListener('click',e=>{
   const remove=e.target.closest('[data-remove]');if(remove){config.batteries.splice(Number(remove.dataset.remove),1);mark();renderEditor();renderLive();return;}
   const pick=e.target.closest('[data-pick]');if(pick){picker={index:Number(pick.dataset.pick),field:pick.dataset.field};$('batteryPicker').showModal();$('batterySearchQuery').focus();}
  });
  $('batteryPickerClose')?.addEventListener('click',()=>$('batteryPicker').close());
  $('batterySearch')?.addEventListener('submit',async e=>{
   e.preventDefault();const query=$('batterySearchQuery').value.trim();
   if(query.length<2)return;
   const results=$('batteryResults');results.textContent='Suche läuft …';
   try{
    const response=await api.send('sourceObjects',{query,type:picker.field==='status'?'string':'number'});
    if(response?.ok===false)throw Error(response.error||'Suche fehlgeschlagen');
    results.replaceChildren();
    for(const row of response.results||[]){
     const button=document.createElement('button');button.type='button';button.className='button ghost battery-result';button.textContent=(row.name||row.id)+' — '+row.id;
     button.addEventListener('click',()=>{config.batteries[picker.index].sources[picker.field]=row.id;mark();renderEditor();$('batteryPicker').close();});results.append(button);
    }
    if(!results.children.length)results.textContent='Keine passenden Datenpunkte.';
   }catch(error){results.textContent=error.message;}
  });
  $('batterySave')?.addEventListener('click',async()=>{
   if(saving||!api.setVal)return;
   saving=true;$('batterySave').disabled=true;
   try{
    for(const b of config.batteries){if(!b.name.trim())throw Error('Batteriename fehlt');for(const id of Object.values(b.sources))if(id&&!/^[a-zA-Z0-9_][\w.:-]*$/.test(id))throw Error('Ungültige Datenpunkt-ID: '+id);}
    await api.setVal('config.batteries_JSON',JSON.stringify(config));
    signature=JSON.stringify(config);dirty=false;renderEditor();$('batteryDirty').textContent='Konfiguration gespeichert';
   }catch(error){$('batteryDirty').textContent='Speichern fehlgeschlagen: '+error.message;}
   finally{saving=false;$('batterySave').disabled=false;}
  });
  $('batteryDiscard')?.addEventListener('click',()=>{dirty=false;signature='';if(api.states)sync(api.states);});
 }
 document.addEventListener('DOMContentLoaded',init);
 window.EnergyBatteriesUI={
  render(page){if(page==='overview'||page==='analytics')renderLive();if(page==='sources'&&!dirty)renderEditor();},
  update(states,N,page,methods){namespace=N;api={...api,...methods,states};sync(states);}
 };
})();
