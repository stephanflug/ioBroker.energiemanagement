'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=x=>typeof x==='number'&&Number.isFinite(x);
 const fmt=x=>num(x)?Math.round(x).toLocaleString('de-AT')+' W':'–';
 const stamp=ts=>new Date(ts).toLocaleString('de-AT',{timeZone:'Europe/Vienna',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
 let states={},devices=[],N='energiemanagement.0',signature='',selected=new Set(['pvW','houseW','importW','exportW']),activePage='overview',chartPoints=[];
 const palette=['#ffd166','#72d6ad','#ff829b','#6fbaff','#bd9eff','#5bd9df','#eea765','#df95c8'];
 const parse=(suffix,fallback)=>{try{return JSON.parse(states[N+'.'+suffix]?.val||'')}catch{return fallback}};
 function series(){return [['pvW','PV gesamt'],['houseW','Hausverbrauch'],['importW','Netzbezug'],['exportW','Einspeisung'],['batteryW','Batterie (+ Entladen)'],...devices.map(d=>['device:'+d.id,d.name||d.id])].map(([key,name],i)=>({key,name,color:palette[i%palette.length]}))}
 function controls(){
  const list=series(),sig=JSON.stringify(list);
  if(sig===signature)return;signature=sig;
  $('powerSeries').innerHTML=list.map(s=>'<label><input type="checkbox" data-power="'+esc(s.key)+'" '+(selected.has(s.key)?'checked':'')+'><i style="background:'+s.color+'"></i>'+esc(s.name)+'</label>').join('');
 }
 function renderAdvice(){
  let a=parse('insights.advice',{});
  const current=Number.isFinite(a.updatedAt)&&Date.now()-a.updatedAt<90000&&Date.now()-a.updatedAt>=-15000;
  const message=current?a.summary:'Empfehlungen noch nicht verfügbar oder veraltet. Auf aktuelle Messung warten.';
  for(const id of ['adviceSummary','adviceOverview'])if($(id).textContent!==message)$(id).textContent=message;
  $('adviceQuality').textContent=current?'Stand '+stamp(a.updatedAt)+' · Reserve '+fmt(a.reserveW)+' · stabil verfügbar '+fmt(a.stableW):'Keine aktuelle Auswertung';
  const names={running:'Läuft',disabled:'Deaktiviert',unknown:'Messung fehlt',data:'Daten prüfen',observing:'Prüfung läuft',parallel:'Nacheinander',wait:'Warten',start:'Jetzt starten',prepare:'Bei Bedarf starten'};
  $('adviceRows').innerHTML=current?(a.recommendations||[]).map(d=>'<tr><td>'+esc(d.name)+'<small class="insight-meta">Priorität '+esc(d.priority)+'</small></td><td><span class="insight-tag '+(['start','prepare'].includes(d.code)?'ready':'')+'">'+esc(names[d.code]||d.code)+'</span></td><td>'+esc(fmt(d.measuredW))+'</td><td>'+esc(d.reason)+'</td></tr>').join('')||'<tr><td colspan="4">Unter „Verbraucher & Prioritäten“ Verbraucher einrichten.</td></tr>':'<tr><td colspan="4">Keine aktuellen Empfehlungen verfügbar.</td></tr>';
 }
 function points(){
  const raw=parse('history.power',[]);if(!Array.isArray(raw))return [];
  const now=Date.now(),r=$('powerRange').value;
  let from=now-Number(r)*3600000,to=now;
  if(r==='custom'){from=new Date($('powerFrom').value).getTime();to=new Date($('powerTo').value).getTime();}
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<from)return [];
  return raw.filter(x=>x&&num(x.ts)&&x.ts>=from&&x.ts<=to&&x.values).sort((a,b)=>a.ts-b.ts);
 }
 function renderChart(){
  controls();chartPoints=points();
  const list=series().filter(s=>selected.has(s.key)),entries=chartPoints;
  const host=$('powerChart');
  $('powerInfo').textContent='Minuten-Momentanwerte · Speicherung bis 48 Stunden · '+entries.length+' Messpunkte. Fehlende oder veraltete Werte bleiben als Lücken sichtbar. Hausverbrauch kann berechnet sein; Geräte sind darin bereits enthalten.';
  if(!entries.length||!list.length){host.innerHTML='<div class="empty">'+(!list.length?'Mindestens eine Kurve auswählen.':'Noch keine Messpunkte im gewählten Zeitraum. Die Aufzeichnung beginnt mit dieser Version.')+'</div>';return}
  const W=1100,H=330,left=78,right=20,top=20,bottom=48;
  const values=entries.flatMap(p=>list.map(s=>p.values[s.key]).filter(num));
  if(!values.length){host.innerHTML='<div class="empty">Für die gewählten Kurven fehlen gültige Messwerte.</div>';return}
  const min=values.reduce((a,b)=>Math.min(a,b),0),max=values.reduce((a,b)=>Math.max(a,b),100),span=max-min;
  const start=entries[0].ts,end=Math.max(start+60000,entries.at(-1).ts);
  const x=t=>left+(t-start)/(end-start)*(W-left-right),y=v=>top+(max-v)/span*(H-top-bottom);
  let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Leistungsverlauf in Watt"><title>Leistungsverlauf in Watt</title>';
  for(let i=0;i<=4;i++){const v=min+span*i/4,yy=y(v);svg+='<line x1="'+left+'" y1="'+yy+'" x2="'+(W-right)+'" y2="'+yy+'" stroke="#344653"/><text x="'+(left-10)+'" y="'+(yy+4)+'" text-anchor="end">'+esc(fmt(v))+'</text>'}
  for(let i=0;i<=4;i++){const ts=start+(end-start)*i/4;svg+='<text x="'+x(ts)+'" y="'+(H-13)+'" text-anchor="middle">'+esc(new Date(ts).toLocaleTimeString('de-AT',{timeZone:'Europe/Vienna',hour:'2-digit',minute:'2-digit'}))+'</text>'}
  for(const s of list){let path='',last=null;
   for(const p of entries){const v=p.values[s.key];if(!num(v)){last=null;continue}path+=(last&&p.ts-last<=90000?'L':'M')+x(p.ts).toFixed(1)+','+y(v).toFixed(1)+' ';last=p.ts;}
   svg+='<path d="'+path+'" fill="none" stroke="'+s.color+'" stroke-width="2" vector-effect="non-scaling-stroke"><title>'+esc(s.name)+'</title></path>';
   if(entries.length===1&&num(entries[0].values[s.key]))svg+='<circle cx="'+x(start)+'" cy="'+y(entries[0].values[s.key])+'" r="4" fill="'+s.color+'"/>';
  }
  host.innerHTML=svg+'</svg>';
  const show=event=>{const rect=host.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*W-left)/(W-left-right))),target=start+fraction*(end-start);const p=entries.reduce((best,item)=>Math.abs(item.ts-target)<Math.abs(best.ts-target)?item:best,entries[0]);$('powerHover').textContent=stamp(p.ts)+' · '+list.map(s=>s.name+': '+fmt(p.values[s.key])).join(' · ');};
  host.onpointermove=show;host.onpointerdown=show;
 }
 function render(page){activePage=page;renderAdvice();if(page==='analytics')renderChart()}
 function update(next,forms,namespace,page){states=next;devices=forms.consumers?.devices||[];N=namespace;render(page||activePage)}
 $('powerSeries').addEventListener('change',e=>{const key=e.target.dataset.power;if(!key)return;e.target.checked?selected.add(key):selected.delete(key);renderChart()});
 $('powerRange').addEventListener('change',()=>{$('powerCustom').classList.toggle('hidden',$('powerRange').value!=='custom');renderChart()});
 for(const id of ['powerFrom','powerTo'])$(id).addEventListener('change',renderChart);
 $('powerAll').addEventListener('click',()=>{selected=new Set(series().map(s=>s.key));signature='';renderChart()});
 $('powerNone').addEventListener('click',()=>{selected.clear();signature='';renderChart()});
 $('powerCSV').addEventListener('click',()=>{
  const list=series().filter(s=>selected.has(s.key));
  const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const header=['Zeit (ISO 8601)',...list.map(s=>s.name+' (W)')].map(v=>cell(/^[=+\-@]/.test(v)?"'"+v:v)).join(';');
  const rows=points().map(p=>[new Date(p.ts).toISOString(),...list.map(s=>num(p.values[s.key])?p.values[s.key]:'')].map(cell).join(';'));
  const url=URL.createObjectURL(new Blob(['\uFEFF'+[header,...rows].join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='Energiemanagement-Leistungsverlauf.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 window.EnergyInsightsUI={update,render};
})();
