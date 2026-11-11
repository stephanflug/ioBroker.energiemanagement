# Veröffentlichungsstand und offene Schritte

## GitHub v0.10.2

Nach erfolgreicher Installation hat der Projektinhaber die Veröffentlichung auf GitHub ausdrücklich freigegeben. Das öffentliche Projekt enthält Quellcode, deutsche und englische Anleitungen, synthetische Screenshots, Issue-Vorlagen und Tests.

- [Projekt und Dokumentation](https://github.com/stephanflug/ioBroker.energiemanagement)
- [Release v0.10.2 und Installationsdateien](https://github.com/stephanflug/ioBroker.energiemanagement/releases/tag/v0.10.2)
- [GitHub-Testläufe](https://github.com/stephanflug/ioBroker.energiemanagement/actions/workflows/test-and-release.yml)

Die Veröffentlichung erfolgt als **Vorabversion**, passend zum unveränderten Entwicklungsstatus des bereits getesteten Pakets. Die serverseitige Versionsprüfung berücksichtigt nur stabile Releases. Das Ausbleiben eines stabilen Updateziels ist für dieses Release beabsichtigt.

Das TGZ bleibt bytegleich zur geprüften und vom Projektinhaber erfolgreich installierten Datei. Die öffentliche Dokumentation wird um dauerhafte GitHub-Downloads ergänzt; im ursprünglichen TGZ enthaltene Vorbereitungsberichte dokumentieren den Stand vor der Veröffentlichungsfreigabe. Prüfsummen unterscheiden das installierbare Paket vom Projekt-ZIP.

Die bereitgestellte GitHub-Verbindung besitzt Schreibzugriff auf Projektdateien. Die Änderung der Repository-Beschreibung und Topics wurde durch GitHub mit HTTP 403 („Resource not accessible by integration“) abgewiesen. Diese beiden Anzeigeangaben sind gegebenenfalls direkt in GitHub unter **About → Zahnrad** zu ergänzen; die README enthält bereits Beschreibung und Funktionsübersicht. Vorgeschlagene Beschreibung: „Herstellerneutrales Energiemanagement für ioBroker: PV, Lastmanagement, Heizung, Wasser, Regenwasser und Brennstoffe.“ Geeignete Topics: `iobroker`, `energy-management`, `photovoltaics`, `smart-home`, `energy-monitoring`, `load-management`.

## npm

Eine npm-Veröffentlichung ist noch offen und wurde nicht mit der Freigabe für GitHub beauftragt.

- Zugriff auf das gewünschte npm-Konto und die Maintainer-Berechtigung klären.
- Vor einer stabilen Version offene Code-/Checker-Punkte bearbeiten und passende Regressionstests durchführen.
- Paketname, Version, Metadaten, Lizenz und Paketinhalt erneut kontrollieren.
- npm-Veröffentlichung gesondert freigeben und anschließend das tatsächlich veröffentlichte Paket prüfen.
- Keine bereits veröffentlichte Versionsnummer überschreiben. Programmänderungen nach dem ausgelieferten 0.10.2-Paket erhalten eine neue Versionsnummer.

Die öffentliche Entwickleradresse `steuerung@gmx.at` ist ausdrücklich freigegeben. Die frühere lokale DNS-/MX-Warnung des Checkers ist kein Nachweis einer ungültigen Adresse; sie ist vor Einreichung mit geeigneter DNS-Auflösung erneut zu prüfen.

## Offizielle ioBroker-Adapterliste

Eine Aufnahme wurde noch nicht beantragt oder bestätigt. Sie setzt unter anderem ein geeignetes npm-Paket und die zum Einreichungszeitpunkt geltenden ioBroker-Anforderungen voraus. Die [Adapteraufnahme-Checkliste](../de/adapteraufnahme-checkliste.md) und der [Repository-Checker-Bericht](official-checker.md) benennen die offenen Punkte.

## Technische Nachverfolgung

- Im [Testbericht](test-results-v0.10.2.md) sind die vor Veröffentlichung tatsächlich ausgeführten Prüfungen dokumentiert: je 268 Tests unter Node.js 22/24/26, Browserprüfung aller 14 Ansichten in vier Breiten und fünf erfolgreiche Tests im getrennten echten ioBroker. TGZ-Installation/Upgrade sowie Übernahme alter Konfigurationen und Neustart sind ebenfalls belegt.
- Öffentliche GitHub-Läufe zeigen ihren aktuellen Zustand direkt unter Actions. Die historische Testübersicht behauptet keine späteren Ergebnisse auf Windows oder macOS.
- Vorhandene native Timer und eigene Wartefunktionen im Mess-/Steuerungscode vor einer offiziellen Einreichung gesondert bewerten und bearbeiten.
- Den bereits in 0.10.1 vorhandenen Verbraucher-Rücknahme-Prüfpunkt gesondert bewerten; siehe [Steuerungs-Kompatibilität](control-compatibility.md).
- Providerabhängige Datenbankkompatibilität und physische Gerätesteuerung nicht allein aus simulierten Tests ableiten.
- Ein automatischer npm-Deploy ist bewusst nicht eingerichtet. Der manuelle GitHub-Release-Workflow veröffentlicht kein npm-Paket.
- Den Repository-Checker vor der offiziellen Einreichung gegen den dann aktuellen öffentlichen Stand erneut ausführen. Ein Werkzeugstatus allein ersetzt bei gleichzeitig aufgelisteten Fehlern keine vollständige Freigabe.

Diese Veröffentlichung nimmt keine Installation oder Änderung auf einem ioBroker-System vor.
