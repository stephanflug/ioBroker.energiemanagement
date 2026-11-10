'use strict';
(() => {
 const $=id=>document.getElementById(id),finite=x=>typeof x==='number'&&Number.isFinite(x);
 if(!$('heatingTrendFilters'))return;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=x=>finite(x)?x.toLocaleString('de-AT',{maximumFractionDigits:2})+' °C':'–';
 const clock=ts=>new Date(ts).toLocaleString('de-AT',{timeZone:'Europe/Vienna',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 const hash=value=>{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')};
 const roomKey=room=>room.id+'@'+hash(room.stateId||'');
 const palette=['#eaa1bf','#a9cb71','#c6abf3','#f4a974','#7ec8dd','#d3d272','#a7afea','#d5a790'];
 let history=[],series=[],signature='',points=[],selected=new Map(),plot=null;
 const get=(s,N,key,def)=>{try{const v=s[N+'.'+key]?.val;return typeof v==='string'?JSON.parse(v):v??def}catch{return def}};
 function update(states,N){
  history=get(states,N,'heating.history',[]);if(!Array.isArray(history))history=[];
  const config=get(states,N,'config.heating',{});
  series=[{key:'meanC',name:'Raummittelwert',color:'#78d9ce',initial:true},{key:'targetC',name:'Raumziel',color:'#e8c17a',dash:true,initial:true},{key:'outdoorC',name:'Außentemperatur',color:'#87bcf0',initial:false}];
  if(config.pv?.floorId)series.push({key:'floorC',name:'Estrich / Boden',color:'#e19c72',initial:true});
  for(const [i,room]of (config.rooms||[]).filter(r=>r.enabled!==false).entries())series.push({key:roomKey(room),room:true,name:room.name||room.id,color:palette[i%palette.length],initial:true});
  const next=JSON.stringify(series);
  if(next!==signature){signature=next;for(const s of series)if(!selected.has(s.key))selected.set(s.key,s.initial);
   $('heatingTrendFilters').innerHTML=series.map(s=>'<label class="heating-curve"><input type="checkbox" data-curve="'+esc(s.key)+'" '+(selected.get(s.key)?'checked':'')+'><i style="background:'+s.color+'"></i>'+esc(s.name)+'</label>').join('');
  }
  render();
 }
 const value=(p,s)=>s.room?p.roomValues?.[s.key]:p[s.key];
 function render(){
  const hours=Number($('heatingTrendRange').value)||24,now=Date.now(),start=now-hours*3600000,end=now;
  points=history.filter(p=>p&&finite(p.ts)&&p.ts>=start&&p.ts<=now+15000).sort((a,b)=>a.ts-b.ts);
  const active=series.filter(s=>selected.get(s.key)),values=points.flatMap(p=>active.map(s=>value(p,s)).filter(finite)),host=$('heatingTrend');
  plot=null;$('heatingTrendReading').textContent='Kurven auswählen und eine Messung in der Grafik berühren.';
  if(!values.length){host.innerHTML='<div class="heating-empty">'+(active.length?'Noch keine Messwerte für die ausgewählten Kurven in diesem Zeitraum. Neue Raumkurven beginnen mit der Aufzeichnung ab Version 0.6.0.':'Mindestens eine Temperaturkurve auswählen.')+'</div>';return;}
  let min=values[0],max=values[0];for(const v of values){min=Math.min(min,v);max=Math.max(max,v)}min-=.5;max+=.5;
  const W=Math.max(320,Math.min(1200,host.clientWidth||1000)),H=300,L=58,R=18,T=16,B=hours>24?52:42,x=ts=>L+(ts-start)/(end-start)*(W-L-R),y=v=>H-B-(v-min)/(max-min)*(H-T-B);
  plot={W,H,L,R,start,end,active};
  let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Temperaturverlauf der ausgewählten Räume und Messwerte"><title>Temperaturverlauf in Grad Celsius</title>';
  for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,yy=y(v);svg+='<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="#34516a"/><text x="'+(L-8)+'" y="'+(yy+4)+'" text-anchor="end">'+esc(v.toLocaleString('de-AT',{maximumFractionDigits:1}))+' °C</text>';}
  for(const s of active){let path='',last=null,previous=null;for(const p of points){const v=value(p,s);if(!finite(v)){last=null;previous=null;continue;}
    const continuous=last!==null&&p.ts-last<=90000&&(s.key!=='meanC'||previous.roomSignature===p.roomSignature);
    path+=(continuous?'L':'M')+x(p.ts).toFixed(1)+','+y(v).toFixed(1)+' ';
    // A short stroke keeps isolated measurements visible without bridging a gap.
    if(!continuous)path+='l0.1,0 ';last=p.ts;previous=p;
   }
   svg+='<path data-temperature-series="'+esc(s.key)+'" d="'+path+'" stroke="'+s.color+'" stroke-width="2.5"'+(s.dash?' stroke-dasharray="7 5"':'')+' fill="none" vector-effect="non-scaling-stroke"><title>'+esc(s.name)+'</title></path>';
  }
  for(let i=0;i<=4;i++){const ts=start+(end-start)*i/4;svg+='<text x="'+x(ts)+'" y="'+(H-13)+'" text-anchor="'+(i===0?'start':i===4?'end':'middle')+'">'+(hours>24?'<tspan x="'+x(ts)+'" dy="-10">'+esc(new Date(ts).toLocaleDateString('de-AT',{timeZone:'Europe/Vienna',day:'2-digit',month:'2-digit'}))+'</tspan><tspan x="'+x(ts)+'" dy="14">':'')+esc(new Date(ts).toLocaleTimeString('de-AT',{timeZone:'Europe/Vienna',hour:'2-digit',minute:'2-digit'}))+(hours>24?'</tspan>':'')+'</text>';}
  host.innerHTML=svg+'<line id="heatingTrendCursor" x1="0" y1="'+T+'" x2="0" y2="'+(H-B)+'" stroke="#fff" opacity="0"/></svg>';
 }
 function inspect(event){
  if(!plot||!points.length)return;const svg=$('heatingTrend').querySelector('svg'),rect=svg.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width*plot.W;
  const ts=plot.start+Math.max(0,Math.min(1,(px-plot.L)/(plot.W-plot.L-plot.R)))*(plot.end-plot.start);
  let nearest=points[0];for(const p of points)if(Math.abs(p.ts-ts)<Math.abs(nearest.ts-ts))nearest=p;
  if(Math.abs(nearest.ts-ts)>90000){$('heatingTrendReading').textContent=clock(ts)+' · Keine Messung in dieser Zeit.';return;}
  const xx=plot.L+(nearest.ts-plot.start)/(plot.end-plot.start)*(plot.W-plot.L-plot.R),cursor=$('heatingTrendCursor');
  cursor.setAttribute('x1',xx);cursor.setAttribute('x2',xx);cursor.setAttribute('opacity','.7');
  $('heatingTrendReading').textContent=clock(nearest.ts)+' · '+plot.active.map(s=>s.name+': '+fmt(value(nearest,s))).join(' · ');
 }
 $('heatingTrendFilters').addEventListener('change',event=>{if(event.target.dataset.curve){selected.set(event.target.dataset.curve,event.target.checked);render()}});
 $('heatingTrendRange').addEventListener('change',render);
 $('heatingTrend').addEventListener('pointermove',inspect);$('heatingTrend').addEventListener('pointerdown',inspect);
 $('heatingTrendCsv').addEventListener('click',()=>{
  const active=series.filter(s=>selected.get(s.key)),cell=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
  const rows=[['Zeit (ISO 8601)',...active.map(s=>s.name+' (°C)')],...points.map(p=>[new Date(p.ts).toISOString(),...active.map(s=>finite(value(p,s))?value(p,s):'')])];
  const blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='heizung-temperaturverlauf.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 let lastWidth=0;if(window.ResizeObserver)new ResizeObserver(entries=>{const width=Math.round(entries[0].contentRect.width);if(width>0&&width!==lastWidth){lastWidth=width;render()}}).observe($('heatingTrend'));
 window.EnergyHeatingTrend={update,roomKey};
})();
