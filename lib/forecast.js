'use strict';
const https=require('node:https');
const {computeSolarPower}=require('./solar-model');
const {forecastURL,parseWeatherForecast,localDay,nextDay,dayBounds}=require('./weather-model');
const HOUR=3600000;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function defaultForecast(){return {enabled:false,provider:'open-meteo',location:{name:'',latitude:null,longitude:null,timezone:'Europe/Vienna'},arrays:[{name:'Dach 1',peakKwp:0,tilt:30,azimuth:180}],performanceRatio:0.8,weatherFactor:0.7};}
function normalizeForecast(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('PV-Prognose: Konfiguration muss ein Objekt sein.');
 if(raw.enabled!==undefined&&typeof raw.enabled!=='boolean')throw Error('PV-Prognose: Aktivierung muss Boolean sein.');
 const enabled=raw.enabled===true,provider=raw.provider||'open-meteo';
 if(!['open-meteo','local'].includes(provider))throw Error('Unbekannte Prognosemethode.');
 const bounded=(v,min,max,label,fallback)=>{const value=v===undefined?fallback:v;if(!finite(value)||value<min||value>max)throw Error(label+' muss zwischen '+min+' und '+max+' liegen.');return value;};
 const loc=raw.location||{},name=String(loc.name||'').trim().slice(0,120),timezone=String(loc.timezone||'Europe/Vienna');
 try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format()}catch{throw Error('Ungültige Standort-Zeitzone.');}
 const coord=(v,min,max,label)=>v===null||v===undefined||v===''?(enabled?(()=>{throw Error(label+' fehlt.');})():null):bounded(v,min,max,label);
 const latitude=coord(loc.latitude,-90,90,'Breitengrad'),longitude=coord(loc.longitude,-180,180,'Längengrad');
 if(!Array.isArray(raw.arrays)||raw.arrays.length<1||raw.arrays.length>4)throw Error('Bitte eine bis vier Dachflächen eintragen.');
 const arrays=raw.arrays.map((a,i)=>{if(!a||typeof a!=='object')throw Error('Ungültige Dachfläche.');const peakKwp=bounded(a.peakKwp,0,1000,'Anlagenleistung');if(enabled&&peakKwp<=0)throw Error('Für jede Dachfläche ist eine Anlagenleistung größer als 0 kWp nötig.');return {name:String(a.name||'Dach '+(i+1)).trim().slice(0,80),peakKwp,tilt:bounded(a.tilt,0,90,'Dachneigung'),azimuth:bounded(a.azimuth,0,360,'Ausrichtung')%360};});
 return {enabled,provider,location:{name,latitude,longitude,timezone},arrays,performanceRatio:bounded(raw.performanceRatio,0.5,1,'Anlagenfaktor',0.8),weatherFactor:bounded(raw.weatherFactor,0.05,1,'Lokaler Wetterfaktor',0.7)};
}
function localForecast(config,now){
 const timezone=config.location.timezone,today=localDay(now,timezone),days=[],hours=[];
 for(const date of [today,nextDay(today)]){
  const bounds=dayBounds(date,timezone);let total=0,clearTotal=0;
  for(let start=bounds.start;start<bounds.end;start+=HOUR){
   const end=Math.min(start+HOUR,bounds.end);let clearSkyKWh=0;
   // Midpoint integration every ten minutes, including shortened DST bins.
   for(let t=start;t<end;t+=600000){const stop=Math.min(t+600000,end),mid=(t+stop)/2;let watts=0;
    for(const a of config.arrays)watts+=computeSolarPower(mid,config.location.latitude,config.location.longitude,a.tilt,a.azimuth).irradianceWm2*a.peakKwp*config.performanceRatio;
    clearSkyKWh+=watts*(stop-t)/3600000000;
   }
   const kWh=clearSkyKWh*config.weatherFactor;
   hours.push({start,end,kWh,clearSkyKWh,averageW:kWh*3600000000/(end-start)});total+=kWh;clearTotal+=clearSkyKWh;
  }
  days.push({date,kWh:total,clearSkyKWh:clearTotal,complete:true});
 }
 return {version:1,method:'local-clear-sky',fetchedAt:now,timezone,location:config.location,configSignature:JSON.stringify(config),days,hours,attribution:'Lokales Sonnenstandsmodell (NOAA/Haurwitz/Erbs)',note:'Lokales Klarhimmelmodell mit manuell gewähltem Wetterfaktor. Keine abgerufene Wettervorhersage; keine Garantie für tatsächlichen Ertrag.'};
}
function requestJSON(address,{signal}={}){
 const url=new URL(address);
 if(url.protocol!=='https:'||!['api.open-meteo.com','geocoding-api.open-meteo.com'].includes(url.hostname)||url.port||url.username||url.password)throw Error('Unzulässige Prognosequelle.');
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{signal,headers:{'User-Agent':'ioBroker-Energiemanagement/0.3.0','Accept':'application/json'}},res=>{
   if(res.statusCode!==200){res.resume();const error=Error('Open-Meteo: HTTP '+res.statusCode);const retry=res.headers['retry-after'];const seconds=Number(retry);if(retry)error.retryMs=Math.min(86400000,Math.max(60000,Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-Date.now()||900000));reject(error);return;}
   let body='',bytes=0;res.setEncoding('utf8');
   res.on('data',chunk=>{bytes+=Buffer.byteLength(chunk);if(bytes>2*1024*1024){req.destroy(Error('Prognoseantwort zu groß.'));return}body+=chunk});
   res.on('end',()=>{try{const data=JSON.parse(body);if(data.error)throw Error('Der Wetterdienst hat die Anfrage abgelehnt.');resolve(data)}catch(e){reject(e)}});
   res.on('error',reject);
  });
  req.setTimeout(12000,()=>req.destroy(Error('Zeitüberschreitung beim Wetterdienst.')));req.on('error',reject);
 });
}
class PVForecast {
 constructor(raw,cache={},options={}){
  this.request=options.request||requestJSON;this.now=options.now||Date.now;this.generation=0;this.closed=false;this.busy=false;this.searchCache=new Map();this.lastSearch=0;this.controllers=new Set();
  this.configure(raw);const age=this.now()-cache?.fetchedAt;
  if(cache?.configSignature===this.signature&&finite(age)&&age>=-15000&&age<3*HOUR){this.data=cache;this.nextAttempt=cache.fetchedAt+HOUR;}
 }
 configure(raw){
  const config=normalizeForecast(raw),signature=JSON.stringify(config);if(signature===this.signature)return false;
  this.config=config;this.signature=signature;this.generation++;this.controller?.abort();this.nextAttempt=0;this.lastAttempt=0;this.data={};this.error='';return true;
 }
 result(status){return {data:this.data,error:this.error||'',status};}
 async refresh(force=false){
  if(this.closed||this.busy)return null;
  if(!this.config.enabled)return this.result('Deaktiviert – Standort und Anlagendaten im Reiter PV-Ertragsprognose eintragen.');
  const now=this.now(),day=localDay(now,this.data.timezone||this.config.location.timezone),rolled=this.data.days?.[0]?.date!==day;
  const minGap=this.config.provider==='local'?5000:300000;
  if(this.error&&now<this.nextAttempt)return null;
  if((!force&&!rolled&&now<this.nextAttempt)||(this.lastAttempt&&now-this.lastAttempt>=0&&now-this.lastAttempt<minGap))return null;
  this.busy=true;this.lastAttempt=now;const generation=this.generation,config=this.config,controller=new AbortController();this.controller=controller;
  try{
   let data;
   if(config.provider==='local')data=localForecast(config,now);
   else {const responses=[];for(const array of config.arrays)responses.push(await this.request(forecastURL(config,array),{signal:controller.signal}));data=parseWeatherForecast(config,responses,this.now());}
   if(this.closed||this.generation!==generation)return null;
   this.data=data;this.error='';this.nextAttempt=this.now()+HOUR;
   return this.result(config.provider==='local'?'Lokale Ertragsschätzung aktuell.':'Wetterbasierte Ertragsprognose aktuell.');
  }catch(e){
   if(this.closed||this.generation!==generation)return null;
   this.error=String(e?.message||e).slice(0,250);this.nextAttempt=this.now()+Math.max(900000,e.retryMs||0);
   return this.result('Prognose derzeit nicht aktualisierbar. Letzten Berechnungszeitpunkt beachten.');
  }finally{this.busy=false;if(this.controller===controller)this.controller=null;}
 }
 async geocode(query){
  if(this.closed)throw Error('Adapter wird beendet.');
  if(typeof query!=='string'||query.trim().length<2||query.trim().length>100)throw Error('Ort oder Postleitzahl mit 2 bis 100 Zeichen eingeben.');
  const name=query.trim(),now=this.now(),cached=this.searchCache.get(name.toLowerCase());if(cached&&now-cached.ts<HOUR)return cached.results;
  if(this.lastSearch&&now-this.lastSearch<1500)throw Error('Bitte kurz warten, bevor du erneut suchst.');
  this.lastSearch=now;const url=new URL('https://geocoding-api.open-meteo.com/v1/search');url.search=new URLSearchParams({name,count:'10',language:'de',format:'json'}).toString();
  const controller=new AbortController();this.controllers.add(controller);
  try{const data=await this.request(url.href,{signal:controller.signal});const results=(Array.isArray(data.results)?data.results:[]).slice(0,10).filter(x=>finite(x.latitude)&&finite(x.longitude)&&Math.abs(x.latitude)<=90&&Math.abs(x.longitude)<=180).map(x=>({name:String(x.name||'').slice(0,100),latitude:x.latitude,longitude:x.longitude,country:String(x.country||'').slice(0,80),admin1:String(x.admin1||'').slice(0,80),timezone:String(x.timezone||'UTC')}));
   this.searchCache.set(name.toLowerCase(),{ts:now,results});if(this.searchCache.size>30)this.searchCache.delete(this.searchCache.keys().next().value);return results;
  }finally{this.controllers.delete(controller);}
 }
 close(){this.closed=true;this.generation++;this.controller?.abort();for(const c of this.controllers)c.abort();}
}
module.exports={defaultForecast,normalizeForecast,localForecast,requestJSON,PVForecast};
