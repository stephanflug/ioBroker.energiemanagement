'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {VersionCheck,validateVersionRuntime,releaseVersion,chooseRelease,REPOSITORY,API_URL,CHECK_INTERVAL_MS,MIN_RETRY_MS,MANUAL_COOLDOWN_MS}=require('../lib/version-check');
const NOW=Date.UTC(2026,10,10,12);
const release=(tag='v0.10.2',extra={})=>({tag_name:tag,draft:false,prerelease:false,published_at:'2026-11-09T12:00:00Z',name:'Version '+tag,body:'## Änderungen\nMesswerte verbessert.',...extra});
const response=(body,status=200,headers={})=>new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers});
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({installedVersion='0.10.2',releaseChannel='stable',runtime={},timeoutMs=100,fetcher}={}){
 let clock=NOW,handler=fetcher||(()=>response([release()]));const calls=[],writes=[],states=new Map(),warnings=[];
 const adapter={stopping:false,dataBusy:false,log:{warn:message=>warnings.push(message)},set:async(id,value,force)=>{writes.push({id,value:structuredClone(value),force});states.set(id,structuredClone(value));}};
 const check=new VersionCheck(adapter,{installedVersion,releaseChannel},runtime,{now:()=>clock,timeoutMs,fetch:async(url,options)=>{calls.push({url,options});return handler(url,options);}});
 return {check,adapter,calls,writes,states,warnings,now:()=>clock,advance:ms=>clock+=ms,fetch:fn=>handler=fn};
}
function assertOwnWrites(f){assert.ok(f.writes.length);assert.deepEqual([...new Set(f.writes.map(row=>row.id))].sort(),['internal.versionCheck_JSON','update.status_JSON']);assert.ok(f.writes.every(row=>row.force===true));}

test('semver selection is strict, numeric and excludes drafts and prereleases',()=>{
 for(const tag of ['release-0.10.2','0.10','01.10.2','v0.10.2 trailing','V0.10.2','v0.10.2.1',''])assert.equal(releaseVersion(tag),null);
 assert.equal(releaseVersion('v0.10.2'),'0.10.2');assert.equal(releaseVersion('0.10.2+build.9'),'0.10.2+build.9');
 const chosen=chooseRelease([release('v0.10.2'),release('v0.10.10'),release('v0.11.0-rc.1'),release('v9.0.0',{draft:true}),release('v8.0.0',{prerelease:true}),release('latest')]);
 assert.equal(chosen.version,'0.10.10');assert.equal(chosen.url,'https://github.com/'+REPOSITORY+'/releases/tag/v0.10.10');
});

test('public startup check uses only the fixed tokenless GitHub GET and publishes current status',async()=>{
 const f=fixture();assert.equal(f.check.document().status,'checking');
 const doc=await f.check.refresh();assert.equal(doc.status,'current');assert.equal(doc.installedVersion,'0.10.2');assert.equal(doc.latestVersion,'0.10.2');assert.equal(doc.lastSuccessfulCheckAt,NOW);assert.equal(doc.nextCheckAt,NOW+CHECK_INTERVAL_MS);
 assert.equal(f.calls.length,1);const call=f.calls[0];assert.equal(call.url,API_URL+'?per_page=100&page=1');assert.equal(call.options.method,'GET');assert.equal(call.options.redirect,'error');assert.equal(Object.keys(call.options.headers).some(key=>/authorization|token/i.test(key)),false);
 assertOwnWrites(f);assert.equal(f.states.get('update.status_JSON').status,'current');assert.equal(validateVersionRuntime(f.check.runtime()).lastOutcome,'success');
});

test('available updates expose their version, date, safe canonical link and bounded plain notes',async()=>{
 const f=fixture({fetcher:()=>response([release('v0.10.10',{html_url:'https://evil.invalid/',body:'<script>alert(1)</script>\n'+'Ä'.repeat(1800)})])});
 const doc=await f.check.refresh();assert.equal(doc.status,'update_available');assert.equal(doc.latestVersion,'0.10.10');assert.equal(doc.publishedAt,'2026-11-09T12:00:00.000Z');assert.equal(doc.releaseUrl,'https://github.com/'+REPOSITORY+'/releases/tag/v0.10.10');assert.ok(doc.releaseNotes.length<=1200);assert.equal(doc.releaseNotes.includes('<script>'),false);assertOwnWrites(f);
});

