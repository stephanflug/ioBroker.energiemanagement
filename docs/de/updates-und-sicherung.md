# Updates, Vollsicherung und Systemwechsel

Energiemanagement besitzt **eine gemeinsame Vollsicherung** für seine eigenen gespeicherten Daten. Sie befindet sich unter **Einstellungen → Vollsicherung & Wiederherstellung**.

## Was die Vollsicherung enthält

- Einstellungen, Datenpunktzuordnungen und Verbraucher mit Prioritäten und Ausgangszuordnungen.
- Gespeicherte Strom-, Batterie-, Wasser-, Regenwasser- und Brennstoffauswertungen.
- Aufgezeichnete Leistungsverläufe, Temperaturverläufe und Profile für den Tagesvergleich innerhalb der jeweiligen Aufbewahrungszeiten.
- Tankkapazitäten, berechnete Pellets-/Ölbestände und Füllereignisse.
- Einstellungen und Lernwerte für Heizung und Gebäudepuffer.
- PV-Prognosekonfiguration und die Auswahl des internen beziehungsweise externen Speichers.

Die Datei sichert die Daten **dieses Energiemanagement-Adapters**. Externe Messgeräte und andere ioBroker-Adapter bleiben als Datenpunktverweise enthalten. Eine vollständige ioBroker-Installation und der gesamte Inhalt einer externen Datenbank werden damit nicht gesichert. Für diese Systeme wird die jeweils eigene Sicherung benötigt.

Die Vollsicherung kann nur Daten enthalten, die bereits aufgezeichnet und noch gespeichert sind. Sie ersetzt keine nicht erfassten Zeiträume und verlängert die Aufbewahrungszeit der einzelnen Archive nicht rückwirkend.

## Vollsicherung herunterladen

1. Öffne **Einstellungen → Vollsicherung & Wiederherstellung**.
2. Klicke auf **Vollsicherung herunterladen**.
3. Speichere die erzeugte `.json`-Datei auf deinem Computer oder Mobilgerät.
4. Bewahre sie getrennt vom ioBroker-Host auf, beispielsweise zusätzlich auf einem anderen Datenträger.

Die Datei enthält die Quellinstanz, Adapterversion, den Sicherungszeitpunkt und eine SHA-256-Prüfsumme. Verändere ihren Inhalt vor einer Wiederherstellung nicht. Die Sicherung enthält private Messwerte und Zuordnungen; lade sie nicht in ein öffentliches GitHub-Repository oder einen öffentlichen Fehlerbericht hoch.

## Eine neue Version installieren

Ein Update ersetzt das Programmpaket und die Weboberfläche. Die bestehende Instanz und ihre gespeicherten Daten werden weiterverwendet.

