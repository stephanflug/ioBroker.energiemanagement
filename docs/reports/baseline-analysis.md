# Analyse der Ausgangsbasis 0.10.1

> Historischer Prüfstand vor der GitHub-Veröffentlichung. Den aktuellen Veröffentlichungsstand enthält [Veröffentlichung und offene Schritte](publication-open-points.md).

## Zweck und Schutz der Produktivinstallation

Die installierte Version 0.10.1 wurde als Ausgangsbasis geprüft. Die bekannten Pfade `/opt/iobroker/node_modules/iobroker.energiemanagement/` und `/tmp/iobroker.energiemanagement-0.10.1.tgz` wurden zunächst auf Existenz geprüft; beide waren vorhanden. Diese Analyse war lesend. Die Vorbereitung von 0.10.2 erfolgt in einem separaten Arbeitsverzeichnis.

Es wurden keine produktiven Einstellungen zurückgesetzt, keine Messwerte gelöscht und keine neue Version auf der produktiven Instanz installiert. Es erfolgte keine GitHub- oder npm-Veröffentlichung und kein Pull Request.

## Verifizierter Ausgangsstand

- Installiertes Paket: `iobroker.energiemanagement` **0.10.1**.
- Installationsdatei der Ausgangsbasis: **284.513 Bytes**.
- SHA-256 dieser ursprünglichen Installationsdatei: `eeb7bb6d795adee62b826f42c5b31dd9d05759ed424b2d5d13abfaff5e0d7353`.
- **93 installierte Dateien** wurden inventarisiert und per Hash abgeglichen.
- Die lokale Referenz wurde aus genau dieser verifizierten TGZ-Datei gewonnen.
- Die bereits vorbereitete Dokumentationsbasis 0.10.1 enthält 85 byte-identische Dateien. Acht Unterschiede betreffen README, Paket-/Projektmetadaten und reine Leerraum-/Dateiende-Bereinigung in Webdateien. Backend-Module, `main.js` und Admin-Ressourcen stimmten mit der installierten Ausgangsbasis überein.

Die ursprüngliche produktive TGZ-Datei 0.10.1 wird durch das neue Paket nicht überschrieben. Für 0.10.2 werden eigene Dateinamen und Prüfsummen erzeugt.

## Aufbau und vorhandener Funktionsumfang

| Bereich | Wesentliche Dateien | Aufgabe |
| --- | --- | --- |
| Adapterlebenszyklus | `main.js`, `admin/jsonConfig.json`, `io-package.json` | Eigene Datenpunkte, Konfiguration, Messzyklus, Messagebox und Status |
| Strom-/Lastspitzenberechnung | `lib/engine.js`, `lib/normalize.js` | Zähler- und Leistungsmessungen, Viertelstunden, Abdeckung, Ziel-/Reserveparameter |
| Kalender und Batterie | `lib/energy-summary.js` | Tages-, Monats-, Jahreswerte, unabhängige Batterieflüsse und lokale Kalendergrenzen |
| Verbraucherenergie | `lib/consumer-energy.js`, `lib/day-comparison.js` | Gemessene Geräteenergie und vergleichbare Zeitabschnitte mit Quellenidentität |
| Empfehlungen | `lib/insights.js` | Beobachteter PV-Überschuss, Stabilität, Prioritäten und nachvollziehbare Empfehlungen |
| PV-Prognose | `lib/forecast.js`, `lib/weather-model.js`, `lib/solar-model.js` | Standort-/Dachkonfiguration, Online-Wettermodell oder lokale Sonnenstandsberechnung |
| Heizung | `lib/heating.js`, `lib/heating-service.js`, `lib/heating-outputs.js` | Raum-/Außenwerte, Gebäudemodell, begrenzte optionale Eingriffe und Besitz-/Rückstellstatus |
| Wasser und Brennstoff | `lib/utilities.js`, `lib/utilities-service.js`, `lib/fuel-inventory.js` | Getrennte Ressourcenarchive, Durchfluss/Zählerwahl, Tankkapazität, Füllereignisse und Restschätzung |
| Datenbank | `lib/storage-service.js`, `lib/storage-checkpoint.js` | Zusätzliche Archivierung, kleine Sicherungsblöcke und Bestätigung durch Zurücklesen |
| Vollsicherung | `lib/backup.js`, `lib/backup-service.js` | Eigene Einstellungen/Archive, Prüfsummen, Vorschau und kontrollierte Wiederherstellung |
| Spezielle Alt-Migration | `lib/migration.js` | Ausschließlich die ausdrücklich unterstützte ältere Skriptstruktur |
| Weboberfläche | `www/` | Übersicht, Diagramme, Berichte, Quellen, Optionen, Bedienung auf schmalen Geräten und Einbettung |
| Qualitätssicherung | `test/` | Bestehende automatisierte Prüfungen der Berechnungs- und Betriebsregeln |

## Ergänzungen in 0.10.2

Die neuen Informationsfunktionen ergänzen diesen Aufbau um eine serverseitige öffentliche Release-Prüfung und eine eigene Seite **Über & Lizenzen**. Die Versionsprüfung besitzt keinen Installationspfad und erhält keine Funktion zum Schalten fremder Geräte. Details und verbleibende Prüfpunkte stehen in [Steuerungs-Kompatibilität](control-compatibility.md) und [Änderungen 0.10.2](changes-v0.10.2.md).

Dieser Bericht enthält keine Hauskonfigurationen, Zugangsdaten, privaten IP-Adressen oder Messhistorien. Öffentliche Beispielscreenshots sind getrennt als synthetische Demo gekennzeichnet.
