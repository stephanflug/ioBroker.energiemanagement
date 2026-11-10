# Mithelfen

Fehler und Verbesserungsideen können über die [GitHub-Issues](https://github.com/stephanflug/ioBroker.energiemanagement/issues) gemeldet werden. Die Vorlagen fragen die Angaben ab, die für eine Prüfung hilfreich sind.

Für Änderungen:

1. Repository forken und einen eigenen Branch erstellen.
2. Node.js ab Version 20 verwenden; für neue Installationen wird eine aktuelle ioBroker-kompatible LTS-Version empfohlen.
3. `npm ci --ignore-scripts` ausführen.
4. Änderungen mit `npm run check` und `npm test` prüfen.
5. Bei sichtbaren Änderungen die Bedienungsanleitung und Screenshots mit Beispieldaten aktualisieren.
6. Pull Request mit Beschreibung, Auswirkung und Prüfung erstellen.

Tests für Messlogik sollen insbesondere gültige Nullwerte, fehlende Daten, Quellenwechsel und Neustarts berücksichtigen. Änderungen an der Geräteansteuerung müssen die vorhandenen Freigaben und die Rücknahme eigener Eingriffe erhalten.

Bitte keine persönlichen Hauskonfigurationen, echten Sicherungsdateien, Zugangsdaten oder privaten Messverläufe in Commits oder Issues aufnehmen. Screenshots in dieser Dokumentation verwenden ausschließlich synthetische Beispieldaten.

Der Quellcode steht unter der [MIT-Lizenz](LICENSE). Aktuelle Grenzen und Installationshinweise stehen in der [Dokumentation](README.md).