test('development builds and installed semver prereleases remain distinguishable from stable releases',async()=>{
 for(const options of [{releaseChannel:'development'},{installedVersion:'0.10.3-rc.1'}]){const f=fixture(options),doc=await f.check.refresh();assert.equal(doc.status,'prerelease');assert.equal(doc.isPrerelease,true);}
 const rc=fixture({installedVersion:'0.10.2-rc.1'}),doc=await rc.check.refresh();assert.equal(doc.status,'update_available');assert.equal(doc.isPrerelease,true);
 const ahead=fixture({installedVersion:'0.11.0'});assert.equal((await ahead.check.refresh()).status,'prerelease');
});

test('an empty or prerelease-only repository has a neutral no-release status',async()=>{
 for(const rows of [[],[release('v0.11.0-rc.1'),release('v0.10.2',{draft:true})]]){
  const f=fixture({releaseChannel:'development',fetcher:()=>response(rows)}),doc=await f.check.refresh();assert.equal(doc.status,'no_release');assert.equal(doc.isPrerelease,true);assert.equal(doc.latestVersion,null);assert.equal(doc.lastSuccessfulCheckAt,NOW);assert.equal(doc.error,'');
 }
 const missing=fixture({fetcher:()=>response({message:'Not Found'},404)}),doc=await missing.check.refresh();assert.equal(doc.status,'no_release');assert.equal(doc.lastSuccessfulCheckAt,null);assert.equal(doc.nextCheckAt,NOW+CHECK_INTERVAL_MS);
});

test('regular polling observes the twelve-hour interval while startup checks a valid cached release',async()=>{
 const f=fixture();await f.check.refresh();f.advance(CHECK_INTERVAL_MS-1);f.check.tick();assert.equal(f.calls.length,1);f.advance(1);f.check.tick();await f.check.flush();assert.equal(f.calls.length,2);
 const runtime=f.check.runtime();runtime.lastAttemptAt=NOW-3600000;runtime.lastSuccessfulCheckAt=NOW-3600000;runtime.nextCheckAt=NOW+CHECK_INTERVAL_MS;
 const restarted=fixture({runtime});assert.equal(restarted.check.document().status,'checking');restarted.check.tick();await restarted.check.flush();assert.equal(restarted.calls.length,1);assert.equal(restarted.check.document().status,'current');
});

test('manual checks share the running request and cannot bypass the one-minute cooldown',async()=>{
 let complete;const f=fixture({fetcher:()=>new Promise(resolve=>complete=resolve)});
 const first=f.check.refresh(),second=f.check.refresh(true);assert.equal(first,second);await nextTurn();assert.equal(f.calls.length,1);complete(response([release()]));await first;
 f.advance(MANUAL_COOLDOWN_MS-1);await f.check.refresh(true);assert.equal(f.calls.length,1);assert.equal(f.check.document().status,'current');
 f.advance(1);f.fetch(()=>response([release()]));await f.check.refresh(true);assert.equal(f.calls.length,2);
});

test('a recent restart schedules its startup check immediately after the remaining cooldown',async()=>{
 const initial=fixture();await initial.check.refresh();const runtime=initial.check.runtime();runtime.lastAttemptAt=NOW-1000;runtime.lastSuccessfulCheckAt=NOW-1000;
 const restarted=fixture({runtime});restarted.check.tick();await restarted.check.flush();assert.equal(restarted.calls.length,0);assert.equal(restarted.check.runtime().nextCheckAt,NOW+MANUAL_COOLDOWN_MS-1000);
 restarted.advance(MANUAL_COOLDOWN_MS-1000);restarted.check.tick();await restarted.check.flush();assert.equal(restarted.calls.length,1);assert.equal(restarted.check.document().status,'current');
});

test('network errors retain the last successful date and cached release without claiming current',async()=>{
 const f=fixture();await f.check.refresh();f.advance(120000);f.fetch(()=>{throw Error('Netzwerk nicht erreichbar');});
 const doc=await f.check.refresh(true);assert.equal(doc.status,'unavailable');assert.equal(doc.latestVersion,'0.10.2');assert.equal(doc.releaseIsCached,true);assert.equal(doc.lastSuccessfulCheckAt,NOW);assert.equal(doc.nextCheckAt,f.now()+MIN_RETRY_MS);assert.match(doc.error,/Netzwerk/);assert.equal(validateVersionRuntime(f.check.runtime()).lastOutcome,'unavailable');
});

