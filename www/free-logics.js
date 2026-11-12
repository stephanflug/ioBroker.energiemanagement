'use strict';
(() => {
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const operations={input:'Datenpunkt',virtual:'Virtueller Sollwert',constant:'Konstante',add:'Addieren (+)',sub:'Subtrahieren (−)',mul:'Multiplizieren (×)',div:'Dividieren (÷)',min:'Minimum',max:'Maximum',gt:'Größer (>)',lt:'Kleiner (<)',gte:'Größer gleich (≥)',lte:'Kleiner gleich (≤)',eq:'Gleich (=)',neq:'Ungleich (≠)',and:'UND',or:'ODER',not:'NICHT',xor:'XOR',limit:'Begrenzen',output:'Ausgang (Simulation)'};
 const counts={input:0,virtual:0,constant:0,not:1,output:1,limit:3};
 let config={logics:[]},signature='',dirty=false,states={},ns='energiemanagement.0',api={},active='',live={logics:[]},pendingSave=null,saving=false,pickerBlock=null,pickerResults=[],lastKnown=null,loading=false;
 const parse=(s,d)=>{try{return JSON.parse(s)}catch{return d}};
 const value=id=>states[ns+'.'+id]?.val;
 const unique=prefix=>prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
 const selected=()=>config.logics.find(l=>l.id===active);
 const count=op=>counts[op]??2;
 function mark(){dirty=true;$('logicStatus').textContent='Ungespeicherte Änderungen';}
 function canvas(logic){
  const blocks=logic.blocks;
  const width=Math.max(980,...blocks.map((b,i)=>(Number.isFinite(b.x)?b.x:30+(i%4)*235)+215));
  const height=Math.max(440,...blocks.map((b,i)=>(Number.isFinite(b.y)?b.y:30+Math.floor(i/4)*145)+125));
  const byId=new Map(blocks.map((b,i)=>[b.id,{b,x:Number.isFinite(b.x)?b.x:30+(i%4)*235,y:Number.isFinite(b.y)?b.y:30+Math.floor(i/4)*145}]));
  const paths=[];
  for(const [id,target]of byId)for(let k=0;k<target.b.inputs.length;k++){
   const source=byId.get(target.b.inputs[k]);if(!source)continue;
   const x1=source.x+184,y1=source.y+48,x2=target.x,y2=target.y+43+k*14,m=(x1+x2)/2;
   paths.push('<path d="M'+x1+' '+y1+' C'+m+' '+y1+' '+m+' '+y2+' '+x2+' '+y2+'" stroke="#3b82f6" stroke-width="2.5" fill="none"/>');
  }
  const nodes=blocks.map(b=>{const p=byId.get(b.id),val=(live.logics||[]).find(l=>l.id===logic.id)?.values?.[b.id];return '<div class="fup-node" data-node="'+esc(b.id)+'" style="left:'+p.x+'px;top:'+p.y+'px"><div class="fup-node-title" data-drag="'+esc(b.id)+'">'+esc(b.name||operations[b.op])+'</div><div class="fup-node-type">'+esc(operations[b.op])+'</div><div class="fup-node-value">'+esc(val===undefined||val===null?'–':String(val))+'</div><button class="fup-out" type="button" data-wire-out="'+esc(b.id)+'" title="Ausgang verbinden">●</button>'+Array.from({length:count(b.op)},(_,i)=>'<button type="button" class="fup-in" style="top:'+(38+i*14)+'px" data-wire-in="'+esc(b.id)+'" data-port="'+i+'" title="Eingang '+(i+1)+' verbinden">●</button>').join('')+'</div>'}).join('');
  return '<div class="fup-help">Bausteine mit der Maus verschieben. Zum Verbinden zuerst den Ausgang ●, danach den Eingang ● anklicken. Die Detailkonfiguration steht darunter.</div><div class="fup-viewport"><div class="fup-stage" style="width:'+width+'px;height:'+height+'px"><svg class="fup-wires" width="'+width+'" height="'+height+'" aria-hidden="true">'+paths.join('')+'</svg>'+nodes+'</div></div><div id="fupWireStatus" class="fup-help">Keine Verbindung ausgewählt.</div>';
 }
 function openBlockSettings(blockId){const details=document.querySelector('.fup-details');if(!details)return;details.open=true;const el=details.querySelector('[data-block="'+blockId+'"]');if(el){el.scrollIntoView({block:'nearest',behavior:'smooth'});el.focus({preventScroll:true})}}
 function openStatePicker(blockId){
  const block=selected()?.blocks.find(b=>b.id===blockId);
  if(!block||!['input','output'].includes(block.op))return;
  ensurePicker();pickerBlock=blockId;
  $('fupPickerTitle').textContent='Datenpunkt auswählen – '+(block.name||operations[block.op]);
  $('fupPickerType').value='number';
  $('fupPickerQuery').value='';
  $('fupPickerResults').replaceChildren();
  $('fupPickerStatus').textContent='Datenpunkt suchen (Zahlenwert oder TRUE/FALSE auswählen).';
  const dialog=$('fupPicker');if(!dialog.open){try{dialog.showModal()}catch(e){$('logicStatus').textContent='Auswahlfenster konnte nicht geöffnet werden: '+e.message;return}}
  $('fupPickerQuery').focus();
 }
 function bindCanvas(logic){
  const stage=document.querySelector('.fup-stage');if(!stage)return;
  let source=null,drag=null;
  stage.addEventListener('click',e=>{
   const pick=e.target.closest('[data-pick-node]');if(pick){openStatePicker(pick.dataset.pickNode);return;}
   const out=e.target.closest('[data-wire-out]'),input=e.target.closest('[data-wire-in]');
   if(out){source=out.dataset.wireOut;$('fupWireStatus').textContent='Ausgang gewählt: '+(logic.blocks.find(b=>b.id===source)?.name||source)+' – jetzt Eingang wählen.';return;}
   if(input&&source){
    const target=logic.blocks.find(b=>b.id===input.dataset.wireIn),port=Number(input.dataset.port);
    if(!target||target.id===source){$('fupWireStatus').textContent='Selbstverbindungen sind nicht erlaubt.';return;}
    const arr=Array.from({length:count(target.op)},(_,i)=>target.inputs[i]||'');arr[port]=source;target.inputs=arr;
    source=null;mark();render();return;
   }

  });
  stage.addEventListener('dblclick',e=>{const node=e.target.closest('.fup-node');if(!node)return;e.preventDefault();const block=logic.blocks.find(b=>b.id===node.dataset.node);if(!block)return;if(block.op==='input'||block.op==='output'&&!block.createNew)openStatePicker(block.id);else openBlockSettings(block.id);});
  stage.addEventListener('pointerdown',e=>{
   const handle=e.target.closest('[data-drag]');if(!handle)return;
   const block=logic.blocks.find(b=>b.id===handle.dataset.drag),node=handle.closest('.fup-node');if(!block)return;
   const index=logic.blocks.indexOf(block);
   drag={block,node,moved:false,x:e.clientX,y:e.clientY,startX:Number.isFinite(block.x)?block.x:30+(index%4)*235,startY:Number.isFinite(block.y)?block.y:30+Math.floor(index/4)*145};
   handle.setPointerCapture(e.pointerId);e.preventDefault();
  });
  stage.addEventListener('pointermove',e=>{if(!drag)return;if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>4)drag.moved=true;if(!drag.moved)return;drag.block.x=Math.max(0,Math.round(drag.startX+e.clientX-drag.x));drag.block.y=Math.max(0,Math.round(drag.startY+e.clientY-drag.y));drag.node.style.left=drag.block.x+'px';drag.node.style.top=drag.block.y+'px';});
  stage.addEventListener('pointerup',()=>{if(drag){const moved=drag.moved;drag=null;if(moved){mark();render()}}});
  stage.addEventListener('pointercancel',()=>{if(drag){drag=null;render();}});
 }
 function render(){
  const host=$('freeLogicEditor');if(!host)return;
  host.innerHTML='<div class="logic-toolbar"><label>Logik <select id="logicSelect">'+config.logics.map(l=>'<option value="'+esc(l.id)+'" '+(l.id===active?'selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select></label><button type="button" id="logicAdd">+ Neue Logik</button><button type="button" id="logicRemove" '+(!selected()?'disabled':'')+'>Löschen</button></div>';
  const logic=selected();
  if(!logic){host.insertAdjacentHTML('beforeend','<p>Noch keine Logik vorhanden. Erstelle deine erste Regelung.</p>');bind();return;}
  host.insertAdjacentHTML('beforeend','<div class="logic-toolbar"><label>Beschriftung <input id="logicName" maxlength="100" value="'+esc(logic.name)+'"></label><label><input type="checkbox" id="logicEnabled" '+(logic.enabled?'checked':'')+'> Simulation aktiv</label><label>Baustein hinzufügen <select id="logicOp">'+Object.entries(operations).map(([k,v])=>'<option value="'+k+'">'+esc(v)+'</option>').join('')+'</select></label><button type="button" id="logicBlockAdd">+ Baustein</button></div><p class="footnote">Ausgänge werden derzeit ausschließlich simuliert und schreiben keine Datenpunkte.</p>'+canvas(logic)+'<details class="fup-details"><summary>Bausteine konfigurieren und Datenpunkte zuordnen</summary><div class="logic-blocks">'+logic.blocks.map((b,i)=>blockHTML(b,i,logic)).join('')+'</div></details><div id="logicDiagnostics" class="logic-diagnostics"></div>');
  bind();bindCanvas(logic);diagnostics();
 }
 function blockHTML(b,i,logic){
  const choices=logic.blocks.filter(x=>x.id!==b.id);
  const links=Array.from({length:count(b.op)},(_,j)=>'<label>Eingang '+(j+1)+' <select data-block="'+esc(b.id)+'" data-input="'+j+'"><option value="">– auswählen –</option>'+choices.map(x=>'<option value="'+esc(x.id)+'" '+(b.inputs[j]===x.id?'selected':'')+'>'+esc(x.name||operations[x.op])+'</option>').join('')+'</select></label>').join('');
  const sourceField='<label>Datenpunkt <span class="fup-source-field"><input data-block="'+esc(b.id)+'" data-prop="stateId" placeholder="adapter.0.datenpunkt" value="'+esc(b.stateId||'')+'"><button type="button" data-pick-state="'+esc(b.id)+'">Datenpunkt auswählen …</button></span></label>';
  const extra=b.op==='virtual'?'<label>Datenpunktname <input data-block="'+esc(b.id)+'" data-prop="virtualKey" placeholder="Sollwert" value="'+esc(b.virtualKey||'Sollwert')+'"></label><label>Datentyp <select data-block="'+esc(b.id)+'" data-prop="valueType"><option value="number" '+(b.valueType!=='boolean'?'selected':'')+'>Zahlenwert</option><option value="boolean" '+(b.valueType==='boolean'?'selected':'')+'>TRUE / FALSE</option></select></label><label>Startwert <input data-block="'+esc(b.id)+'" data-prop="value" value="'+esc(b.value??0)+'"></label><small>Schreibbarer ioBroker-Datenpunkt: '+esc(ns+'.logicVirtual.'+logic.id+'_'+(b.virtualKey||'Sollwert'))+'</small>':b.op==='input'?sourceField:b.op==='output'?'<label>Ausgangsart <select data-block="'+esc(b.id)+'" data-prop="createNew"><option value="false" '+(!b.createNew?'selected':'')+'>Vorhandenen Datenpunkt auswählen (Simulation)</option><option value="true" '+(b.createNew?'selected':'')+'>Neuen ioBroker-Ausgang erzeugen</option></select></label>'+(b.createNew?'<label>Datentyp <select data-block="'+esc(b.id)+'" data-prop="outputType"><option value="number" '+(b.outputType!=='boolean'?'selected':'')+'>Zahlenwert</option><option value="boolean" '+(b.outputType==='boolean'?'selected':'')+'>TRUE / FALSE</option></select></label><label>Neuer Ausgangsname <input data-block="'+esc(b.id)+'" data-prop="outputKey" placeholder="z. B. BKW_Ladeleistung" value="'+esc(b.outputKey||'')+'"></label><small>Wird als eigener Datenpunkt unter energiemanagement.0.logicOutputs angelegt. Nur gültige Werte des ausgewählten Datentyps werden geschrieben.</small>':sourceField):b.op==='constant'?'<label>Wert <input data-block="'+esc(b.id)+'" data-prop="value" value="'+esc(b.value??0)+'"></label>':'';
  return '<article class="logic-block"><div class="logic-block-head"><span class="logic-block-number">'+(i+1)+'</span><strong>'+esc(operations[b.op])+'</strong><button type="button" data-delete="'+esc(b.id)+'">Entfernen</button></div><label>Name <input data-block="'+esc(b.id)+'" data-prop="name" value="'+esc(b.name||'')+'"></label>'+extra+'<div class="logic-inputs">'+links+'</div><div class="logic-live" data-live="'+esc(b.id)+'">Noch kein Ergebnis</div></article>';
 }
 function diagnostics(){
  const logic=selected(),current=(live.logics||[]).find(l=>l.id===logic?.id);if(!logic)return;
  for(const b of logic.blocks){const el=document.querySelector('[data-live="'+b.id+'"]');if(el)el.textContent=current?.values?.[b.id]===null||current?.values?.[b.id]===undefined?'Wert: –':'Wert: '+String(current.values[b.id]);}
  for(const b of logic.blocks){const node=document.querySelector('.fup-node[data-node="'+b.id+'"] .fup-node-value');if(node)node.textContent=current?.values?.[b.id]===null||current?.values?.[b.id]===undefined?'–':String(current.values[b.id]);}
  const d=$('logicDiagnostics');if(d){const stamp=live.ts?new Date(live.ts).toLocaleTimeString('de-AT'):'–';const stale=!live.ts||Date.now()-live.ts>30000;d.textContent=(stale?'Keine aktuellen Live-Daten vom Adapter. ':'Live-Berechnung: '+stamp+' · ')+(current?.errors?.length?'Diagnose: '+current.errors.join(' | '):'Keine Berechnungsfehler.');}
 }
 function ensurePicker(){
  if($('fupPicker'))return;
  const dialog=document.createElement('dialog');dialog.id='fupPicker';dialog.className='source-manager-picker';dialog.innerHTML='<div class="panel-head wrap"><h3 id="fupPickerTitle">Datenpunkt auswählen</h3><button type="button" id="fupPickerClose" class="button ghost">Schließen</button></div><form id="fupPickerForm"><label>Datentyp <select id="fupPickerType"><option value="number">Zahlenwert</option><option value="boolean">TRUE / FALSE</option></select></label><label for="fupPickerQuery">Name oder vollständige Datenpunkt-ID</label><div class="source-picker-search"><input id="fupPickerQuery" type="search" maxlength="100" placeholder="Mindestens 2 Zeichen"><button type="submit" id="fupPickerSearch" class="button primary">Suchen</button></div></form><p id="fupPickerStatus" role="status">Datenpunkt suchen.</p><div id="fupPickerResults"></div>';
  document.body.append(dialog);
  $('fupPickerClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{pickerBlock=null;pickerResults=[]});
  $('fupPickerForm').addEventListener('submit',async e=>{
   e.preventDefault();if(!pickerBlock)return;
   const query=$('fupPickerQuery').value.trim();if(query.length<2){$('fupPickerStatus').textContent='Mindestens 2 Zeichen eingeben.';return}
   if(!api.send){$('fupPickerStatus').textContent='Keine Verbindung zum Adapter.';return}
   const target=pickerBlock;$('fupPickerSearch').disabled=true;$('fupPickerStatus').textContent='Datenpunkte werden gesucht …';
   try{const response=await api.send('sourceObjects',{query,type:$('fupPickerType').value});if(pickerBlock!==target)return;if(response?.ok===false)throw Error(response.error||'Suche fehlgeschlagen');
    pickerResults=(response?.results||[]).filter(row=>row.type===$('fupPickerType').value||!row.type);
    $('fupPickerResults').innerHTML=pickerResults.map((row,i)=>'<button type="button" data-fup-result="'+i+'"><strong>'+esc(row.name||row.id)+'</strong><small>'+esc(row.id)+'</small><small>'+esc([row.type,row.unit].filter(Boolean).join(' · '))+'</small></button>').join('');
    $('fupPickerStatus').textContent=pickerResults.length?pickerResults.length+' passende Datenpunkte':'Keine passenden Datenpunkte gefunden.';
   }catch(error){$('fupPickerStatus').textContent='Suche fehlgeschlagen: '+error.message}finally{$('fupPickerSearch').disabled=false}
  });
  $('fupPickerResults').addEventListener('click',e=>{
   const button=e.target.closest('[data-fup-result]');if(!button||!pickerBlock)return;
   const row=pickerResults[Number(button.dataset.fupResult)],block=selected()?.blocks.find(b=>b.id===pickerBlock);
   if(!row||!block)return;block.stateId=String(row.id);mark();dialog.close();render();
  });
 }
 function bind(){
  $('logicSelect')?.addEventListener('change',e=>{active=e.target.value;render()});
  $('logicAdd')?.addEventListener('click',()=>{const id=unique('logic');config.logics.push({id,name:'Neue Logik',enabled:false,blocks:[]});active=id;mark();render()});
  $('logicRemove')?.addEventListener('click',()=>{if(!confirm('Diese Logik wirklich entfernen?'))return;config.logics=config.logics.filter(l=>l.id!==active);active=config.logics[0]?.id||'';mark();render()});
  const logic=selected();if(!logic)return;
  
  $('logicName')?.addEventListener('change',e=>{logic.name=e.target.value;mark();render()});
  $('logicEnabled')?.addEventListener('change',e=>{logic.enabled=e.target.checked;mark()});
  $('logicBlockAdd')?.addEventListener('click',()=>{const op=$('logicOp').value;logic.blocks.push({id:unique('block'),op,name:operations[op],inputs:[],...(['constant','virtual'].includes(op)?{value:0}:{}),...(op==='virtual'?{virtualKey:'Sollwert_'+(logic.blocks.length+1),valueType:'number'}:{}),...(['input','output'].includes(op)?{stateId:''}:{})});mark();render()});
  for(const el of document.querySelectorAll('#freeLogicEditor [data-block]'))el.addEventListener('change',()=>{
   const b=logic.blocks.find(x=>x.id===el.dataset.block);if(!b)return;
   if(el.dataset.input!==undefined){b.inputs[Number(el.dataset.input)]=el.value;b.inputs=b.inputs}
   else if(el.dataset.prop==='createNew'){b.createNew=el.value==='true';if(b.createNew&&!b.outputKey)b.outputKey='Ausgang';render()}
   else if(el.dataset.prop==='value'){const t=el.value.trim();b.value=t==='true'?true:t==='false'?false:Number(t)}
   else b[el.dataset.prop]=el.value;
   mark();if(el.dataset.prop==='name')render();
  });
  for(const el of document.querySelectorAll('#freeLogicEditor [data-delete]'))el.addEventListener('click',()=>{logic.blocks=logic.blocks.filter(b=>b.id!==el.dataset.delete);for(const b of logic.blocks)b.inputs=b.inputs.filter(id=>id!==el.dataset.delete);mark();render()});
 }
 function init(){
  document.addEventListener('click',e=>{const button=e.target.closest('[data-pick-state]');if(button&&button.closest('#freeLogicEditor')){e.preventDefault();openStatePicker(button.dataset.pickState)}});
  if(!$('freeLogicEditor'))return;
  $('logicSave')?.addEventListener('click',async()=>{if(saving)return;try{if(!api.setVal||!api.readVal)throw Error('Keine Verbindung');saving=true;const payload=JSON.stringify(config);pendingSave=payload;$('logicStatus').textContent='Speichern und Bestätigung abwarten …';await api.setVal('config.freeLogics_JSON',payload);let confirmed=false;for(let attempt=0;attempt<12;attempt++){await new Promise(resolve=>setTimeout(resolve,500));const response=await api.readVal('config.freeLogics_JSON');const val=response?.val??response?.state?.val;let parsed;try{parsed=JSON.parse(val)}catch{continue}if(JSON.stringify(parsed)===payload&&response?.ack!==false){confirmed=true;break}}if(!confirmed)throw Error('Keine Bestätigung vom Adapter. Konfiguration nicht überschrieben; bitte Adapterstatus prüfen.');dirty=false;signature=payload;pendingSave=payload;$('logicStatus').textContent='Vom Adapter bestätigt und gespeichert (Simulation)';}catch(e){dirty=true;pendingSave=null;$('logicStatus').textContent='Speichern nicht bestätigt: '+e.message;}finally{saving=false}});
  $('logicReset')?.addEventListener('click',()=>{dirty=false;signature='';sync()});
  render();
  loadSaved();
 }
 async function loadSaved(){
  if(loading||!api.readVal||dirty||pendingSave)return;
  loading=true;
  try{const response=await api.readVal('config.freeLogics_JSON');const raw=response?.val??response?.state?.val;const parsed=typeof raw==='string'?parse(raw,null):raw;if(parsed&&Array.isArray(parsed.logics)){states[ns+'.config.freeLogics_JSON']={val:JSON.stringify(parsed)};sync();}}
  catch(e){if($('logicStatus'))$('logicStatus').textContent='Gespeicherte Logiken konnten nicht geladen werden: '+e.message}
  finally{loading=false}
 }
 function sync(){
  const raw=value('config.freeLogics_JSON');
  if(raw===undefined||raw===null||raw==='')return;
  const saved=parse(raw,null);
  if(!saved||!Array.isArray(saved.logics)){if($('logicStatus'))$('logicStatus').textContent='Konfiguration konnte nicht gelesen werden – vorhandene Logiken bleiben erhalten.';return;}
  const sig=JSON.stringify(saved);lastKnown=saved;
  if(pendingSave&&sig===pendingSave)pendingSave=null;
  if(!dirty&&!pendingSave&&sig!==signature){config=saved;signature=sig;if(!config.logics.some(l=>l.id===active))active=config.logics[0]?.id||'';render()}
  live=parse(value('live.freeLogics_JSON'),{logics:[]});diagnostics();
 }
 document.addEventListener('DOMContentLoaded',init);
 window.EnergyFreeLogicsUI={render(page){if(page==='regulation'&&!dirty&&!pendingSave&&!document.querySelector('#fupPicker[open]'))render()},update(next,N,page,methods){states=next||{};ns=N;api={...api,...methods};sync();if(value('config.freeLogics_JSON')===undefined)loadSaved()}};
})();
