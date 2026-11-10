'use strict';
const finite = v => typeof v === 'number' && Number.isFinite(v);
const MINUTE = 60000;
const RETENTION = 48 * 60 * MINUTE;
const STABLE = 5 * MINUTE;
// Recommendations only. This module never writes to an actuator.
class EnergyInsights {
  constructor(history = []) {
    this.history = Array.isArray(history) ? history.filter(x => x && finite(x.ts)).slice(-2880) : [];
    this.window = [];
    this.signature = '';
    this.lastArchive = this.history.at(-1)?.ts || 0;
  }
  reset() { this.window = []; this.signature = ''; }
  sample(now, live, devices, measured, settings, options = {}) {
    const signature = JSON.stringify([options.sources, devices, settings.reserveW]);
    if (signature !== this.signature) { this.window = []; this.signature = signature; }
    const valid = finite(live.importW) && live.importW >= 0 && finite(live.exportW) && live.exportW >= 0 &&
      (!options.hasBattery || finite(live.batteryW));
    const available = valid ? Math.max(0, live.exportW - live.importW -
      Math.max(0, live.batteryW || 0) - settings.reserveW) : null;
    const last = this.window.at(-1);
    if (!valid || (last && (now - last.ts > 90000 || now <= last.ts))) this.window = [];
    if (valid) this.window.push({ts: now, value: available});
    // Keep one sample before the boundary to prove the full five-minute window.
    while (this.window.length > 1 && this.window[1].ts <= now - STABLE) this.window.shift();
    const stable = valid && this.window.length > 1 && now - this.window[0].ts >= STABLE;
    const stableW = stable ? Math.min(...this.window.map(x => x.value)) : 0;
    let budget = stableW;
    let count = devices.filter(d => finite(measured[d.id]) && measured[d.id] > 20).length;
    const maxParallel = options.maxParallel || 3;
    const recommendations = [...devices].sort((a,b) => a.priority-b.priority || a.id.localeCompare(b.id)).map(d => {
      const current = finite(measured[d.id]) ? measured[d.id] : null;
      const need = d.type === 'variable' ? d.minW : d.maxW;
      let code, reason, targetW = 0;
      if (current !== null && current > 20) {
        code = 'running'; reason = 'Verbraucher läuft. Laufende Programme nicht wegen kurzer PV-Schwankungen unterbrechen.';
      } else if (!d.enabled || d.mode === 'off') {
        code = 'disabled'; reason = 'Verbraucher ist deaktiviert oder ausgeschaltet.';
      } else if (current === null) {
        code = 'unknown'; reason = 'Aktuelle Istleistung fehlt oder ist veraltet; Betriebszustand nicht sicher erkennbar.';
      } else if (!valid) {
        code = 'data'; reason = 'Aktuelle Netz- oder konfigurierte Batteriemessung fehlt. Keine verlässliche Startempfehlung.';
      } else if (!stable) {
        code = 'observing'; reason = 'Messwerte werden fünf Minuten ohne Unterbrechung auf stabilen Überschuss geprüft.';
      } else if (count >= maxParallel) {
        code = 'parallel'; reason = 'Maximalzahl paralleler Verbraucher erreicht. Nacheinander starten.';
      } else if (budget < need) {
        code = 'wait'; reason = 'Warten: nach Reserve und höher priorisierten Verbrauchern fehlen ' + Math.ceil(need-budget) + ' W für den Start.';
      } else {
        code = d.requested || d.mode === 'on' ? 'start' : 'prepare';
        targetW = d.type === 'variable' ? Math.min(d.maxW, Math.floor(budget / 100) * 100) : d.maxW;
        if (targetW < need) { code = 'wait'; targetW = 0; reason = 'Leistung reicht nach Sollwertrundung noch nicht aus.'; }
        else {
          budget -= targetW; count++;
          reason = (code === 'start' ? 'Jetzt starten' : 'Bei Bedarf bereitstellen und manuell starten') +
            ': mindestens fünf Minuten ausreichender Überschuss; ' + Math.round(targetW) + ' W zugeteilt nach Priorität.';
        }
      }
      return {id:d.id, name:d.name, priority:d.priority, code, reason, targetW, measuredW:current, requiredW:need};
    });
    const starts = recommendations.filter(x => ['start','prepare'].includes(x.code));
    const summary = !valid ? 'Messdaten unvollständig – derzeit keine Startempfehlung.' :
      !stable ? 'Überschuss wird auf Stabilität geprüft (fünf Minuten).' :
      starts.length ? starts.map(x => x.name).join(', ') + ': Start bei Bedarf empfohlen.' :
      'Keinen zusätzlichen Verbraucher starten: stabiler Überschuss reicht für die verfügbaren Geräte nicht aus.';
    const advice = {version:1, updatedAt:now, valid, stable, availableW:available, stableW,
      reserveW:settings.reserveW, observedSeconds:this.window.length ? Math.floor((now-this.window[0].ts)/1000):0,
      mode:'advisory', summary, recommendations,
      note:'Empfehlungen lösen keine Schaltung aus. Startempfehlungen beruhen auf Messwerten; die separate Ertragsprognose löst keine Schaltung aus.'};
    this.history = this.history.filter(x => x.ts > now - RETENTION && x.ts <= now);
    const archiveDue = now - this.lastArchive >= MINUTE || now < this.lastArchive;
    if (archiveDue) {
      const point = {ts:now, values:{}, houseQuality:options.houseQuality || 'unknown',sourceIds:{house:options.houseSignature||''}};
      for (const key of ['pvW','houseW','importW','exportW','batteryW']) point.values[key] = finite(live[key]) ? live[key] : null;
      for (const d of devices) {point.values['device:'+d.id] = finite(measured[d.id]) ? measured[d.id] : null;point.sourceIds['device:'+d.id]=d.measuredW||'';}
      this.history.push(point); this.history = this.history.slice(-2880); this.lastArchive = now;
    }
    return {advice, archiveDue};
  }
}
module.exports = {EnergyInsights};
