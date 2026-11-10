'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {forecastURL,parseWeatherForecast,localDay,nextDay,dayBounds}=require('../lib/weather-model');
const HOUR=3600000;
const cfg=()=>({enabled:true,provider:'open-meteo',location:{name:'Test',latitude:52.52,longitude:13.41,timezone:'Europe/Berlin'},arrays:[{name:'Dach',peakKwp:5,tilt:30,azimuth:180}],performanceRatio:.8,weatherFactor:.7});
function response(date,timezone='Europe/Berlin',value=100){
 const a=dayBounds(date,timezone).start,b=dayBounds(nextDay(date),timezone).end;
 // UTC-hourly data crosses half-hour local midnight in Lord Howe, exercising splits.
 const start=Math.floor(a/HOUR)*HOUR-2*HOUR,end=Math.ceil(b/HOUR)*HOUR+2*HOUR;
 const time=[];for(let t=start;t<=end;t+=HOUR)time.push(t/1000);
 return {timezone,hourly_units:{time:'unixtime',global_tilted_irradiance:'W/m²'},hourly:{time,global_tilted_irradiance:time.map(()=>value)}};
}
test('forecast endpoint uses compass orientation conversion and requires no key',()=>{
 const c=cfg(),u=new URL(forecastURL(c,{...c.arrays[0],azimuth:90}));
 assert.equal(u.hostname,'api.open-meteo.com');assert.equal(u.searchParams.get('azimuth'),'-90');assert.equal(u.searchParams.get('timeformat'),'unixtime');assert.equal(u.searchParams.has('apikey'),false);
});
test('daily energy is summed from preceding-hour means using installed kWp and PR',()=>{
 const c=cfg(),date='2026-11-07',r=parseWeatherForecast(c,[response(date)],Date.parse(date+'T12:00:00Z'));
 assert.ok(Math.abs(r.days[0].kWh-9.6)<1e-8);assert.ok(r.days.every(d=>d.complete));
 assert.equal(r.hours[0].start,dayBounds(date,'Europe/Berlin').start);assert.equal(r.hours[0].averageW,400);assert.equal(r.hours[0].kWh,.4);
});
test('multiple roofs add once and missing irradiance is never silently treated as zero',()=>{
 const c=cfg();c.arrays.push({...c.arrays[0],name:'Ost',peakKwp:2});
 const a=response('2026-11-07'),b=response('2026-11-07');
 let r=parseWeatherForecast(c,[a,b],Date.parse('2026-11-07T12:00:00Z'));assert.ok(Math.abs(r.days[0].kWh-13.44)<1e-8);
 const i=a.hourly.time.findIndex(t=>t*1000===dayBounds('2026-11-07','Europe/Berlin').start+HOUR);b.hourly.global_tilted_irradiance[i]=null;
 r=parseWeatherForecast(c,[a,b],Date.parse('2026-11-07T12:00:00Z'));assert.equal(r.days[0].kWh,null);assert.equal(r.hours[0].averageW,null);
});
test('a real zero remains a complete zero forecast',()=>{
 const r=parseWeatherForecast(cfg(),[response('2026-11-07','Europe/Berlin',0)],Date.parse('2026-11-07T12:00:00Z'));
 assert.equal(r.days[0].kWh,0);assert.equal(r.days[0].complete,true);
});
test('shared missing timestamp creates explicit null hour and incomplete day',()=>{
 const a=response('2026-11-07'),t=dayBounds('2026-11-07','Europe/Berlin').start+6*HOUR,i=a.hourly.time.indexOf(t/1000);
 a.hourly.time.splice(i,1);a.hourly.global_tilted_irradiance.splice(i,1);
 const r=parseWeatherForecast(cfg(),[a],Date.parse('2026-11-07T12:00:00Z'));
 assert.equal(r.days[0].complete,false);assert.ok(r.hours.some(h=>h.end===t&&h.kWh===null));
});
test('IANA daylight saving days retain their actual 23/25 hours',()=>{
 for(const [date,expected]of [['2026-03-29',23],['2026-10-25',25]]){
  const r=parseWeatherForecast(cfg(),[response(date)],Date.parse(date+'T12:00:00Z'));
  assert.equal(r.days[0].hours,expected);assert.ok(Math.abs(r.days[0].kWh-expected*.4)<1e-8);assert.equal(r.days[0].complete,true);
 }
});
test('half-hour DST splits source intervals at actual local midnight',()=>{
 const tz='Australia/Lord_Howe',date='2026-10-04',r=parseWeatherForecast(cfg(),[response(date,tz)],Date.parse(date+'T01:00:00Z'));
 assert.equal(r.days[0].hours,23.5);assert.equal(r.days[0].complete,true);assert.ok(Math.abs(r.days[0].kWh-9.4)<1e-8);
 assert.equal(r.hours[0].start,dayBounds(date,tz).start);
});
test('roof time axes, timezone, units and invalid timestamps are rejected',()=>{
 const c=cfg();c.arrays.push({...c.arrays[0]});
 let a=response('2026-11-07'),b=response('2026-11-07');b.hourly.time=b.hourly.time.map(t=>t+1800);
 assert.throws(()=>parseWeatherForecast(c,[a,b],Date.now()),/Zeitachsen/);
 b=response('2026-11-07','UTC');assert.throws(()=>parseWeatherForecast(c,[a,b],Date.now()),/Zeitzonen/);
 a=response('2026-11-07');a.hourly_units.time='iso8601';assert.throws(()=>parseWeatherForecast(cfg(),[a],Date.now()),/Einheiten/);
 a=response('2026-11-07');a.timezone='Invalid/Timezone';assert.throws(()=>parseWeatherForecast(cfg(),[a],Date.now()),/Zeitzone/);
 a=response('2026-11-07');a.hourly.time[0]='0';assert.throws(()=>parseWeatherForecast(cfg(),[a],Date.now()),/Zeitachse/);
});
test('calendar date helpers preserve timezone date and month/year rollover',()=>{
 assert.equal(localDay(Date.parse('2026-11-07T23:30:00Z'),'Europe/Vienna'),'2026-11-08');assert.equal(nextDay('2026-12-31'),'2027-01-01');
 assert.throws(()=>dayBounds('2026-02-30','UTC'),/Prognosedatum/);
});
