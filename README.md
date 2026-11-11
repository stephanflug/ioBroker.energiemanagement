# ioBroker Energiemanagement

[Deutsch](README.de.md) · [Installation](docs/en/installation.md) · [User guide](docs/en/user-guide.md) · [Detailed German manual](docs/de/benutzerhandbuch.md) · [Changelog](CHANGELOG.md)

**PV generation, household consumption, demand peaks and optional resource monitoring in one ioBroker interface.** Existing ioBroker data points provide the measurements. The adapter does not depend on a specific meter, inverter, battery, heat pump or consumer brand.

## Preparation status

Version **0.10.2 is a prepared development build**. The deliverables are an installable `iobroker.energiemanagement-0.10.2.tgz`, a complete project ZIP and checksums. Preparing these files does not update the running 0.10.1 installation. This preparation does not publish a GitHub release, publish to npm or submit an official ioBroker repository request.

The intended project is [stephanflug/ioBroker.energiemanagement](https://github.com/stephanflug/ioBroker.energiemanagement). A new or empty repository may not yet have downloadable releases. Use the separately supplied TGZ for a local installation.

![Dashboard with synthetic example data](docs/images/overview-desktop.png)

*Documentation screenshots contain synthetic demonstration data.*

## Features

| Area | Purpose |
| --- | --- |
| Dashboard | Current PV, household, grid and battery power, energy flow and consumer measurements. |
| Quarter-hour monitoring | Fifteen-minute demand averages, daily/monthly peaks and measurement coverage. |
| Energy analysis | Calendar cards, comparable-day consumption changes, selectable power curves and device detail. |
| PV forecast | Expected production for today/tomorrow, selectable location and multiple roof sections. |
| Water and rainwater | Independent consumption histories; flow and cumulative counter can be assigned together. |
| Fuel | Pellets in kg, oil in l and gas in m³; estimated stock and refill history for pellets/oil. |
| Heating and building buffer | Room sensors, weighted mean temperature, trends, learning model and separately enabled bounded controls. |
| Reports | Selected periods as CSV, JSON or browser print/PDF. |
| Data sources | Central measurement and sensor assignment. |
| Settings | Optional modules, internal or existing database storage and one full-adapter backup. |
| About and licences | Project, developer Stephan Ebner, installed version, full MIT licence and third-party notices. |

Water, rainwater, fuel and heating are hidden by default on a new installation. Physical outputs also start disabled. Enable only the areas needed for your installation.

## Get started

1. Follow the [manual installation guide](docs/en/installation.md). Version 0.10.2 requires **Node.js 22 or newer** and an ioBroker `web` instance.
2. Open the application through the web adapter.
3. Assign grid import power in W and the cumulative import counter in kWh under **Datenquellen** (Data sources).
4. Check live values, units and signs. Add PV, export, battery and optional sensors as available.
5. Add measured devices under **Verbraucher & Prioritäten** and assign their measurement sources centrally.
6. Enable optional modules in Settings and create a full backup after setup.

The application retains its existing German menu labels. The [English user guide](docs/en/user-guide.md) maps those labels to their purpose.

## Version information

A compact version indicator remains visible in the header on desktop and mobile. Public GitHub releases are checked on the ioBroker server at startup and approximately every twelve hours; browsers share the server result.

The indicator distinguishes checking, current, update available, unavailable, development build and a neutral state where no public stable release exists. Drafts and prereleases are ignored as update targets. Comparisons use semantic version numbers. Update details include the available version, release date, short notes and release link.

The checker does not install updates or reload the page. Open forms, scroll position and navigation stay in place when version information changes. A failed GitHub request does not stop energy collection. The prepared 0.10.2 is explicitly marked as a development build.

## Data and calculations

Power in **W/kW** is a current rate; energy in **kWh** is accumulated over time. Device consumption is already part of household consumption and must not be added again. Missing measurements are not treated as zero.

Calendar periods advance automatically without resetting physical meter counters. Same-time day comparisons need sufficiently recorded comparable periods. A newly configured system first collects suitable history. The electricity and consumption archives use Europe/Vienna calendar boundaries, including daylight-saving changes.

Forecasts and tank stock are estimates. PV weather forecasts use Open-Meteo without an API key for private/non-commercial use within the provider terms; a local solar model is also available. See [Open-Meteo terms](https://open-meteo.com/en/terms) and [data attribution](docs/de/architektur.md#netzverkehr-und-datenschutz).

## Backup and database storage

There is **one full-backup and restore function** for the adapter's own settings, assignments, stored archives, comparison profiles, tank data and heating learning data. A restore leaves device and heating controls disabled for review. Foreign sensor objects, other adapters and the entire external database are outside that file.

Internal storage is the default. Optional database archiving uses an existing configured ioBroker database instance while keeping a local copy. Since 0.10.1, complete database checkpoints are compressed into small parts and confirmed by readback. InfluxDB confirmation needs the `getRawEntries` API present in adapter 5.1.8 or a compatible implementation. SQL/history compatibility depends on the provider and is experimental.

## Developer and project

Development: **Stephan Ebner**. Public project contact: [steuerung@gmx.at](mailto:steuerung@gmx.at). Project: [stephanflug/ioBroker.energiemanagement](https://github.com/stephanflug/ioBroker.energiemanagement).

## Installation and project status

- Node.js **22 or newer** for 0.10.2; use an ioBroker-supported LTS release.
- ioBroker js-controller at least 6.0.11 and Admin at least 7.6.20, according to the package metadata.
- A running `web` instance for the browser interface.
- No external database or particular device manufacturer is required.

This build is not an official ioBroker adapter-list or npm publication. Publishing and the official admission process require separate release steps. Physical load and heating automation are supplementary functions; compatible device interfaces and independent protection remain necessary.

[Installation](docs/en/installation.md) · [User guide](docs/en/user-guide.md) · [German troubleshooting](docs/de/fehlerbehebung.md) · [Contributor guide](CONTRIBUTING.md) · [MIT licence](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

## Changelog

### 0.10.2 (prepared development version)

- Add About and Licenses, a persistent version indicator and server-side public GitHub release checks.
- Keep checks informational, with no automatic installation, control change or page reload.
- Update developer credits, licensing, German/English documentation and publication readiness metadata.
- Prepare separate TGZ/ZIP artifacts while leaving the productive 0.10.1 installation unchanged.

See [CHANGELOG.md](CHANGELOG.md) for the complete history. No GitHub/npm release or official ioBroker submission is performed by this preparation.

## License

MIT License

Copyright (c) 2026 Stephan Ebner <steuerung@gmx.at>
Copyright (c) 2026 Energiemanagement contributors <steuerung@gmx.at>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
