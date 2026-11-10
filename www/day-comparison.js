'use strict';
(() => {
 const host=document.getElementById('dayComparisonContent');if(!host)return;
 const finite=value=>typeof value==='number'&&Number.isFinite(value),esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const fmt=(value,decimals=2)=>finite(value)?new Intl.NumberFormat('de-AT',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(value):'–';
 const kwh=value=>finite(value)&&value>=0?(value>0&&value<.01?'< 0,01':fmt(value))+' kWh':'–';
 const localDay=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Vienna'});
 const clock=minutes=>{const safe=Math.max(0,Math.min(1440,Math.floor(minutes||0)));return String(Math.floor(safe/60)).padStart(2,'0')+':'+String(safe%60).padStart(2,'0');};
 let states={},N='energiemanagement.0',page=location.hash==='#analytics'?'analytics':'overview',signature='';
 function read(){try{const value=states[N+'.analytics.dayComparison_JSON']?.val;return typeof value==='string'?JSON.parse(value):value}catch{return null}}
 function comparable(row){return row?.status==='comparable'&&['same-time','full-day-exceeded'].includes(row.basis)&&finite(row.todayKWh)&&row.todayKWh>=0&&finite(row.baselineKWh)&&row.baselineKWh>=0&&finite(row.deltaKWh)&&Array.isArray(row.baselineDays)&&row.baselineDays.length>0;}
 function direction(row){return row.deltaKWh>1e-8?'more':row.deltaKWh< -1e-8?'less':'equal';}
 function delta(row){if(!finite(row?.deltaKWh))return '–';if(Math.abs(row.deltaKWh)<1e-8)return '0,00 kWh';return (row.deltaKWh>0?'+':'−')+kwh(Math.abs(row.deltaKWh));}
 function percent(row){if(row.baselineKWh===0)return row.todayKWh>0?'Vergleich bisher 0 kWh':'Unverändert';return finite(row.deltaPct)?(row.deltaPct>0?'+':row.deltaPct<0?'−':'')+fmt(Math.abs(row.deltaPct),1)+' %':'Abweichung in kWh';}
 function reference(row,doc){
  const count=Array.isArray(row.baselineDays)?row.baselineDays.length:0,days=count===1?'1 Vergleichstag':count+' Vergleichstage',minutes=row.referenceWindow?.endMinute??doc?.cutoffMinutes;
  return row.basis==='full-day-exceeded'?'<strong>Ganze Vergleichstage</strong><span>Heute bereits mehr als ein ganzer Vergleichstag · Ø aus '+days+'</span>':'<strong>Gleicher Tagesabschnitt: 00:00–'+esc(clock(minutes))+' Uhr</strong><span>Durchschnitt aus '+days+'</span>';
 }
 function bars(row){const max=Math.max(row.todayKWh,row.baselineKWh,.000001);return '<div class="day-comparison-bars"><div class="day-comparison-bar"><div><span>Heute im Vergleich</span><strong>'+esc(kwh(row.todayKWh))+'</strong></div><i aria-hidden="true"><span style="width:'+Math.max(0,Math.min(100,row.todayKWh/max*100)).toFixed(2)+'%"></span></i></div><div class="day-comparison-bar baseline"><div><span>Vergleich Ø</span><strong>'+esc(kwh(row.baselineKWh))+'</strong></div><i aria-hidden="true"><span style="width:'+Math.max(0,Math.min(100,row.baselineKWh/max*100)).toFixed(2)+'%"></span></i></div></div>';}
 function houseMarkup(row,doc){
  if(!comparable(row))return '<div class="day-comparison-house"><h3>Hausverbrauch</h3><div class="day-comparison-change equal">–</div><p class="day-comparison-context">Vergleich baut sich auf</p><p class="day-comparison-reason">'+esc(row?.reason||'Für einen verlässlichen Vergleich fehlen noch ausreichend Messwerte für denselben Tagesabschnitt.')+'</p></div>';
  const tone=direction(row),label=tone==='more'?'mehr Energie als im Vergleich':tone==='less'?'weniger Energie als im Vergleich':'im Vergleich unverändert';
  return '<div class="day-comparison-house"><h3>Hausverbrauch</h3><div class="day-comparison-change '+tone+'">'+esc(delta(row))+'</div><p class="day-comparison-context">'+esc(percent(row)+' · '+label)+'</p>'+bars(row)+'<div class="day-comparison-window">'+reference(row,doc)+'</div></div>';
 }
 function increasedMarkup(row,doc){return '<li class="day-comparison-item"><div class="day-comparison-item-head"><strong>'+esc(row.name||row.id)+'</strong><span class="day-comparison-item-change">'+esc(delta(row))+'<small>'+esc(percent(row))+'</small></span></div><div class="day-comparison-item-values"><span>Heute <strong>'+esc(kwh(row.todayKWh))+'</strong></span><span>Vergleich Ø <strong>'+esc(kwh(row.baselineKWh))+'</strong></span></div><div class="day-comparison-window">'+reference(row,doc)+'</div></li>';}
 function detailMarkup(rows,doc){
  if(!rows.length)return '';
  return '<details class="day-comparison-detail"><summary>Alle Verbraucher und Messabdeckung ('+rows.length+') <span aria-hidden="true">⌄</span></summary><div class="table-scroll"><table><thead><tr><th>Verbraucher / Vergleich</th><th class="numeric">Heute</th><th class="numeric">Vergleich Ø</th><th class="numeric">Änderung</th><th>Messabdeckung</th></tr></thead><tbody>'+rows.map(row=>{
   const valid=comparable(row),coverage=finite(row.coveragePct)?fmt(Math.max(0,Math.min(100,row.coveragePct)),0)+' %':'–';
   return '<tr><td>'+esc(row.name||row.id)+'<small>'+esc(valid?(row.basis==='full-day-exceeded'?'Ganze Vergleichstage':('Gleicher Tagesabschnitt bis '+clock(row.referenceWindow?.endMinute??doc?.cutoffMinutes)))+' · '+row.baselineDays.length+' '+(row.baselineDays.length===1?'Tag':'Tage'):row.reason||'Noch kein ausreichender Vergleich')+'</small></td><td class="numeric">'+esc(kwh(row.todayKWh))+'</td><td class="numeric">'+esc(valid?kwh(row.baselineKWh):'–')+'</td><td class="numeric '+(valid?direction(row):'')+'">'+esc(valid?delta(row):'–')+'</td><td>'+esc(coverage)+'<small>'+esc(valid?(row.basis==='full-day-exceeded'?'Referenz: vollständige Tage':'Im gleichen Tagesabschnitt'):'Vergleich noch nicht verfügbar')+'</small></td></tr>';
  }).join('')+'</tbody></table></div></details>';
 }
 function render(nextPage=page){
  page=nextPage;if(page!=='analytics')return;
  const raw=read(),age=Date.now()-raw?.updatedAt,current=raw?.version===1&&raw.day===localDay()&&finite(raw.updatedAt)&&age>=-15000&&age<120000,doc=current?raw:null;
  const rows=Array.isArray(doc?.rows)?doc.rows.filter(row=>row&&typeof row==='object'&&row.kind!=='house'):[],increased=rows.filter(row=>comparable(row)&&row.deltaKWh>1e-8).sort((a,b)=>b.deltaKWh-a.deltaKWh),valid=rows.filter(comparable),allKnown=rows.length>0&&valid.length===rows.length;
  let emptyTitle='Vergleich baut sich auf',emptyText='Sobald genügend Messwerte für vergleichbare Tagesabschnitte vorhanden sind, werden auffällige Verbraucher hier angezeigt.';
  if(doc?.status==='dst-day'){emptyTitle='Heute ist die Zeitumstellung';emptyText=doc.message||'Der Tagesvergleich ist heute nicht direkt mit normalen Tagen vergleichbar.';}
  else if(valid.length){emptyTitle='Kein Mehrverbrauch bei den vergleichbaren Geräten';emptyText=allKnown?'Die erfassten Verbraucher liegen im Vergleich gleich oder niedriger.':'Die vergleichbaren Verbraucher liegen gleich oder niedriger. Bei weiteren Geräten fehlen noch ausreichend Messdaten.';}
  else if(!rows.length){emptyText='Ordne Verbrauchern unter Datenquellen eine Istleistungsmessung zu. Die Auswertung verwendet aufgezeichnete Energie und ausreichend gemessene Vergleichszeiträume.';}
  if(!current&&raw?.version===1){emptyTitle='Auf aktuelle Auswertung warten';emptyText='Der Tagesvergleich ist noch nicht aktuell. Sobald frische Messdaten vorliegen, erscheint der Vergleich für heute.';}
  const badge=!doc?'Vergleich wird geladen':doc.status==='dst-day'?'Zeitumstellung':doc.cutoffMinutes>0?'Stand bis '+clock(doc.cutoffMinutes)+' Uhr':'Erste Messwerte sammeln';
  const message=doc?.message||'Zeigt, wo heute mehr Energie verbraucht wurde. Der Vergleichszeitraum steht direkt beim jeweiligen Wert.';
  const html='<article id="dayComparisonPanel" class="panel day-comparison" aria-labelledby="dayComparisonTitle"><div class="panel-head wrap"><div><div class="eyebrow">HEUTE IM VERGLEICH</div><h2 id="dayComparisonTitle">Wo wird heute mehr verbraucht?</h2><p>'+esc(message)+'</p></div><span class="day-comparison-status '+(!doc||doc.status!=='ok'?'waiting':'')+'" role="status">'+esc(badge)+'</span></div><div class="day-comparison-grid">'+houseMarkup(doc?.house,doc)+'<div class="day-comparison-consumers"><div class="day-comparison-consumers-heading"><h3>Auffällige Verbraucher</h3><span class="day-comparison-count">'+(increased.length?increased.length+' mit Mehrverbrauch':valid.length?'Keiner im Vergleich':'Messwerte sammeln')+'</span></div>'+(increased.length?'<ol class="day-comparison-list">'+increased.slice(0,5).map(row=>increasedMarkup(row,doc)).join('')+'</ol>'+(increased.length>5?'<p class="day-comparison-note">Die fünf größten Abweichungen. Alle Werte stehen in der Detailansicht.</p>':''):'<div class="day-comparison-empty"><strong>'+esc(emptyTitle)+'</strong><p>'+esc(emptyText)+'</p></div>')+'</div></div>'+detailMarkup(rows,doc)+'<p class="day-comparison-note"><strong>Verbraucher sind im Hausverbrauch enthalten.</strong> Gerätewerte werden nicht zum Hausverbrauch addiert. Fehlende Messwerte gelten nicht als 0 kWh. Beim Vergleich gleicher Tagesabschnitte zählen ausreichend erfasste Zeiten bis zum letzten vollständigen 15-Minuten-Abschnitt; fehlende Verbräuche werden nicht hochgerechnet.</p></article>';
  if(html!==signature){const open=host.querySelector('.day-comparison-detail')?.open;signature=html;host.innerHTML=html;if(open&&host.querySelector('.day-comparison-detail'))host.querySelector('.day-comparison-detail').open=true;}
 }
 window.EnergyDayComparisonUI={update(next,namespace,currentPage){states=next||{};N=namespace||N;render(currentPage||page);},render};render();
})();
