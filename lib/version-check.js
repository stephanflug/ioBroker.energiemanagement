'use strict';

const semver=require('semver');

const REPOSITORY='stephanflug/ioBroker.energiemanagement';
const API_URL='https://api.github.com/repos/'+REPOSITORY+'/releases';
const RELEASE_URL='https://github.com/'+REPOSITORY+'/releases/tag/';
const CHECK_INTERVAL_MS=12*3600000,MIN_RETRY_MS=15*60000,MANUAL_COOLDOWN_MS=60000;
const MAX_RESPONSE_BYTES=512*1024,MAX_PAGES=3,MAX_SERVER_WAIT_MS=7*86400000;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validTime=value=>Number.isSafeInteger(value)&&value>=0&&Number.isFinite(new Date(value).getTime());
const copy=value=>JSON.parse(JSON.stringify(value));

function plainText(value,max){
 return String(value??'').replace(/<[^>]*>/g,'').replace(/!?(\[[^\]]*\])\([^)]*\)/g,'$1')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\r\n?/g,'\n').trim().slice(0,max);
}
function releaseVersion(tag){
 if(typeof tag!=='string'||tag.length>100)return null;
 const version=tag.startsWith('v')?tag.slice(1):tag;
 // No coercion: tags such as release-1.2, 01.2.3 or a trailing suffix are not versions.
 return /^\d/.test(version)&&!/\s/.test(version)&&semver.parse(version,{loose:false})?version:null;
}
function emptyRuntime(){return {version:1,repository:REPOSITORY,lastAttemptAt:null,lastSuccessfulCheckAt:null,nextCheckAt:null,limitedUntil:null,lastOutcome:'never',lastError:'',failureCount:0,latestRelease:null};}
function validateRelease(value){
 if(!plain(value)||Object.keys(value).some(key=>!['version','tag','publishedAt','url','name','notes'].includes(key)))throw Error('Ungültiger gespeicherter GitHub-Release.');
 if(releaseVersion(value.tag)!==value.version||semver.prerelease(value.version)!==null||typeof value.publishedAt!=='string'||!Number.isFinite(Date.parse(value.publishedAt))||value.url!==RELEASE_URL+encodeURIComponent(value.tag)||typeof value.name!=='string'||value.name.length>160||typeof value.notes!=='string'||value.notes.length>1200)throw Error('Ungültiger gespeicherter GitHub-Release.');
 return copy(value);
}
function validateVersionRuntime(input={}){
 if(plain(input)&&Object.keys(input).length===0)return emptyRuntime();
 const keys=['version','repository','lastAttemptAt','lastSuccessfulCheckAt','nextCheckAt','limitedUntil','lastOutcome','lastError','failureCount','latestRelease'];
 if(!plain(input)||Object.keys(input).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(input,key))||input.version!==1||input.repository!==REPOSITORY||!['never','success','no_release','unavailable'].includes(input.lastOutcome)||typeof input.lastError!=='string'||input.lastError.length>300||!Number.isInteger(input.failureCount)||input.failureCount<0||input.failureCount>32)throw Error('Ungültiger Speicher der Versionsprüfung.');
 for(const key of ['lastAttemptAt','lastSuccessfulCheckAt','nextCheckAt','limitedUntil'])if(input[key]!==null&&!validTime(input[key]))throw Error('Ungültiger Zeitpunkt der Versionsprüfung.');
 if(input.lastOutcome==='success'&&input.latestRelease===null)throw Error('Erfolgreiche Versionsprüfung ohne Release.');
 if(['never','no_release'].includes(input.lastOutcome)&&input.latestRelease!==null)throw Error('Neutraler Versionsstatus enthält einen Release.');
 if(input.lastOutcome==='success'&&(input.lastAttemptAt===null||input.lastSuccessfulCheckAt===null))throw Error('Erfolgreiche Versionsprüfung ohne Zeitpunkt.');
 const out=copy(input);if(out.latestRelease!==null)out.latestRelease=validateRelease(out.latestRelease);return out;
}
function header(response,name){return response.headers?.get?.(name)??null;}
function retryDeadline(response,now){
 const retry=header(response,'retry-after'),reset=Number(header(response,'x-ratelimit-reset'));
 let until=now+MIN_RETRY_MS;
 if(retry!==null){const seconds=Number(retry),date=Date.parse(retry);const value=Number.isFinite(seconds)?now+Math.max(0,seconds)*1000:date;if(Number.isFinite(value))until=Math.max(until,value);}
 if(header(response,'x-ratelimit-remaining')==='0'&&Number.isFinite(reset)&&reset>0)until=Math.max(until,reset*1000);
 return Math.min(now+MAX_SERVER_WAIT_MS,until);
}
async function readJSON(response,signal){
 const declared=Number(header(response,'content-length'));
 if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES)throw Error('GitHub-Antwort ist zu groß.');
 let text='';
 if(response.body?.getReader){
  const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0;
  const cancel=()=>{Promise.resolve(reader.cancel()).catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_RESPONSE_BYTES){await reader.cancel();throw Error('GitHub-Antwort ist zu groß.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
  finally{signal?.removeEventListener('abort',cancel);reader.releaseLock();}
 }else{
  text=await response.text();if(Buffer.byteLength(text)>MAX_RESPONSE_BYTES)throw Error('GitHub-Antwort ist zu groß.');
 }
 try{return JSON.parse(text);}catch{throw Error('GitHub liefert keine gültige JSON-Antwort.');}
}
function chooseRelease(releases){
 let selected=null;
 for(const raw of releases){
  if(!plain(raw)||typeof raw.tag_name!=='string'||typeof raw.draft!=='boolean'||typeof raw.prerelease!=='boolean')throw Error('GitHub liefert keine gültige Release-Liste.');
  const version=releaseVersion(raw.tag_name);if(raw.draft||raw.prerelease||!version||semver.prerelease(version)!==null)continue;
  if(typeof raw.published_at!=='string'||!Number.isFinite(Date.parse(raw.published_at)))throw Error('GitHub-Release hat kein gültiges Veröffentlichungsdatum.');
  const candidate={version,tag:raw.tag_name,publishedAt:new Date(raw.published_at).toISOString(),url:RELEASE_URL+encodeURIComponent(raw.tag_name),name:plainText(raw.name||raw.tag_name,160),notes:plainText(raw.body,1200)};
  if(!selected||semver.gt(candidate.version,selected.version)||semver.eq(candidate.version,selected.version)&&Date.parse(candidate.publishedAt)>Date.parse(selected.publishedAt))selected=candidate;
 }return selected;
}

class VersionCheck{
 constructor(adapter,{installedVersion,releaseChannel='stable'}={},runtime={},options={}){
  if(typeof installedVersion!=='string'||releaseVersion(installedVersion)!==installedVersion)throw Error('Ungültige installierte Adapterversion.');
  if(!['stable','development'].includes(releaseChannel))throw Error('Ungültiger Veröffentlichungskanal.');
  this.adapter=adapter;this.installedVersion=installedVersion;this.releaseChannel=releaseChannel;
  this.fetch=options.fetch||globalThis.fetch;this.now=options.now||Date.now;this.timeoutMs=options.timeoutMs??10000;
  this.scheduleTimeout=typeof adapter.setTimeout==='function'?adapter.setTimeout.bind(adapter):globalThis.setTimeout.bind(globalThis);
  this.cancelTimeout=typeof adapter.clearTimeout==='function'?adapter.clearTimeout.bind(adapter):globalThis.clearTimeout.bind(globalThis);
  try{this.cache=validateVersionRuntime(runtime);}catch{this.cache=emptyRuntime();}
  // A malformed clock must not postpone checks indefinitely after restoring a cache.
  const now=this.now();if([this.cache.lastAttemptAt,this.cache.lastSuccessfulCheckAt].some(value=>value!==null&&value>now+15000))this.cache=emptyRuntime();
  if(this.cache.nextCheckAt!==null&&this.cache.nextCheckAt>now+MAX_SERVER_WAIT_MS)this.cache.nextCheckAt=null;
  if(this.cache.limitedUntil!==null&&this.cache.limitedUntil>now+MAX_SERVER_WAIT_MS)this.cache.limitedUntil=null;
  // A restart during a newer request must retain the previous successful check,
  // but must not present that interrupted attempt as a current confirmation.
  if(this.cache.lastOutcome==='success'&&this.cache.lastSuccessfulCheckAt<this.cache.lastAttemptAt){this.cache.lastOutcome='unavailable';this.cache.lastError='Die letzte Versionsprüfung wurde unterbrochen.';this.cache.nextCheckAt=now;}
  this.closed=false;this.checking=false;this.startup=true;this.task=null;this.controller=null;
 }
 runtime(){return copy(this.cache);}
 document(){
  const release=this.cache.latestRelease,installedDevelopment=this.releaseChannel==='development'||semver.prerelease(this.installedVersion)!==null;
  let status='checking',message='Versionsprüfung läuft.';
  if(!this.checking&&!this.startup){
   if(this.cache.lastOutcome==='unavailable'){status='unavailable';message='Versionsprüfung derzeit nicht möglich. Die laufende Anwendung bleibt unverändert.';}
   else if(this.cache.lastOutcome==='no_release'){status='no_release';message='Noch kein öffentliches stabiles GitHub-Release verfügbar.';}
   else if(release){
    if(semver.lt(this.installedVersion,release.version)){status='update_available';message='Eine neuere stabile Version ist verfügbar. Die Installation erfolgt über die ioBroker-Adapterverwaltung.';}
    else if(installedDevelopment||semver.gt(this.installedVersion,release.version)){status='prerelease';message='Installierte Entwicklungsversion. Es wurde keine neuere stabile Version gefunden.';}
    else{status='current';message='Die installierte Version entspricht dem neuesten stabilen GitHub-Release.';}
   }
  }
  return {version:1,status,installedVersion:this.installedVersion,releaseChannel:this.releaseChannel,isPrerelease:installedDevelopment||!!release&&semver.gt(this.installedVersion,release.version),latestVersion:release?.version??null,publishedAt:release?.publishedAt??null,releaseUrl:release?.url??null,releaseName:release?.name||'',releaseNotes:release?.notes||'',releaseIsCached:!!release&&['checking','unavailable'].includes(status),lastAttemptAt:this.cache.lastAttemptAt,lastSuccessfulCheckAt:this.cache.lastSuccessfulCheckAt,nextCheckAt:this.cache.nextCheckAt,message,error:this.checking?'':this.cache.lastError};
 }
 async persist(){
  if(this.closed)return this.document();
  const document=this.document();await this.adapter.set('update.status_JSON',document,true);if(!this.closed)await this.adapter.set('internal.versionCheck_JSON',this.runtime(),true);return document;
 }
 refresh(force=false){
  if(this.closed)return Promise.resolve(this.document());
  if(this.task)return this.task;
  const now=this.now();
  if(!validTime(now))return Promise.reject(Error('Ungültiger Zeitpunkt der Versionsprüfung.'));
  const limited=this.cache.limitedUntil!==null&&now<this.cache.limitedUntil,recent=this.cache.lastAttemptAt!==null&&now>=this.cache.lastAttemptAt&&now-this.cache.lastAttemptAt<MANUAL_COOLDOWN_MS;
  if(limited||recent||!force&&this.cache.nextCheckAt!==null&&now<this.cache.nextCheckAt){
   // A restart during the manual cooldown still needs its startup check once
   // the cooldown ends, rather than silently waiting another twelve hours.
   if(force&&recent&&!limited)this.cache.nextCheckAt=Math.min(this.cache.nextCheckAt??Infinity,this.cache.lastAttemptAt+MANUAL_COOLDOWN_MS);
   this.startup=false;return this.persist();
  }
  this.startup=false;this.checking=true;this.cache.lastAttemptAt=now;
  this.task=this.run(now).finally(()=>{this.task=null;this.checking=false;});return this.task;
 }
 async run(startedAt){
  const controller=new AbortController();this.controller=controller;
  let abort;
  const cancelled=new Promise((resolve,reject)=>{abort=()=>reject(controller.signal.reason||Error('GitHub-Abfrage abgebrochen.'));controller.signal.addEventListener('abort',abort,{once:true});});
  cancelled.catch(()=>{}); // Closing while an own state is being persisted may precede the first fetch race.
  const timeout=this.scheduleTimeout(()=>controller.abort(Error('Zeitüberschreitung bei GitHub.')),this.timeoutMs);
  try{
   await this.persist();const releases=[];let unavailableRepository=false;
   for(let page=1;page<=MAX_PAGES;page++){
    if(this.closed)return this.document();
    const response=await Promise.race([this.fetch(API_URL+'?per_page=100&page='+page,{method:'GET',redirect:'error',signal:controller.signal,headers:{'Accept':'application/vnd.github+json','User-Agent':'ioBroker-Energiemanagement/'+this.installedVersion,'X-GitHub-Api-Version':'2022-11-28'}}),cancelled]);
    if(response.status===404&&page===1){unavailableRepository=true;break;}
    if(response.status!==200){const error=Error(response.status===403||response.status===429?'GitHub-Prüfung vorübergehend begrenzt (HTTP '+response.status+').':'GitHub-Abfrage fehlgeschlagen (HTTP '+response.status+').');error.retryAt=retryDeadline(response,this.now());throw error;}
    const rows=await Promise.race([readJSON(response,controller.signal),cancelled]);if(!Array.isArray(rows)||rows.length>100)throw Error('GitHub liefert keine gültige Release-Liste.');releases.push(...rows);
    const next=/<[^>]+>;\s*rel="next"/.test(header(response,'link')||'');if(!next)break;
    if(page===MAX_PAGES)throw Error('GitHub-Release-Liste überschreitet den begrenzten Prüfumfang.');
   }
   if(this.closed)return this.document();
   const release=unavailableRepository?null:chooseRelease(releases),now=this.now();
   this.cache.latestRelease=release;this.cache.lastOutcome=release?'success':'no_release';this.cache.lastError='';this.cache.failureCount=0;this.cache.limitedUntil=null;this.cache.nextCheckAt=now+CHECK_INTERVAL_MS;
   // A 404 is neutral for an unpublished repository, but it is not a successful release response.
   if(!unavailableRepository)this.cache.lastSuccessfulCheckAt=now;
  }catch(error){
   if(this.closed)return this.document();
   const now=this.now();this.cache.lastOutcome='unavailable';this.cache.lastError=plainText(controller.signal.aborted?'Zeitüberschreitung bei der GitHub-Versionsprüfung.':error?.message||error,300);this.cache.failureCount=Math.min(32,this.cache.failureCount+1);
   const retry=Math.max(now+MIN_RETRY_MS,Number.isFinite(error.retryAt)?error.retryAt:0);this.cache.nextCheckAt=retry;this.cache.limitedUntil=Number.isFinite(error.retryAt)?retry:null;
  }finally{this.cancelTimeout(timeout);controller.signal.removeEventListener('abort',abort);if(this.controller===controller)this.controller=null;}
  if(this.closed)return this.document();this.checking=false;return this.persist();
 }
 tick(now=this.now()){
  if(this.closed||this.adapter.stopping||this.adapter.dataBusy||this.task)return;
  if(!validTime(now))return;
  const force=this.startup;this.startup=false;
  if(force||this.cache.nextCheckAt===null||now>=this.cache.nextCheckAt)this.refresh(force).catch(error=>this.adapter.log?.warn?.('Versionsprüfung: '+plainText(error?.message||error,200)));
 }
 async flush(){if(this.task)await this.task;return this.persist();}
 async close(){this.closed=true;this.controller?.abort();if(this.task)await this.task.catch(()=>{});}
}

module.exports={VersionCheck,validateVersionRuntime,releaseVersion,chooseRelease,REPOSITORY,API_URL,CHECK_INTERVAL_MS,MIN_RETRY_MS,MANUAL_COOLDOWN_MS};
