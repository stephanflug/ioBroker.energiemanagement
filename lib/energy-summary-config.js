'use strict';
function normalizeEnergySummaryConfig(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Energieübersicht muss ein Konfigurationsobjekt sein.');
 const value=raw.monthlyPvTargetKWh??0;
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000)throw Error('PV-Monatsziel muss eine Zahl zwischen 0 und 1.000.000 kWh sein.');
 return {monthlyPvTargetKWh:Math.round(value*1000)/1000};
}
module.exports={normalizeEnergySummaryConfig};
