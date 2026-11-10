'use strict';
/**
 * Einmalige Übernahme der alten Skriptlösung in eine dedizierte Adapterinstanz.
 * Der Altbestand wird hier NICHT gelöscht. Aufräumen ist ein gesonderter,
 * bewusst auszulösender Vorgang nach mindestens einer gültigen Neumessung.
 */
const {defaultSources,normalizeSources,normalizeSettings,normalizeConsumers}=require('./normalize');
const {createRuntime}=require('./engine');
const LEGACY_ROOT='0_userdata.0.Netzentgelt2027';
const LEGACY_SCRIPTS=[
 'script.js.common.Netzentgelt2027_Leistungsmonitor',
 'script.js.common.Netzentgelt2027_DashboardDatenexport',
 'script.js.common.Netzentgelt2027_Lastmanagement',
 'script.js.common.Netzentgelt2027_LastmanagementDashboardExport',
 'script.js.common.Energiemanagement_Aktoren'
];
const safeJSON=(s,f)=>{try{return JSON.parse(String(s))}catch{return f}};
async function foreign(adapter,id){try{return (await adapter.getForeignStateAsync(id))?.val??null}catch{return null}}
function oldSources(raw){
 const data=defaultSources();
 for(const k of Object.keys(data)){
  if(k==='pv')continue;
  const legacyKey=({batteryW:'battery',phase1W:'phase1',phase2W:'phase2',phase3W:'phase3'})[k]||k;
  const found=raw?.sources?.[legacyKey];
  if(found?.id)data[k]={id:String(found.id),factor:Number(found.factor??1)};
 }
 data.pv=[];
 for(const oldKey of ['pvGoodwe','pvGrowatt']){
  const f=raw?.sources?.[oldKey];
  if(f?.id)data.pv.push({id:String(f.id),factor:Number(f.factor??1),name:'PV '+(data.pv.length+1)});
 }
 return normalizeSources(data);
}
function oldConsumers(cfg){
 const devices=(cfg?.devices||[]).map(d=>({
  id:d.id,name:d.name,type:d.type,enabled:d.enabled===true,requested:d.requested!==false,
  mode:d.mode,priority:d.priority,minW:d.minW,maxW:d.maxW,minOffSec:d.minOffSec,
  measuredW:'',
  output:{armed:false,enableId:d.actuator?.enableId||'',enableOn:d.actuator?.enableOn!==false,
   powerId:d.actuator?.powerId||'',powerUnit:d.actuator?.powerUnit||'A',phases:d.actuator?.phases||3,
   voltage:d.actuator?.nominalVoltage||230,minA:d.actuator?.minA||6,maxA:d.actuator?.maxA||16}
 }));
 // Physische Steuerung ist beim Umzug immer deaktiviert.
 return normalizeConsumers({master:false,maxParallel:cfg?.maxParallel||3,devices},250);
}
function transformHistory(old){
 const source=old||{};
 const days={},months={};
 for(const [target,prev] of [[days,source.days||{}],[months,source.months||{}]]){
  for(const [k,r] of Object.entries(prev))target[k]={
   importKWh:Number(r.bezugKWh||0),exportKWh:Number(r.abgabeKWh||0),
   pvKWh:Number(r.pvKWh||0),houseKWh:Number(r.hausKWh||0),
   peakW:Number(r.max15MinW||0),peakStart:Number(r.max15MinStart||0),
   valid:Number(r.valid||0),invalid:Number(r.invalid||0)
  };
 }
 const intervals=(source.intervals||[]).map(r=>({
  start:Number(r.start),day:r.day,month:r.month,valid:r.valid===true,
  coveragePct:Number(r.coverage||0),averageW:Number(r.mittelwertW||0),
  importKWh:Number(r.bezugKWh||0),exportKWh:Number(r.abgabeKWh||0),
  pvKWh:Number(r.pvKWh||0),houseKWh:Number(r.hausKWh||0)
 }));
 return createRuntime({startedAt:source.startedAt||Date.now(),sourceSignature:'',anchors:{},
  open:{},lastPower:null,days,months,intervals,invalidSamples:source.invalidSamples||0,
  incomplete:source.incomplete||0,lastValid:source.lastValid||null});
}
async function importLegacy(a){
 if(await a.read('migration.done',false))throw Error('Migration wurde bereits durchgeführt – erneute Übernahme wird verweigert');
 const [src,config,runtime,target,reserve,minCover,tariff]=await Promise.all([
  foreign(a,LEGACY_ROOT+'.Config.Datenquellen_JSON'),
  foreign(a,LEGACY_ROOT+'.Lastmanagement.Konfiguration_JSON'),
  foreign(a,LEGACY_ROOT+'.Intern.Speicher_JSON'),
  foreign(a,LEGACY_ROOT+'.Config.Ziel15Min_W'),
  foreign(a,LEGACY_ROOT+'.Config.Sicherheitsreserve_W'),
  foreign(a,LEGACY_ROOT+'.Config.MinAbdeckung_Prozent'),
  foreign(a,LEGACY_ROOT+'.Config.GesetzlicheTarifgrenze_W')
 ]);
 if(!src||!runtime||!config)throw Error('Die bisherige Installation ist nicht vollständig vorhanden. Nichts wurde verändert.');
 const previous={sources:safeJSON(src,{}),consumers:safeJSON(config,{}),runtime:safeJSON(runtime,{})};
 const translated={sources:oldSources(previous.sources),consumers:oldConsumers(previous.consumers),
  runtime:transformHistory(previous.runtime),settings:normalizeSettings({targetW:target,reserveW:reserve,minCoveragePct:minCover,tariffThresholdW:tariff},a.config)};
 // Quelltext der alten Skripte wird für einen möglichen Rollback mitgesichert.
 const scripts={};for(const id of LEGACY_SCRIPTS){try{
  const o=await a.getForeignObjectAsync(id);if(o?.common?.source)scripts[id]=o.common.source;
 }catch{}}
 const snapshot={date:new Date().toISOString(),origin:LEGACY_ROOT,previous,scripts,
  sourceCount:Object.values(translated.sources).filter(v=>v&&v.id).length,
  devices:translated.consumers.devices.length,intervals:translated.runtime.intervals.length};
 // Vor der Datenänderung vollständige Sicherung erstellen.
 await a.set('migration.backup',snapshot,true);
 for(const [key,val] of Object.entries({
  'config.sources':translated.sources,'config.consumers':translated.consumers,
  'config.settings':translated.settings,'internal.runtime':translated.runtime,
  'history.intervals':translated.runtime.intervals,'history.days':translated.runtime.days,
  'history.months':translated.runtime.months
 }))await a.set(key,val,true);
 // Adapter-Engine sofort umstellen – kein Neustart nötig.
 a.engine.r=translated.runtime;
 await a.set('config.hardwareMaster',false,true);
 const report={date:new Date().toISOString(),migrated:true,sourceCount:snapshot.sourceCount,
  consumers:snapshot.devices,intervals:snapshot.intervals,dayCount:Object.keys(translated.runtime.days).length,
  monthCount:Object.keys(translated.runtime.months).length,oldScriptsBackedUp:Object.keys(scripts).length,
  note:'Legacy-Skripte und Zustände sind noch vollständig vorhanden. Die Hardwaresteuerung bleibt AUS.'};
 await a.set('migration.report',report,true);
 await a.set('migration.done',true,true);
 a.migrationComplete=true;
 a.log.info('Legacy-Migration erfolgreich. Historie übernommen: '+report.intervals+' Viertelstunden, '+report.consumers+' Verbraucher.');
 return report;
}
async function cleanupLegacy(a){
 if(await a.read('migration.done',false)!==true)throw Error('Bereinigung nicht möglich: Migration wurde nicht bestätigt');
 const backup=safeJSON(await a.read('migration.backup','{}'),{});
 if(!backup?.previous?.runtime||!backup?.scripts)throw Error('Keine vollständige Sicherung gefunden');
 if(!a.engine||a.runCount<5)throw Error('Neue Adapterinstanz wurde noch nicht ausreichend geprüft');
 if(!a.monitorGoodSince||Date.now()-a.monitorGoodSince<180000)throw Error('Mindestens drei Minuten gültige Messdaten erforderlich');
 const report=safeJSON(await a.read('migration.report','{}'),{});
 if(!report.migrated)throw Error('Migrationsbericht fehlt');
 const importedAt=new Date(report.date).getTime();
 if(!Number.isFinite(importedAt)||!a.engine.r.intervals.some(x=>x.valid&&x.start>=importedAt))
  throw Error('Noch keine seit der Migration vollständig neu erfasste Viertelstunde vorhanden');
 if(a.hardwareMaster||Object.keys(a.activeHardware).length)throw Error('Hardwaresteuerung vor der Bereinigung ausschalten');
 // Erst nach allen Positivprüfungen alte Skripte deaktivieren.
 const disabled=[];
 for(const id of LEGACY_SCRIPTS){
  const o=await a.getForeignObjectAsync(id);
  if(!o)continue;
  await a.extendForeignObjectAsync(id,{common:{enabled:false}});
  disabled.push(id);
 }
 // Laufzeit prüfen, ob der neue Adapter weiterhin aktiv ist.
 await new Promise(resolve=>setTimeout(resolve,3000));
 if(!a.engine||await a.read('status.running',false)!==true)throw Error('Adapterstatus nach Deaktivierung nicht gültig; Altbestand bleibt erhalten');
 // Erst hier destruktive Bereinigung, begrenzt auf EXAKT bekannte IDs.
 const removed=[];
 for(const id of disabled){
  await a.delForeignObjectAsync(id);
  removed.push(id);
 }
 // Exakt den eigenen alten Datenpunkt-Namensraum entfernen.
 await a.delForeignObjectAsync(LEGACY_ROOT,{recursive:true});
 // Nur das dedizierte Verzeichnis der alten Dashboard-Dateien aufräumen.
 // Bei Dateizugriffsfehlern den Rückfallsicherungsstand erhalten und melden.
 let webFilesDeleted=0,webFileError='';
 try{
  const files=await a.readDirAsync('0_userdata.0','Netzentgelt2027');
  for(const entry of files||[]){
   if(entry.isDir)continue;
   await a.delFileAsync('0_userdata.0','Netzentgelt2027/'+entry.file);
   webFilesDeleted++;
  }
 }catch(e){webFileError=String(e.message||e);a.log.warn('Alte Dashboard-Dateien teilweise erhalten: '+webFileError)}
 const result={...report,cleanupAt:new Date().toISOString(),oldScriptsDeleted:removed,
  oldStatesRemoved:true,oldWebFilesDeleted:webFilesDeleted,oldWebFilesError:webFileError};
 await a.set('migration.report',result,true);
 a.log.info('Legacy-Skripte und alter Datenpunktordner wurden nach Erfolgskontrolle entfernt.');
 return result;
}
module.exports={importLegacy,cleanupLegacy,transformHistory,oldSources,oldConsumers,LEGACY_SCRIPTS,LEGACY_ROOT};
