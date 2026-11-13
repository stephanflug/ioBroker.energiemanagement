# 0.10.8 (2026-11-13)

- Fix source configuration saves: wait for a real `ack:true` from ioBroker after updating `config.sources`, instead of checking the value immediately.
- Show persistent, specific validation errors for missing mandatory smart-meter readings, an empty added PV row, or an unavailable/incompatible state ID; highlight the affected source.
- Prevent overlapping save clicks, keep unsaved edits after failures, and confirm successful persistence only after the adapter has acknowledged the new configuration.
- Retain the unified alias-compatible picker introduced in 0.10.7 and all existing source bindings and safety gates.
- Add regression tests for delayed adapter acknowledgment, stale values, rejected writes and input errors.

# 0.10.7 (2026-11-13)

- Fix the source picker failing with `Cannot set properties of null (setting 'textContent')` after accepting a measurement state: preserve the previously moved output controls in the data sources view.
- Unify ioBroker object selection for PV and grid measurements, batteries, heating sensors and outputs, water, rainwater, fuel and consumer measurements.
- Use a consistent picker with `alias.0` support, manual state IDs, datatype and read/write permission checks, and explicit feedback.
- Keep draft changes separate from persisted source mappings; each configuration section is still explicitly saved by its own action.
- Preserve the FUP editor's dedicated logic-output creation dialog, which provides different functionality from selecting measurement sources.
- Add regression checks for DOM preservation, shared state picker usage and PV row creation.
- Verified source-selection behavior in the isolated `energiemanagement.1` test frontend; no automatic changes to the production adapter.

# 0.10.6 (2026-11-13)

- Fix the PV source add button: append a visible draft row even when the source editor is dynamically moved, provide a loading error instead of silently ignoring the click, and keep existing PV mappings untouched until saved.
- Include the ioBroker alias namespace `alias.0` in the source picker even though alias is a meta namespace rather than an adapter instance.
- Support queued adapter selection changes while the picker loads its objects.
- Add explicit manual entry and validation for ioBroker state IDs when selecting measurement sources. Show in-dialog errors for incompatible data types, missing read permissions or unavailable objects.
- Improve the "Datenpunkt übernehmen" workflow and retain the normal save process for source mappings.

# 0.10.5 (2026-11-12)

- Fix an unintended repeated FUP command when **Cyclic write** is disabled and another ioBroker adapter changes the target state without any change to the calculated output.
- Non-cyclic foreign outputs now respond only to a change in the FUP-calculated value, not to drift or refreshes of the destination state.
- Keep cyclic writes on their configured interval and preserve immediate commands when the calculated result changes.
- Show `Zyklisch AUS – Logikwert unverändert, kein Schreibbefehl` in the output diagnostic status.
- Retain existing FUP configurations, output IDs, write permissions and hardware-control settings.
- Expand regression coverage for target drift without repeated commands, including the case where the original target initially matches.

# 0.10.4 (2026-11-12)

- FUP: Export all logics as a JSON backup, share one portable JSON template, and import templates or backups without replacing existing logics.
- Sharing removes all ioBroker device IDs and disables logic and output writes. Imported logics receive new IDs, remain disabled, and cannot reactivate foreign writes without explicit reconfiguration.
- Add a safe, ready-to-share battery threshold example under `examples/fup`.
- Add per-output **Cyclic write: yes/no** with a 10–3600 second interval (default 60 seconds), for external and own ioBroker outputs.
- When cyclic writing is off, values already present at the destination are not resent. When on, identical values are periodically sent only after the requested interval; changed values are sent immediately.
- Keep foreign-state writes behind both global FUP and individual output permissions; validate the destination type and record output write status for troubleshooting.
- Add regression tests for cyclic writing, JSON import/export, missing references, type checking and import-time permission reset.

# 0.10.3 (2026-11-12)

- Introduce a freely configurable FUP logic editor with ioBroker input, virtual setpoint, constant, math, comparison, boolean, limiting and output blocks.
- Show actual live values of inputs, virtual setpoints, function blocks and created ioBroker outputs directly on the canvas; changes take effect only after saving.
- Provide per-logic enable/disable, ioBroker data point selection, wiring and removal of connections and individual blocks (including safe cleanup of dependent connections).
- Create virtual setpoint and output states when configuration changes; handle disconnected ports and failed block evaluations without spurious cycle errors.
- Add separate battery configurations and SOC measurements without a combined SOC; retain previous hardware-control settings.
- Add regression tests for live FUP calculations, deleted blocks and invalid references.
- Source version on GitHub; a packaged v0.10.3 Release asset has not yet been published.

