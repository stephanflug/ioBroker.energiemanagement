'use strict';
/*
 * Local, approximate clear-sky solar model. No network calls or weather input.
 * Solar position: NOAA fractional-year equation-of-time / declination series:
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 * GHI: Haurwitz (1945/1946), GHI=1098*cos(z)*exp(-0.059/cos(z)).
 * https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.clearsky.haurwitz.html
 * Diffuse fraction: Erbs, Klein & Duffie (1982), hourly clearness-index fit.
 * https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.irradiance.erbs.html
 * Plane of array: direct incidence + isotropic sky diffuse + ground reflection,
 * with fixed ground albedo 0.20. No shading, temperature, snow, horizon masking,
 * aerosols, terrain, altitude correction, cloud cover or inverter losses.
 * This is a clear-sky orientation model, not a weather forecast or measurement.
 */
const RAD=Math.PI/180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function bounded(value,low,high,name){
 if(typeof value!=='number'||!Number.isFinite(value)||value<low||value>high)throw new RangeError(name+' außerhalb des gültigen Bereichs');
 return value;
}
function computeSolarPower(ts,latitude,longitude,tilt,azimuthCompass){
 bounded(ts,-8640000000000000,8640000000000000,'Zeitpunkt');
 bounded(latitude,-90,90,'Breitengrad');bounded(longitude,-180,180,'Längengrad');
 bounded(tilt,0,90,'Dachneigung');bounded(azimuthCompass,0,360,'Ausrichtung');
 const d=new Date(ts),year=d.getUTCFullYear();
 const yearStart=new Date(0);yearStart.setUTCFullYear(year,0,1);yearStart.setUTCHours(0,0,0,0);
 if(!Number.isFinite(yearStart.getTime()))throw new RangeError('Zeitpunkt außerhalb des Modellbereichs');
 const day=Math.floor((ts-yearStart.getTime())/86400000)+1;
 const minutes=d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60+d.getUTCMilliseconds()/60000;
 const yearDays=year%4===0&&(year%100!==0||year%400===0)?366:365;
 const gamma=2*Math.PI/yearDays*(day-1+(minutes/60-12)/24);
 const equationMinutes=229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
 const decl=0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
 const solarMinutes=((minutes+equationMinutes+4*longitude)%1440+1440)%1440;
 const hourAngle=(solarMinutes/4-180)*RAD,lat=latitude*RAD;
 // Local east/north/up unit vector towards the sun; works at both geographic poles.
 const east=-Math.cos(decl)*Math.sin(hourAngle);
 const north=Math.cos(lat)*Math.sin(decl)-Math.sin(lat)*Math.cos(decl)*Math.cos(hourAngle);
 const up=clamp(Math.sin(lat)*Math.sin(decl)+Math.cos(lat)*Math.cos(decl)*Math.cos(hourAngle),-1,1);
 const altitudeDeg=Math.asin(up)/RAD;
 if(up<=0)return {irradianceWm2:0,altitudeDeg};
 const ghi=1098*up*Math.exp(-0.059/up);
 const eccentricity=1.00011+0.034221*Math.cos(gamma)+0.00128*Math.sin(gamma)+0.000719*Math.cos(2*gamma)+0.000077*Math.sin(2*gamma);
 const extraterrestrialNormal=1367*eccentricity;
 const kt=clamp(ghi/(extraterrestrialNormal*up),0,1);
 const diffuseFraction=clamp(kt<=0.22?1-0.09*kt:kt<=0.8?0.9511-0.1604*kt+4.388*kt*kt-16.638*kt**3+12.336*kt**4:0.165,0,1);
 const dhi=ghi*diffuseFraction,dni=clamp((ghi-dhi)/up,0,extraterrestrialNormal);
 const slope=tilt*RAD,azimuth=azimuthCompass*RAD;
 const incidence=east*Math.sin(slope)*Math.sin(azimuth)+north*Math.sin(slope)*Math.cos(azimuth)+up*Math.cos(slope);
 const sky=dhi*(1+Math.cos(slope))/2;
 const ground=ghi*0.20*(1-Math.cos(slope))/2;
 return {irradianceWm2:Math.max(0,dni*Math.max(0,incidence)+sky+ground),altitudeDeg};
}
module.exports={computeSolarPower};