1. Erstelle zunächst eine Vollsicherung mit der oben beschriebenen Funktion.
2. Lade das gewünschte `.tgz`-Paket aus [GitHub-Veröffentlichungen](https://github.com/stephanflug/ioBroker.energiemanagement/releases) herunter und kopiere es auf den ioBroker-Host beziehungsweise in den ioBroker-Container.
3. Installiere das Paket mit der ioBroker-CLI. Für Version 0.10.1:

   ```bash
   cd /opt/iobroker
   iobroker url /tmp/iobroker.energiemanagement-0.10.1.tgz
   ```

   Verwende den für deine Installation vorgesehenen ioBroker-Benutzer. Beispiele für SSH, Docker und Portainer stehen in der [Installationsanleitung](installation.md).

4. Starte die bestehende Instanz bei Bedarf neu:

   ```bash
   iobroker restart energiemanagement.0
   ```

5. Falls die Oberfläche noch nicht aktualisiert wurde, lade die Web-Dateien erneut hoch:

   ```bash
   iobroker upload energiemanagement
   ```

6. Lade die Browserseite vollständig neu und prüfe `status.version`, `status.running` sowie aktuelle Messwerte.

**Kein `iobroker add energiemanagement` beim Update:** Eine vorhandene `energiemanagement.0` wird aktualisiert. Das Hinzufügen einer weiteren Instanz ist nur nötig, wenn du bewusst eine getrennte weitere Konfiguration betreiben möchtest.

Eine Deinstallation oder das Löschen von Datenpunkten ist für ein normales Update nicht erforderlich. Neue optionale Funktionen können nach einem Update unter **Einstellungen** freigeschaltet werden. Bereits vorhandene Zuordnungen sollten anschließend kurz geprüft werden.

## Eine Vollsicherung wiederherstellen

Die Wiederherstellung ersetzt die eigenen gespeicherten Adapterdaten durch den Inhalt der ausgewählten Datei.

1. Erstelle auf dem Zielsystem bei vorhandenen Daten zuerst eine aktuelle Vollsicherung.
2. Öffne **Einstellungen → Vollsicherung & Wiederherstellung** und wähle die gewünschte `.json`-Datei aus. Unterstützt werden Vollsicherungen bis 32 MiB.
3. Die Funktion **Datei prüfen** kontrolliert Format, Inhalt und Prüfsumme. Prüfe in der Vorschau unter anderem Quellinstanz, Version, Sicherungsdatum, Verbraucher und Raumfühler.
4. Aktiviere die Bestätigung für das Ersetzen der Adapterdaten.
5. Starte **Geprüfte Sicherung wiederherstellen** und warte auf die Abschlussmeldung.
6. Lade die Oberfläche über den angebotenen Schalter neu und kontrolliere die Zuordnungen und Messwerte.

Vor dem Einspielen legt der Adapter zusätzlich einen Sicherungsstand unter `0_userdata.0/energiemanagement-backups/` ab. Eigene aktive Gerätebefehle werden zuerst zurückgenommen. Ist deren Rücknahme nicht bestätigt, wird die Wiederherstellung abgebrochen; bestehende Besitzdaten werden für einen weiteren Versuch erhalten.

Nach erfolgreicher Wiederherstellung bleiben **Hardware-Master, Verbrauchersteuerung, Heizungsoptimierung und einzelne Ausgangsfreigaben ausgeschaltet**. Prüfe zuerst die Datenquellen und Gerätezuordnungen. Aktiviere danach nur die Funktionen, die auf dem Zielsystem verwendet werden sollen. Das erneute Einblenden eines optionalen Heizungsreiters aktiviert die Optimierung nicht automatisch.

Alte Messanker werden nicht verwendet, um eine unbeobachtete Ausfallzeit als durchgehend gemessenen Verbrauch auszugeben. Ein wiederhergestellter Tankbestand bleibt ein berechneter Bestand; unbeobachteter Verbrauch kann seine Genauigkeit beeinträchtigen.

## Auf einen anderen ioBroker umziehen

1. Lade auf dem bisherigen System die Vollsicherung herunter.
2. Installiere auf dem neuen System das Energiemanagement-Paket nach der [Installationsanleitung](installation.md).
3. Richte dort die benötigten Geräteadapter und die `web`-Instanz ein.
4. Stelle die Vollsicherung wieder her.
5. Öffne **Datenquellen** und prüfe jeden Bereich. Gleiche die Datenpunkt-IDs mit den tatsächlichen IDs des neuen Systems ab.
6. Prüfe gegebenenfalls den PV-Standort, die Dachflächen und die vorhandene Datenbankinstanz.
7. Beobachte zunächst die Livewerte und Messqualität, bevor du Geräteausgänge oder Heizungssteuerungen freigibst.

Die Quellkonfiguration kann beispielsweise `modbus.0...` enthalten, während derselbe Messwert auf dem neuen System unter einer anderen Instanz liegt. Die Sicherung legt die fremden Geräteadapter und deren Datenpunkte nicht selbst an.

## Interner Speicher und Datenbankbetrieb

Die Speicherwahl befindet sich unter **Einstellungen → Intern oder Datenbank**. Eine interne Kopie bleibt auch bei ausgewählter Datenbank für Betrieb, Auswertungen und Ausfälle erhalten.

Die gemeinsame Vollsicherung umfasst diese intern erfassten Adapterdaten und die Speicherwahl. Datenbanksicherungsstände werden beim Datenbankbetrieb zusätzlich komprimiert in kleinen Teilen archiviert und nach erfolgreichem Zurücklesen bestätigt. Fremde Datenbankinhalte und zusätzliche externe Detailhistorien außerhalb der intern aufbewahrten Daten benötigen die Sicherung des jeweiligen Datenbanksystems.

Für eine Meldung wie **Datenbank nicht bestätigt** siehe [Fehlerbehebung](fehlerbehebung.md). Ein erreichbarer TCP-Port allein beweist noch keinen funktionierenden Lese- und Schreibzugriff auf InfluxDB.

## Vorhandene ältere Skripte

Die integrierte Legacy-Migration ist für eine bestimmte ältere Skriptinstallation vorgesehen und keine allgemeine Importfunktion für beliebige fremde Energieskripte. Sie ist bei einer neuen Installation standardmäßig deaktiviert. Übernimm oder entferne ältere Skripte nur nach Prüfung der passenden Migration; das normale Paketupdate benötigt diese Bereinigung nicht. Weitere Angaben stehen in der [Versionshistorie](../../CHANGELOG.md).
