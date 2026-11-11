'use strict';
(() => {
 const host=document.getElementById('appVersion');if(!host)return;
 const $=id=>document.getElementById(id),labels={current:'Aktuell',update_available:'Update verfügbar',checking:'Prüfung läuft',unavailable:'Prüfung nicht möglich',prerelease:'Vorabversion',no_release:'Noch kein Release'};
 let states={},namespace='energiemanagement.0',api={},busy=false,override=null;
 const text=(id,value)=>{const element=$(id),next=String(value);if(element.textContent!==next)element.textContent=next;};
 const read=id=>{try{const value=states[namespace+'.'+id]?.val;return typeof value==='string'&&id!=='status.version'?JSON.parse(value):value;}catch{return null;}};
 const version=value=>typeof value==='string'&&/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value)?value:null;
 function date(value){const d=new Date(value);return value&&Number.isFinite(d.getTime())?d.toLocaleString('de-AT',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'Noch nicht geprüft';}
 function releaseUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.origin==='https://github.com'&&u.pathname.startsWith('/stephanflug/ioBroker.energiemanagement/releases/tag/')&&!u.username&&!u.password?u.href:null;}catch{return null;}}
 function render(){
  const published=read('update.status_JSON'),doc=override||published||{},installed=version(read('status.version'))||version(doc.installedVersion)||host.dataset.buildVersion||'–';
  const state=Object.hasOwn(labels,doc.status)?doc.status:'checking',development=doc.isPrerelease===true||doc.releaseChannel==='development'||(!published&&host.dataset.releaseChannel==='development');
  host.dataset.state=state;text('versionInstalled','v'+installed);text('versionInstalledDetail',installed);
  text('versionLabel',labels[state]);$('versionChannel').hidden=!development||state==='prerelease';
  $('versionIndicator').setAttribute('aria-label','Installierte Version '+installed+' · '+labels[state]+(development&&state!=='prerelease'?' · Vorabversion':''));
  text('versionMessage',typeof doc.message==='string'?doc.message:'Die serverseitige Versionsprüfung wird vorbereitet.');
  text('versionLatest',version(doc.latestVersion)|| (state==='no_release'?'Noch nicht veröffentlicht':'Noch nicht geprüft'));
  text('versionPublished',doc.publishedAt?date(doc.publishedAt):'–');text('versionLastSuccess',date(doc.lastSuccessfulCheckAt));
  const url=releaseUrl(doc.releaseUrl),show=!!url&&!!version(doc.latestVersion);$('versionReleaseInfo').hidden=!show;
  const notes=$('versionNotes'),notesScroll=notes.scrollTop;text('versionNotes',typeof doc.releaseNotes==='string'&&doc.releaseNotes.trim()?doc.releaseNotes.trim().slice(0,1200):'Für dieses Release wurden keine kurzen Änderungsinformationen hinterlegt.');notes.scrollTop=notesScroll;
  const link=$('versionReleaseLink');if(url)link.href=url;else link.removeAttribute('href');
  link.textContent=doc.releaseIsCached?'Zuletzt bekanntes GitHub-Release ansehen ↗':'GitHub-Release ansehen ↗';
  $('versionCheck').disabled=busy||typeof api.send!=='function'||state==='checking';
  const footer=$('footerVersion');if(footer&&footer.textContent!=='v'+installed)footer.textContent='v'+installed;
 }
 $('versionCheck').addEventListener('click',async()=>{
  if(busy||typeof api.send!=='function')return;busy=true;render();$('versionCheckFeedback').textContent='Versionsprüfung angefordert …';
  try{const result=await api.send('versionCheck',{});if(!result?.ok)throw Error(result?.error||'Die Versionsprüfung wurde nicht bestätigt.');if(result.status&&typeof result.status==='object')override=result.status;$('versionCheckFeedback').textContent=typeof result.status?.message==='string'?result.status.message:'Versionsinformation wird angezeigt.';}
  catch(error){$('versionCheckFeedback').textContent='Prüfung nicht bestätigt: '+String(error.message||error);}
  finally{busy=false;render();}
 });
 // Updating text never replaces the details element, closes a menu, navigates or scrolls.
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('versionDetails').open){$('versionDetails').open=false;$('versionIndicator').focus({preventScroll:true});}});
 document.addEventListener('pointerdown',event=>{if($('versionDetails').open&&!host.contains(event.target))$('versionDetails').open=false;});
 const topbar=document.querySelector('.topbar');if(topbar){const height=()=>document.documentElement.style.setProperty('--energy-topbar-height',Math.ceil(topbar.getBoundingClientRect().height)+'px');height();if(typeof ResizeObserver==='function')new ResizeObserver(height).observe(topbar);}
 window.EnergyVersionUI={update(next,N,page,actions){states=next||{};namespace=N||namespace;api=actions||api;override=null;render();},render};
 render();
})();
