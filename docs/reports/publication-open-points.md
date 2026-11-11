# Offene Schritte für GitHub, npm und die offizielle Adapteraufnahme

## Aktuelle Freigabe

Der Auftrag erlaubt die vollständige Vorbereitung und Prüfung von 0.10.2 als Projekt-ZIP und installierbares TGZ. Er erlaubt **keine Veröffentlichung** auf GitHub oder npm, keinen Pull Request und keine Änderung der produktiven 0.10.1. Der Zugriff auf ein angelegtes Repository ersetzt diese Veröffentlichungsfreigabe nicht.

## GitHub

1. Abschließende Artefakte, Prüfsummen, [Änderungen](changes-v0.10.2.md) und [Testbericht](test-results-v0.10.2.md) durchsehen.
2. Offene technische Punkte und den gewünschten Entwicklungs-/stabilen Release-Kanal festlegen.
3. Veröffentlichung ausdrücklich freigeben.
4. Erst dann Quellcode, Dokumentation, Beispielscreenshots und Workflows in `stephanflug/ioBroker.energiemanagement` übertragen.
5. Nach erfolgreicher Prüfung ein passendes Versions-Tag und Release mit den tatsächlich gebauten Dateien erstellen.
6. Öffentliche Links, Paketdownload, Prüfsummen und CI-Ergebnis kontrollieren.

Bis ein öffentliches stabiles Release vorhanden ist, ist der neutrale Versionsstatus in der Anwendung beabsichtigt. Ein Repository allein erzeugt kein stabiles Release.

## npm

- Paketname, Version, Metadaten, Lizenz und Paketinhalt mit den finalen Prüfergebnissen abgleichen.
- Zugriff auf das gewünschte npm-Konto beziehungsweise die Maintainer-Berechtigung und dessen Veröffentlichungsvoraussetzungen klären.
- Keine bereits veröffentlichte Version überschreiben; bei Änderungen eine neue Version vorbereiten.
- npm-Veröffentlichung gesondert freigeben und erst anschließend ausführen.
- Installierbarkeit des tatsächlich veröffentlichten Pakets unabhängig von der TGZ-Datei prüfen.

Die Zustimmung zu GitHub ist keine automatische npm-Veröffentlichungsfreigabe.

Die öffentliche Entwickleradresse `steuerung@gmx.at` wurde ausdrücklich freigegeben und ist in den vorbereiteten Metadaten enthalten. Sie ist kein ungeklärter Kontakt-Platzhalter. Die lokale DNS-/MX-Warnung des Checkers wird vor einer späteren Einreichung erneut geprüft; sie wird nicht als Nachweis einer ungültigen Adresse gewertet.

## Offizielle ioBroker-Adapterliste

Die [Checkliste zur Adapteraufnahme](../de/adapteraufnahme-checkliste.md) und der [Repository-Checker-Bericht](official-checker.md) halten die tatsächlichen Anforderungen und offenen Prüfungen fest. Ein bestandener lokaler Metadatencheck ist keine Aufnahmezusage.

Vor einer Einreichung sind unter anderem ein öffentlich erreichbarer Projektstand, passende npm-Veröffentlichung, vollständige Lizenz-/Maintainerdaten, erfolgreiche Prüfungen und die zum Einreichungszeitpunkt geltenden ioBroker-Regeln erforderlich. Eine Beantragung beziehungsweise ein Pull Request erfolgt separat nach Freigabe.

## Technische Nachverfolgung

- Die abgeschlossenen Tests sind im [Testbericht](test-results-v0.10.2.md) festgehalten: je 268 Node-Tests unter Node.js 22/24/26, Browserprüfung aller 14 Ansichten in vier Breiten und fünf erfolgreiche Tests im getrennten echten ioBroker. TGZ-Installation/Upgrade sowie Übernahme alter Konfigurationen und Neustart sind dort ebenfalls belegt.
- Vor einer späteren Veröffentlichung die vorbereiteten GitHub-Workflows tatsächlich ausführen lassen und deren Ergebnisse prüfen. Windows und macOS wurden in dieser Linux-Umgebung nicht ausgeführt. Abweichungen vom geprüften Programmstand erfordern passende erneute Prüfungen.
- Providerabhängige Datenbankkompatibilität nicht aus simulierten Tests allein ableiten.
- Den bereits in 0.10.1 vorhandenen Verbraucher-Rücknahme-Prüfpunkt getrennt von dieser Informationsversion bewerten; siehe [Steuerungs-Kompatibilität](control-compatibility.md).
- Native Timer und eigene Wartefunktionen im vorhandenen Mess-/Steuerungscode nach separater Bewertung bearbeiten. Die Informationsversion ist keine stillschweigende Freigabe, diese Abläufe umzubauen.
- Der abschließend erneut ausgeführte Repository-Checker meldet sechs offene Fehlerkennungen: npm-Veröffentlichung, Deploy-Job, vorhandene Intervalle/Timeouts sowie GitHub-Beschreibung/Topics. Ein fehlender Deploy-Job wird nicht durch einen ungefragt aktivierten npm-Publish ersetzt.
- Vor offizieller Einreichung den Repository-Checker erneut gegen den dann aktuellen öffentlichen Stand ausführen. Die Ausgabe `FINAL status 'OK'` allein ist bei gleichzeitig aufgelisteten Fehlern keine vollständige Freigabe.

Die produktive Installation und ihre Daten bleiben von der Vorbereitung und dieser Liste unberührt.
