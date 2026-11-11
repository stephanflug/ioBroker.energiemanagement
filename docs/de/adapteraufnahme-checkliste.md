# Vorbereitung für die offizielle ioBroker-Adapterliste

Stand dieser Vorbereitung: **0.10.2, 11. November 2026**. Diese Liste ist keine Aufnahmebestätigung. Das Projekt wird in diesem Auftrag weder auf GitHub oder npm veröffentlicht noch bei `ioBroker/ioBroker.repositories` eingereicht.

## Vorbereiteter Projektstand

| Punkt | Stand |
| --- | --- |
| Paketname und Adaptername | `iobroker.energiemanagement` / `energiemanagement` |
| Version | `package.json` und `io-package.json`: `0.10.2` |
| Node.js | Ab Version 22 deklariert; die tatsächlichen Prüfungen stehen im [Testbericht](../reports/test-results-v0.10.2.md). |
| ioBroker-Abhängigkeiten | js-controller ab 6.0.11 und Admin ab 7.6.20 in den Metadaten; eine deklarierte Mindestversion ersetzt keinen Test jeder älteren Controller-Version. |
| Laufzeitbibliotheken | `@iobroker/adapter-core` und die direkt deklarierte Semver-Bibliothek; Lockdatei vorhanden. |
| Entwicklerkontakt | Stephan Ebner, `steuerung@gmx.at`; für die spätere öffentliche Verwendung ausdrücklich freigegeben. |
| Lizenz | MIT, vollständige `LICENSE`, lokale Lizenzanzeige und zusätzliche Drittanbieter-Hinweise. |
| Icon und Admin | Bestehendes SVG-Icon, JSON-Konfiguration, Übersetzungsdateien und responsive Feldgrößen vorhanden. |
| Web-Verknüpfung | Bestehende Link- und Kachelinhalte erhalten; `welcomeScreen` an das erwartete Array-Schema angepasst. |
| Dokumentation | Englische Haupt-README, deutsche README, DE/EN-Anleitungen, Datenquellen- und Sicherungshinweise sowie synthetische Screenshots. |
| Tests | Je 268 Tests unter Node.js 22/24/26, Browserprüfungen und fünf echte isolierte ioBroker-Tests bestanden; Einzelheiten und Grenzen im Testbericht. `@iobroker/testing` ist als Entwicklungsabhängigkeit enthalten. |
| Veröffentlichungsart | Entwicklungsstand in `lib/build-info.json`; keine automatische Installation durch die Versionsprüfung. |

## Repository-Checker

Als Regelstand wurde **`@iobroker/repochecker` 5.24.0** verwendet. Der lokale Aufruf lautet:

```bash
npx @iobroker/repochecker@5.24.0 \
  https://github.com/stephanflug/ioBroker.energiemanagement --local
```

Der lokale Modus ist laut Werkzeug experimentell. Er liest lokale Dateien, prüft aber auch externe Angaben wie npm, Repository-Eigenschaften und Workflow-Ergebnisse. Deshalb kann ein absichtlich unveröffentlichtes Projekt diese externen Prüfungen noch nicht erfüllen. Der [Checker-Bericht](../reports/official-checker.md) trennt korrigierte Metadaten von offenen Befunden.

## Vor einer späteren Einreichung zu erledigen

1. **Projektstand freigeben.** Änderungen, Artefakte, Prüfsummen und Testergebnisse durchsehen und die Veröffentlichung ausdrücklich erlauben. Die produktive 0.10.1 wird dadurch nicht automatisch aktualisiert.
2. **GitHub veröffentlichen.** Vorbereiteten Quellstand übertragen; Beschreibung und geeignete Topics setzen; CI ausführen und prüfen. Tag, Release, Installationspaket und Dokumentationslinks erst dann öffentlich anlegen.
3. **Release- und CI-Konfiguration abschließen.** Die offiziellen Anforderungen an Testjobs, Tag-Auslöser und Release-Ablauf mit dem dann aktuellen Regelstand abgleichen. Ein npm-Deploy darf erst nach gesonderter Freigabe und eingerichteter npm-Berechtigung aktiviert werden.
4. **npm vorbereiten und freigeben.** Zugang zum vorgesehenen Maintainer-Konto, Schutzmaßnahmen beziehungsweise Trusted Publishing und Paketinhalt klären. Erst nach Freigabe veröffentlichen; eine bereits veröffentlichte Versionsnummer nicht überschreiben. Danach das tatsächlich veröffentlichte Paket getrennt installieren und prüfen.
5. **Bestehende Codebefunde separat bearbeiten.** Der Checker meldet native Timer und eigene Wartefunktionen in bereits vorhandenen Modulen. Deren Umstellung kann Mess- oder Steuerungsabläufe berühren und wurde in diesem Informationsauftrag nicht stillschweigend vorgenommen. Dafür sind eine getrennte Bewertung, gegebenenfalls Freigabe und Regressionstests nötig.
6. **Checker erneut vollständig ausführen.** Aktuelle Fehler, Warnungen und Hinweise nach den freigegebenen Anpassungen überprüfen. Ein Werkzeugstatus oder bestandene Metadatentests ersetzen keine fachliche Prüfung der Gerätesteuerung.
7. **Aufnahme separat beantragen.** Erst mit öffentlichem Projekt, geeignetem npm-Stand und belegten Prüfungen die zum Einreichungszeitpunkt geltende Anleitung von `ioBroker/ioBroker.repositories` befolgen. Eine Einreichung oder ein Pull Request ist nicht Teil dieses Auftrags.

## Weitere Hinweise aus der Prüfung

- Ein Lint-Workflow, die ioBroker-Entwicklungswerkzeuge, TypeScript-/Typprüfungs-Konfiguration, Dependabot und die Changelog-Struktur wurden vom Checker zusätzlich empfohlen. Diese Vorschläge sind nach Nutzen und aktuellem Projektstand zu bewerten; sie wurden nicht als erledigt dargestellt.
- Die lokale MX-Prüfung konnte `gmx.at` nicht bestätigen. Das ist **keine Feststellung, dass die freigegebene Adresse ungültig ist**. Die öffentliche Kontaktadresse und ihre Erreichbarkeit sind vor einer Einreichung auf einem geeigneten System erneut zu prüfen.
- Das Paket enthält keine persönlichen Hauskonfigurationen oder Messsicherungen. Vor dem späteren Upload sollte die Prüfung des konkreten finalen ZIP/TGZ wiederholt werden.

Siehe auch [offene Veröffentlichungsschritte](../reports/publication-open-points.md) und [Steuerungs-Kompatibilität](../reports/control-compatibility.md).
