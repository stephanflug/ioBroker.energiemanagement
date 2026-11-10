'use strict';
const {isCelsiusUnit}=require('./heating-units');
// Writes only explicitly armed manufacturer controls; never discovers or switches a compressor.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_][\w.:-]{1,254}$/.test(id);
const MINUTE=60000,ACK_TIMEOUT=30000,MANUAL_HOLD=30*MINUTE;
class HeatingOutputs {
 constructor(adapter,runtime={}){
  this.adapter=adapter;this.source='system.adapter.'+adapter.namespace;this.owned={};this.holds={};this.queue=Promise.resolve();
  for(const [id,r]of Object.entries(runtime?.owned||{}))if(validId(id)&&r?.owner===this.source&&r.id===id&&['pump','circuit'].includes(r.kind)&&typeof r.lastValue===(r.kind==='pump'?'boolean':'number')&&(r.kind==='pump'?typeof r.baseline==='boolean':finite(r.baseline)&&finite(r.lastValue)))this.owned[id]=clone(r);
  for(const [id,until]of Object.entries(runtime?.holds||{}))if(validId(id)&&finite(until))this.holds[id]=until;
 }
 runtime(){return {version:1,owned:clone(this.owned),holds:clone(this.holds)};}
 serial(fn){const next=this.queue.catch(()=>{}).then(fn);this.queue=next;return next;}
 report(now,status){return {ts:now,status,outputs:[],errors:[]};}
 row(report,id,status,value){report.outputs.push({id,status,...(value===undefined?{}:{value})});}
 error(report,id,error){const message=String(error?.message||error);report.errors.push({id,message});this.row(report,id,'Nicht angesteuert: '+message);}
 blockedId(id){return !validId(id)||id.startsWith('system.')||id.startsWith(this.adapter.namespace+'.')||id.startsWith('alias.');}
 async metadata(id,kind){
  if(this.blockedId(id))throw Error('Unzulässiger Ausgang; einen direkten Geräte-Datenpunkt verwenden.');
  const obj=await this.adapter.getForeignObjectAsync(id),type=kind==='pump'?'boolean':'number';
  if(obj?.type!=='state'||obj.common?.type!==type||obj.common?.write!==true||obj.common?.read!==true||obj.common?.alias)throw Error('Ausgang muss ein direkt les- und schreibbarer '+type+'-Datenpunkt sein.');
  if(kind==='circuit'&&!isCelsiusUnit(obj.common.unit))throw Error('Heizkreis-Sollwert muss in °C vorliegen.');
  return obj;
 }
 bounds(spec,obj){
  if(!finite(spec.minC)||!finite(spec.maxC)||spec.minC>spec.maxC||spec.minC<5||spec.maxC>60)throw Error('Sollwertgrenzen sind ungültig.');
  const min=Math.max(spec.minC,finite(obj.common.min)?obj.common.min:spec.minC),max=Math.min(spec.maxC,finite(obj.common.max)?obj.common.max:spec.maxC);
  if(min>max)throw Error('Heizkreis- und Geräte-Grenzen überschneiden sich nicht.');return {minC:min,maxC:max};
 }
 async read(id,kind){
  const s=await this.adapter.getForeignStateAsync(id);if(!s||(s.q!==undefined&&s.q!==0)||typeof s.val!==(kind==='pump'?'boolean':'number')||(kind==='circuit'&&!finite(s.val)))throw Error('Aktueller Ausgangswert ist nicht verfügbar.');return s;
 }
 expectedSource(id){const parts=id.split('.');return parts.length>=2?'system.adapter.'+parts[0]+'.'+parts[1]:'';}
 abandon(record,now,report){delete this.owned[record.id];this.holds[record.id]=now+MANUAL_HOLD;this.row(report,record.id,'Manuelle Änderung erkannt – 30 Minuten keine Ansteuerung.');}
 observe(record,state,now,report){
  const acceptable=record.pending?[this.source,record.ackFrom,record.priorFrom,this.expectedSource(record.id)].filter(Boolean):[record.ackFrom||this.source];
  if(state.val!==record.lastValue||!state.from||!acceptable.includes(state.from)||!record.pending&&state.ack!==true){
   this.abandon(record,now,report);return false;
  }
  if(record.pending&&state.ack===true&&state.from!==this.source&&finite(state.ts)&&state.ts>=record.sentAt-15000&&state.ts<=now+15000){record.pending=false;record.ackFrom=state.from;}
  if(record.pending&&now-record.sentAt>=ACK_TIMEOUT){record.timedOut=true;this.error(report,record.id,Error(record.releasing?'Rückstellung seit 30 Sekunden unbestätigt.':'Befehl seit 30 Sekunden unbestätigt; keine weiteren Änderungen.'));}
  if(record.releasing&&!record.pending){delete this.owned[record.id];this.row(report,record.id,'Ursprünglicher Wert bestätigt wiederhergestellt.',state.val);return false;}
  return true;
 }
 async send(record,value,now,obj,releasing=false){
  const previous=clone(record);record.lastValue=value;record.sentAt=now;record.pending=true;record.ackFrom=null;record.releasing=releasing;
  try{await this.adapter.setForeignStateAsync(record.id,{val:value,ack:false});delete record.writeOutcome;}
  catch(error){
   // A transport failure does not prove that the command was not stored.
   record.writeOutcome='uncertain';
   try{
    const state=await this.read(record.id,record.kind),trusted=[this.source,previous.ackFrom,previous.priorFrom,this.expectedSource(record.id)].filter(Boolean);
    if(state.val===value&&trusted.includes(state.from)){record.writeOutcome='possibly-applied';}
    else if(state.val===previous.lastValue&&trusted.includes(state.from)){
     for(const key of Object.keys(record))delete record[key];Object.assign(record,previous,{writeOutcome:'not-applied'});
    }else {delete this.owned[record.id];this.holds[record.id]=now+MANUAL_HOLD;}
   }catch{} // Keep the attempted command pending until its state can be reconciled.
   throw error;
  }
 }
 async restore(record,reason,now,report,spec){
  try{
   const obj=await this.metadata(record.id,record.kind),state=await this.read(record.id,record.kind);
   if(!this.observe(record,state,now,report))return;
   if(record.releasing)return;
   let baseline=record.baseline;
   if(record.kind==='circuit'){const limits=this.bounds(spec||record.bounds,obj);baseline=Math.max(limits.minC,Math.min(limits.maxC,baseline));}
   if(state.val===baseline){delete this.owned[record.id];this.row(report,record.id,'Ursprünglicher Wert bereits aktiv.');return;}
   await this.send(record,baseline,now,obj,true);
   this.row(report,record.id,'Rückstellung angefordert: '+reason,baseline);
  }catch(error){this.error(report,record.id,error);}
 }
 async pump(now,config,status,report){
  const spec=config.pump,id=spec.lockId;
  try{
   const obj=await this.metadata(id,'pump'),state=await this.read(id,'pump');let record=this.owned[id];
   if(record&&!this.observe(record,state,now,report))record=null;
   if(this.holds[id]>now){this.row(report,id,'Manuelle Sperrzeit aktiv.');return;}
   if(record?.releasing)return;
   if(status.pumpLock!==true){if(record)await this.restore(record,'Heizfreigabe / Schutzbedingung',now,report);else this.row(report,id,'Keine eigene Wärmepumpensperre aktiv.');return;}
   const feedback=spec.statusId?await this.adapter.getForeignStateAsync(spec.statusId):null;
   const age=now-Number(feedback?.ts),maxAge=Math.min(7200,Math.max(60,Number(config.sensorMaxAgeSec)||1800))*1000;
   if(typeof feedback?.val!=='boolean'||feedback.ack!==true||(feedback.q!==undefined&&feedback.q!==0)||!finite(feedback.ts)||age>maxAge||age< -15000){if(record)await this.restore(record,'Betriebsrückmeldung fehlt',now,report);throw Error('Aktuelle bestätigte Wärmepumpen-Betriebsrückmeldung fehlt.');}
   const target=spec.lockOn!==false;
   if(record&&record.lockValue!==undefined&&record.lockValue!==target){await this.restore(record,'Sperrpolarität geändert',now,report);return;}
   if(record){if(record.pending||record.timedOut){this.row(report,id,'Wärmepumpensperre wartet auf Bestätigung.');return;}this.row(report,id,'Eigene Wärmepumpensperre bestätigt aktiv.',state.val);return;}
   if(state.ack!==true||!state.from)throw Error('Sperrausgang ist nicht bestätigt oder seine Herkunft fehlt.');
   if(state.val===target){this.row(report,id,'Bereits extern gesperrt – wird nicht übernommen oder entsperrt.');return;}
   record={id,kind:'pump',lockValue:target,owner:this.source,baseline:state.val,lastValue:state.val,priorFrom:state.from,pending:false,sentAt:now};this.owned[id]=record;
   try{await this.send(record,target,now,obj)}catch(error){if(record.writeOutcome==='not-applied')delete this.owned[id];throw error;}
   this.row(report,id,'Wärmepumpensperre angefordert, noch nicht bestätigt.',target);
  }catch(error){this.error(report,id,error);}
 }
 async circuit(now,spec,plan,status,report){
  const id=spec.setpointId,target=plan?.targetC;
  try{
   const obj=await this.metadata(id,'circuit'),limits=this.bounds(spec,obj),state=await this.read(id,'circuit');let record=this.owned[id];
   if(record&&!this.observe(record,state,now,report))record=null;
   if(this.holds[id]>now){this.row(report,id,'Manuelle Sperrzeit aktiv.');return;}
   if(record?.releasing)return;
   if(!finite(target)||finite(plan?.boostC)&&plan.boostC>0&&status.pv?.hardwareAllowed!==true){if(record)await this.restore(record,'Kein gültiger Heizkreis-Sollwert',now,report,spec);else this.row(report,id,'Kein gültiger Heizkreis-Sollwert.');return;}
   if(record?.pending||record?.timedOut){this.row(report,id,'Sollwert wartet auf Bestätigung.');return;}
   if(state.ack!==true||!state.from)throw Error('Aktueller Sollwert ist nicht bestätigt oder seine Herkunft fehlt.');
   if(!record&&(state.val<limits.minC||state.val>limits.maxC))throw Error('Aktueller Sollwert liegt außerhalb der konfigurierten Raum-Sollwertgrenzen. Zuordnung prüfen.');
   const step=spec.stepC;if(!finite(step)||step<0.1||step>2)throw Error('Sollwert-Schrittweite ist ungültig.');
   const goal=Math.max(limits.minC,Math.min(limits.maxC,Math.round(target/step)*step));
   if(Math.abs(goal-state.val)<0.001){this.row(report,id,'Sollwert entspricht bereits der Empfehlung.',state.val);return;}
   if(record&&now-record.sentAt<5*MINUTE){this.row(report,id,'Sollwert-Wartezeit (fünf Minuten).');return;}
   const next=goal>state.val?Math.min(goal,Math.floor((state.val+0.500001)/step)*step):Math.max(goal,Math.ceil((state.val-0.500001)/step)*step);
   const value=Number(next.toFixed(3));
   if(value<limits.minC||value>limits.maxC||Math.abs(value-state.val)>0.50001||(goal-state.val)*(value-state.val)<=0){this.row(report,id,'Kein zulässiger Schritt innerhalb von 0,5 °C erreichbar.');return;}
   const isNew=!record;
   record ||= {id,kind:'circuit',owner:this.source,baseline:state.val,lastValue:state.val,priorFrom:state.from,pending:false,sentAt:0};record.bounds=limits;this.owned[id]=record;
   try{await this.send(record,value,now,obj)}catch(error){if(isNew&&record.writeOutcome==='not-applied')delete this.owned[id];throw error;}
   this.row(report,id,'Sollwertänderung angefordert, noch nicht bestätigt.',value);
  }catch(error){this.error(report,id,error);}
 }
 apply(now,config,status){return this.serial(()=>this.applyInner(now,config,status));}
 async applyInner(now,config={},status={}){
  const report=this.report(now,'Beobachtungsbetrieb – keine Geräteansteuerung.');
  for(const [id,until]of Object.entries(this.holds))if(until<=now)delete this.holds[id];
  const gate=config.enabled===true&&config.hardwareEnabled===true&&config.mode==='auto'&&status.hardwareAllowed===true&&finite(status.ts)&&now-status.ts>=-15000&&now-status.ts<=90000;
  const specs=(Array.isArray(config.circuits)?config.circuits:[]).filter(c=>c?.armed&&c.setpointId),pump=config.pump?.armed&&config.pump.lockId?config.pump:null;
  const targets=[...(pump?[pump.lockId]:[]),...specs.map(c=>c.setpointId)],inputs=new Set([config.outdoorId,config.pump?.statusId,config.pump?.powerId,config.pv?.floorId,...(Array.isArray(config.rooms)?config.rooms:[]).map(r=>r?.stateId)].filter(Boolean));
  const conflict=new Set(targets).size!==targets.length||targets.some(id=>inputs.has(id));
  const desired=new Set(gate&&!conflict?targets:[]),byId=new Map(specs.map(c=>[c.setpointId,c])),kinds=new Map([...(pump?[[pump.lockId,'pump']]:[]),...specs.map(c=>[c.setpointId,'circuit'])]);
  for(const record of Object.values({...this.owned}))if(record.releasing||!desired.has(record.id)||kinds.get(record.id)!==record.kind)await this.restore(record,!gate?'Freigabe fehlt oder Messung ungültig':'Ausgangszuordnung geändert',now,report,byId.get(record.id));
  if(conflict){report.status='Ausgangskonflikt – keine neue Ansteuerung.';this.error(report,'config',Error('Ausgänge dürfen weder doppelt zugewiesen noch als Eingangsfühler verwendet werden.'));return report;}
  if(Object.values(this.owned).some(record=>record.releasing||!desired.has(record.id)||kinds.get(record.id)!==record.kind)){report.status='Rückstellung eigener Ausgänge noch nicht bestätigt – keine neue Übernahme.';return report;}
  if(!gate)return report;
  report.status='Automatik freigegeben; Gerätebestätigung wird überwacht.';
  if(pump)await this.pump(now,config,status,report);
  const plans=new Map((status.circuits||[]).map(c=>[c.id,c]));
  for(const spec of specs)await this.circuit(now,spec,plans.get(spec.id),status,report);
  if(report.errors.length)report.status='Ansteuerung teilweise blockiert – Gründe prüfen.';
  return report;
 }
 release(reason='Modul beendet',now=Date.now()){return this.serial(async()=>{const report=this.report(now,'Eigene Eingriffe werden zurückgenommen.');for(const record of Object.values({...this.owned}))await this.restore(record,reason,now,report);return report;});}
}
module.exports={HeatingOutputs};