# 0.10.2 (2026-11-10, prepared development version)

- Add an About & Licenses page with the developer name, installed version, project/documentation/issue links and full MIT and third-party notices.
- Add a compact persistent version indicator for desktop and mobile, including checking, current, update available, unavailable, development and no-release states.
- Check public stable GitHub releases on the server at startup and approximately every twelve hours, using semantic version comparison, rate-limit handling and a persistent successful-check timestamp.
- Keep update checking informational: no software installation, page reload, form reset or device-control change.
- Replace the old development credit with “Entwicklung: Stephan Ebner” and retain the existing layout and calendar views.
- Expand German and English user/installation documentation and prepare metadata, licensing and the checklist for a later public release and official ioBroker submission.
- Prepare separate TGZ/ZIP artifacts without publishing, modifying the productive 0.10.1 installation or replacing its package.

# 0.10.1 (2026-11-10)

- Replace oversized single-field database checkpoints with gzip/Base64 chunks carrying snapshot identity, timestamps and integrity hashes; publish the manifest only after all chunks have been read back and validated.
- Limit database write requests to 64 KiB and ten points. Keep each checkpoint payload at most 16 KiB of Base64 data instead of sending a multi-megabyte JSON field.
- Confirm stored numeric values, checkpoint chunks and the final manifest through database readback. Avoid flushing unrelated global InfluxDB buffers and reject incomplete or mismatched results.
- Give database writes/readback a separate 35-second response budget and identify the failed operation; interactive read-only connection checks retain their shorter deadline.
- Reset unverified 0.10.0 acknowledgement timestamps until the new readback protocol confirms storage. Preserve selected storage, configurations, archives and the single full-backup workflow.

# 0.10.0 (2026-11-09)

- Add an optional Rainwater area, disabled by default, with separate flow/counter bindings, native m³ consumption, archives, reports and read-only embedding; keep drinking-water quantities independent.
- Reorganize Energy Analysis with clear sections and shortcuts while preserving the calendar overview and its calculation.
- Add up to 35 days of source-aware quarter-hour profiles and comparisons against matching measured time windows from the preceding seven days; distinguish missing data, measured zero, gaps and DST exclusions.
- Where proven source-matched daily archives already exceed complete reference-day averages, show an explicitly labelled full-day-exceeded comparison rather than implying a same-time comparison.
- Offer internal storage or an installed ioBroker SQL/InfluxDB/history instance with local fallback, numeric minute snapshots and periodic adapter-data checkpoints.
- Replace separate configuration transfer with one checksummed full-adapter backup, including rainwater, comparison profiles and storage configuration; external database contents remain outside backup scope.
- Preserve current mappings, heating permissions, archives and web.0 launch metadata on upgrade.

# 0.9.0 (2026-11-09)

- Centralize electricity/PV, water, fuel, heating sensor/circuit and consumer measurement bindings under Data Sources with grouped overview and pickers.
- Support simultaneous water flow and cumulative counter assignments; display both while using exactly one selected calculation method without double counting.
- Add separate pellet (kg) and oil (l) capacity, initial stock, refill, full-fill and stock-correction ledgers, idempotent retries and remaining-stock estimates with incomplete-measurement flags.
- Retain monotonic lifetime utility totals independently of rolling archive retention for inventory consumption.
- Extend reports and CSV/JSON/print exports with native-unit water/fuel consumption, current inventory and date-filtered refill events; distinguish corrections from delivered quantities.
- Add checksummed full-adapter JSON backup, preview and explicit restore of mappings, histories, learning and inventory; require release acknowledgement for current controlled outputs before replacing ownership and leave controls disabled after restore.
- Preserve measured open energy intervals while resetting downtime anchors during restore; reject malformed or foreign state writes.
- Add read-only stock iframe and mobile layouts for central sources, tank controls and backup; preserve web.0 launch metadata.

# 0.8.0 (2026-11-08)