test('GitHub rate limits and Retry-After also survive a restart and forced checks',async()=>{
 const f=fixture({fetcher:()=>response({message:'limit'},403,{'x-ratelimit-remaining':'0','x-ratelimit-reset':String((NOW+3600000)/1000),'retry-after':'1200'})});
 const doc=await f.check.refresh();assert.equal(doc.status,'unavailable');assert.equal(doc.nextCheckAt,NOW+3600000);assert.match(doc.error,/HTTP 403/);
 f.advance(120000);await f.check.refresh(true);assert.equal(f.calls.length,1);
 const restarted=fixture({runtime:f.check.runtime()});restarted.check.tick();await restarted.check.flush();assert.equal(restarted.calls.length,0);assert.equal(restarted.check.document().status,'unavailable');
 restarted.advance(3600000);restarted.check.tick();await restarted.check.flush();assert.equal(restarted.calls.length,1);assert.equal(restarted.check.document().status,'current');
});

test('HTTP Retry-After dates are honored and excessive delays are bounded',async()=>{
 const f=fixture({fetcher:()=>response({},429,{'retry-after':new Date(NOW+2*86400000).toUTCString()})});assert.equal((await f.check.refresh()).nextCheckAt,NOW+2*86400000);
 const huge=fixture({fetcher:()=>response({},429,{'retry-after':'99999999999999999'})});assert.equal((await huge.check.refresh()).nextCheckAt,NOW+7*86400000);
 const invalid=fixture({fetcher:()=>response({},500,{'retry-after':'nonsense'})});assert.equal((await invalid.check.refresh()).nextCheckAt,NOW+MIN_RETRY_MS);
});

test('malformed GitHub data never becomes an up-to-date confirmation',async()=>{
 for(const body of ['{',{},[{tag_name:'v0.10.2'}],[release('v0.10.2',{published_at:'invalid'})]]){
  const f=fixture({fetcher:()=>response(body)}),doc=await f.check.refresh();assert.equal(doc.status,'unavailable');assert.equal(doc.lastSuccessfulCheckAt,null);assert.equal(doc.latestVersion,null);assert.ok(doc.error);
 }
});

test('both announced and streamed oversized responses are rejected',async()=>{
 for(const fetcher of [()=>response([] ,200,{'content-length':String(512*1024+1)}),()=>response(' '.repeat(512*1024+1))]){
  const f=fixture({fetcher});assert.match((await f.check.refresh()).error,/zu groß/);assert.equal(f.check.document().status,'unavailable');
 }
});

test('pagination remains on the fixed endpoint and chooses the highest stable semantic version',async()=>{
 const f=fixture({fetcher:url=>url.endsWith('page=1')?response([release('v0.10.2')],200,{link:'<https://evil.invalid/>; rel="next"'}):response([release('v0.10.10')])});
 assert.equal((await f.check.refresh()).latestVersion,'0.10.10');assert.deepEqual(f.calls.map(call=>call.url),[API_URL+'?per_page=100&page=1',API_URL+'?per_page=100&page=2']);
 const tooMany=fixture({fetcher:()=>response([release()],200,{link:'<https://api.github.com/next>; rel="next"'})});assert.equal((await tooMany.check.refresh()).status,'unavailable');assert.equal(tooMany.calls.length,3);
 const missingPage=fixture({fetcher:url=>url.endsWith('page=1')?response([release()],200,{link:'<https://api.github.com/next>; rel="next"'}):response({},404)});assert.equal((await missingPage.check.refresh()).status,'unavailable');
});

test('runtime validation rejects malformed data and constructors recover without changing configuration',async()=>{
 const good=fixture();await good.check.refresh();const runtime=good.check.runtime();
 for(const mutate of [row=>row.version=2,row=>row.repository='someone/else',row=>row.extra=true,row=>row.latestRelease.url='https://evil.invalid/',row=>row.latestRelease.version='0.11.0-rc.1',row=>row.lastSuccessfulCheckAt='yesterday',row=>row.lastOutcome='no_release']){
  const bad=structuredClone(runtime);mutate(bad);assert.throws(()=>validateVersionRuntime(bad));const f=fixture({runtime:bad});assert.equal(f.check.runtime().lastOutcome,'never');assert.equal((await f.check.refresh()).status,'current');assertOwnWrites(f);
 }
 const future=structuredClone(runtime);future.lastSuccessfulCheckAt=NOW+100000;future.lastAttemptAt=NOW+100000;const f=fixture({runtime:future});assert.equal(f.check.runtime().lastSuccessfulCheckAt,null);assert.equal((await f.check.refresh()).lastSuccessfulCheckAt,NOW);
});

