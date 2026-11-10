# Screenshots mit Beispieldaten

Alle Bilder zeigen die tatsächliche Weboberfläche von Version **0.10.1** mit vollständig **synthetischen Beispieldaten**. Es wurden keine Hauskonfigurationen, privaten Sensor-IDs, Messhistorien, Zugangsdaten oder Netzwerkadressen einer realen Anlage verwendet.

Die Beispiele aktivieren die optionalen Bereiche, damit deren Darstellung sichtbar ist. Bei einer Neuinstallation sind diese Bereiche zunächst ausgeblendet; Geräteausgänge und Heizungssteuerung werden nicht automatisch freigegeben.

Die sichtbaren Leistungen, Zählerstände, Raumtemperaturen, Tankbestände, Prognosen und Vergleichswerte dienen ausschließlich der Veranschaulichung. Die Uhr der Demo ist für diese Aufnahmen auf den 10. November 2026, 13:45 Uhr gestellt. Der Standort heißt „Beispielstandort · Demo“; der Prognose-Screenshot zeigt keine Standortkoordinaten.

## Desktop

| Ansicht | Bild | Was ist zu sehen? |
| --- | --- | --- |
| Übersicht | [overview-desktop.png](overview-desktop.png) | Aktuelle Leistung, Energiefluss, gemessene Verbraucher und Handlungsempfehlung. |
| Energieauswertung | [analytics-desktop.png](analytics-desktop.png) | Kalenderübersicht, Tagesvergleich, Leistungsverlauf und Detailauswertung. |
| PV-Prognose | [forecast-desktop.png](forecast-desktop.png) | Erwarteter Tagesertrag, verbleibender Ertrag und stündliche Schätzung. |
| Heizung & Gebäudepuffer | [heating-desktop.png](heating-desktop.png) | Raumwerte, Temperaturverlauf und Empfehlungen im Beobachtungsbetrieb. |
| Datenquellen | [sources-desktop.png](sources-desktop.png) | Zentrale Auswahl der Messquellen, Sensoren und Zähler. |
| Wasser | [water-desktop.png](water-desktop.png) | Durchfluss, Gesamtzähler und Verbrauch nach Kalenderperioden. |
| Regenwasser | [rainwater-desktop.png](rainwater-desktop.png) | Getrennte Erfassung der Regenwassernutzung. |
| Brennstoff & Vorrat | [fuel-desktop.png](fuel-desktop.png) | Pelletsverbrauch, geschätzter Restbestand und Nachfüllhistorie. |
| Einstellungen | [settings-desktop.png](settings-desktop.png) | Optionale Bereiche, Speicherwahl und die gemeinsame Vollsicherung. |
| Verbraucher | [devices-desktop.png](devices-desktop.png) | Dynamische Verbraucherliste und Prioritäten. |
| Berichte | [reports-desktop.png](reports-desktop.png) | Berichtsgenerator und exportierbare Energiebilanz. |

## Handy

| Ansicht | Bild |
| --- | --- |
| Übersicht mit 390 Pixeln Breite | [overview-mobile.png](overview-mobile.png) |
| Energieauswertung mit 390 Pixeln Breite | [analytics-mobile.png](analytics-mobile.png) |

Die Bilder zeigen vollständige Seiten. Bei langen Ansichten kann das Originalbild im Browser geöffnet und vergrößert werden.

## Reproduzieren

Die Aufnahmen lassen sich aus dem Quellcode mit dem enthaltenen [Screenshot-Generator](../../tools/create-publication-screenshots.cjs) erzeugen. Das ist eine optionale Entwicklungsfunktion; für die normale Adapterinstallation sind diese Schritte nicht erforderlich.

Im Stammverzeichnis des ausgecheckten Repositorys ausführen:

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run docs:screenshots
```

Der Generator verwendet einen lokalen HTTP-Server mit simuliertem ioBroker-Transport. Externe Netzwerkaufrufe sind während der Aufnahme blockiert. Die Bilder werden unter `docs/images/` geschrieben. Der installierte Adapter enthält keinen Demo-Modus und keine dieser Messdaten.

Ein bereits installiertes Chromium unter `/usr/bin/chromium` wird automatisch verwendet. Für einen anderen vorhandenen Browserpfad kann unter Linux oder macOS ausdrücklich ein Chromium angegeben werden:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/pfad/zu/chromium npm run docs:screenshots
```

Ist weder dieser Pfad gesetzt noch `/usr/bin/chromium` vorhanden, verwendet Playwright das mit `npx playwright install chromium` heruntergeladene Chromium. Falls unter Linux notwendige Systembibliotheken fehlen, stellt `npx playwright install --with-deps chromium` auch diese bereit.

Die Produktionsdateien der Oberfläche werden für die Aufnahmen nicht verändert. Der Hinweis „BEISPIELDATEN · synthetische Demo“ wird nur während der lokalen Aufnahme als Kennzeichnung eingeblendet.
