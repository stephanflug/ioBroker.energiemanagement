'use strict';
(() => {
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const operations={input:'Datenpunkt',constant:'Konstante',add:'Addieren (+)',sub:'Subtrahieren (−)',mul:'Multiplizieren (×)',div:'Dividieren (÷)',min:'Minimum',max:'Maximum',gt:'Größer (>)',lt:'Kleiner (<)',gte:'Größer gleich (≥)',lte:'Kleiner gleich (≤)',eq:'Gleich (=)',neq:'Ungleich (≠)',and:'UND',or:'ODER',not:'NICHT',xor:'XOR',limit:'Begrenzen',output:'Ausgang (Simulation)'};
 const counts={input:0,constant:0,not:1,output:1,limit:3};
 let config={logics:[]},signature='',dirty=false,states={},ns='energiemanagement.0',api={},active='',live={logics:[]};
 const parse=(s,d)=>{try{return JSON.parse(s)}catch{return d}};
 const value=id=>states[ns+'.'+id]?.val;
 const unique=prefix=>prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
 const selected=()=>config.logics.find(l=>l.id===active);
 const count=op=>counts[op]??2;
 function mark(){dirty=true;$('logicStatus').textContent='Ungespeicherte Änderungen';}
 function render(){
  const host=$('freeLogicEditor');if(!host)return;
  host.innerHTML='<div class="logic-toolbar"><label>Logik <select id="logicSelect">'+config.logics.map(l=>'<option value="'+esc(l.id)+'" '+(l.id===active?'selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></label><button type="button" id="logicAdd">+ Neue Logik</button><button type="button" id="logicRemove" '+(!selected()?'disabled':'')+'>Löschen</button></div>';
  const logic=selected();
  if(!logic){host.insertAdjacentHTML('beforeend','<p>Noch keine Logik vorhanden. Erstelle deine erste Regelung.</p>');bind();return;}
  host.insertAdjacentHTML('beforeend','<div class="logic-toolbar"><label>Beschriftung <input id="logicName" maxlength="100" value="'+esc(logic.name)+'"></label><label><input type="checkbox" id="logicEnabled" '+(logic.enabled?'checked':'')+'> Simulation aktiv</label><label>Baustein hinzufügen <select id="logicOp">'+Object.entries(operations).map(([k,v])=>'<option value="'+k+'">'+esc(v)+'</option>').join('')+'</select></label><button type="button" id="logicBlockAdd">+ Baustein</button></div><p class="footnote">Verbindungen werden über die Eingangs-Auswahl hergestellt. Ausgänge sind in dieser Version ausschließlich simuliert und schreiben keine Datenpunkte.</p><div class="logic-blocks">'+logic.blocks.map((b,i)=>blockHTML(b,i,logic)).join('')+'</div><div id="logicDiagnostics" class="logic-diagnostics"></div>');
  bind();diagnostics();
 }
 function blockHTML(b,i,logic){
  const choices=logic.blocks.filter(x=>x.id!==b.id);
  const links=Array.from({length:count(b.op)},(_,j)=>'<label>Eingang '+(j+1)+' <select data-block="'+esc(b.id)+'" data-input="'+j+'"><option value="">– auswählen –</option>'+choices.map(x=>'<option value="'+esc(x.id)+'" '+(b.inputs[j]===x.id?'selected':'')+'>'+esc(x.name||operations[x.op])+'</option>').join('')+'</select></label>').join('');
  const extra=b.op==='input'||b.op==='output'?'<label>Datenpunkt <input data-block="'+esc(b.id)+'" data-prop="stateId" placeholder="adapter.0.datenpunkt" value="'+esc(b.stateId||'')+'"></label>':b.op==='constant'?'<label>Wert <input data-block="'+esc(b.id)+'" data-prop="value" value="'+esc(b.value??0)+'"></label>':'';
  return '<article class="logic-block"><div class="logic-block-head"><span class="logic-block-number">'+(i+1)+'</span><strong>'+esc(operations[b.op])+'</strong><button type="button" data-delete="'+esc(b.id)+'">Entfernen</button></div><label>Name <input data-block="'+esc(b.id)+'" data-prop="name" value="'+esc(b.name||'')+'"></label>'+extra+'<div class="logic-inputs">'+links+'</div><div class="logic-live" data-live="'+esc(b.id)+'">Noch kein Ergebnis</div></article>';
 }
 function diagnostics(){
  const logic=selected(),current=(live.logics||[]).find(l=>l.id===logic?.id);if(!logic)return;
  for(const b of logic.blocks){const el=document.querySelector('[data-live="'+b.id+'"]');if(el)el.textContent=current?.values?.[b.id]===null||current?.values?.[b.id]===undefined?'Wert: –':'Wert: '+String(current.values[b.id]);}
  const d=$('logicDiagnostics');if(d)d.textContent=current?.errors?.length?'Diagnose: '+current.errors.join(' | '):'Simulationsmodus – keine physischen Ausgänge werden geschaltet.';
 }
 function bind(){
  $('logicSelect')?.addEventListener('change',e=>{active=e.target.value;render()});
  $('logicAdd')?.addEventListener('click',()=>{const id=unique('logic');config.logics.push({id,name:'Neue Logik',enabled:false,blocks:[]});active=id;mark();render()});
  $('logicRemove')?.addEventListener('click',()=>{if(!confirm('Diese Logik wirklich entfernen?'))return;config.logics=config.logics.filter(l=>l.id!==active);active=config.logics[0]?.id||'';mark();render()});
  const logic=selected();if(!logic)return;
  $('logicName')?.addEventListener('change',e=>{logic.name=e.target.value;mark();render()});
  $('logicEnabled')?.addEventListener('change',e=>{logic.enabled=e.target.checked;mark()});
  $('logicBlockAdd')?.addEventListener('click',()=>{const op=$('logicOp').value;logic.blocks.push({id:unique('block'),op,name:operations[op],inputs:[],...(op==='constant'?{value:0}:{}),...(['input','output'].includes(op)?{stateId:''}:{})});mark();render()});
  for(const el of document.querySelectorAll('#freeLogicEditor [data-block]'))el.addEventListener('change',()=>{
   const b=logic.blocks.find(x=>x.id===el.dataset.block);if(!b)return;
   if(el.dataset.input!==undefined){b.inputs[Number(el.dataset.input)]=el.value;b.inputs=b.inputs.filter(Boolean)}
   else if(el.dataset.prop==='value'){const t=el.value.trim();b.value=t==='true'?true:t==='false'?false:Number(t)}
   else b[el.dataset.prop]=el.value;
   mark();if(el.dataset.prop==='name')render();
  });
  for(const el of document.querySelectorAll('#freeLogicEditor [data-delete]'))el.addEventListener('click',()=>{logic.blocks=logic.blocks.filter(b=>b.id!==el.dataset.delete);for(const b of logic.blocks)b.inputs=b.inputs.filter(id=>id!==el.dataset.delete);mark();render()});
 }
 function init(){
  if(!$('freeLogicEditor'))return;
  $('logicSave')?.addEventListener('click',async()=>{try{if(!api.setVal)throw Error('Keine Verbindung');await api.setVal('config.freeLogics_JSON',JSON.stringify(config));dirty=false;signature=JSON.stringify(config);$('logicStatus').textContent='Gespeichert (nur Simulation)';}catch(e){$('logicStatus').textContent='Fehler: '+e.message}});
  $('logicReset')?.addEventListener('click',()=>{dirty=false;signature='';sync()});
  render();
 }
 function sync(){
  const saved=parse(value('config.freeLogics_JSON'),{logics:[]}),sig=JSON.stringify(saved);
  if(!dirty&&sig!==signature){config=saved;signature=sig;if(!config.logics.some(l=>l.id===active))active=config.logics[0]?.id||'';render()}
  live=parse(value('live.freeLogics_JSON'),{logics:[]});diagnostics();
 }
 document.addEventListener('DOMContentLoaded',init);
 window.EnergyFreeLogicsUI={render(page){if(page==='regulation'&&!dirty)render()},update(next,N,page,methods){states=next||{};ns=N;api={...api,...methods};sync()}};
})();
