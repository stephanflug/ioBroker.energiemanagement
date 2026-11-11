# Steuerungs- und Datenkompatibilität 0.10.2

> Historischer Prüfstand vor der GitHub-Veröffentlichung. Den aktuellen Veröffentlichungsstand enthält [Veröffentlichung und offene Schritte](publication-open-points.md).

## Freigaberahmen

Der Auftrag erlaubt Informationsseite, Versionshinweise, Beschriftungen, Metadaten und Veröffentlichungsvorbereitung. Eine Änderung bestehender Steuerungslogik ist ausdrücklich nicht Teil dieser Freigabe. Insbesondere wird v0.10.2 nicht auf der produktiven v0.10.1 installiert.

## Vergleich mit der installierten Referenz

Die folgenden Berechnungs-, Steuerungs- und Speichermodule wurden mit der verifizierten installierten Referenz 0.10.1 verglichen. Die angegebene Hash-Vorsilbe bezeichnet jeweils die Referenzdatei; der vollständige Quellstand liegt im vorbereiteten Projekt.

| Datei | Referenz SHA-256, gekürzt | Stand beim Dokumentationsabgleich |
| --- | --- | --- |
| `lib/engine.js` | `fcacc62cdb211f8b…` | Identisch |
| `lib/normalize.js` | `5a8336653429105f…` | Identisch |
| `lib/consumer-energy.js` | `f544b25bf2534a4e…` | Identisch |
| `lib/energy-summary.js` | `27c041dfc326a6ea…` | Identisch |
| `lib/day-comparison.js` | `4cdb7e0b5b68de53…` | Identisch |
| `lib/insights.js` | `62843e8d0b586e29…` | Identisch |
| `lib/heating.js` | `a99220855fec066d…` | Identisch |
| `lib/heating-service.js` | `dcf758058ce0cc9a…` | Identisch |
| `lib/heating-outputs.js` | `cc339e09b1fd5d75…` | Identisch |
| `lib/heating-units.js` | `9801b0a4ed813d4b…` | Identisch |
| `lib/utilities.js` | `85569fdae66e6653…` | Identisch |
| `lib/utilities-service.js` | `02847739913bc863…` | Identisch |
| `lib/fuel-inventory.js` | `c4a49154aba822f0…` | Identisch |
| `lib/source-config.js` | `80a7dd58e4d03738…` | Identisch |
| `lib/storage-service.js` | `4a667ac2e2ea257e…` | Identisch |
| `lib/storage-checkpoint.js` | `0fdf5850cba51a94…` | Identisch |
| `lib/backup.js` | `540c4d355b1cfb34…` | Ausschließlich Versionsinformation/-Cache ergänzt; neue Cache-Struktur validiert |
| `lib/backup-service.js` | `4d69ac3c10917c24…` | Identisch |
| `lib/forecast.js` | `91c7452c1165448b…` | Identisch |
| `lib/weather-model.js` | `7a3966285165568f…` | Identisch |
| `lib/solar-model.js` | `728642674759032a…` | Identisch |
| `lib/migration.js` | `6d3cee80cd31c4c0…` | Identisch |

Die ergänzende Informationsintegration in `main.js` wurde getrennt von diesen Modulen geprüft: `tick`, `deactivate`, `driveHardware`, `planConsumers` und `readMeasures` sind gegenüber der installierten Referenz bytegleich. Die Informationsprüfung verwendet einen eigenen Adapter-Timer, schreibt nur eigene Informationszustände und ist nicht Teil des Mess-/Steuerungszyklus. Native Vorgaben, `localLinks` und Inhalt der Web-Startkachel sind erhalten.

## Zu erhaltende Regeln

- Vorhandene Konfigurationen und Datenpunktzuordnungen werden weiterverwendet.
- Bestehende gespeicherte Energie- und Ressourcenarchive werden nicht gelöscht oder zurückgesetzt.
- Fehlende Messwerte bleiben von gültigen Nullwerten unterscheidbar.
- Quellenwechsel und unbeobachtete Ausfallzeiten werden nicht als durchgehend gemessene Energie behandelt.
- Neue Installationen beginnen ohne Hardware-Master, aktivierte Verbraucher-Ausgänge oder automatische Heizungssteuerung.
- Empfehlungen und Ertragsprognosen erteilen allein keine physische Gerätefreigabe.
- Das Ausblenden der Heizung deaktiviert weiterhin die Optimierung; erneutes Einblenden reaktiviert sie nicht automatisch.
- Eine Wiederherstellung erhält ihre bestehenden Prüfungen und nimmt eigene aktive Ausgänge zuerst bestätigt zurück.
- Die Versionsprüfung schreibt ausschließlich ihre eigenen Informations- und Cache-Datenpunkte. Sie installiert keine Software.
- GitHub-Abfragen dürfen nicht als abgewarteter Netzaufruf in die Mess-/Steuerungsberechnung eingebaut werden. Ein GitHub-Fehler darf den Fehlerpfad der Verbrauchersteuerung nicht auslösen.
- Ein Statuswechsel der Versionsinformation baut keine Formulare oder Navigation neu auf und löst keinen Browser-Reload aus.

## Bestehender gesonderter Prüfpunkt

Bei der Analyse der unveränderten 0.10.1 wurde ein bereits vorhandener Unterschied in der Rücknahme von Verbraucher-Ausgängen festgestellt: `main.deactivate()` kann einen Eintrag aus `activeHardware` auch nach einem Schreibfehler entfernen; `sendIfChanged()` überspringt einen gleichen Wert ohne zusätzliche ACK-Prüfung. Die Heizungs-/Wiederherstellungslogik enthält hierfür andere Prüfungen.

Dieser Punkt ist **kein neu eingeführtes Verhalten von 0.10.2** und wurde im Informationsauftrag nicht stillschweigend geändert. Eine mögliche Korrektur benötigt eine eigene Freigabe, gezielte Tests und Prüfung der Auswirkungen auf die physische Steuerung. Bis dahin gilt die bestehende Anwendungsgrenze: Die Hausautomation ersetzt keine unabhängige Geräte- oder Schutzregelung.

## Prüfbelege

Die tatsächlich durchgeführten Prüfungen stehen im [Testbericht](test-results-v0.10.2.md). Auf einem separaten echten ioBroker-Testsystem wurden die Übernahme von 0.10.1-Zuständen, Weitererfassung bei GitHub-Ausfall, ein echter Adapter-Neustart und die CLI-TGZ-Installation geprüft. Aussagen über die Produktivinstallation beruhen weiterhin ausschließlich auf lesender Analyse und Dateivergleich; dort wurde nichts installiert.
