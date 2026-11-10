'use strict';
(() => {
 const $=id=>document.getElementById(id),host=$('analysisResourceCards');if(!host)return;
 const finite=value=>typeof value==='number'&&Number.isFinite(value),esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const fmt=(value,decimals=2)=>finite(value)?new Intl.NumberFormat('de-AT',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(value):'–';
 const day=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Vienna'});
 let states={},N='energiemanagement.0',page='overview',signature='';
 function read(key,fallback){try{const value=states[N+'.'+key]?.val;return typeof value==='string'?JSON.parse(value):value??fallback}catch{return fallback}}
 function card({page,title,icon,value,detail,color}){return '<button class="analysis-resource-link" style="--resource-accent:'+color+'" type="button" data-goto="'+page+'"><span class="analysis-resource-icon" aria-hidden="true">'+icon+'</span><span class="analysis-resource-copy"><strong>'+esc(title)+'</strong><span>'+esc(value)+'</span><small>'+esc(detail)+'</small></span><span class="analysis-resource-arrow" aria-hidden="true">↗</span></button>'}
 function render(nextPage=page){
  page=nextPage;if(page!=='analytics')return;
  const features=read('config.features_JSON',{}),utilities=read('analytics.utilities_JSON',{}),fuel=utilities.fuel||{},fuelType=read('config.utilities_JSON',{}).fuel?.type||fuel.type;
  const items=[];
  for(const [key,title,icon,color]of [['water','Wasser','◉','#8cc8f5'],['rainwater','Regenwasser','☂','#83d8cb'],['fuel',fuelType==='oil'?'Öl':fuelType==='gas'?'Gas':'Pellets','♨','#e1bd81']]){
   if(features[key]!==true)continue;
   const module=utilities[key]||{},period=module.periods?.day,known=period?.key===day()&&finite(period.value)&&period.value>=0,unit=module.unit||(key==='fuel'?(fuelType==='oil'?'l':fuelType==='gas'?'m³':'kg'):'m³');
   items.push({page:key,title,icon,color,value:known?fmt(period.value,key==='fuel'?2:3)+' '+unit:'Noch keine Tageswerte',detail:known?'Heute erfasst'+(period.partial?' · teilweise gemessen':''):'Messwerte und Verbrauch ansehen'});
  }
  if(features.heating===true)items.push({page:'heating',title:'Heizung & Gebäudepuffer',icon:'⌂',color:'#e6aa93',value:'Temperaturen & Trend',detail:'Gebäudewärme und Heizempfehlung ansehen'});
  items.push({page:'reports',title:'Berichte & Export',icon:'▤',color:'#b5b4e9',value:'CSV · JSON · Drucken',detail:'Zeitraum und Kennzahlen frei auswählen'});
  const html=items.map(card).join('');if(html!==signature){signature=html;host.innerHTML=html;}
  const description=$('analysisResourcesDescription');if(description)description.textContent=items.length===1?'Weitere Bereiche kannst du unter Einstellungen freischalten.':'Freigeschaltete Bereiche mit eigener Auswertung. Verschiedene Verbrauchsarten werden getrennt dargestellt.';
 }
 $('analysisNavigation')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-analysis-jump]');if(!button)return;
  const target=$(button.dataset.analysisJump);if(!target)return;
  document.querySelectorAll('[data-analysis-jump]').forEach(item=>item.removeAttribute('aria-current'));button.setAttribute('aria-current','location');
  target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});target.focus({preventScroll:true});
 });
 window.EnergyAnalysisLayout={update(next,namespace,currentPage){states=next||{};N=namespace||N;render(currentPage||page);},render};
})();
