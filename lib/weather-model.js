'use strict';
const HOUR=3600000;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const dateFormats=new Map();
function dateFormatter(timezone){
 if(!dateFormats.has(timezone))dateFormats.set(timezone,new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}));
 return dateFormats.get(timezone);
}
function localDay(ts,timezone){
 const parts=Object.fromEntries(dateFormatter(timezone).formatToParts(new Date(ts)).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
function nextDay(date){return new Date(Date.parse(date+'T00:00:00Z')+24*HOUR).toISOString().slice(0,10);}
function midnight(date,timezone){
 const center=Date.parse(date+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!finite(center)||new Date(center).toISOString().slice(0,10)!==date)throw Error('Ungültiges Prognosedatum');
 let lo=center-36*HOUR,hi=center+36*HOUR;
 // Search the UTC instant where this IANA calendar date starts, without a fixed UTC offset.
 while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(localDay(mid,timezone)<date)lo=mid;else hi=mid;}
 return hi;
}
function dayBounds(date,timezone){const start=midnight(date,timezone),end=midnight(nextDay(date),timezone);if(end<=start)throw Error('Lokaler Kalendertag ist nicht darstellbar');return {start,end};}
function forecastURL(config,array){
 const url=new URL('https://api.open-meteo.com/v1/forecast');
 const params={latitude:config.location.latitude,longitude:config.location.longitude,hourly:'global_tilted_irradiance',tilt:array.tilt,azimuth:array.azimuth-180,timezone:'auto',timeformat:'unixtime',forecast_days:3,past_days:1};
 for(const [key,value]of Object.entries(params))url.searchParams.set(key,String(value));
 return url.toString();
}
function parseWeatherForecast(config,responses,now){
 if(!Array.isArray(responses)||responses.length!==config.arrays.length||!responses.length)throw Error('Unvollständige Prognose der Dachflächen');
 const timezone=responses[0]?.timezone;
 if(typeof timezone!=='string'||timezone.length>100)throw Error('Zeitzone der Wetterprognose fehlt');
 try{dateFormatter(timezone)}catch{throw Error('Zeitzone der Wetterprognose ist ungültig');}
 let times;
 const powers=[];
 for(let roof=0;roof<responses.length;roof++){
  const response=responses[roof],hourly=response?.hourly,units=response?.hourly_units;
  if(response.timezone!==timezone)throw Error('Dachflächen haben unterschiedliche Zeitzonen');
  if(units?.time!=='unixtime'||units?.global_tilted_irradiance!=='W/m²')throw Error('Einheiten der Wetterprognose sind ungültig');
  if(!Array.isArray(hourly?.time)||!Array.isArray(hourly?.global_tilted_irradiance)||hourly.time.length!==hourly.global_tilted_irradiance.length||hourly.time.length<2||hourly.time.length>256)throw Error('Stundenwerte der Wetterprognose fehlen oder sind ungültig');
  for(let i=0;i<hourly.time.length;i++)if(!Number.isSafeInteger(hourly.time[i])||hourly.time[i]<=0||(i&&hourly.time[i]-hourly.time[i-1]<3600))throw Error('Zeitachse der Wetterprognose ist ungültig');
  if(!times)times=hourly.time;
  else if(times.length!==hourly.time.length||times.some((t,i)=>t!==hourly.time[i]))throw Error('Zeitachsen der Dachflächen stimmen nicht überein');
  powers.push(hourly.global_tilted_irradiance.map(v=>finite(v)&&v>=0?v*config.arrays[roof].peakKwp*config.performanceRatio:null));
 }
 const today=localDay(now,timezone),tomorrow=nextDay(today),dates=[today,tomorrow];
 const bounds=dates.map(date=>({date,...dayBounds(date,timezone)}));
 const from=bounds[0].start,to=bounds[1].end;
 // Open-Meteo's GTI is the mean for the PRECEDING hour, not the following hour.
 const intervals=times.map((time,i)=>({start:time*1000-HOUR,end:time*1000,power:powers.every(p=>p[i]!==null)?powers.reduce((sum,p)=>sum+p[i],0):null})).filter(x=>x.end>from&&x.start<to);
 const breakpoints=new Set([from,bounds[0].end,to]);
 for(const x of intervals){breakpoints.add(Math.max(from,x.start));breakpoints.add(Math.min(to,x.end));}
 const sorted=[...breakpoints].sort((a,b)=>a-b),hours=[];
 for(let i=0;i<sorted.length-1;i++){
  let start=sorted[i];const boundary=sorted[i+1];
  const source=intervals.find(x=>x.start<=start&&x.end>=boundary),power=source?.power??null;
  // Missing intervals are explicit nulls, so charts cannot bridge a forecast data gap.
  while(start<boundary){const end=Math.min(start+HOUR,boundary);hours.push({start,end,kWh:power===null?null:power*(end-start)/3600000000,averageW:power});start=end;}
 }
 const days=bounds.map(b=>{
  const entries=hours.filter(x=>x.start>=b.start&&x.end<=b.end),complete=entries.length>0&&entries.every(x=>x.kWh!==null)&&entries.reduce((sum,x)=>sum+x.end-x.start,0)===b.end-b.start;
  return {date:b.date,kWh:complete?entries.reduce((sum,x)=>sum+x.kWh,0):null,complete,hours:(b.end-b.start)/HOUR};
 });
 return {version:1,method:'open-meteo',fetchedAt:now,timezone,location:config.location,configSignature:JSON.stringify(config),days,hours,attribution:'Open-Meteo',note:'Wetterabhängige PV-Schätzung aus vorhergesagter Einstrahlung, Dachflächen und Anlagenverlusten. Kein garantierter Ertrag oder verfügbarer Netzüberschuss.'};
}
module.exports={forecastURL,parseWeatherForecast,localDay,nextDay,dayBounds};
