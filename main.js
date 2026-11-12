'use strict';
const utils=require('@iobroker/adapter-core');
const {EnergyEngine,createRuntime,fresh}=require('./lib/engine');
const {normalizeBatteryConfig,readBatteryMeasurements}=require('./lib/battery-sources');
const FreeLogic=require('./lib/free-logic');
const {applyForeignOutputs}=require('./lib/free-logic-output');
const {SRC_SCHEMA,defaultSources,defaultConsumers,normalizeSources,normalizeConsumers,normalizeSettings,clamp}=require('./lib/normalize');
const {importLegacy,cleanupLegacy}=require('./lib/migration');
const pkg=require('./package.json');
const {EnergyInsights}=require('./lib/insights');
const {ConsumerEnergy}=require('./lib/consumer-energy');
const {defaultForecast,normalizeForecast,PVForecast}=require('./lib/forecast');
const {defaultHeating}=require('./lib/heating');
const {HeatingService}=require('./lib/heating-service');
const {EnergySummary}=require('./lib/energy-summary');
const {normalizeEnergySummaryConfig}=require('./lib/energy-summary-config');
const {UtilitiesService,defaultFeatures,normalizeFeatures,defaultStoredUtilities}=require('./lib/utilities-service');
const {BackupService}=require('./lib/backup-service');
const {DayComparison}=require('./lib/day-comparison');
const {StorageService,defaultStorageConfig}=require('./lib/storage-service');
const {VersionCheck}=require('./lib/version-check');
const buildInfo=require('./lib/build-info.json');
const {ConsumerSourceConfig}=require('./lib/source-config');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const asJSON=(data,def)=>{try{return JSON.parse(String(data))}catch{return def}};
const unix=()=>Date.now();
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;