test('a restart during an unfinished request retains the previous successful time and reports interruption',async()=>{
 const initial=fixture();await initial.check.refresh();const runtime=initial.check.runtime();runtime.lastAttemptAt=NOW+120000;
 const f=fixture({runtime}); // A cache recorded in the future is reset rather than trusted.
 assert.equal(f.check.runtime().lastSuccessfulCheckAt,null);
 runtime.lastSuccessfulCheckAt=NOW-120000;runtime.lastAttemptAt=NOW;
 const interrupted=fixture({runtime});assert.equal(interrupted.check.runtime().lastSuccessfulCheckAt,NOW-120000);assert.equal(interrupted.check.runtime().lastOutcome,'unavailable');
 const doc=await interrupted.check.refresh(true);assert.equal(doc.status,'unavailable');assert.match(doc.error,/unterbrochen/);assert.equal(interrupted.calls.length,0);
 interrupted.advance(MANUAL_COOLDOWN_MS);interrupted.check.tick();await interrupted.check.flush();assert.equal(interrupted.check.document().status,'current');assert.equal(interrupted.calls.length,1);
});

test('a hard request timeout settles even if a transport ignores its AbortSignal',async()=>{
 let complete;const f=fixture({timeoutMs:10,fetcher:()=>new Promise(resolve=>complete=resolve)});
 const doc=await f.check.refresh();assert.equal(doc.status,'unavailable');assert.match(doc.error,/Zeitüberschreitung/);assert.equal(f.calls[0].options.signal.aborted,true);
 const count=f.writes.length;complete(response([release('v9.0.0')]));await nextTurn();assert.equal(f.writes.length,count);assert.equal(f.check.document().latestVersion,null);
});

test('the request deadline also bounds response-body parsing',async()=>{
 const f=fixture({timeoutMs:10,fetcher:()=>({status:200,headers:new Headers(),text:()=>new Promise(()=>{})})});
 assert.equal((await f.check.refresh()).status,'unavailable');assert.match(f.check.document().error,/Zeitüberschreitung/);await f.check.close();
});

test('closing aborts an active request without publishing late state changes or waiting for the transport',async()=>{
 const f=fixture({fetcher:()=>new Promise(()=>{})});const pending=f.check.refresh();await nextTurn();assert.equal(f.calls.length,1);
 const count=f.writes.length;await f.check.close();await pending;assert.equal(f.calls[0].options.signal.aborted,true);assert.equal(f.writes.length,count);
 f.check.tick();await f.check.refresh(true);await f.check.flush();assert.equal(f.calls.length,1);assert.equal(f.writes.length,count);
});

test('data-backup pauses and shutdown prevent new background requests',async()=>{
 const f=fixture();f.adapter.dataBusy=true;f.check.tick();assert.equal(f.calls.length,0);f.adapter.dataBusy=false;f.adapter.stopping=true;f.check.tick();assert.equal(f.calls.length,0);f.adapter.stopping=false;f.check.tick();await f.check.flush();assert.equal(f.calls.length,1);
});

test('invalid build versions, release channels and clock values are rejected explicitly',async()=>{
 const adapter={set:async()=>{}};assert.throws(()=>new VersionCheck(adapter,{installedVersion:'v0.10.2'}),/Adapterversion/);assert.throws(()=>new VersionCheck(adapter,{installedVersion:'0.10.2',releaseChannel:'automatic'}),/Veröffentlichungskanal/);
 const f=fixture();f.check.now=()=>NaN;await assert.rejects(f.check.refresh(),/Zeitpunkt/);assert.equal(f.calls.length,0);
});

test('adapter-managed deadline timers are used and cleared after a completed request',async()=>{
 let armed=0,cleared=0;const adapter={set:async()=>{},setTimeout(fn,ms){armed++;return setTimeout(fn,ms);},clearTimeout(timer){cleared++;clearTimeout(timer);}};
 const check=new VersionCheck(adapter,{installedVersion:'0.10.2+build.1'},{},{now:()=>NOW,fetch:async()=>response([release('v0.10.2+build.1')])});
 const doc=await check.refresh();assert.equal(doc.status,'current');assert.equal(armed,1);assert.equal(cleared,1);await check.close();assert.equal(cleared,1);
});
