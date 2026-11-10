'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {defaultForecast,normalizeForecast,localForecast,PVForecast}=require('../lib/forecast');
const base=Date.UTC(2026,5,21,10),HOUR=3600000;
function config(provider='local'){const c=defaultForecast();c.enabled=true;c.provider=provider;c.location={name:'Berlin',latitude:52.52,longitude:13.41,timezone:'Europe/Berlin'};c.arrays=[{name:'Dach',peakKwp:5,tilt:30,azimuth:180}];return normalizeForecast(c);}
function response(){return {timezone:'Europe/Berlin',hourly_units:{time:'unixtime',global_tilted_irradiance:'W/m²'},hourly:{time:Array.from({length:96},(_,i)=>(Date.UTC(2026,5,19,22)+i*HOUR)/1000),global_tilted_irradiance:Array(96).fill(100)}};}
test('forecast defaults need actual location and capacity; no assumed user plant',()=>{
 const d=normalizeForecast(defaultForecast());assert.equal(d.enabled,false);assert.equal(d.location.latitude,null);assert.equal(d.arrays[0].peakKwp,0);assert.throws(()=>normalizeForecast({...d,enabled:true}),/Breitengrad/);
 assert.throws(()=>normalizeForecast({...config(),arrays:[{name:'x',peakKwp:0,tilt:30,azimuth:180}]}),/größer/);
});
test('rejects malformed settings and unsupported providers',()=>{
 const c=config();for(const patch of [{enabled:'true'},{provider:'untrusted'},{weatherFactor:0},{performanceRatio:2},{arrays:[]},{location:{latitude:true,longitude:15}},{location:{latitude:12,longitude:15,timezone:'Invalid/Timezone'}}])assert.throws(()=>normalizeForecast({...c,...patch}));
 assert.equal(normalizeForecast({...c,arrays:[{...c.arrays[0],azimuth:360}]}).arrays[0].azimuth,0);
});
test('local model calculates actual local days, scales capacity and weather factor',()=>{
 const c=config(),f=localForecast(c,base);assert.equal(f.days.length,2);assert.ok(f.days[0].kWh>0);assert.equal(f.hours.length,48);assert.ok(Math.abs(f.days[0].kWh-f.days[0].clearSkyKWh*c.weatherFactor)<1e-8);
 const doubled=localForecast({...c,arrays:[{...c.arrays[0],peakKwp:10}]},base);assert.ok(Math.abs(doubled.days[0].kWh/f.days[0].kWh-2)<1e-8);
 const winter=localForecast(c,Date.UTC(2026,11,21,10));assert.ok(winter.days[0].kWh<f.days[0].kWh);
});
test('local model has proper 23h and 25h day instead of assuming 24h',()=>{
 const c=config();assert.equal(localForecast(c,Date.UTC(2026,2,29,10)).hours.length,47);assert.equal(localForecast(c,Date.UTC(2026,9,25,10)).hours.length,49);
});
test('disabled and local forecast make no network requests',async()=>{
 let count=0;const service=new PVForecast(defaultForecast(),{},{now:()=>base,request:async()=>{count++;throw Error('Should not call');}});
 assert.match((await service.refresh()).status,/Deaktiviert/);service.configure(config());assert.equal((await service.refresh()).data.method,'local-clear-sky');assert.equal(count,0);
});
test('weather forecast is cached and refresh button respects cooldown',async()=>{
 let count=0,now=base;const service=new PVForecast(config('open-meteo'),{},{now:()=>now,request:async()=>{count++;return response();}});
 const first=await service.refresh();assert.equal(first.data.method,'open-meteo');assert.equal(count,1);assert.equal(await service.refresh(),null);assert.equal(await service.refresh(true),null);
 now+=HOUR;await service.refresh();assert.equal(count,2);
});
test('rate limiting and outages preserve last forecast and honor Retry-After',async()=>{
 let now=base,fail=false,count=0;const c=config('open-meteo');const service=new PVForecast(c,{},{now:()=>now,request:async()=>{count++;if(fail){const e=Error('HTTP 429');e.retryMs=2*HOUR;throw e;}return response();}});
 const original=(await service.refresh()).data;fail=true;now+=HOUR;const r=await service.refresh();assert.equal(r.data,original);assert.match(r.error,/429/);now+=HOUR;assert.equal(await service.refresh(true),null);assert.equal(count,2);
 const cold=new PVForecast(c,{},{now:()=>now,request:async()=>{const e=Error('HTTP 429');e.retryMs=2*HOUR;throw e;}});await cold.refresh();now+=HOUR;assert.equal(await cold.refresh(true),null);
});
test('late replies from an old location are discarded',async()=>{
 let resolve;const service=new PVForecast(config('open-meteo'),{},{now:()=>base,request:()=>new Promise(r=>resolve=r)});const pending=service.refresh();service.configure({...config('open-meteo'),location:{...config().location,name:'Other',latitude:48}});resolve(response());assert.equal(await pending,null);assert.deepEqual(service.data,{});
});
test('geocoding accepts names or postcodes, uses fixed host, caches and throttles',async()=>{
 let count=0;const service=new PVForecast(defaultForecast(),{},{now:()=>base,request:async url=>{assert.equal(new URL(url).hostname,'geocoding-api.open-meteo.com');count++;return {results:[{name:'Berlin',latitude:52.5,longitude:13.4,country:'Deutschland',timezone:'Europe/Berlin'}]};}});
 await assert.rejects(()=>service.geocode('x'));assert.equal((await service.geocode('10115'))[0].name,'Berlin');await service.geocode('10115');assert.equal(count,1);await assert.rejects(()=>service.geocode('Wien'),/warten/);
 service.close();await assert.rejects(()=>service.geocode('Linz'),/beendet/);
});
