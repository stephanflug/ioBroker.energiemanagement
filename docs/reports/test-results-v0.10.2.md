# Prüfbericht 0.10.2

> Historischer Prüfstand vor der GitHub-Veröffentlichung. Den aktuellen Veröffentlichungsstand enthält [Veröffentlichung und offene Schritte](publication-open-points.md).

## Tatsächlich ausgeführte Prüfungen

Stand: **11. November 2026**. Die Prüfungen liefen in einer getrennten Linux-Entwicklungsumgebung mit synthetischen Messwerten. Die produktive Hausanlage wurde weder aktualisiert noch für Schreibtests verwendet.

Die Ausgangsbasis 0.10.1 hatte 246 erfolgreiche automatisierte Tests. Für 0.10.2 sind es **268 Tests pro ausgeführter Node.js-Version**, einschließlich 22 neuer Fälle zur Versionsprüfung. Die installierte Referenz wurde zuvor über 93 Dateien und die ursprüngliche TGZ-Prüfsumme abgeglichen.

| Prüfung | Tatsächliches Ergebnis |
| --- | --- |
| Vollständige Node-Tests | **268/268 bestanden unter Node.js 22, 24 und 26**, jeweils 0 Fehler, 0 übersprungen. Standardlauf: Node.js 24.22.1. |
| Syntax | `npm run check` bestanden: `main.js` sowie JavaScript unter `lib/` und `www/`. |
| Öffentliche Release-Prüfung | 22 neue Fälle bestanden: semantischer Vergleich, Entwürfe/Vorabversionen, leeres Repository/404, Netzfehler, kompletter Anfrage-Timeout, Rate-Limit/Retry-After, Cache und Beenden während einer Anfrage. Netzwerkantworten sind kontrollierte Testdaten. |
| Informationsseite | Browserprüfung bestanden: vollständige lokale MIT-Lizenz, Drittanbietertexte, freigegebene Kontaktadresse, Projektlinks und tatsächliche Laufzeitversion. |
| Desktop und Mobil | Chromium/Playwright: alle **14 Ansichten bei 320, 390, 768 und 1440 Pixeln** geprüft; Versionsanzeige und Popover passen, kein horizontaler Seitenüberlauf. Mobiler Zugang zur Informationsseite geprüft. |
| Zustandsaktualisierung | Alle sechs Versionszustände geprüft. Kein Reload, Verlust von Scrollposition, offenem Menü/Popover oder ungespeichertem Formularentwurf. Release-Notizen bleiben Text; ungültige Release-URLs werden verworfen. |
| Getrennter ioBroker | **5/5 Integrationstests bestanden**, mit `@iobroker/testing` 6.3.0, js-controller 7.2.5 und Node.js 24.22.1; echte lokale Datenbank und Adapterprozesse. |
| Übernahme von 0.10.1-Daten | Im Integrationstest vorgegebene Quellen, Verbraucherprioritäten, Einstellungen, Heizungs-/Ressourcenkonfigurationen und Energie-/Verbrauchsarchive erhalten; auch nach echtem Adapterprozess-Neustart. |
| GitHub-Ausfall | Im echten Testadapter gezielt simuliert: Versionsstatus meldet die fehlende Verbindung, die nächsten regulären Messzyklen laufen weiter. Kein fremder Aktorschreibbefehl; Hardware-Master bleibt aus. |
| TGZ-Installation und Update | Auf demselben isolierten System zunächst das ursprüngliche 0.10.1-TGZ, danach das vorbereitete 0.10.2-TGZ mit `iobroker url` installiert. CLI erfolgreich, neue Webdateien hochgeladen, installierte Paketversion 0.10.2. Quellenzustand einschließlich Zeitstempeln vor/nach Update identisch. |
| Steuerungsabgrenzung | Bestehende Berechnungs-/Steuermodule sowie die Kernmethoden `tick`, `deactivate`, `driveHardware`, `planConsumers` und `readMeasures` unverändert gegenüber der installierten Referenz. `lib/backup.js` ergänzt ausschließlich eigene Versionsinformations-/Cache-Daten. |
| Metadaten-Kompatibilität | Native Vorgaben, vorhandene `localLinks` und Inhalt der Web-Startkachel erhalten; nur das geforderte Array-Format der Startkachel geändert. |
| Offizieller Repository-Checker | Letzter lokaler Lauf mit 5.24.0: **6 offene Fehlerkennungen**, einschließlich bewusst fehlender Veröffentlichung und vorhandener Timer. Kein fehlerfreies offizielles Ergebnis behauptet; siehe [Detailbericht](official-checker.md). |
| Dokumentation und Datenschutz | Relative Dateilinks geprüft, 15 synthetische Screenshots. Keine produktiven Hauskonfigurationen, Messarchive oder Zugangsdaten im freizugebenden Projekt. Öffentlicher Kontakt: `steuerung@gmx.at`. |

## Prüfungen wiederholen

Im entpackten Projekt mit passender Node.js-Version:

```bash
npm ci --ignore-scripts
npm run check
npm test
node test/browser/version-about.cjs
npm run test:integration
npm pack --dry-run
```

Der Browserlauf benötigt Chromium. Alternativ dessen Pfad über `PLAYWRIGHT_CHROMIUM_EXECUTABLE` setzen. Die offizielle Integrationshilfe legt ihr **eigenes Testsystem im temporären Verzeichnis** an; sie benötigt Netzwerkzugriff für Testabhängigkeiten und darf nicht auf ein Produktivverzeichnis umgestellt werden. Der GitHub-Ausfall wird ausschließlich für diesen Testprozess über die mitgelieferte Fixture erzwungen.

Die vorbereitete GitHub-Testmatrix umfasst Node.js 22/24/26 und Ubuntu/Windows/macOS. **Ausgeführt wurde lokal unter Linux**; öffentliche GitHub-Workflow-Läufe sowie Windows-/macOS-Läufe werden nicht als bestanden ausgegeben.

## Paketbereitstellung

Das finale TGZ und der vollständige Projekt-ZIP enthalten diesen Bericht, Änderungsübersicht, Installationsanleitungen und offene Veröffentlichungspunkte. Separate SHA-256-Dateien beziehen sich auf die tatsächlich ausgelieferten Archive. Im TGZ-Installationstest wurde bereits derselbe Programmstand verwendet; anschließend wurden nur die Abschlussberichte vervollständigt.

## Bewusst nicht durchgeführt

- Keine Installation oder Aktualisierung auf der produktiven Version 0.10.1.
- Keine Veröffentlichung auf GitHub oder npm.
- Kein Pull Request zur offiziellen Adapterliste.
- Keine Änderung bestehender Steuerungslogik ohne gesonderte Freigabe.

Nicht abgedeckt sind eine erneute Prüfung sämtlicher physischer Hausgeräte und aller externen Datenbankanbieter, eine produktive Installation oder die Installation eines veröffentlichten npm-Pakets. Offene Punkte stehen in [Veröffentlichung und Adapteraufnahme](publication-open-points.md).