- Add optional Water and Fuel tabs and calendar cards, enabled under Settings; hide disabled routes on desktop, mobile and iframe views.
- Support water flow integration (l/min, l/h, m³/h) or cumulative counters (m³/l).
- Add pellets (kg), oil (l) and gas (m³) selection with consumption counters or rates, source re-selection and separated archives.
- Disable heating optimization and its hardware permission when hiding Heating & Building Buffer; preserve existing configured heating visibility on upgrade.
- Add input-quality checks, gap/reset handling, DST-aware calendar rollover, persistent consumption history, source picker and configuration transfer.

# 0.7.0 (2026-11-08)

- Add responsive year/month/day energy cards, configurable monthly PV goal, daily battery charge/discharge and Smart Meter snapshot in the existing dashboard style.
- Roll calendar views over automatically in Europe/Vienna without resetting physical counters or deleting archives.
- Include all open quarters in energy totals without double-counting finalized intervals; retain unknown historical coverage and distinguish measured zero from missing data.
- Integrate signed battery flows across zero crossings and DST-aware midnight boundaries; skip gaps, source changes and restart downtime.
- Add live freshness handling, read-only iframe panels and PV-target configuration transfer.

# 0.6.1 (2026-11-08)

- Normalize Celsius metadata consistently across room/outdoor/floor sensor validation and heating setpoint output checks.
- Accept Homematic/ReGa ºC, generic Grad, Unicode ℃, whitespace/case variants and common Celsius labels without modifying source objects or converting values.
- Retain numeric type, freshness, bounds, direct-output permission checks and rejection of incompatible units.

# 0.6.0 (2026-11-08)

- Recover mobile connections after background suspension, network changes and request timeouts for both web.0 pure WebSocket and Socket.IO clients; preserve form drafts and never replay uncertain commands.
- Add direct Heating navigation to the five-button mobile tab bar.
- Record individual room temperatures with source identity, validated floor values and room-composition gaps; retain up to 48 hours at minute resolution.
- Add a dedicated temperature trend with selectable room/mean/target/outdoor/floor curves, 1/6/24/48-hour ranges, touch inspection and CSV export.
- Add per-window embed buttons, an iframe dialog and allowlisted read-only dashboard views using existing ioBroker authentication.
- Preserve existing configuration, hardware permissions and web.0 start-page metadata on update.

# 0.5.0 (2026-11-08)

- Add optional Heating & Building Buffer tab with dynamic labeled, weighted room sensors and outdoor sensor.
- Add cold-room protection, bounded manufacturer heating pause, hysteresis and minimum/maximum timing.
- Learn simplified heating/cooling behavior from confirmed observations and estimate evening comfort.
- Add per-circuit bounded room-setpoint adaptation with explicit output arming, device acknowledgements and manual override handling.
- Add full/partial PV thermal buffering with stability, learned evening need and room/floor limits.
- Keep new heating function unassigned, disabled and observational by default; safe configuration transfer and persistent ownership/restoration logs.

# 0.4.1 (2026-11-08)

- Restore web start-page tile and Admin launch link in adapter-level package metadata.
- Resolve web protocol, port and instance dynamically; retain the existing dashboard.

# 0.4.0 (2026-11-07)

- Redesign overview around current PV, home, grid and battery power.
- Group recommendations and yield forecast; move detailed tables and control diagnostics into expandable sections.
- Add mobile bottom navigation and full drawer menu with large touch targets, backdrop, keyboard and focus handling.
- Preserve energy monitoring, forecasts, configuration and actuator behavior.

# 0.3.1 (2026-11-07)

- Give PV yield forecast its own navigation tab and direct hash link.
- Keep forecast display and location/roof setup together on one page.
- Explain missing configuration with a direct setup action and preserve all existing settings.

# 0.3.0 (2026-11-07)

- Add free keyless Open-Meteo weather-based PV yield forecast for today/tomorrow and remaining day.
- Add location search/manual coordinates, up to four roof arrays, tilt, compass orientation and performance ratio.
- Add optional offline clear-sky solar model with explicit manual weather factor.
- Add hourly chart, forecast freshness checks, request limits, caching and DST-safe energy aggregation.
- Preserve existing histories; forecast starts unconfigured and disabled, imports keep it disabled.

# 0.2.0 (2026-11-07)

- Add persistent, filterable 48-hour power history and CSV export.
- Add dynamic advisory recommendations with five-minute surplus stability, reserve, battery discharge handling and shared priority budget.
- Integrate existing consumer-energy archives into the adapter; preserve historical data.
- Preserve status feedback mappings and support explicit UI instance selection.
- Include unit and adapter startup tests.
