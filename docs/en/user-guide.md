# User guide

[English overview](../../README.en.md) · [Installation](installation.md) · [Detailed German manual](../de/benutzerhandbuch.md)

This guide describes development release **0.10.2**. The application currently uses German labels. Development: **Stephan Ebner**.

## Find your way around

| Menu label | Meaning |
| --- | --- |
| Übersicht | Dashboard: current power, energy flow and useful hints |
| Viertelstunden / Verlauf | Quarter-hour demand averages, peaks and coverage |
| Energieauswertung | Calendar, day comparison, power trends and detailed energy analysis |
| PV-Ertragsprognose | Location-based expected PV production |
| Wasser / Regenwasser | Water and separate rainwater use |
| Brennstoff | Pellets, oil or gas and optional pellet/oil stock |
| Heizung & Gebäudepuffer | Room temperatures, heating advice and bounded optional controls |
| Berichte | Reports and CSV/JSON/print exports |
| Datenquellen | Central measurement-source assignment |
| Verbraucher & Prioritäten | Device configuration and priorities |
| Geräteausgänge | Explicitly enabled device outputs |
| Einstellungen | Optional modules, storage and one full backup |
| Über & Lizenzen | About, developer, installed version, project links and licences |

On a phone, open the menu button for the complete navigation. The quick navigation contains frequently used areas. Water, rainwater, fuel and heating appear only when enabled in Settings.

## First measurements

1. Open **Datenquellen**.
2. Assign current grid import power in **W** and the cumulative import counter in **kWh**.
3. Add export, PV, battery and direct household power sources where available.
4. Check units, conversion factors, valid zero values and battery sign direction against the physical installation.
5. Save and watch the Dashboard before enabling optional controls.

A cumulative counter is not a daily consumption value. Do not reset a physical meter to make the application's calendar change periods.

Power in W/kW is a rate. Energy in kWh is accumulated over time. Consumers are already included in household consumption; do not add their total again. Missing or stale readings stay unknown rather than becoming zero.

## Calendars and comparisons

The energy calendar advances automatically between day, month and year. Histories show only recorded data; the application cannot reconstruct measurements that never existed.

**Heute im Vergleich** compares matching sufficiently measured quarter-hour sections with previous days. It needs suitable history and may first display that data is still being collected. An explicitly labelled fallback can show that today's measured consumption already exceeds the mean of sufficiently recorded whole comparison days; it is not a claim that a partial day equals a complete day.

Select individual power curves and the desired time range. CSV and JSON export the selected analysis. Device energy needs an assigned current-power measurement.

## Version information and About

The header keeps the installed version visible on all pages, including mobile. Public GitHub releases are checked on the server at startup and approximately every twelve hours. Each browser reads the same stored status.

| Display | Meaning |
| --- | --- |
| Aktuell | Installed stable version matches the newest found stable release |
| Update verfügbar | A newer stable release exists; details include version, date, short changes and link |
| Prüfung läuft | A server request is in progress |
| Prüfung nicht möglich | Network failure, API limit or invalid response prevented a current check |
| Vorabversion | Installed development build or semantic prerelease |
| Noch kein stabiles Release | Neutral result for a new repository or no usable stable release |

Drafts and prereleases are ignored as stable update targets. Version numbers use semantic ordering: `0.10.10` is newer than `0.10.2`. Version 0.10.2 is explicitly a development version; its GitHub prerelease is not a stable update target. The manual check uses the same server function and cannot bypass cooldowns or GitHub rate limits.

The indicator never installs software. It does not reload the page or reset scroll position, menus or unsaved forms. A failed version check does not change device control. Install a deliberately selected new package through normal ioBroker administration.

**Über & Lizenzen** explains the adapter's purpose and links to the GitHub project, documentation and issue reporting. It also displays the installed version, full MIT licence and third-party notices.

## PV forecast

Set a location, actual installed kWp and each roof's tilt and compass orientation under **PV-Ertragsprognose**. The online model uses Open-Meteo without an API key for private/non-commercial use within its terms. An alternative local solar model needs no weather request.

Predicted energy is an estimate, not a meter reading or guaranteed surplus. A forecast does not itself enable an output. The optional online location search sends the entered search text; enabled weather forecasting sends the configured coordinates to the weather provider.

## Water, rainwater and fuel

Enable the relevant module in Settings. Assign sources centrally under **Datenquellen**.

- Water and rainwater accept flow and cumulative counter independently. Select exactly one calculation method; the second measurement remains available for display.
- Water/rainwater use m³ internally, with supported litre/flow-unit conversion. Their archives remain separate.
- Fuel uses kg for pellets, l for oil and m³ for gas. Choose the correct fuel before assigning its source.
- Pellets/oil stock needs a known initial amount or an actual full-fill action. Capacity alone does not create a stock value.
- Record deliveries using the refill action. Estimated remaining stock decreases only with recorded consumption; gaps and downtime can make the estimate uncertain.

The current stock shown in a report is a current estimate with a timestamp, not a reconstructed historical stock for an arbitrary report date.

## Heating and building buffer

Begin with observation. Add clearly named room sensors and, where available, an outdoor sensor. Weighted room temperature, trends and the building model help assess heating demand.

Automatic operation needs appropriate manufacturer interfaces, explicit hardware permissions and suitable configured limits. Room-temperature observations can guide bounded central heating-circuit setpoints and an appropriate manufacturer lock input. They must not directly switch a compressor's power supply.

Optional PV preheating is limited by windows, temperature limits, surplus and coverage requirements. A learned evening temperature estimate does not guarantee an evening without heating. Hiding the heating module in Settings also disables its optimization; showing it again does not re-arm automation.

## Reports and embedding

**Berichte** provides electricity and enabled resource reports for selected ranges. Export as CSV, JSON or browser print/PDF. Resource units remain separate from kWh.

Use **Einbetten** on an available panel to obtain a direct link or iframe. Existing ioBroker authentication still applies, and the destination system must be able to reach the web address. Use compatible HTTPS addresses when embedding on an HTTPS page.

## Storage and full backup

Internal storage is the default. An existing ioBroker database instance can optionally archive additional measurements and compressed checkpoints. Credentials remain in the database adapter. Local archives continue during a database outage; external detail series can have gaps.

There is one full backup under **Einstellungen → Vollsicherung & Wiederherstellung**. It includes the adapter's own settings, assignments, retained histories, stock/refill events and heating model. It does not export foreign adapters or the entire external database.

Restore checks the backup and its checksum before applying it. Active owned device commands must first be confirmed as released. Restored hardware and heating controls remain disabled until reviewed. Keep backups private; they can contain location, device names, assignments and consumption history.

If something is unclear, see [German troubleshooting](../de/fehlerbehebung.md). GitHub reports should include versions, expected/observed behaviour and a small relevant log excerpt, with credentials and private information removed.
