'use strict';
const {BACKUP_STATE_IDS,buildBackup,validateBackup,buildRestorePlan,buildRollbackPlan}=require('./backup');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const goodOff=(state,value)=>state?.val===value&&state.ack===true&&(state.q===undefined||state.q===0);
class BackupService{
 constructor(adapter,{releaseTimeoutMs=30000,wait=sleep}={}){this.adapter=adapter;this.releaseTimeoutMs=releaseTimeoutMs;this.wait=wait;this.completed=new Map();}
 async exclusive(fn){
  const a=this.adapter;if(a.dataBusy)throw Error('Eine Sicherung oder Wiederherstellung läuft bereits.');a.dataBusy=true;
  try{
   const deadline=Date.now()+30000;
   while(a.running||a.migrating||a.configActive){if(Date.now()>=deadline)throw Error('Laufende Messung oder Konfigurationsänderung ist noch nicht abgeschlossen. Bitte erneut versuchen.');await this.wait(50);}
   await a.sourceConfig?.queue?.catch(()=>{});await a.utilities?.queue?.catch(()=>{});await a.heating?.queue?.catch(()=>{});
   await a.storage?.flush();
   return await fn();
  }finally{a.dataBusy=false;}
 }
 async flush(){
  const a=this.adapter;
  for(const [id,value]of Object.entries({'config.sources':a.sources,'config.consumers':a.consumers,'config.settings':a.settings,'config.hardwareMaster':a.hardwareMaster,'config.forecast':a.forecast?.config,'config.heating':a.heating?.config,'config.features_JSON':a.utilities?.features,'config.utilities_JSON':a.utilities?.config,'config.energySummary_JSON':a.energySummaryConfig,'config.storage_JSON':a.storage?.config}))if(value!==undefined)await a.set(id,value,true);
  if(a.engine){await a.set('internal.runtime',a.engine.r,true);await a.set('history.intervals',a.engine.r.intervals,true);await a.set('history.days',a.engine.r.days,true);await a.set('history.months',a.engine.r.months,true);}
  if(a.energySummary)await a.set('internal.energySummary',a.energySummary.runtime(),true);
  if(a.dayComparison)await a.set('internal.dayComparison',a.dayComparison.runtime(),true);
  if(a.insights)await a.set('history.power',a.insights.history,true);
  if(a.consumerEnergy)await a.set('analytics.consumerDays_JSON',a.consumerEnergy.archive(),true);
  if(a.heating)await a.heating.persist(true);
  if(a.utilities)await a.utilities.persist();
  await a.set('internal.hardware',a.activeHardware||{},true);
 }
 async snapshot(){
  await this.flush();const states={};
  for(const id of BACKUP_STATE_IDS){const state=await this.adapter.getStateAsync(id);if(state)states[id]=state;}
  return buildBackup({states,namespace:this.adapter.namespace});
 }
 export(){return this.exclusive(async()=>({ok:true,backup:await this.snapshot()}));}
 preview(request={}){const plan=buildRestorePlan(request.backup,{currentNamespace:this.adapter.namespace,currentConsumerIds:(this.adapter.consumers?.devices||[]).map(d=>d.id)});return {ok:true,summary:plan.summary,warnings:plan.warnings};}
 async releaseOwned(){
  const a=this.adapter;a.restoreHold=true;await a.set('internal.restoreHold',true,true);a.hardwareMaster=false;a.consumers.master=false;
  await a.set('config.hardwareMaster',false,true);await a.set('config.consumers',a.consumers,true);
  if(a.heating){const config={...a.heating.config,enabled:false,hardwareEnabled:false};a.heating.config=a.heating.engine.configure(config);await a.set('config.heating',a.heating.config,true);}
  const attempted=new Set(),deadline=Date.now()+this.releaseTimeoutMs;
  for(;;){
   let pending=false;const errors=[];
   for(const [key,record]of Object.entries({...a.activeHardware})){try{
    await a.validateWritable(record.enableId,'boolean');const target=!record.enableOn;let state=await a.getForeignStateAsync(record.enableId);
    if(!goodOff(state,target)&&!attempted.has(record.enableId)){attempted.add(record.enableId);await a.setForeignStateAsync(record.enableId,{val:target,ack:false});state=await a.getForeignStateAsync(record.enableId);}
    if(goodOff(state,target)){delete a.activeHardware[key];a.lastOff[key]=Date.now();}else pending=true;
   }catch(error){pending=true;errors.push(String(error.message||error));}}
   await a.set('internal.hardware',a.activeHardware,true);
   if(a.heating){const report=await a.heating.outputs.release('Wiederherstellung vorbereitet');await a.set('heating.hardware',report,true);await a.heating.persist(true);if(Object.keys(a.heating.outputs.runtime().owned||{}).length)pending=true;errors.push(...(report.errors||[]).map(e=>e.message));}
   if(!pending)return;
   if(errors.length||Date.now()>=deadline)throw Error('Wiederherstellung abgebrochen: Die Rücknahme eigener Gerätebefehle wurde nicht bestätigt. Steuerungen bleiben aus; bestehende Zuordnungen und Besitzdaten bleiben erhalten.'+(errors.length?' '+errors.join('; ').slice(0,200):''));
   await this.wait(250);
  }
 }
 async apply(plan){for(const {id,val}of plan.entries)await this.adapter.set(id,val,true);await this.adapter.loadRestoredData();}
 restore(request={}){
  const a=this.adapter,requestId=request.requestId;
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(requestId))return Promise.reject(Error('Gültige Kennung für die Wiederherstellung fehlt.'));
  const document=validateBackup(request.backup),checksum=document.checksum.value;
  const previous=this.completed.get(requestId);if(previous){if(previous.checksum!==checksum)return Promise.reject(Error('Diese Wiederherstellungskennung gehört zu einer anderen Sicherung.'));return Promise.resolve(previous.result);}
  return this.exclusive(async()=>{
   const plan=buildRestorePlan(document,{currentNamespace:a.namespace,currentConsumerIds:(a.consumers?.devices||[]).map(d=>d.id)});
   const before=await this.snapshot(),stamp=new Date().toISOString().replace(/[:.]/g,'-');
   const safetyBackupPath='energiemanagement-backups/'+a.namespace+'-vor-restore-'+stamp+'.json';
   // Persist a complete safety copy outside the adapter's web-files before changing anything.
   await a.writeFileAsync('0_userdata.0',safetyBackupPath,Buffer.from(JSON.stringify(before,null,2)));
   await this.releaseOwned(); // Never overwrite ownership until current physical commands are reconciled.
   a.forecast?.close();
   try{await this.apply(plan);}
   catch(error){
    try{await this.apply(buildRollbackPlan(before,{currentNamespace:a.namespace,currentConsumerIds:(a.consumers?.devices||[]).map(d=>d.id)}));}
    catch(rollbackError){throw Error('Wiederherstellung und Rücksicherung fehlgeschlagen. Sicherung: 0_userdata.0/'+safetyBackupPath+'. '+String(rollbackError.message||rollbackError).slice(0,150));}
    throw Error('Wiederherstellung fehlgeschlagen; vorherige Daten mit deaktivierten Steuerungen zurückgesichert. '+String(error.message||error).slice(0,150));
   }
   const result={ok:true,summary:plan.summary,warnings:plan.warnings,safetyBackupPath:'0_userdata.0/'+safetyBackupPath};
   this.completed.set(requestId,{checksum,result});if(this.completed.size>20)this.completed.delete(this.completed.keys().next().value);
   return result;
  }).finally(()=>{if(!a.dataBusy&&!a.stopping)a.tick().catch(error=>a.log.warn('Nach Wiederherstellung: '+error.message));});
 }
}
module.exports={BackupService,goodOff};