class Energiemanagement extends utils.Adapter {
  constructor(options={}){
    super({...options,name:'energiemanagement'});
    this.on('ready',this.onReady.bind(this));
    this.on('stateChange',this.onStateChange.bind(this));
    this.on('unload',this.onUnload.bind(this));
    this.on('message',this.onMessage.bind(this));
    this.stopping=false;this.dataBusy=false;this.configActive=0;this.restoreHold=false;this.backup=new BackupService(this);
    this.versionCheck=null;this.versionTimer=null;this.versionCheckOptions=options.versionCheckOptions||{};
    this.running=false;this.timer=null;this.engine=null;this.sources=defaultSources();
    this.consumers=defaultConsumers();this.settings={targetW:9500,reserveW:500,tariffThresholdW:10000,minCoveragePct:85};
    this.hardwareMaster=false;this.activeHardware={};this.lastOff={};this.lastSave=0;this.lastStatus={};this.freeLogicWriteTimes=new Map();
    this.knownConsumers=new Set();this.migrationComplete=false;this.migrating=false;this.monitorGoodSince=0;this.runCount=0;
  }
  async channel(id,name){await this.setObjectNotExistsAsync(id,{type:'channel',common:{name},native:{}});}
  async state(id,name,type,def,write=false,unit){
    const common={name,type,role:type==='boolean'?'indicator':type==='number'?'value':'text',read:true,write,def};
    if(unit)common.unit=unit;
    await this.setObjectNotExistsAsync(id,{type:'state',common,native:{}});
    // ioBroker legt beim Erstellen des Objekts nicht auf jeder Controller-Version
    // automatisch den zugehörigen State-Wert an.
    const existing=await this.getStateAsync(id);
    if(!existing) await this.setStateAsync(id,{val:def,ack:true});
  }
  async set(id,value,force=false){
    if(typeof value==='number'&&!Number.isFinite(value))return;
    if(value===undefined||value===null)return;
    const v=typeof value==='object'?JSON.stringify(value):value;
    if(!force&&this.lastStatus[id]===v)return;
    this.lastStatus[id]=v;
    await this.setStateAsync(id,{val:v,ack:true});
  }
  async read(id,defaultValue=null){try{const state=await this.getStateAsync(id);return state?.val??defaultValue}catch{return defaultValue}}
  async onReady(){
    try{
      const hadFeatures=await this.getStateAsync('config.features_JSON');
      await this.createStates();
      this.restoreHold=await this.read('internal.restoreHold',false)===true;
      const oldRuntime=asJSON(await this.read('internal.runtime','{}'),{});
      this.engine=new EnergyEngine(oldRuntime);
      this.insights=new EnergyInsights(asJSON(await this.read('history.power','[]'),[]));
      this.dayComparison=new DayComparison(asJSON(await this.read('internal.dayComparison','{}'),{}),this.insights.history);
      this.consumerEnergy=new ConsumerEnergy(asJSON(await this.read('analytics.consumerDays_JSON','{}'),{}));
      this.energySummary=new EnergySummary(asJSON(await this.read('internal.energySummary','{}'),{}));
      try{this.energySummaryConfig=normalizeEnergySummaryConfig(asJSON(await this.read('config.energySummary_JSON','{}'),{}));}
      catch(e){this.energySummaryConfig={monthlyPvTargetKWh:0};await this.set('config.energySummary_JSON',this.energySummaryConfig,true);this.log.warn('PV-Monatsziel zurückgesetzt: '+e.message);}
      this.forecast=new PVForecast(asJSON(await this.read('config.forecast','{}'),defaultForecast()),asJSON(await this.read('forecast.data','{}'),{}));
      this.heating=new HeatingService(this,asJSON(await this.read('config.heating','{}'),defaultHeating()),asJSON(await this.read('internal.heatingLearning','{}'),{}),asJSON(await this.read('internal.heatingOutputs','{}'),{}),asJSON(await this.read('heating.history','[]'),[]));
      this.activeHardware=asJSON(await this.read('internal.hardware','{}'),{});
      this.sources=normalizeSources(asJSON(await this.read('config.sources','{}'),defaultSources()));
      this.batteries=normalizeBatteryConfig(asJSON(await this.read('config.batteries_JSON','{}'),{batteries:[]}));
      // Vorhandene Batterie-Leistungsquelle einmalig als eigenen Speicher übernehmen.
      if(!this.batteries.batteries.length&&this.sources.batteryW?.id){
        this.batteries=normalizeBatteryConfig({batteries:[{id:'battery_1',name:'Vorhandener Batteriespeicher',enabled:true,sources:{power:this.sources.batteryW.id}}]});
        await this.set('config.batteries_JSON',this.batteries,true);
      }
      this.freeLogics=FreeLogic.validate(asJSON(await this.read('config.freeLogics_JSON','{"logics":[]}'),{logics:[]}));
      await this.prepareFreeLogicOutputs();
      this.consumers=normalizeConsumers(asJSON(await this.read('config.consumers','{}'),defaultConsumers()),this.config.maxConsumers||250);
      this.settings=normalizeSettings(asJSON(await this.read('config.settings','{}'),{}),this.config);
      this.hardwareMaster=await this.read('config.hardwareMaster',false)===true;
      let utilityConfig=asJSON(await this.read('config.utilities_JSON','{}'),defaultStoredUtilities()),features,featuresValid=true;
      try{features=normalizeFeatures(JSON.parse(await this.read('config.features_JSON','{}')));}
      catch(e){features=defaultFeatures();featuresValid=false;this.log.warn('Optionale Bereichsauswahl zurückgesetzt: '+e.message);}
      if(!hadFeatures||!featuresValid)features.heating=!!(this.heating.config.enabled||this.heating.config.rooms.length||this.heating.config.circuits.length||this.heating.config.pump.lockId);
      const inventoryRuntime=asJSON(await this.read('internal.fuelInventory','{}'),{});
      try{this.utilities=new UtilitiesService(this,utilityConfig,features,asJSON(await this.read('internal.utilities','{}'),{}),inventoryRuntime);}
      catch(e){this.log.warn('Ungültige Verbrauchszuordnung zurückgesetzt: '+e.message);this.utilities=new UtilitiesService(this,defaultStoredUtilities(),features,asJSON(await this.read('internal.utilities','{}'),{}),inventoryRuntime);}
      await this.set('config.utilities_JSON',this.utilities.config,true);await this.set('config.features_JSON',this.utilities.features,true);
      try{this.storage=new StorageService(this,asJSON(await this.read('config.storage_JSON','{}'),defaultStorageConfig()),asJSON(await this.read('internal.storage','{}'),{}));}
      catch(error){this.log.warn('Speicherauswahl zurückgesetzt: '+error.message);this.storage=new StorageService(this,defaultStorageConfig(),{});}
      await this.set('config.storage_JSON',this.storage.config,true);
      await this.initializeVersionCheck();
      if(!this.utilities.features.heating)await this.utilities.disableHiddenHeating();
      if(this.config.migrateLegacy===true && !await this.read('migration.done',false)){
        await importLegacy(this);
        await this.reloadConfig();
      }
      await this.subscribeStatesAsync('config.*');
      await this.subscribeStatesAsync('commands.*');
      await this.createConsumers();
      await this.set('status.version',pkg.version);
      await this.set('status.running',true);
      this.log.info('Energiemanagement '+pkg.version+' gestartet – Hardwaresteuerung: '+(this.hardwareMaster?'freigegeben':'AUS'));
      await this.tick();
      this.timer=setInterval(()=>this.tick().catch(err=>this.log.error('Messung: '+err.stack)),clamp(Number(this.config.samplingSeconds)||5,2,30)*1000);
      if(!this.stopping)this.versionTimer=this.setInterval(()=>this.runVersionCheck(),60000);
    }catch(e){this.log.error('Startfehler: '+e.stack);await this.set('status.running',false).catch(()=>{});}
  }
  async createStates(){
    const channels={logicVirtual:'Virtuelle Sollwerte freier Logiken',logicOutputs:'Ausgänge freier Logiken',config:'Einstellungen',status:'Systemstatus',live:'Livewerte',interval:'15-Minuten-Auswertung',day:'Tageswerte',month:'Monatswerte',control:'Leistungsbudget',history:'Historie',consumers:'Verbraucher',internal:'Interner Speicher',migration:'Migration',commands:'Aktionen',insights:'Dynamische Empfehlungen',analytics:'Geräte-Energieauswertung',forecast:'PV-Ertragsprognose',heating:'Heizung & Gebäudepuffer',utilities:'Wasser und Brennstoff',storage:'Datenspeicherung',update:'Versionsinformationen'};
    for(const [key,label]of Object.entries(channels))await this.channel(key,label);
    const defs=[
      ['update.status_JSON','Installierte Version und öffentliche GitHub-Releases (JSON)','string','{}'],
      ['internal.versionCheck_JSON','Cache und letzte erfolgreiche Versionsprüfung (JSON)','string','{}'],
      ['config.features_JSON','Optionale Bereiche anzeigen (JSON)','string',JSON.stringify(defaultFeatures()),true],
      ['config.utilities_JSON','Wasser- und Brennstoffzuordnungen (JSON)','string',JSON.stringify(defaultStoredUtilities()),true],
      ['analytics.utilities_JSON','Wasser- und Brennstoffverbrauch nach Kalenderperioden (JSON)','string','{}'],
      ['analytics.dayComparison_JSON','Tagesvergleich Haus und Verbraucher (JSON)','string','{}'],
      ['internal.dayComparison','Messprofile für Tagesvergleiche (JSON)','string','{}'],
      ['config.storage_JSON','Interne Speicherung oder ioBroker-Datenbankinstanz (JSON)','string',JSON.stringify(defaultStorageConfig()),true],
      ['internal.storage','Metadaten der Datenbankarchivierung (JSON)','string','{}'],
      ['storage.status_JSON','Status der gewählten Datenspeicherung (JSON)','string','{}'],
      ['storage.checkpoint_JSON','Serienkennung der vollständigen Datenbanksicherung','string','{}'],
      ['storage.checkpointManifest_JSON','Geprüfter Datenbanksicherungsstand (Manifest)','string','{}'],
      ['internal.utilities','Persistente Verbrauchsarchive Wasser und Brennstoff (JSON)','string','{}'],
      ['internal.restoreHold','Wiederherstellung wartet auf bestätigte Geräterückstellung','boolean',false],
      ['analytics.utilitiesArchive_JSON','Verbrauchsarchive für Wasser- und Brennstoffberichte (JSON)','string','{}'],
      ['internal.fuelInventory','Tankbestände und Befüllungen (JSON)','string','{}'],
      ['analytics.fuelInventory_JSON','Tankbestände und Befüllungen zur Anzeige (JSON)','string','{}'],
      ['utilities.error','Letzter Fehler Wasser/Brennstoff','string',''],
      ['config.energySummary_JSON','PV-Monatsziel und Energieübersicht (JSON)','string',JSON.stringify({monthlyPvTargetKWh:0}),true],
      ['analytics.energySummary_JSON','Kalenderübersicht und Smart Meter (JSON)','string','{}'],
      ['internal.energySummary','Batterieenergie nach Kalendertagen (JSON)','string','{}'],
      ['config.heating','Optionale Heizungsoptimierung (JSON)','string',JSON.stringify(defaultHeating()),true],
      ['heating.status','Raumwerte und Heizempfehlung (JSON)','string','{}'],
      ['heating.message','Heizempfehlung','string','Heizungsmodul deaktiviert.'],
      ['heating.hardware','Status eigener Heizungseingriffe (JSON)','string','{}'],
      ['heating.history','Temperaturverlauf bis 48 Stunden (JSON)','string','[]'],
      ['heating.error','Letzter Heizungsfehler','string',''],
      ['internal.heatingLearning','Gebäudemodell (JSON)','string','{}'],
      ['internal.heatingOutputs','Eigene Heizungs-Ausgänge und Ausgangswerte (JSON)','string','{}'],
      ['commands.heatingResetLearning','Gebäudemodell zurücksetzen','boolean',false,true],
      ['config.forecast','Standort und PV-Ertragsprognose (JSON)','string',JSON.stringify(defaultForecast()),true],
      ['forecast.data','PV-Ertragsprognose heute und morgen (JSON)','string','{}'],
      ['forecast.status','Status der Ertragsprognose','string','Noch nicht eingerichtet.'],
      ['forecast.error','Letzter Prognosefehler','string',''],
      ['commands.forecastRefresh','Ertragsprognose aktualisieren','boolean',false,true],
      ['config.sources','Datenquellen (JSON)','string',JSON.stringify(defaultSources()),true],
      ['config.batteries_JSON','Optionale Batteriespeicher und Messpunkte (JSON)','string','{"batteries":[]}',true],
      ['config.freeLogics_JSON','Frei konfigurierbare Funktionsbaustein-Logiken (JSON)','string','{"logics":[]}',true],
      ['live.freeLogics_JSON','Simulation und Diagnose der freien Logiken (JSON)','string','{"logics":[],"simulation":true}'],
      ['live.batteries_JSON','Getrennte Batterie-Messwerte (JSON)','string','{"batteries":[]}'],
      ['config.consumers','Prioritäten und Verbraucher (JSON)','string',JSON.stringify(defaultConsumers()),true],
      ['config.settings','Leistungsziel, Reserve und Tarifwert (JSON)','string',JSON.stringify(normalizeSettings({},this.config)),true],
      ['config.hardwareMaster','Echte Hardwaresteuerung freigeben','boolean',false,true],
      ['status.running','Adapter läuft','boolean',false],['status.dataOk','Zählermessung für Lastmanagement geeignet','boolean',false],
      ['status.message','Messwertqualität / Hinweis','string',''],['status.version','Adapterversion','string',pkg.version],
      ['status.lastSample','Letzte Messung ISO 8601','string',''],['status.lastError','Letzter Fehler','string',''],
      ['live.snapshot','Zeitgleiche Livewerte mit Datenqualität (JSON)','string','{}'],
      ['live.importW','Netzbezug','number',0,false,'W'],['live.exportW','Netzeinspeisung','number',0,false,'W'],
      ['live.gridBalanceW','Netzsaldo','number',0,false,'W'],['live.importKWh','Bezugszählerstand','number',0,false,'kWh'],
      ['live.exportKWh','Einspeisezählerstand','number',0,false,'kWh'],['live.pvW','PV-Gesamtleistung','number',0,false,'W'],
      ['live.batteryW','Batterieleistung','number',0,false,'W'],['live.houseW','Hausverbrauch','number',0,false,'W'],
      ['live.houseQuality','Art der Hausverbrauchsmessung','string',''],
      ['interval.start','Beginn aktuelle Viertelstunde (Epoch-ms)','number',0],
      ['interval.end','Ende aktuelle Viertelstunde (Epoch-ms)','number',0],
      ['interval.currentMeanW','Bisheriger Durchschnitt','number',0,false,'W'],
      ['interval.forecastW','Prognose des Viertelstunden-Mittelwerts','number',0,false,'W'],
      ['interval.importKWh','Bezogene Energie im aktuellen Block','number',0,false,'kWh'],
      ['interval.coveragePct','Messabdeckung','number',0,false,'%'],
      ['interval.remainingSec','Verbleibende Sekunden','number',0,false,'s'],
      ['interval.lastValidW','Letzter gültiger 15-Minuten-Mittelwert','number',0,false,'W'],
      ['day.importKWh','Tages-Netzbezug','number',0,false,'kWh'],
      ['day.exportKWh','Tages-Einspeisung','number',0,false,'kWh'],
      ['day.peakW','Höchster 15-Minuten-Mittelwert heute','number',0,false,'W'],
      ['day.peakStart','Beginn Tagesmaximum (Epoch-ms)','number',0],
      ['day.validIntervals','Gültige Viertelstunden heute','number',0],
      ['month.importKWh','Monats-Netzbezug','number',0,false,'kWh'],
      ['month.exportKWh','Monats-Einspeisung','number',0,false,'kWh'],
      ['month.peakW','Höchster 15-Minuten-Mittelwert des Monats','number',0,false,'W'],
      ['month.peakStart','Beginn Monatsspitze (Epoch-ms)','number',0],
      ['month.validIntervals','Gültige Viertelstunden im Monat','number',0],
      ['month.invalidIntervals','Unvollständige Viertelstunden im Monat','number',0],
      ['control.ready','Messdaten ausreichend','boolean',false],
      ['control.availableW','Zusätzlich mögliche Leistung','number',0,false,'W'],
      ['control.allowedW','Momentan zulässiger Durchschnitt im Restblock','number',0,false,'W'],
      ['control.reductionW','Erforderliche Lastreduktion','number',0,false,'W'],
      ['control.virtualMaster','Prioritätenmatrix aktiv','boolean',false],
      ['control.hardwareReady','Hardwareansteuerung vorbereitet','boolean',false],
      ['control.summary','Prioritätenmatrix (JSON)','string','[]'],
      ['analytics.consumerDays_JSON','Geräteenergie nach Tagen (JSON)','string','{"version":1,"days":{}}'],
      ['analytics.status_JSON','Qualität der Geräteenergiemessung (JSON)','string','{}'],
      ['history.power','Leistungsverlauf: 48 Stunden, Minutenwerte (JSON)','string','[]'],
      ['insights.advice','Dynamische Verbraucherempfehlungen (JSON)','string','{}'],
      ['insights.message','Aktuelle Empfehlung','string',''],
      ['history.intervals','Viertelstundenarchiv (JSON)','string','[]'],
      ['history.days','Tagesarchiv (JSON)','string','{}'],
      ['history.months','Monatsarchiv (JSON)','string','{}'],
      ['internal.runtime','Historie / Zähleranker (JSON)','string','{}'],
      ['internal.hardware','Zuvor durch den Adapter gesteuerte Ausgänge (JSON)','string','{}'],
      ['migration.done','Legacy-Migration erfolgreich','boolean',false],
      ['migration.report','Migrationsbericht (JSON)','string','{}'],
      ['migration.cleanupStatus','Status der vorgemerkten Bereinigung','string',''],
      ['migration.backup','Sicherung der bisherigen Daten (JSON)','string','{}'],
      ['commands.importLegacy','Altdaten übernehmen (einmalig)','boolean',false,true],
      ['commands.cleanupLegacy','Alte Skripte und Datenpunkte nach erfolgreicher Migration löschen','boolean',false,true]
    ];
    for(const [id,label,type,def,writable,unit]of defs)await this.state(id,label,type,def,!!writable,unit);
  }
  async refreshForecast(force=false){
    if(!this.forecast||this.stopping)return;
    const generation=this.forecast.generation;
    const result=await this.forecast.refresh(force);
    if(!result||this.stopping||generation!==this.forecast.generation)return;
    await this.set('forecast.data',result.data);
    await this.set('forecast.status',result.status);
    await this.set('forecast.error',result.error);
  }
  async initializeVersionCheck(){
    if(this.versionCheck)await this.versionCheck.close();
    try{
      this.versionCheck=new VersionCheck(this,{installedVersion:pkg.version,releaseChannel:buildInfo.releaseChannel||'stable'},asJSON(await this.read('internal.versionCheck_JSON','{}'),{}),this.versionCheckOptions);
      await this.versionCheck.persist();this.runVersionCheck();
    }catch(error){
      this.versionCheck=null;this.log.warn('Versionsinformationen: '+String(error.message||error));
      await this.set('update.status_JSON',{version:1,status:'unavailable',installedVersion:pkg.version,releaseChannel:buildInfo.releaseChannel||'stable',isPrerelease:buildInfo.releaseChannel==='development',message:'Versionsprüfung derzeit nicht möglich.',error:String(error.message||error).slice(0,250)},true).catch(()=>{});
    }
  }
  runVersionCheck(){
    if(this.stopping||!this.versionCheck)return;
    // Informational background work must never enter the measurement/control error handler.
    try{Promise.resolve(this.versionCheck.tick()).catch(error=>this.log.warn('Versionsprüfung: '+String(error.message||error)));}
    catch(error){this.log.warn('Versionsprüfung: '+String(error.message||error));}
  }
  async onMessage(message){
    if(!message?.callback)return;
    let response,mutating=false,tracked=false;
    try{
      if(['backupExport','backupPreview','backupRestore'].includes(message.command)){
        response=message.command==='backupExport'?await this.backup.export():message.command==='backupPreview'?this.backup.preview(message.message):await this.backup.restore(message.message);
        if(!this.stopping)this.sendTo(message.from,message.command,response,message.callback);return;
      }
      mutating=!['utilityObjects','sourceObjects','heatingObjects','forecastGeocode','storageInstances','storageTest','versionCheck'].includes(message.command);
      if(mutating){if(this.dataBusy)throw Error('Sicherung oder Wiederherstellung läuft. Bitte danach erneut speichern.');if(this.restoreHold)throw Error('Die Rücknahme vorheriger Gerätebefehle ist noch unbestätigt. Wiederherstellung erneut versuchen.');this.configActive++;tracked=true;}
      if(message.command==='versionCheck'){
        if(!this.versionCheck)throw Error('Versionsprüfung noch nicht bereit.');response={ok:true,status:await this.versionCheck.refresh(true)};
      }else if(message.command==='storageInstances'){
        if(!this.storage)throw Error('Datenspeicherung noch nicht bereit.');response={ok:true,instances:await this.storage.instances()};
      }else if(message.command==='storageTest'){
        if(!this.storage)throw Error('Datenspeicherung noch nicht bereit.');response={ok:true,...await this.storage.test(message.message)};
      }else if(message.command==='storageConfigure'){
        if(!this.storage)throw Error('Datenspeicherung noch nicht bereit.');response={ok:true,config:await this.storage.configure(message.message?.config)};
      }else if(message.command==='featuresConfigure'){
        if(!this.utilities)throw Error('Verbrauchsbereiche noch nicht bereit.');
        response={ok:true,config:await this.utilities.configureFeatures(message.message?.config)};
      }else if(message.command==='utilitiesConfigure'){
        if(!this.utilities)throw Error('Verbrauchsbereiche noch nicht bereit.');
        response={ok:true,config:await this.utilities.configure(message.message)};
      }else if(message.command==='utilityObjects'||message.command==='sourceObjects'){
        if(!this.utilities)throw Error('Verbrauchsbereiche noch nicht bereit.');
        response={ok:true,results:await this.utilities.objects(message.message)};
      }else if(message.command==='consumerSourcesConfigure'){
        this.sourceConfig??=new ConsumerSourceConfig(this);
        response={ok:true,config:await this.sourceConfig.configure(message.message)};
      }else if(message.command==='fuelInventoryConfigure'){
        if(!this.utilities)throw Error('Verbrauchsbereiche noch nicht bereit.');
        response={ok:true,inventory:await this.utilities.inventoryConfigure(message.message)};
      }else if(message.command==='fuelRefill'){
        if(!this.utilities)throw Error('Verbrauchsbereiche noch nicht bereit.');
        response={ok:true,inventory:await this.utilities.refill(message.message)};
      }else if(message.command==='heatingObjects'){
        if(!this.heating)throw Error('Heizungsmodul noch nicht bereit.');
        response={ok:true,results:await this.heating.objects(message.message)};
      }else if(message.command==='heatingConfigure'){
        if(!this.heating)throw Error('Heizungsmodul noch nicht bereit.');
        if(message.message?.config?.enabled&&!this.utilities?.heatingAllowed())throw Error('Heizung & Gebäudepuffer zuerst unter Einstellungen freischalten.');
        response={ok:true,config:await this.heating.configure(message.message?.config)};
      }else if(message.command==='forecastGeocode'){
        if(!this.forecast)throw Error('Prognose noch nicht bereit.');
        response={ok:true,results:await this.forecast.geocode(message.message?.query)};
      }else throw Error('Unbekannter Befehl.');
    }catch(e){response={ok:false,error:String(e.message||e).slice(0,650)};}
    finally{if(tracked)this.configActive--;}
    if(!this.stopping)this.sendTo(message.from,message.command,response,message.callback);
  }
  async reloadConfig(){
    this.sources=normalizeSources(asJSON(await this.read('config.sources'),defaultSources()));
    this.batteries=normalizeBatteryConfig(asJSON(await this.read('config.batteries_JSON','{}'),{batteries:[]}));
    this.freeLogics=FreeLogic.validate(asJSON(await this.read('config.freeLogics_JSON','{"logics":[]}'),{logics:[]}));
    await this.prepareFreeLogicOutputs();
    this.consumers=normalizeConsumers(asJSON(await this.read('config.consumers'),defaultConsumers()),this.config.maxConsumers||250);
    this.settings=normalizeSettings(asJSON(await this.read('config.settings'),{}),this.config);
    this.hardwareMaster=await this.read('config.hardwareMaster',false)===true;
    const forecastConfig=normalizeForecast(asJSON(await this.read('config.forecast','{}'),defaultForecast()));
    if(this.forecast?.configure(forecastConfig)){
      await this.set('forecast.data',{},true);
      await this.set('forecast.error','',true);
      await this.set('forecast.status',forecastConfig.enabled?'Ertragsprognose wird berechnet …':'Ertragsprognose deaktiviert.',true);
      this.refreshForecast(true).catch(e=>this.log.warn('PV-Prognose: '+e.message));
    }
    await this.createConsumers();
  }
  async loadRestoredData(){
    if(this.storage)await this.storage.close({persist:false});
    this.forecast?.close();if(this.heating)this.heating.closed=true;if(this.utilities)this.utilities.closed=true;
    this.lastStatus={};this.activeHardware={};this.lastOff={};this.monitorGoodSince=0;
    this.engine=new EnergyEngine(asJSON(await this.read('internal.runtime','{}'),{}));
    this.insights=new EnergyInsights(asJSON(await this.read('history.power','[]'),[]));
    this.dayComparison=new DayComparison(asJSON(await this.read('internal.dayComparison','{}'),{}),this.insights.history);
    this.consumerEnergy=new ConsumerEnergy(asJSON(await this.read('analytics.consumerDays_JSON','{}'),{}));
    this.energySummary=new EnergySummary(asJSON(await this.read('internal.energySummary','{}'),{}));
    this.energySummaryConfig=normalizeEnergySummaryConfig(asJSON(await this.read('config.energySummary_JSON','{}'),{}));
    this.sources=normalizeSources(asJSON(await this.read('config.sources','{}'),defaultSources()));
    this.consumers=normalizeConsumers(asJSON(await this.read('config.consumers','{}'),defaultConsumers()),this.config.maxConsumers||250);
    this.settings=normalizeSettings(asJSON(await this.read('config.settings','{}'),{}),this.config);this.hardwareMaster=false;
    this.forecast=new PVForecast(asJSON(await this.read('config.forecast','{}'),defaultForecast()),{});
    this.heating=new HeatingService(this,asJSON(await this.read('config.heating','{}'),defaultHeating()),asJSON(await this.read('internal.heatingLearning','{}'),{}),{},asJSON(await this.read('heating.history','[]'),[]));
    this.utilities=new UtilitiesService(this,asJSON(await this.read('config.utilities_JSON','{}'),defaultStoredUtilities()),normalizeFeatures(asJSON(await this.read('config.features_JSON','{}'),{})),asJSON(await this.read('internal.utilities','{}'),{}),asJSON(await this.read('internal.fuelInventory','{}'),{}));
    this.storage=new StorageService(this,asJSON(await this.read('config.storage_JSON','{}'),defaultStorageConfig()),asJSON(await this.read('internal.storage','{}'),{}));
    await this.initializeVersionCheck();
    // A restored stock is an estimate; measurements during downtime are unavailable.
    for(const type of ['pellets','oil'])this.utilities.inventory.observe(Date.now(),type,this.utilities.core.totals[type],{partial:true});
    await this.utilities.persist();await this.createConsumers();this.lastSave=0;await this.set('internal.restoreHold',false,true);this.restoreHold=false;
  }
  async createConsumers(){
    const current=new Set(this.consumers.devices.map(x=>x.id));
    const defs=[['allow','Boolean-Freigabe','boolean',false],['targetW','Ziel-/Freigabeleistung','number',0,'W'],
     ['requested','Anforderung','boolean',false],['priority','Priorität','number',0],
     ['status','Freigabegrund','string',''],['hardwareStatus','Aktorstatus','string',''],['name','Verbraucher','string','']];
    for(const d of this.consumers.devices){
      if(!this.knownConsumers.has(d.id)){
       await this.channel('consumers.'+d.id,d.name);
       for(const [key,label,type,def,unit]of defs)await this.state('consumers.'+d.id+'.'+key,label,type,def,false,unit);
       this.knownConsumers.add(d.id);
      }
    }
    for(const old of [...this.knownConsumers]){
      if(!current.has(old)){
        await this.set('consumers.'+old+'.allow',false,true);
        await this.set('consumers.'+old+'.targetW',0,true);
        await this.set('consumers.'+old+'.status','Entfernt – Datenpunkte werden aus Sicherheitsgründen nicht gelöscht',true);
      }
    }
  }
  async getNumeric(id,factor=1){
    if(!id)return null;
    try{
      const s=await this.getForeignStateAsync(id),v=s?.val;
      if(v===undefined||v===null||v===''||typeof v==='boolean'||!Number.isFinite(Number(v)))return null;
      return {value:Number(v)*factor,ts:s.ts||0};
    }catch{return null}
  }
  async readMeasures(){
    const s=this.sources,keys=Object.keys(s).filter(x=>x!=='pv');
    const entries=await Promise.all(keys.map(async key=>[key,await this.getNumeric(s[key].id,s[key].factor)]));
    const data=Object.fromEntries(entries);
    const pv=await Promise.all((s.pv||[]).map(x=>this.getNumeric(x.id,x.factor)));
    const valid=pv.filter(x=>fresh(x,Date.now()));
    // Wenn eine konfigurierte PV-Quelle ausfällt, Hauslast NICHT aus nur einem Teilwert schätzen.
    data.pvW=pv.length===0?null:valid.length===pv.length?valid.reduce((a,b)=>a+b.value,0):null;
    data.batteryW=data.batteryW||null;
    const baseline=key=>{const x=data[key];return x&&num(x.value)!==null?x.value:null};
    data.dayBaseImport=baseline('dayBaseImport');data.monthBaseImport=baseline('monthBaseImport');
    data.dayBaseExport=baseline('dayBaseExport');data.monthBaseExport=baseline('monthBaseExport');
    return data;
  }
  async updateReport(now,m,d){
    await this.set('status.dataOk',d.dataOk);
    await this.set('status.message',d.quality);
    await this.set('status.lastSample',new Date(now).toISOString());
    const l=d.live;
    await this.set('live.snapshot',{ts:now,values:l,houseQuality:d.houseSource,dataOk:d.dataOk});
    for(const [field,value]of Object.entries({importW:l.importW,exportW:l.exportW,pvW:l.pvW,batteryW:l.batteryW,houseW:l.houseW,importKWh:l.importKWh,exportKWh:l.exportKWh})){
      if(num(value)!==null)await this.set('live.'+field,value);
    }
    if(num(l.importW)!==null && num(l.exportW)!==null)await this.set('live.gridBalanceW',l.importW-l.exportW);
    await this.set('live.houseQuality',d.houseSource);
    const q=d.interval;
    for(const [id,v]of Object.entries({start:q.start,end:q.end,currentMeanW:q.meanSoFarW,forecastW:q.forecastW,importKWh:q.importKWh,coveragePct:q.coveragePct,remainingSec:q.remainingSeconds,lastValidW:q.lastValid?.value||0}))await this.set('interval.'+id,v);
    for(const [prefix,val]of [['day',d.day],['month',d.month]]){
      await this.set(prefix+'.importKWh',val.importKWh);
      await this.set(prefix+'.exportKWh',val.exportKWh);
      await this.set(prefix+'.peakW',val.peakW||0);
      await this.set(prefix+'.peakStart',val.peakStart||0);
      await this.set(prefix+'.validIntervals',val.valid||0);
      if(prefix==='month')await this.set('month.invalidIntervals',val.invalid||0);
    }
    await this.set('control.ready',d.control.ready);
    await this.set('control.availableW',d.control.availableW);
    await this.set('control.allowedW',d.control.allowedW);
    await this.set('control.reductionW',d.control.reductionW);
    await this.set('control.virtualMaster',this.consumers.master);
    if(d.completed){
      await this.set('history.intervals',this.engine.r.intervals,true);
      await this.set('history.days',this.engine.r.days,true);
      await this.set('history.months',this.engine.r.months,true);
    }
  }
  async updateEnergySummary(now,measured,report){
    if(!this.energySummary)return;
    const data=this.energySummary.sample(now,report.live,{engineRuntime:this.engine.r,sourceSignature:JSON.stringify(this.sources)});
    const live={...report.live};
    for(const key of ['importKWh','exportKWh','phase1W','phase2W','phase3W'])live[key]=fresh(measured[key],now)?measured[key].value:null;
    data.live=live;
    await this.set('analytics.energySummary_JSON',data,true);
  }
  async measureDevice(d,now){
    const measured=await this.getNumeric(d.measuredW,1);
    return fresh(measured,now,120000)?Math.max(0,measured.value):null;
  }
  async planConsumers(now,d){
    let budget=d.control.ready&&this.consumers.master?d.control.availableW:0;
    // Wenn ein bereits vom Adapter angesteuerter Verbraucher seine Istleistung
    // aktuell meldet, ist diese bereits im Netzbezug enthalten. Sie wird für
    // die Neuverteilung einmal zurückgerechnet (kein doppeltes Abziehen).
    const measured={};
    for(const device of this.consumers.devices){
      measured[device.id]=await this.measureDevice(device,now);
      if(this.activeHardware[device.id] && measured[device.id]!==null && d.control.ready)
        budget+=Math.min(device.maxW,measured[device.id]);
    }
    budget=Math.max(0,budget);
    const sorted=[...this.consumers.devices].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
    const plan=[];let count=0;
    for(const device of sorted){
      const wanted=device.mode==='on'||device.mode==='auto'&&device.requested;
      let allow=false,targetW=0,reason='';
      if(!this.consumers.master)reason='Prioritätensteuerung AUS';
      else if(!device.enabled)reason='Verbraucher deaktiviert';
      else if(device.mode==='off'||!wanted)reason='Keine Anforderung';
      else if(!d.control.ready)reason='Messdaten unvollständig';
      else if(count>=this.consumers.maxParallel)reason='Maximalzahl gleichzeitiger Freigaben erreicht';
      else{
        const qty=device.type==='variable'?Math.min(device.maxW,Math.floor(budget/100)*100):device.maxW;
        if(qty>=device.minW){
          const last=this.lastOff[device.id]||0;
          if(!this.activeHardware[device.id]&&last&&now-last<device.minOffSec*1000)reason='Wiedereinschaltsperre';
          else {allow=true;targetW=qty;budget=Math.max(0,budget-qty);count++;reason='Freigegeben nach Priorität'}
        }else reason='Leistungsbudget zu klein';
      }
      await this.set('consumers.'+device.id+'.allow',allow);
      await this.set('consumers.'+device.id+'.targetW',targetW);
      await this.set('consumers.'+device.id+'.requested',wanted);
      await this.set('consumers.'+device.id+'.priority',device.priority);
      await this.set('consumers.'+device.id+'.name',device.name);
      await this.set('consumers.'+device.id+'.status',reason);
      plan.push({id:device.id,name:device.name,priority:device.priority,allow,targetW,reason,measuredW:measured[device.id]});
    }
    await this.set('control.summary',plan);
    return plan;
  }
  async validateWritable(id,type){
    if(!id||id.startsWith('system.')||id.startsWith(this.namespace+'.')||id.startsWith('0_userdata.0.Netzentgelt2027.'))throw Error('Unzulässiger Ausgang: '+id);
    const obj=await this.getForeignObjectAsync(id);
    if(obj?.type!=='state'||obj.common?.write!==true||obj.common?.type!==type)throw Error('Ungültiger '+type+'-Schreibdatenpunkt: '+id);
    return obj;
  }
  async sendIfChanged(id,val){
    const state=await this.getForeignStateAsync(id);
    if(state?.val===val)return;
    await this.setForeignStateAsync(id,{val,ack:false});
  }
  async deactivate(previous,reason='Keine Freigabe'){
    try{
      await this.validateWritable(previous.enableId,'boolean');
      await this.sendIfChanged(previous.enableId,!previous.enableOn);
    }catch(e){this.log.error('Aktor konnte nicht sicher abgeschaltet werden: '+e.message)}
    delete this.activeHardware[previous.id];this.lastOff[previous.id]=unix();
    await this.set('consumers.'+previous.id+'.hardwareStatus',reason).catch(()=>{});
  }
  async driveHardware(now,report,plan){
    const possible=this.hardwareMaster&&this.consumers.master&&report.control.ready;
    const current=new Set();
    for(const item of plan){
      const device=this.consumers.devices.find(x=>x.id===item.id);if(!device)continue;
      const out=device.output,old=this.activeHardware[item.id];
      const armed=out.armed&&out.enableId;
      if(!armed){await this.set('consumers.'+device.id+'.hardwareStatus','Nicht zugeordnet oder nicht aktiviert');continue}
      let enabled=possible&&device.enabled&&item.allow;
      let target=0,reason='';
      try{
        await this.validateWritable(out.enableId,'boolean');
        if(device.type==='variable'){
          if(!out.powerId)throw Error('Für regelbare Verbraucher fehlt der Sollwert-Datenpunkt');
          const meta=await this.validateWritable(out.powerId,'number');
          if(meta.common?.unit && meta.common.unit!==out.powerUnit)throw Error('Sollwert-Einheit passt nicht zum Datenpunkt');
          if(!device.measuredW)throw Error('Für physische Regelung fehlt die Istleistungs-Rückmeldung');
          if(item.measuredW===null)throw Error('Istleistung veraltet oder nicht vorhanden');
          const min=out.minA*out.voltage*out.phases;
          const max=out.maxA*out.voltage*out.phases;
          const granted=Math.min(max,item.targetW);
          if(granted<min)enabled=false;
          target=out.powerUnit==='A'?Math.floor(granted/out.voltage/out.phases):Math.floor(granted/100)*100;
          target=Math.min(out.maxA,out.powerUnit==='A'?target:out.maxA*out.voltage*out.phases);
          if(out.powerUnit==='A'&&target<out.minA)enabled=false;
          if(!enabled)target=0;
        }else if(item.measuredW===null){
          // Ein/Aus-Verbraucher ohne Messung können zwar virtuell freigegeben,
          // aber nicht sicher dynamisch begrenzt werden.
          throw Error('Istleistungs-Datenpunkt fehlt oder liefert keine aktuellen Werte');
        }
        if(enabled){
          if(old&&old.enableId!==out.enableId)await this.deactivate(old,'Ausgangszuordnung geändert');
          if(out.powerId&&device.type==='variable')await this.sendIfChanged(out.powerId,target);
          await this.sendIfChanged(out.enableId,out.enableOn);
          this.activeHardware[item.id]={id:item.id,enableId:out.enableId,enableOn:out.enableOn,targetW:item.targetW};
          current.add(item.id);reason='Ansteuerung aktiv';
        }else{
          if(old){await this.deactivate(old,'Freigabe entzogen');}
          reason=!this.hardwareMaster?'Hardware-Master AUS':!report.control.ready?'Messdaten nicht gültig':'Keine Freigabe';
        }
      }catch(e){reason='Nicht angesteuert: '+e.message;if(old)await this.deactivate(old,reason);}
      await this.set('consumers.'+item.id+'.hardwareStatus',reason);
    }
    for(const [id,old]of Object.entries({...this.activeHardware})){
      if(!current.has(id))await this.deactivate(old,'Nicht mehr aktiv / Konfiguration geändert');
    }
    await this.set('control.hardwareReady',possible);
  }
  async prepareFreeLogicOutputs(){
    for(const logic of this.freeLogics?.logics||[]){
      for(const b of logic.blocks){
        if(b.op!=='virtual'||!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(b.virtualKey||''))continue;
        const id='logicVirtual.'+logic.id+'_'+b.virtualKey;
        if(await this.getObjectAsync(id))continue;
        const type=b.valueType==='boolean'?'boolean':'number';
        const initial=typeof b.value===type?b.value:(type==='boolean'?false:0);
        await this.state(id,logic.name+' – '+(b.name||b.virtualKey),type,initial,true);
      }
    }
    for(const logic of this.freeLogics?.logics||[]){
      for(const b of logic.blocks){
        if(b.op!=='output'||b.createNew!==true)continue;
        const key=b.outputKey;
        if(!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key||''))continue;
        const id='logicOutputs.'+logic.id+'_'+key;
        const existing=await this.getObjectAsync(id);
        if(existing)continue;
        await this.state(id,logic.name+' – '+(b.name||key),b.outputType==='boolean'?'boolean':'number',b.outputType==='boolean'?false:0,false);
      }
    }
  }
  async tick(){
    if(this.running||this.migrating||this.dataBusy||!this.engine)return;
    this.running=true;const now=unix();let utilitiesSampled=false;
    this.refreshForecast().catch(e=>this.log.warn('PV-Prognose: '+e.message));
    try{
      const measured=await this.readMeasures();
      try{const ids=[...new Set((this.freeLogics?.logics||[]).flatMap(l=>l.blocks.filter(b=>b.op==='input'&&b.stateId).map(b=>b.stateId)))];const entries=await Promise.all(ids.map(async id=>[id,await this.getForeignStateAsync(id).catch(()=>null)]));const inputs=Object.fromEntries(entries);const virtualIds=[...new Set((this.freeLogics?.logics||[]).flatMap(l=>l.blocks.filter(b=>b.op==='virtual'&&b.virtualKey).map(b=>['virtual:'+l.id+':'+b.virtualKey,'logicVirtual.'+l.id+'_'+b.virtualKey])))];const virtualValues=Object.fromEntries(await Promise.all(virtualIds.map(async ([key,id])=>[key,(await this.getStateAsync(id).catch(()=>null))?.val??null])));const evaluated=FreeLogic.evaluate(this.freeLogics||{logics:[]},id=>id.startsWith('virtual:')?virtualValues[id]:inputs[id]?.val??null);
        await applyForeignOutputs(this.freeLogics||{logics:[]},evaluated,{
          getObject:id=>this.getForeignObjectAsync(id),
          getState:id=>this.getForeignStateAsync(id),
          setState:(id,val)=>this.setForeignStateAsync(id,{val,ack:false}),
          lastWrites:this.freeLogicWriteTimes
        });
        evaluated.ts=Date.now();
        for(const row of evaluated.logics){
          if(!row.enabled||row.errors.length)continue;
          for(const out of row.outputs){
            if(!out.createNew||!out.outputKey||!(typeof out.value==='boolean'||typeof out.value==='number'&&Number.isFinite(out.value)))continue;
            const id='logicOutputs.'+row.id+'_'+out.outputKey;
            const obj=await this.getObjectAsync(id);
            if(!obj||obj.common?.type!==typeof out.value){out.writeStatus='Eigener Ausgang fehlt oder Datentyp passt nicht';continue;}
            const key='own|'+row.id+'|'+out.id+'|'+id;
            const last=this.freeLogicWriteTimes.get(key);
            const cycleMs=out.cycleSeconds*1000;
            const due=out.cyclicWrite===true&&(!Number.isFinite(last)||Date.now()-last>=cycleMs);
            const changed=this.lastStatus[id]!==out.value;
            if(due||changed){
              await this.set(id,out.value,due);
              this.freeLogicWriteTimes.set(key,Date.now());
              out.writeStatus=due?'Eigener Ausgang zyklisch aktualisiert ('+out.cycleSeconds+' s)':'Eigener Ausgang aktualisiert';
            }else out.writeStatus=out.cyclicWrite?'Eigener Ausgang: zyklisch '+out.cycleSeconds+' s':'Eigener Ausgang: Wert unverändert';
          }
        }
        await this.set('live.freeLogics_JSON',evaluated,true);
       }catch(e){this.log.warn('Freie Logiken: '+e.message)}
       try{
        const ids=[...new Set((this.batteries?.batteries||[]).filter(b=>b.enabled).flatMap(b=>Object.values(b.sources)).filter(Boolean))];
        const entries=await Promise.all(ids.map(async id=>{try{return [id,await this.getForeignStateAsync(id)]}catch{return [id,null]}}));
        const rows=readBatteryMeasurements(this.batteries,Object.fromEntries(entries),now);
        await this.set('live.batteries_JSON',{ts:now,batteries:rows},true);
       }catch(e){this.log.warn('Batterie-Messwerte: '+e.message)}
      const signature=JSON.stringify([this.sources.importKWh,this.sources.exportKWh]);
      const report=this.engine.sample(now,measured,this.settings,signature);
      await this.updateReport(now,measured,report);
      await this.updateEnergySummary(now,measured,report);
      if(this.utilities){if(!this.utilities.features.heating)await this.utilities.disableHiddenHeating();await this.utilities.tick(now);utilitiesSampled=true;}
      if(this.heating&&!this.restoreHold)await this.heating.tick(now,report.live);
      const plan=await this.planConsumers(now,report);
      if(!this.restoreHold)await this.driveHardware(now,report,plan);
      const deviceMeasures=Object.fromEntries(plan.map(x=>[x.id,x.measuredW]));
      const energyStatus=this.consumerEnergy.sample(now,this.consumers.devices,deviceMeasures);
      await this.set('analytics.status_JSON',energyStatus,true);
      const houseSignature=JSON.stringify([this.sources.houseW,this.sources.pv,this.sources.importW,this.sources.exportW,this.sources.batteryW,report.houseSource]);
      if(this.dayComparison)await this.set('analytics.dayComparison_JSON',this.dayComparison.sample(now,report.live,this.consumers.devices,deviceMeasures,{houseSignature,consumerArchive:this.consumerEnergy.archive()}),true);
      const insight=this.insights.sample(now,report.live,this.consumers.devices,deviceMeasures,this.settings,{
        sources:this.sources,hasBattery:!!this.sources.batteryW.id,
        houseQuality:report.houseSource,houseSignature,maxParallel:this.consumers.maxParallel
      });
      await this.set('insights.advice',insight.advice,true);
      await this.set('insights.message',insight.advice.summary);
      if(insight.archiveDue){
        await this.set('history.power',this.insights.history,true);
        await this.set('analytics.consumerDays_JSON',this.consumerEnergy.archive(),true);
      }
      this.monitorGoodSince=report.dataOk?(this.monitorGoodSince||now):0;
      if(now-this.lastSave>60000||report.completed){
        await this.set('internal.runtime',this.engine.r,true);
        if(this.energySummary)await this.set('internal.energySummary',this.energySummary.runtime(),true);
        if(this.dayComparison)await this.set('internal.dayComparison',this.dayComparison.runtime(),true);
        await this.set('internal.hardware',this.activeHardware,true);
        this.lastSave=now;
      }
      this.runCount++;
      if(this.storage&&!this.restoreHold)await this.storage.tick(now);
      if(await this.read('commands.cleanupLegacy',false)===true){
        try{
          await cleanupLegacy(this);
          await this.set('commands.cleanupLegacy',false,true);
          await this.set('migration.cleanupStatus','Alte Skripte und Datenpunkte erfolgreich entfernt',true);
        }catch(e){
          // Fehlende neue Viertelstunden und eine laufende Sicherheitsprüfung
          // sind erwartete Wartezustände – der Löschauftrag bleibt gespeichert.
          await this.set('migration.cleanupStatus','Wartet auf Freigabe: '+e.message);
        }
      }
    }catch(e){
      if(this.utilities&&!utilitiesSampled)await this.utilities.tick(now).catch(()=>{});
      if(this.heating&&!this.restoreHold)await this.heating.tick(now,{importW:null,exportW:null,batteryW:null}).catch(()=>{});
      if(this.insights)this.insights.reset();
      if(this.dayComparison){this.dayComparison.reset?.();await this.set('analytics.dayComparison_JSON',{version:1,updatedAt:now,status:'error',message:'Tagesvergleich derzeit unterbrochen. Messdaten werden erneut geprüft.',house:null,rows:[],increases:[]},true).catch(()=>{});}
      await this.updateEnergySummary(now,{}, {live:{importW:null,exportW:null,pvW:null,houseW:null,batteryW:null}}).catch(()=>{});
      await this.set('insights.advice',{version:1,updatedAt:now,valid:false,stable:false,mode:'advisory',summary:'Auswertung unterbrochen – keine Startempfehlung.',recommendations:[]},true).catch(()=>{});
      await this.set('insights.message','Auswertung unterbrochen – keine Startempfehlung.',true).catch(()=>{});
      await this.set('status.dataOk',false).catch(()=>{});
      await this.set('status.lastError',String(e.message||e));
      this.log.warn('Auswertung: '+e.stack);
      // Bei unerwarteter Ausnahme müssen zuvor aktivierte Hardwareausgänge AUS.
      if(!this.restoreHold)for(const x of Object.values({...this.activeHardware}))await this.deactivate(x,'Fehler – Schutzabschaltung');
      await this.set('internal.hardware',this.activeHardware,true).catch(()=>{});
    }finally{this.running=false;}
  }
  async onStateChange(id,state){
    if(!state||state.ack)return;
    const suffix=id.slice(this.namespace.length+1);
    if(this.dataBusy||this.restoreHold){
      const current={'config.sources':this.sources,'config.batteries_JSON':this.batteries,'config.consumers':this.consumers,'config.settings':this.settings,'config.hardwareMaster':this.hardwareMaster,'config.forecast':this.forecast?.config,'config.heating':this.heating?.config,'config.features_JSON':this.utilities?.features,'config.utilities_JSON':this.utilities?.config,'config.energySummary_JSON':this.energySummaryConfig,'config.storage_JSON':this.storage?.config};
      const previous=current[suffix]??this.lastStatus[suffix];
      if(previous!==undefined)await this.set(suffix,previous,true);
      else if(suffix.startsWith('commands.'))await this.set(suffix,false,true);
      this.log.warn('Änderung während Sicherung oder ausstehender Rückstellung abgewiesen: '+suffix);return;
    }
    this.configActive++;
    try{
      if(suffix==='commands.heatingResetLearning'){
        if(typeof state.val!=='boolean')throw Error('Lernreset muss Boolean sein.');
        await this.set(suffix,false,true);
        if(state.val===true&&this.heating)await this.heating.resetLearning();
        return;
      }
      if(suffix==='commands.forecastRefresh'){
        if(typeof state.val!=='boolean')throw Error('Prognose-Aktualisierung muss Boolean sein');
        await this.set(suffix,false,true);
        if(state.val===true)await this.refreshForecast(true);
        return;
      }
      if(suffix==='commands.importLegacy' && state.val===true){
        this.migrating=true;
        try{await importLegacy(this);await this.reloadConfig();}
        finally{this.migrating=false;}
        await this.set('commands.importLegacy',false,true);return;
      }
      if(suffix==='commands.cleanupLegacy'&&state.val===true){
        await this.set('commands.cleanupLegacy',true,true);
        await this.set('migration.cleanupStatus','Bereinigung vorgemerkt; startet erst nach erfolgreicher Prüfung');
        return;
      }
      if(suffix.startsWith('config.')){
        if(suffix==='config.storage_JSON'){
          if(!this.storage)throw Error('Datenspeicherung noch nicht bereit.');
          try{await this.storage.configure(asJSON(state.val,null));}catch(error){await this.set(suffix,this.storage.config,true);throw error;}return;
        }
        if(suffix==='config.features_JSON'||suffix==='config.utilities_JSON'){
          if(!this.utilities)throw Error('Verbrauchsbereiche noch nicht bereit.');
          try{if(suffix==='config.features_JSON')await this.utilities.configureFeatures(asJSON(state.val,null));else await this.utilities.configure({config:asJSON(state.val,null)});}
          catch(e){await this.set(suffix,suffix==='config.features_JSON'?this.utilities.features:this.utilities.config,true);await this.set('utilities.error',e.message);throw e;}
          return;
        }
        if(suffix==='config.energySummary_JSON'){
          try{this.energySummaryConfig=normalizeEnergySummaryConfig(asJSON(state.val,null));}
          catch(e){await this.set(suffix,this.energySummaryConfig||{monthlyPvTargetKWh:0},true);throw e;}
          await this.set(suffix,this.energySummaryConfig,true);return;
        }
        // Beim Eintragen von neuen Quellen die alte Konfiguration nicht überschreiben.
        if(suffix==='config.heating'){
          if(!this.heating)throw Error('Heizungsmodul noch nicht bereit.');
          try{const config=asJSON(state.val,null);if(config?.enabled&&!this.utilities?.heatingAllowed())throw Error('Heizung & Gebäudepuffer zuerst unter Einstellungen freischalten.');await this.heating.configure(config);}
          catch(e){await this.set('config.heating',this.heating.config,true);await this.set('heating.error',e.message);throw e;}
          return;
        }
        if(suffix==='config.forecast'){
          const normalized=normalizeForecast(asJSON(state.val,null));
          await this.set(suffix,JSON.stringify(normalized),true);
          await this.reloadConfig();return;
        }
        if(suffix==='config.freeLogics_JSON'){const candidate=FreeLogic.validate(asJSON(state.val,null));this.freeLogics=candidate;await this.prepareFreeLogicOutputs();await this.set(suffix,candidate,true);return;}
        if(suffix==='config.batteries_JSON'){
          const candidate=normalizeBatteryConfig(asJSON(state.val,null));
          await this.set(suffix,candidate,true);
          this.batteries=candidate;return;
        }
        if(suffix==='config.sources'){const candidate=normalizeSources(asJSON(state.val,null));this.heating?.validateConflicts(this.heating.config,this.consumers,candidate);}
        if(suffix==='config.consumers'){const candidate=normalizeConsumers(asJSON(state.val,null),this.config.maxConsumers||250);this.heating?.validateConflicts(this.heating.config,candidate,this.sources);}
        if(suffix==='config.settings')normalizeSettings(asJSON(state.val,null),this.config);
        if(suffix==='config.hardwareMaster'&&typeof state.val!=='boolean')throw Error('Hardware-Master muss boolean sein');
        await this.set(suffix,state.val,true);
        await this.reloadConfig();
      }
    }catch(e){
      this.log.error('Ungültige Konfiguration / Aktion: '+e.message);
      await this.set('status.lastError',e.message);
      if(suffix==='commands.cleanupLegacy'||suffix==='commands.importLegacy')await this.set(suffix,false,true);
    }finally{this.configActive--;}
  }
  async onUnload(callback){
    try{
      this.stopping=true;
      if(this.versionTimer)this.clearInterval(this.versionTimer);
      if(this.versionCheck)await this.versionCheck.close();
      if(this.storage)await this.storage.close();
      this.forecast?.close();
      if(this.heating)await this.heating.close();
      if(this.timer)clearInterval(this.timer);
      // Aktive Ausgänge nach Beenden der Steuerung ausschalten.
      if(!this.restoreHold)for(const a of Object.values({...this.activeHardware}))await this.deactivate(a,'Adapter gestoppt');
      if(this.engine)await this.set('internal.runtime',this.engine.r,true);
      if(this.energySummary)await this.set('internal.energySummary',this.energySummary.runtime(),true);
      if(this.dayComparison)await this.set('internal.dayComparison',this.dayComparison.runtime(),true);
      if(this.insights)await this.set('history.power',this.insights.history,true);
      if(this.consumerEnergy)await this.set('analytics.consumerDays_JSON',this.consumerEnergy.archive(),true);
      if(this.utilities)await this.utilities.close();
      await this.set('internal.hardware',this.activeHardware,true);
      await this.set('status.running',false);
    }catch(e){this.log.warn('Beim Beenden: '+e.message)}finally{callback();}
  }
}
if(require.main===module) new Energiemanagement();
else module.exports=options=>new Energiemanagement(options);
