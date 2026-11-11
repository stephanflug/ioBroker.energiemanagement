'use strict';
// Run from a development checkout with Playwright: node test/browser/version-about.cjs
// The server and every source/reading below are synthetic; no ioBroker is contacted.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const fixture=require('../../tools/create-publication-screenshots.cjs');
const {server,state,states,calls,N,NOW}=fixture;
const routes=['overview','history','analytics','forecast','water','rainwater','fuel','heating','reports','sources','devices','outputs','settings','about'];
const labels={current:'Aktuell',update_available:'Update verfügbar',checking:'Prüfung läuft',unavailable:'Prüfung nicht möglich',prerelease:'Vorabversion',no_release:'Noch kein Release'};
function versionDoc(status,extra={}){
 const release=['current','update_available','unavailable'].includes(status),latest=status==='current'?'0.10.2':'0.10.3';
 return {version:1,status,installedVersion:'0.10.2',releaseChannel:status==='prerelease'||status==='no_release'?'development':'stable',isPrerelease:['prerelease','no_release'].includes(status),latestVersion:release?latest:null,publishedAt:release?'2026-11-09T12:00:00.000Z':null,releaseUrl:release?'https://github.com/stephanflug/ioBroker.energiemanagement/releases/tag/v'+latest:null,releaseName:release?'Energiemanagement '+latest:'',releaseNotes:release?'Kleine Verbesserungen und verständlichere Hilfetexte.':'',releaseIsCached:status==='unavailable',lastAttemptAt:NOW,lastSuccessfulCheckAt:status==='checking'?null:NOW-60000,nextCheckAt:NOW+12*3600000,message:status==='no_release'?'Noch kein öffentliches stabiles GitHub-Release verfügbar.':status==='unavailable'?'GitHub ist derzeit nicht erreichbar.':status==='update_available'?'Eine neuere stabile Version ist verfügbar.':'Versionsinformation aus der synthetischen Testumgebung.',error:status==='unavailable'?'GitHub nicht erreichbar.':'',...extra};
}
async function navigate(page,route){
 await page.evaluate(route=>{location.hash=route;},route);
 await page.waitForFunction(route=>document.getElementById('page-'+route)?.classList.contains('hidden')===false,route);
 await page.evaluate(()=>scrollTo(0,0));
}
let publishedSequence=0;
async function publish(page,status,extra={}){
 const doc=versionDoc(status,extra);doc.message+=' [Teststand '+(++publishedSequence)+']';state('update.status_JSON',doc);
 await page.waitForFunction(({status,message})=>document.getElementById('appVersion')?.dataset.state===status&&document.getElementById('versionMessage')?.textContent===message,{status,message:doc.message});
 assert.equal(await page.locator('#versionLabel').textContent(),labels[status]);
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,errors=[],external=[],requests=new Map();
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...((process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||fs.existsSync('/usr/bin/chromium'))?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});let loads=0;
  page.on('load',()=>loads++);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{const url=new URL(request.url());if(url.origin===base)requests.set(url.pathname,(requests.get(url.pathname)||0)+1);});
  await page.addInitScript(now=>{
   const RealDate=Date;class DemoDate extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}window.Date=DemoDate;
   window.__testDocumentToken=Math.random().toString(36);
   const original=setInterval;window.setInterval=(callback,delay,...args)=>original(callback,delay===10000?250:delay,...args);
  },NOW);
  await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base)||url.startsWith('data:'))return route.continue();external.push(url);return route.abort();});
  await page.goto(base+'/#overview');await page.waitForFunction(()=>document.getElementById('dashboardPvValue')?.textContent.includes('5,7'));
  const token=await page.evaluate(()=>window.__testDocumentToken);
  assert.match(await page.locator('#versionInstalled').textContent(),/0\.10\.2/);
  assert.equal(await page.locator('#appSidebar [data-page="about"]').count(),1);
  assert.equal(await page.locator('body').textContent().then(text=>text.includes('Power bye Ebner Stephan')),false);
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:width<801?844:1000});
   for(const route of routes){
    await navigate(page,route);
    const box=await page.locator('#versionIndicator').boundingBox();
    assert.ok(box&&box.width>=44&&box.height>=44,'version touch target '+route+' @'+width);
    assert.ok(box.x>=-1&&box.x+box.width<=width+1,'version header fits '+route+' @'+width);
    assert.ok(box.y>=-1&&box.y+box.height<=844,'version visible '+route+' @'+width);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'page overflow '+route+' @'+width);
   }
   await page.locator('#versionIndicator').click();const popup=await page.locator('#versionPopover').boundingBox();
   assert.ok(popup&&popup.x>=-1&&popup.x+popup.width<=width+1,'popover fits '+width);
   assert.ok(popup.y>=0&&popup.y+popup.height<=(width<801?844:1000)+1,'popover height fits '+width);
   await page.locator('#versionIndicator').click();
  }
  await page.setViewportSize({width:1440,height:1000});await navigate(page,'about');
  const license=fs.readFileSync(path.resolve(__dirname,'../../LICENSE'),'utf8').trim();
  await page.waitForFunction(()=>document.getElementById('aboutMIT')?.textContent.includes('Permission is hereby granted'));
  assert.equal((await page.locator('#aboutMIT').textContent()).trim(),license,'complete local MIT license');
  await page.waitForFunction(()=>document.getElementById('aboutLicenseStatus')?.textContent.includes('vollständig geladen'));
  assert.match(await page.locator('#aboutThirdParty').textContent(),/semver/i);
  assert.match(await page.locator('#aboutContent').textContent(),/Entwicklung: Stephan Ebner/);
  assert.equal(await page.locator('#aboutVersion').textContent(),'0.10.2');
  const links=await page.locator('#aboutContent a').evaluateAll(nodes=>nodes.map(node=>({href:node.href,rel:node.rel,target:node.target})));
  assert.ok(links.some(link=>link.href==='https://github.com/stephanflug/ioBroker.energiemanagement'));
  assert.ok(links.some(link=>link.href.endsWith('/blob/main/README.md')));
  assert.ok(links.some(link=>link.href.endsWith('/issues/new/choose')));
  assert.ok(links.filter(link=>link.href.startsWith('https:')).every(link=>link.target==='_blank'&&link.rel.includes('noopener')));
  assert.ok(links.some(link=>link.href==='mailto:steuerung@gmx.at'));
  await navigate(page,'devices');
  const input=page.locator('[data-device="washer"][data-field="name"]');await input.fill('Ungespeicherter Vergleichsentwurf');
  await page.locator('#versionIndicator').click();await page.evaluate(()=>scrollTo(0,400));
  const scroll=await page.evaluate(()=>scrollY),initialLoads=loads;
  for(const status of ['checking','current','update_available','unavailable','prerelease','no_release']){
   await publish(page,status);
   assert.equal(await input.inputValue(),'Ungespeicherter Vergleichsentwurf');
   assert.equal(await page.locator('#versionDetails').evaluate(node=>node.open),true,'popover survives '+status);
   assert.equal(await page.evaluate(()=>location.hash),'#devices');
   assert.ok(Math.abs((await page.evaluate(()=>scrollY))-scroll)<=2,'scroll survives '+status);
   assert.equal(await page.evaluate(()=>window.__testDocumentToken),token);assert.equal(loads,initialLoads,'no reload '+status);
  }
  await publish(page,'update_available',{releaseNotes:'<img src=x onerror="window.bad=true"> Nur als Text angezeigt.'});
  assert.equal(await page.locator('#versionLatest').textContent(),'0.10.3');assert.match(await page.locator('#versionPublished').textContent(),/09\.11\.2026/);
  assert.equal(await page.locator('#versionReleaseLink').getAttribute('href'),'https://github.com/stephanflug/ioBroker.energiemanagement/releases/tag/v0.10.3');
  assert.equal(await page.locator('#versionNotes img').count(),0);assert.match(await page.locator('#versionNotes').textContent(),/<img/);
  assert.equal(await page.evaluate(()=>window.bad),undefined);
  await publish(page,'update_available',{releaseUrl:'javascript:window.bad=true'});
  assert.equal(await page.locator('#versionReleaseLink').getAttribute('href'),null);assert.equal(await page.locator('#versionReleaseInfo').isVisible(),false);
  await publish(page,'update_available');
  const beforeCheck=calls.filter(call=>call.command==='versionCheck').length;
  await page.locator('#versionCheck').click();await page.waitForFunction(message=>document.getElementById('versionCheckFeedback')?.textContent===message,JSON.parse(states[N+'.update.status_JSON'].val).message);
  assert.equal(calls.filter(call=>call.command==='versionCheck').length,beforeCheck+1);assert.deepEqual(calls.filter(call=>call.command==='versionCheck').at(-1).payload,{});
  assert.ok(!calls.some(call=>/install|upgrade|restart|updateAdapter/i.test(call.command)),'no update installation command');
  // Actual runtime state is authoritative even if a stale informational cache names a different build.
  state('status.version','0.10.1');await publish(page,'current',{installedVersion:'0.10.2'});
  await page.waitForFunction(()=>document.getElementById('versionInstalled')?.textContent==='v0.10.1');state('status.version','0.10.2');
  await page.waitForFunction(()=>document.getElementById('versionInstalled')?.textContent==='v0.10.2');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
  await page.locator('#mobileMenuOpen').click();assert.equal(await page.locator('body').evaluate(node=>node.classList.contains('nav-open')),true);
  await publish(page,'unavailable');
  assert.equal(await page.locator('body').evaluate(node=>node.classList.contains('nav-open')),true,'poll does not close drawer');
  assert.equal(await input.inputValue(),'Ungespeicherter Vergleichsentwurf');
  await page.locator('#appSidebar [data-page="about"]').click();await page.waitForFunction(()=>location.hash==='#about');
  assert.equal(await page.locator('body').evaluate(node=>node.classList.contains('nav-open')),false,'explicit navigation closes drawer');
  assert.equal(await page.locator('#aboutVersion').textContent(),'0.10.2');
  assert.equal(await page.evaluate(()=>window.__testDocumentToken),token);assert.equal(loads,initialLoads);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[],'browser does not fetch GitHub or other external resources');
  assert.equal(requests.get('/LICENSE.txt'),1,'license loaded once');assert.equal(requests.get('/THIRD_PARTY_NOTICES.txt'),1,'notices loaded once');
  console.log('Version/About browser checks passed: all routes and320/390/768/1440, fullMIT/localnotices, sixstates, safeReleaseinfo, readonlymanualcheck, runtimeversion, no reload/scroll/draft/popover/drawer loss.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);if(server.listening)server.close();process.exitCode=1;});
