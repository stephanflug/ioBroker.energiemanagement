# Testumgebung für Issues #7–#11

**Nur Entwicklungsstand für `energiemanagement.1`; keine Veröffentlichung oder Migration nach `energiemanagement.0`.**

Testoberfläche im bestehenden ioBroker-Webserver:

`http://192.168.2.80:8082/energiemanagement/test-issues/index.html?instance=energiemanagement.1`

Die isolierte Startseite in `index.html` verwendet die vorhandenen produktiven Webmodule lesend und lädt `features.js` / `features.css`. Die Originalseite `/energiemanagement/index.html` wird nicht ersetzt. Diese Vorschau ist ein **Testprototyp**, keine fertige Adapterintegration.

## Umgesetzte Testfunktionen

- **#7 Brennstoff-Gesamtzähler:** letzter bestätigter Zahlenwert im Bereich „Brennstoff“ einschließlich Zeitstempel und Kennzeichnung älterer Werte; die dahinterliegende reguläre Backend-Verbrauchsauswertung bleibt unangetastet.
- **#8 Tages-/Monatsreset:** im Bereich Einstellungen Test-Reset von Wasser und Brennstoff. Die Originaldaten in `analytics.utilitiesArchive_JSON` bleiben erhalten; der Reset wird als separat gespeicherter Offset in `energiemanagement.1.test.utilityAdjustments_JSON` geführt und in der **Testauswertung** berücksichtigt. Die reguläre Verbrauchsauswertung des bisherigen Adapters wird damit **noch nicht zurückgesetzt**.
- **#9 Wasserzählerwechsel:** neue lesbare numerische Datenpunkt-ID wählen und nach Bestätigung ausschließlich `energiemanagement.1.config.utilities_JSON` aktualisieren; Bestätigung des Adapters abwarten. Der Testwechsellauf auf einen separaten Mock-Zähler und zurück wurde erfolgreich durchgeführt.
- **#10 Energieauswertung:** zwölf Monatsbalken für Wasser und gewählten Brennstoff mit Daten aus dem vorhandenen Verbrauchsarchiv.
- **#11 Heizgradtage:** Region aus `config.forecast.location`, Außensensor aus `config.heating.outdoorId`. Tagesmittel aus den aufgezeichneten Temperaturen (Testhistorie initialisiert mit vorhandenen Stunden-Mittelwerten für 8.–14.11.2026); Heizgradtage aus konfigurierbarer Heizgrenze und Bezugsinnentemperatur. Blaue Monatsbalken und grüne Temperaturkurve sowie virtuelle Anzeige „Heizen empfohlen / Kein Heizbedarf / Keine gültigen Daten“ auf der Übersicht. Der TRUE/FALSE-Status liegt in `energiemanagement.1.test.heatingDemand`, seine Gültigkeit in `energiemanagement.1.test.heatingDemandValid`.

## Sicherung und Schutz

Der Hintergrundcode `runner.js` läuft als **ioBroker-JavaScript-Skript** `script.js.common.energiemanagement1_features` und verarbeitet ausschließlich die Testinstanz. Er schreibt keine Homematic-, Relais-, Schalt- oder sonstigen Fremddatenpunkte und aktiviert keine externen Ausgangsfunktionen.

Der auswählbare Boolean-Zieldatenpunkt ist nur eine **Zuordnung für spätere Tests**, keine Hardwareaktivierung. Die Testinstanz hat `config.hardwareMaster=false`.

Datenpunkte unter `energiemanagement.1.test.*` sind zusätzliche Entwicklungsobjekte. Der Entwicklungszweig hier dokumentiert die Dateien; eine vollständige Übernahme in die Adapter-Module, konsistente Resets für die regulären Widgets, Migrationslogik und weitergehende Integrationstests sind **noch offen**.

## Testnachweise

- Isolierte Preview-Ressourcen über Webport 8082 erreichbar (HTTP 200), Syntaxprüfung von `features.js` erfolgreich.
- DOM-Smoke-Test: Testmodule unter Übersicht, Energieauswertung, Einstellungen, Regelungsfunktionen erfolgreich eingefügt.
- Reset der Tages-/Monats-Testauswertung ergab 0; nach Rücknahme wurden die ursprünglichen 0,1 m³ wieder angezeigt.
- Wasserzählerwechsel in Testinstanz auf separaten Mock-Zähler und zurück bestätigt. Produktive Quellen von Instanz 0 unverändert.
- Heizgradtage-Tagesarchiv aus bestehenden realen Temperaturhistorie-Stundenmitteln auf Testinstanz initialisiert.

**Offene nächste Schritte:** Benutzer-Abnahme der echten Browser-Klickstrecke; normale Adapteroberfläche und native Berechnung/Datenspeicherung integrieren; Reset-/Zählerwechselhistorie und Backups produktionsreif testen; erst danach neue Version freigeben.
