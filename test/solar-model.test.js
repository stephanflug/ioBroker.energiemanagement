'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {computeSolarPower}=require('../lib/solar-model');
const at=(iso,lat=0,lon=0,tilt=0,az=180)=>computeSolarPower(Date.parse(iso),lat,lon,tilt,az);
test('equinox solar noon near equator gives plausible clear-sky horizontal irradiance',()=>{
 const p=at('2026-03-20T12:00:00Z');assert.ok(p.altitudeDeg>85&&p.altitudeDeg<=90);assert.ok(p.irradianceWm2>950&&p.irradianceWm2<1100);
});
test('night has zero irradiance and longitude controls solar time',()=>{
 const midnight=at('2026-03-20T00:00:00Z');assert.equal(midnight.irradianceWm2,0);assert.ok(midnight.altitudeDeg< -80);
 const opposite=at('2026-03-20T00:00:00Z',0,180);assert.ok(opposite.irradianceWm2>950);
});
test('tilt faces the correct hemisphere in winter',()=>{
 const nSouth=at('2026-12-21T12:00:00Z',48,0,55,180),nNorth=at('2026-12-21T12:00:00Z',48,0,55,0);
 assert.ok(nSouth.irradianceWm2>nNorth.irradianceWm2*3);
 const sNorth=at('2026-06-21T12:00:00Z',-48,0,55,0),sSouth=at('2026-06-21T12:00:00Z',-48,0,55,180);
 assert.ok(sNorth.irradianceWm2>sSouth.irradianceWm2*3);
});
test('east roof benefits in the morning, west roof in the afternoon',()=>{
 const morningEast=at('2026-03-20T08:00:00Z',48,0,45,90),morningWest=at('2026-03-20T08:00:00Z',48,0,45,270);
 assert.ok(morningEast.irradianceWm2>morningWest.irradianceWm2*2);
 const eveningEast=at('2026-03-20T16:00:00Z',48,0,45,90),eveningWest=at('2026-03-20T16:00:00Z',48,0,45,270);
 assert.ok(eveningWest.irradianceWm2>eveningEast.irradianceWm2*2);
});
test('geographic poles return finite polar day and night values',()=>{
 const summer=at('2026-06-21T00:00:00Z',90),winter=at('2026-12-21T12:00:00Z',90);
 assert.ok(summer.altitudeDeg>20&&summer.irradianceWm2>0);assert.equal(winter.irradianceWm2,0);
 const southSummer=at('2026-12-21T00:00:00Z',-90);assert.ok(southSummer.irradianceWm2>0);
});
test('horizontal irradiance is azimuth independent; compass north wraps at 360 degrees',()=>{
 const a=at('2026-06-21T10:00:00Z',48,16,0,0),b=at('2026-06-21T10:00:00Z',48,16,0,270);assert.equal(a.irradianceWm2,b.irradianceWm2);
 const c=at('2026-06-21T10:00:00Z',48,16,45,0),d=at('2026-06-21T10:00:00Z',48,16,45,360);assert.ok(Math.abs(c.irradianceWm2-d.irradianceWm2)<1e-9);
});
test('invalid inputs never silently become real production estimates',()=>{
 for(const args of [[NaN,48,16,30,180],[0,null,16,30,180],[0,91,16,30,180],[0,48,181,30,180],[0,48,16,-1,180],[0,48,16,30,361]])assert.throws(()=>computeSolarPower(...args),RangeError);
});
test('model remains finite and nonnegative over all seasons, hemispheres and roof directions',()=>{
 for(const month of [0,3,6,9])for(const lat of [-90,-66,-30,0,30,66,90])for(const hour of [0,6,12,18])for(const az of [0,90,180,270]){
  const p=computeSolarPower(Date.UTC(2026,month,15,hour),lat,16,40,az);assert.ok(Number.isFinite(p.irradianceWm2)&&p.irradianceWm2>=0&&p.irradianceWm2<1600);assert.ok(Number.isFinite(p.altitudeDeg)&&Math.abs(p.altitudeDeg)<=90);
 }
});
