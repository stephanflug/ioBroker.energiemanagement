'use strict';

const SRC_SCHEMA = Object.freeze({
  importW: ['Aktueller Netzbezug', 'W', true],
  importKWh: ['Bezugszählerstand', 'kWh', true],
  exportW: ['Aktuelle Netzeinspeisung', 'W', false],
  exportKWh: ['Einspeisezählerstand', 'kWh', false],
  dayBaseImport: ['Zählerstand bei Tagesbeginn', 'kWh', false],
  monthBaseImport: ['Zählerstand bei Monatsbeginn', 'kWh', false],
  dayBaseExport: ['Einspeisezählerstand bei Tagesbeginn', 'kWh', false],
  monthBaseExport: ['Einspeisezählerstand bei Monatsbeginn', 'kWh', false],
  batteryW: ['Batterieleistung', 'W', false],
  houseW: ['Hausverbrauch direkt gemessen', 'W', false],
  phase1W: ['Phasenleistung L1', 'W', false],
  phase2W: ['Phasenleistung L2', 'W', false],
  phase3W: ['Phasenleistung L3', 'W', false]
});
const numeric = (v, fallback = 0) => Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const validId = id => typeof id === 'string' && id.length <= 255 && /^[a-zA-Z0-9_][\w.:-]*$/.test(id);
function normalizeSources(raw) {
  if (!raw || typeof raw !== 'object') throw Error('Datenquellen müssen ein Objekt sein');
  const out = {};
  for (const [key, meta] of Object.entries(SRC_SCHEMA)) {
    const it = raw[key] || {};
    const id = String(it.id || '').trim();
    if (id && !validId(id)) throw Error('Ungültiger Datenpunkt: ' + key);
    const factor = numeric(it.factor, 1);
    if (!factor || Math.abs(factor) > 1000000) throw Error('Ungültiger Faktor: ' + key);
    out[key] = {id, factor};
  }
  const pv = Array.isArray(raw.pv) ? raw.pv : [];
  if (pv.length > 100) throw Error('Zu viele PV-Quellen');
  out.pv = pv.map((x, i) => {
    const id = String(x?.id || '').trim();
    if (!id || !validId(id)) throw Error('PV-Datenpunkt fehlt oder ist ungültig: ' + (i + 1));
    const factor = numeric(x.factor, 1);
    if (!factor || Math.abs(factor) > 1000000) throw Error('PV-Faktor ungültig');
    return {id, factor, name:String(x.name || 'PV ' + (i + 1)).slice(0,80)};
  });
  return out;
}
const defaultSources = () => ({...Object.fromEntries(Object.keys(SRC_SCHEMA).map(k => [k,{id:'', factor:1}])),pv:[]});

function normalizeConsumer(raw, i = 0) {
  const id = String(raw?.id || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,47}$/.test(id)) throw Error('Ungültige Verbraucher-ID: ' + id);
  const type = raw.type === 'variable' ? 'variable' : 'switch';
  const maxW = Math.round(clamp(numeric(raw.maxW, 1000), 100, 50000));
  const minW = type === 'switch' ? maxW : Math.round(clamp(numeric(raw.minW, maxW), 100, maxW));
  const output = raw.output || {};
  const item = {
    id, name:String(raw.name || id).trim().slice(0,100), type,
    enabled:raw.enabled === true, requested:raw.requested !== false,
    mode:['auto','on','off'].includes(raw.mode) ? raw.mode : 'auto',
    priority:Math.round(clamp(numeric(raw.priority, i + 1), 1, 99999)),
    minW, maxW, minOffSec:Math.round(clamp(numeric(raw.minOffSec, 30), 0, 3600)),
    statusId:validId(String(raw.statusId || '')) ? String(raw.statusId) : '',
    measuredW:validId(String(raw.measuredW || '')) ? String(raw.measuredW) : '',
    output:{
      armed:output.armed === true,
      enableId:validId(String(output.enableId || '')) ? String(output.enableId) : '',
      enableOn:output.enableOn !== false,
      powerId:validId(String(output.powerId || '')) ? String(output.powerId) : '',
      powerUnit:output.powerUnit === 'W' ? 'W' : 'A',
      phases:output.phases === 1 ? 1 : 3,
      voltage:clamp(numeric(output.voltage, 230), 200, 250),
      minA:Math.round(clamp(numeric(output.minA, 6), 6, 32)),
      maxA:Math.round(clamp(numeric(output.maxA, 16), 6, 80))
    }
  };
  return item;
}
function normalizeConsumers(raw, maxConsumers = 250) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.devices)) throw Error('Verbraucherliste ungültig');
  if (raw.devices.length > maxConsumers) throw Error('Zu viele Verbraucher (maximal ' + maxConsumers + ')');
  const devices = raw.devices.map(normalizeConsumer);
  if (new Set(devices.map(x=>x.id)).size !== devices.length) throw Error('Doppelte Verbraucher-ID');
  const outputs = new Set();
  for (const d of devices) {
    if (!d.output.armed) continue;
    for (const target of [d.output.enableId, d.output.powerId]) {
      if (!target) continue;
      if (outputs.has(target)) throw Error('Mehrfach zugewiesener Hardware-Datenpunkt: '+target);
      outputs.add(target);
    }
    if (d.type==='variable' && !d.output.powerId) throw Error('Regelbarer Verbraucher benötigt einen Sollwert-Datenpunkt: '+d.name);
  }
  return {master:raw.master === true, maxParallel:Math.round(clamp(numeric(raw.maxParallel,3),1,maxConsumers)),devices};
}
function defaultConsumers() {return {master:false,maxParallel:3,devices:[]};}
function normalizeSettings(raw, defaults={}) {
  return {targetW:Math.round(clamp(numeric(raw?.targetW,defaults.targetW ?? 9500),500,100000)),
    reserveW:Math.round(clamp(numeric(raw?.reserveW,defaults.reserveW ?? 500),0,20000)),
    tariffThresholdW:Math.round(clamp(numeric(raw?.tariffThresholdW,defaults.tariffThresholdW ?? 10000),0,100000)),
    minCoveragePct:clamp(numeric(raw?.minCoveragePct,defaults.minCoveragePct ?? 85),50,100)};
}
module.exports={SRC_SCHEMA,defaultSources,defaultConsumers,normalizeSources,normalizeConsumers,normalizeSettings,numeric,clamp,validId};
