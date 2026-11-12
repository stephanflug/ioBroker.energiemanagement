'use strict';

// Optional, read-only battery measurements. Never aggregate SOC across batteries.
const FIELDS = Object.freeze({soc:'%',voltage:'V',current:'A',power:'W',status:''});
const VALID_ID = /^[a-zA-Z0-9_][\w.:-]*$/;
function normalizeBatteryConfig(raw) {
 const batteries=Array.isArray(raw?.batteries)?raw.batteries:[];
 if(batteries.length>100)throw Error('Maximal 100 Batteriespeicher');
 const used=new Set();
 return {batteries:batteries.map((b,i)=>{
  const id=String(b?.id||'battery_'+(i+1)).trim();
  if(!/^[a-z][a-z0-9_]{1,47}$/.test(id)||used.has(id))throw Error('Ungültige oder doppelte Batterie-ID');
  used.add(id);
  const sources={};
  for(const key of Object.keys(FIELDS)){
   const value=String(b?.sources?.[key]||'').trim();
   if(value&&(!VALID_ID.test(value)||value.length>255))throw Error('Ungültiger Datenpunkt für '+key);
   sources[key]=value;
  }
  return {id,name:String(b?.name||'Batterie '+(i+1)).trim().slice(0,80),enabled:b?.enabled===true,sources};
 })};
}
function readBatteryMeasurements(config,states,now=Date.now(),maxAgeMs=120000) {
 return normalizeBatteryConfig(config).batteries.filter(b=>b.enabled).map(b=>{
  const values={},quality={};
  for(const key of Object.keys(FIELDS)){
   const id=b.sources[key],state=id?states[id]:null;
   const fresh=!!state&&Number.isFinite(state.ts)&&now-state.ts<=maxAgeMs&&state.ts<=now;
   let value=fresh?state.val:null;
   if(key!=='status'){
    value=value===null||value===''||!Number.isFinite(Number(value))?null:Number(value);
    if(key==='soc'&&value!==null&&(value<0||value>100))value=null;
   }else value=value===null?null:String(value).slice(0,120);
   values[key]=value;quality[key]=value===null?'missing_or_stale':'ok';
  }
  return {id:b.id,name:b.name,values,quality};
 });
}
module.exports={FIELDS,normalizeBatteryConfig,readBatteryMeasurements};
