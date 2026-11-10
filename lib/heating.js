'use strict';
// Optional supervisory logic only. No actuator writes or electrical power switching.
const MIN=60000,HOUR=3600000;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const stateId=v=>typeof v==='string'&&v.length<=255&&(!v||/^[a-zA-Z0-9_][\w.:-]*$/.test(v));
const copy=v=>JSON.parse(JSON.stringify(v));
function defaultHeating(){return {
 enabled:false,hardwareEnabled:false,mode:'observe',rooms:[],outdoorId:'',
 pump:{lockId:'',lockOn:true,statusId:'',powerId:'',armed:false},circuits:[],
 sensorMaxAgeSec:1800,outdoorMaxAgeSec:3600,minValidRooms:1,minCoveragePct:80,
 hysteresisC:0.4,coldRoomToleranceC:0.7,frostOutdoorC:3,minRoomC:18,
 minOnMin:30,minOffMin:20,maxLockMin:120,learningEnabled:true,
 pv:{enabled:false,minExportW:800,minCoveragePct:80,reserveW:300,heatPumpPowerW:2000,
  boostC:1,maxRoomC:23,maxFloorC:28,floorId:'',allowEstimatedFloor:false,startHour:10,endHour:16,eveningHour:18,stableMin:5}
};}
function normalizeHeating(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Heizungs-Konfiguration muss ein Objekt sein.');
 const d=defaultHeating(),out={};
 const flag=(o,k,f)=>{if(o[k]!==undefined&&typeof o[k]!=='boolean')throw Error(k+' muss Boolean sein.');return o[k]===undefined?f:o[k];};
 const number=(o,k,min,max,f)=>{const v=o[k]===undefined?f:o[k];if(!finite(v)||v<min||v>max)throw Error(k+' muss zwischen '+min+' und '+max+' liegen.');return v;};
 const id=(v,label)=>{const s=v===undefined?'':v;if(!stateId(s))throw Error('Ungültiger Datenpunkt: '+label);return s;};
 const itemId=(v,label)=>{if(typeof v!=='string'||!/^[a-z][a-z0-9_]{1,47}$/.test(v))throw Error('Ungültige '+label+'-ID.');return v;};
 const outputId=(v,label)=>{const s=id(v,label);if(s.startsWith('system.')||s.startsWith('energiemanagement.'))throw Error('Unzulässiger Heizungs-Ausgang: '+label);return s;};
 out.enabled=flag(raw,'enabled',false);out.hardwareEnabled=flag(raw,'hardwareEnabled',false);
 out.mode=raw.mode===undefined?'observe':raw.mode;if(!['observe','auto'].includes(out.mode))throw Error('Heizungsmodus ungültig.');
 if(raw.rooms!==undefined&&!Array.isArray(raw.rooms)||raw.circuits!==undefined&&!Array.isArray(raw.circuits))throw Error('Raum- oder Heizkreisliste ungültig.');
 if((raw.rooms||[]).length>100||(raw.circuits||[]).length>20)throw Error('Maximal 100 Räume und 20 Heizkreise.');
 out.rooms=(raw.rooms||[]).map((r,i)=>{if(!r||typeof r!=='object')throw Error('Raumfühler ungültig.');return {id:itemId(r.id,'Raum'),name:String(r.name||'Raum '+(i+1)).slice(0,100),stateId:id(r.stateId,'Raumfühler'),enabled:flag(r,'enabled',true),weight:number(r,'weight',0.1,100,1),targetC:number(r,'targetC',10,28,21)};});
 out.outdoorId=id(raw.outdoorId,'Außenfühler');
 const pump=raw.pump||{};out.pump={lockId:outputId(pump.lockId,'Wärmepumpensperre'),lockOn:flag(pump,'lockOn',true),statusId:id(pump.statusId,'Heizbetrieb'),powerId:id(pump.powerId,'Wärmepumpenleistung'),armed:flag(pump,'armed',false)};
 out.circuits=(raw.circuits||[]).map((c,i)=>{if(!c||typeof c!=='object')throw Error('Heizkreis ungültig.');const minC=number(c,'minC',5,60,18),maxC=number(c,'maxC',minC,65,24),baseC=number(c,'baseC',minC,maxC,21);return {id:itemId(c.id,'Heizkreis'),name:String(c.name||'Heizkreis '+(i+1)).slice(0,100),setpointId:outputId(c.setpointId,'Heizkreissollwert'),baseC,minC,maxC,stepC:number(c,'stepC',0.1,2,0.5),gain:number(c,'gain',0,5,0.5),armed:flag(c,'armed',false)};});
 for(const key of ['sensorMaxAgeSec','outdoorMaxAgeSec'])out[key]=number(raw,key,30,86400,d[key]);
 out.minValidRooms=number(raw,'minValidRooms',1,100,d.minValidRooms);out.minCoveragePct=number(raw,'minCoveragePct',50,100,d.minCoveragePct);
 for(const [key,min,max]of [['hysteresisC',0.1,2],['coldRoomToleranceC',0.1,3],['frostOutdoorC',-10,10],['minRoomC',5,24],['minOnMin',0,180],['minOffMin',0,180],['maxLockMin',5,720]])out[key]=number(raw,key,min,max,d[key]);
 out.learningEnabled=flag(raw,'learningEnabled',true);
 const p=raw.pv||{};out.pv={enabled:flag(p,'enabled',false)};
 for(const [key,min,max]of [['minExportW',0,50000],['minCoveragePct',10,100],['reserveW',0,10000],['heatPumpPowerW',100,30000],['boostC',0.1,3],['maxRoomC',18,28],['maxFloorC',20,35],['startHour',0,23],['endHour',1,24],['eveningHour',0,23],['stableMin',1,60]])out.pv[key]=number(p,key,min,max,d.pv[key]);
 if(out.pv.startHour>=out.pv.endHour)throw Error('PV-Zeitfenster muss am selben Tag enden.');
 out.pv.floorId=id(p.floorId,'Estrichfühler');out.pv.allowEstimatedFloor=flag(p,'allowEstimatedFloor',false);
 if(new Set(out.rooms.map(r=>r.id)).size!==out.rooms.length||new Set(out.circuits.map(c=>c.id)).size!==out.circuits.length)throw Error('Doppelte Raum- oder Heizkreis-ID.');
 const roomIds=out.rooms.filter(r=>r.enabled&&r.stateId).map(r=>r.stateId);if(new Set(roomIds).size!==roomIds.length)throw Error('Ein Raumfühler darf nicht mehrfach gewichtet werden.');
 const outputs=[out.pump.lockId,...out.circuits.map(c=>c.setpointId)].filter(Boolean),inputs=[...out.rooms.map(r=>r.stateId),out.outdoorId,out.pump.statusId,out.pump.powerId,out.pv.floorId].filter(Boolean);
 if(new Set(outputs).size!==outputs.length)throw Error('Heizungs-Ausgänge mehrfach zugeordnet.');if(outputs.some(x=>inputs.includes(x)))throw Error('Heizungs-Ausgänge dürfen keine Messfühler überschreiben.');
 return out;
}
function reading(values,id,now,maxAgeSec,type='number',min=-Infinity,max=Infinity){
 const x=id&&values&&own(values,id)?values[id]:null,v=x?.value,age=now-x?.ts;
 const time=finite(x?.ts)&&age>=-15000&&age<=maxAgeSec*1000;
 return time&&(type==='boolean'?typeof v==='boolean':finite(v)&&v>=min&&v<=max)?v:null;
}
const thermalFingerprint=c=>JSON.stringify([c.rooms.filter(r=>r.enabled).map(r=>[r.id,r.stateId,r.weight]),c.outdoorId,c.pump.statusId]);
class HeatingEngine {
 constructor(runtime={}){
  this.r={version:1,signature:typeof runtime.signature==='string'?runtime.signature:'',heatingRateKph:finite(runtime.heatingRateKph)?clamp(runtime.heatingRateKph,0,5):null,coolingLossPerHourK:finite(runtime.coolingLossPerHourK)?clamp(runtime.coolingLossPerHourK,0,0.3):null,heatingSamples:finite(runtime.heatingSamples)?clamp(Math.floor(runtime.heatingSamples),0,100000):0,coolingSamples:finite(runtime.coolingSamples)?clamp(Math.floor(runtime.coolingSamples),0,100000):0};
  this.config=defaultHeating();this.resetSession();
 }
 resetSession(){this.previous=null;this.learningPrevious=null;this.pumpRunning=null;this.pumpSince=0;this.locked=false;this.lockSince=0;this.lockReleased=0;this.windowUntil=0;this.windowAnchor=null;this.pvWindow=[];}
 configure(raw){const c=normalizeHeating(raw),signature=thermalFingerprint(c),changed=JSON.stringify(c)!==JSON.stringify(this.config);
  if(signature!==this.r.signature){this.r={version:1,signature,heatingRateKph:null,coolingLossPerHourK:null,heatingSamples:0,coolingSamples:0};}
  if(changed)this.resetSession();this.config=c;return copy(c);
 }
 runtime(){return copy(this.r);}
 learn(now,meanC,outdoorC,running,composition,eligible){
  const prev=this.previous,dt=prev?(now-prev.ts)/HOUR:0;
  const same=prev&&prev.composition===composition&&dt>0&&dt<=0.25;
  // Five-minute observation avoids interpreting quantized sensor updates as open windows.
  if(!same||!finite(meanC))this.windowAnchor=finite(meanC)?{ts:now,meanC}:null;
  if(this.windowAnchor&&now-this.windowAnchor.ts>=5*MIN){const hours=(now-this.windowAnchor.ts)/HOUR,drop=meanC-this.windowAnchor.meanC;if(drop< -0.5&&drop/hours< -1.8)this.windowUntil=now+30*MIN;if(now-this.windowAnchor.ts>=10*MIN)this.windowAnchor={ts:now,meanC};}
  const valid=eligible&&finite(meanC)&&finite(outdoorC)&&typeof running==='boolean'&&now>=this.windowUntil;
  const anchor=this.learningPrevious;
  if(!valid||anchor&&(anchor.composition!==composition||anchor.running!==running||now<=anchor.ts||now-anchor.ts>15*MIN))this.learningPrevious=null;
  if(valid){
   if(!this.learningPrevious)this.learningPrevious={ts:now,meanC,outdoorC,running,composition};
   else if(now-this.learningPrevious.ts>=5*MIN){
    const a=this.learningPrevious,hours=(now-a.ts)/HOUR,rate=(meanC-a.meanC)/hours,delta=(meanC+a.meanC-outdoorC-a.outdoorC)/2;
    if(Math.abs(rate)<=2.5&&Math.abs(outdoorC-a.outdoorC)<=3){
     if(!running&&rate<=0&&delta>=3){const loss=-rate/delta;if(loss<=0.3){this.r.coolingLossPerHourK=this.r.coolingLossPerHourK===null?loss:0.85*this.r.coolingLossPerHourK+0.15*loss;this.r.coolingSamples++;}}
     if(running&&rate>=0&&finite(this.r.coolingLossPerHourK)){const heating=rate+this.r.coolingLossPerHourK*Math.max(0,delta);if(heating<=5){this.r.heatingRateKph=this.r.heatingRateKph===null?heating:0.85*this.r.heatingRateKph+0.15*heating;this.r.heatingSamples++;}}
    }
    this.learningPrevious={ts:now,meanC,outdoorC,running,composition};
   }
  }
  this.previous={ts:now,meanC,outdoorC,running,composition};
 }
 sample(now,values={},live={}){
  const c=this.config;if(!finite(now))throw Error('Heizungszeitpunkt ungültig.');
  const rooms=c.rooms.map(r=>{const v=r.enabled?reading(values,r.stateId,now,c.sensorMaxAgeSec,'number',-10,50):null;return {...r,valueC:v,valid:v!==null,reason:!r.enabled?'Deaktiviert':!r.stateId?'Datenpunkt fehlt':v===null?'Messwert fehlt, ist veraltet oder unplausibel':'Aktuell'};});
  const active=rooms.filter(r=>r.enabled),validRooms=active.filter(r=>r.valid),weight=active.reduce((sum,r)=>sum+r.weight,0),validWeight=validRooms.reduce((sum,r)=>sum+r.weight,0);
  const coveragePct=weight?validWeight/weight*100:0,meanC=validWeight?validRooms.reduce((sum,r)=>sum+r.valueC*r.weight,0)/validWeight:null,targetMeanC=validWeight?validRooms.reduce((sum,r)=>sum+r.targetC*r.weight,0)/validWeight:null;
  const minC=validRooms.length?Math.min(...validRooms.map(r=>r.valueC)):null,maxC=validRooms.length?Math.max(...validRooms.map(r=>r.valueC)):null;
  const outdoorC=reading(values,c.outdoorId,now,c.outdoorMaxAgeSec,'number',-60,60);
  const running=reading(values,c.pump.statusId,now,c.sensorMaxAgeSec,'boolean');
  if(running!==this.pumpRunning){this.pumpRunning=running;this.pumpSince=now;}
  const pumpMinutes=running===null?0:Math.max(0,(now-this.pumpSince)/MIN);
  const ready=validRooms.length>=c.minValidRooms&&coveragePct>=c.minCoveragePct&&outdoorC!==null;
  const composition=validRooms.map(r=>r.id).sort().join('|');
  this.learn(now,meanC,outdoorC,running,composition,c.enabled&&c.learningEnabled&&ready);
  const windowSuspected=now<this.windowUntil,frost=outdoorC!==null&&outdoorC<=c.frostOutdoorC;
  const hardwareAllowed=c.enabled&&ready&&!windowSuspected;
  const pumpReady=hardwareAllowed&&running!==null&&!frost;
  const cold=validRooms.some(r=>r.valueC<Math.max(c.minRoomC,r.targetC-c.coldRoomToleranceC));
  const trainedCooling=c.learningEnabled&&this.r.coolingSamples>=6&&finite(this.r.coolingLossPerHourK);
  const trainedHeating=trainedCooling&&this.r.heatingSamples>=6&&finite(this.r.heatingRateKph);
  const rate=trainedHeating&&running!==null?(running?this.r.heatingRateKph:0)-this.r.coolingLossPerHourK*Math.max(0,meanC-outdoorC):null;
  const predictedAfter30MinC=ready&&rate!==null?meanC+rate*0.5:null;
  const localParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Vienna',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));const parts=Object.fromEntries(localParts.map(x=>[x.type,x.value]));const hour=Number(parts.hour)+Number(parts.minute)/60;
  const eveningHours=c.pv.eveningHour-hour;
  const predictedEveningC=ready&&trainedCooling&&eveningHours>0?outdoorC+(meanC-outdoorC)*Math.exp(-this.r.coolingLossPerHourK*eveningHours):null;
  const pv=this.pv(now,values,live,{ready:hardwareAllowed,meanC,maxC,outdoorC,running,hour});
  pv.eveningNeedC=finite(predictedEveningC)?Math.max(0,targetMeanC-predictedEveningC):null;
  pv.needed=pv.eveningNeedC===null?null:pv.eveningNeedC>0;
  if(c.pv.enabled&&pv.needed===false){
   pv.eligible=false;pv.hardwareAllowed=false;pv.boostC=0;
   pv.reason='Gebäudemodell erwartet ausreichenden Abendkomfort; keine zusätzliche Vorwärmung nötig.';
  }else if(c.pv.enabled&&pv.needed===true){
   // Approximate the room lift now that would survive passive cooling until evening.
   const survival=Math.exp(-this.r.coolingLossPerHourK*eveningHours);
   pv.boostC=Math.min(pv.boostC,pv.eveningNeedC/survival);
   if(pv.eligible)pv.reason+=' Geschätzter Abendbedarf begrenzt die Anhebung auf '+pv.boostC.toFixed(2)+' °C.';
  }else if(pv.eligible){
   pv.reason+=' Modell lernt noch oder das Abendfenster ist vorbei; begrenzte PV-Anhebung nach Grenzwerten.';
  }
  if(this.locked&&pv.hardwareAllowed){pv.hardwareAllowed=false;pv.reason='Aktive Heizpause: PV-Vorwärmung umgeht weder Mindestpause noch Hysterese.';}
  let action='observe',reason='',wantLock=false;
  if(!c.enabled){action='disabled';reason='Heizungsfunktion deaktiviert.';}
  else if(!ready){action='data';reason='Zu wenige aktuelle Raumwerte, Messabdeckung oder Außenfühler fehlen.';}
  else if(frost){action=pv.eligible&&pv.hardwareAllowed&&!cold?'pv-buffer':'frost';reason='Frostschutz hat Vorrang: keine Wärmepumpensperre oder Sollwertabsenkung.'+(action==='pv-buffer'?' Begrenzte PV-Vorwärmung innerhalb der Raum- und Estrichgrenzen ist möglich.':' Normale Heizungsregelung bleibt freigegeben.');}
  else if(windowSuspected){action='window';reason='Schnelle Abkühlung erkannt. Lernpause und keine PV-Anhebung; Raumlüftung oder Fühler prüfen.';}
  else if(cold){action='heat';reason='Mindestens ein Raum liegt unter seiner Komfortgrenze. Der Mittelwert darf diesen Raum nicht übergehen.';}
  else if(pv.eligible&&pv.hardwareAllowed){action='pv-buffer';reason='Stabiler PV-Anteil vorhanden: begrenzte Vorwärmung als Gebäudepuffer empfohlen.';}
  else if(meanC>=targetMeanC+c.hysteresisC||(trainedHeating&&running===true&&meanC>=targetMeanC&&predictedAfter30MinC>=targetMeanC+c.hysteresisC)){
   action='pause';reason=meanC>=targetMeanC+c.hysteresisC?'Gebäude ausreichend warm; Heizpause mit Hysterese empfohlen.':'Gelerntes Aufheizverhalten spricht für eine frühzeitige Heizpause.';wantLock=true;
  }else if(this.locked&&meanC>targetMeanC-c.hysteresisC){action='pause';reason='Heizpause bleibt innerhalb der Hysterese bestehen.';wantLock=true;}
  else {action='heat';reason=predictedEveningC!==null&&predictedEveningC<targetMeanC-c.hysteresisC?'Abkühlmodell erwartet bis zum Abend sinkenden Komfort; Heizen nicht pauschal bis abends sperren.':'Raumtemperaturen liegen im Komfortbereich; normale Heizungsregelung weiterarbeiten lassen.';}
  const lockMinutes=this.locked?Math.max(0,(now-this.lockSince)/MIN):0;
  if(wantLock&&!pumpReady){wantLock=false;reason+=' Aktueller Heizbetriebsstatus fehlt; keine automatische Sperre.';}
  if(wantLock&&!this.locked&&running===true&&pumpMinutes<c.minOnMin){wantLock=false;reason+=' Mindestlaufzeit noch nicht beobachtet.';}
  if(wantLock&&!this.locked&&this.lockReleased&&now-this.lockReleased<c.minOnMin*MIN){wantLock=false;reason+=' Wiedersperre wartet auf die Mindestfreigabezeit.';}
  const lockLimit=this.locked&&lockMinutes>=c.maxLockMin;
  if(wantLock&&lockLimit){wantLock=false;reason='Maximale Sperrdauer erreicht. Freigabe der bestehenden Heizungsregelung hat Vorrang.';action='heat';}
  const emergency=!hardwareAllowed||cold||frost||lockLimit;
  if(!wantLock&&this.locked&&!emergency&&lockMinutes<c.minOffMin){wantLock=true;reason+=' Mindestpausenzeit läuft noch.';action='pause';}
  if(wantLock&&!this.locked){this.lockSince=now;this.locked=true;}
  else if(!wantLock&&this.locked){this.locked=false;this.lockReleased=now;this.lockSince=0;}
  const boost=pv.eligible&&pv.hardwareAllowed&&!cold?pv.boostC:0;pv.active=boost>0;
  const correction=finite(meanC)?targetMeanC-meanC:0;
  const safeCorrection=cold||frost||boost>0?Math.max(0,correction):correction;
  const circuits=c.circuits.map(circuit=>{const raw=circuit.baseC+circuit.gain*safeCorrection+boost;const rounded=circuit.minC+Math.round((raw-circuit.minC)/circuit.stepC)*circuit.stepC;return {id:circuit.id,name:circuit.name,baseC:circuit.baseC,boostC:boost,targetC:hardwareAllowed?Number(clamp(rounded,circuit.minC,circuit.maxC).toFixed(3)):null,reason:!hardwareAllowed?'Automatische Anpassung pausiert; bestehende Heizungsregelung hat Vorrang.':boost?'Raumkorrektur plus begrenzte PV-Anhebung.':'Begrenzte Raumtemperaturkorrektur um den konfigurierten Basissollwert.'};});
  return {version:1,ts:now,enabled:c.enabled,mode:c.mode,ready,hardwareAllowed,pumpReady,meanC,minC,maxC,targetMeanC,coveragePct,outdoorC,frost,rooms,action,reason,pumpLock:wantLock,pump:{running,observedMinutes:pumpMinutes,lockMinutes:this.locked?(now-this.lockSince)/MIN:0},circuits,pv,learning:{enabled:c.learningEnabled,heatingRateKph:this.r.heatingRateKph,coolingLossPerHourK:this.r.coolingLossPerHourK,heatingSamples:this.r.heatingSamples,coolingSamples:this.r.coolingSamples,confidence:trainedHeating?'usable':trainedCooling?'developing':'insufficient',predictedEveningC,predictedAfter30MinC,windowSuspected,note:'Beobachtete Temperaturverläufe sind ein vereinfachtes Modell. Sonneneinstrahlung, Lüften und interne Wärmequellen beeinflussen die Werte. Kein garantierter Abend-Ertrag oder Speicherinhalt in kWh.'}};
 }
 pv(now,values,live,context){
  const c=this.config,p=c.pv,floorC=reading(values,p.floorId,now,c.sensorMaxAgeSec,'number',0,60);
  const power=reading(values,c.pump.powerId,now,Math.min(120,c.sensorMaxAgeSec),'number',0,50000);
  const inputW=Math.max(p.heatPumpPowerW,context.running===true&&power!==null?power:0),existing=context.running===true&&power!==null?power:0;
  const gridValid=finite(live.importW)&&live.importW>=0&&finite(live.exportW)&&live.exportW>=0&&(finite(live.batteryW)||live.hasBattery===false);
  const referenceSurplus=gridValid?Math.max(0,live.exportW-live.importW+existing-Math.max(0,live.batteryW||0)):null;
  const availableW=referenceSurplus===null?null:Math.max(0,referenceSurplus-p.reserveW);
  const coveragePct=availableW===null?null:clamp(availableW/inputW*100,0,100);
  const inTime=context.hour>=p.startHour&&context.hour<p.endHour;
  const maxRoom=context.maxC!==null&&context.maxC>=p.maxRoomC;
  const floorSafe=floorC!==null?floorC<p.maxFloorC:!p.floorId&&p.allowEstimatedFloor;
  const valid=c.enabled&&p.enabled&&context.ready&&gridValid&&inTime&&!maxRoom;
  const last=this.pvWindow.at(-1);if(!valid||last&&(now<=last.ts||now-last.ts>90000))this.pvWindow=[];
  if(valid)this.pvWindow.push({ts:now,value:availableW,referenceSurplus});
  while(this.pvWindow.length>1&&this.pvWindow[1].ts<=now-p.stableMin*MIN)this.pvWindow.shift();
  const stable=valid&&this.pvWindow.length>1&&now-this.pvWindow[0].ts>=p.stableMin*MIN;
  const stableW=stable?Math.min(...this.pvWindow.map(x=>x.value)):0,stableReference=stable?Math.min(...this.pvWindow.map(x=>x.referenceSurplus)):0;
  const enough=stable&&stableReference>=p.minExportW&&stableW/inputW*100>=p.minCoveragePct;
  const eligible=valid&&enough,knownHeatingState=typeof context.running==='boolean';
  let reason=!p.enabled?'PV-Gebäudepuffer deaktiviert.':!context.ready?'Raum-/Außenwerte oder Komfortschutz erlauben keine PV-Anhebung.':!gridValid?'Aktuelle Netz- oder Batteriemessung fehlt.':!inTime?'Außerhalb des PV-Zeitfensters.':maxRoom?'Maximale Raumtemperatur erreicht.':!stable?'Stabiler Überschuss wird beobachtet.':!enough?'PV-Anteil oder Mindestüberschuss reichen noch nicht aus.':!floorSafe?(p.floorId?'Estrichmessung fehlt, ist veraltet oder am Grenzwert.':'Für automatische Vorwärmung Estrichfühler zuordnen oder bewusst den begrenzten Schätzbetrieb erlauben.'):!knownHeatingState?'Tatsächliche Heizbetriebsrückmeldung fehlt; nur Empfehlung.':'Stabiler PV-Anteil und Temperaturgrenzen erlauben begrenzte Vorwärmung.';
  return {enabled:p.enabled,eligible,stable,availableW,stableW,referenceSurplus,coveragePct,pumpInputW:inputW,estimatedGridShareW:stable?Math.max(0,inputW-stableW):null,stableMinutes:this.pvWindow.length?Math.max(0,(now-this.pvWindow[0].ts)/MIN):0,boostC:eligible?p.boostC:0,hardwareAllowed:eligible&&floorSafe&&knownHeatingState,floorC,reason};
 }
}
module.exports={defaultHeating,normalizeHeating,HeatingEngine};
