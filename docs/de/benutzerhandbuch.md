# Benutzerhandbuch

[Zur Startseite](../../README.md) · [Installation](installation.md) · [Datenquellen](datenquellen.md) · [Fehlerhilfe](fehlerbehebung.md)

Diese Anleitung beschreibt Version 0.10.1. Die Oberfläche arbeitet mit den Datenpunkten der ausgewählten Adapterinstanz, standardmäßig `energiemanagement.0`.

## Die Oberfläche öffnen

Öffne die Verknüpfung des Energiemanagements über den ioBroker-Webadapter. Eine typische Adresse lautet:

```text
http://IOBROKER:8082/energiemanagement/index.html?instance=energiemanagement.0
```

Host, Port, HTTP/HTTPS und Instanz an deine Installation anpassen. Auf dem Handy öffnet die Menütaste oben links die vollständige Navigation. Unten stehen die wichtigsten Seiten als Schnellzugriff bereit.

## Orientierung im Menü

| Menü | Typische Frage |
| --- | --- |
| Übersicht | Wie viel erzeugt und verbraucht mein Haus gerade? |
| Viertelstunden / Verlauf | Wie hoch ist die durchschnittliche Netzlast und wann lag die Spitze? |
| Energieauswertung | Wie viel Energie wurde erfasst, und wo steigt der Verbrauch? |
| PV-Ertragsprognose | Welcher Solarertrag ist heute und morgen zu erwarten? |
| Wasser / Regenwasser / Brennstoff | Wie viel wurde verbraucht und welcher Vorrat ist geschätzt noch vorhanden? |
| Heizung & Gebäudepuffer | Wie warm sind die Räume und welcher Heizbedarf wird erkannt? |
| Berichte | Wie exportiere ich einen bestimmten Zeitraum? |
| Datenquellen | Wo wähle ich Sensoren, Zähler und Istleistungsquellen aus? |
| Verbraucher & Prioritäten | Welche Geräte sind eingerichtet und welche haben Vorrang? |
| Geräteausgänge | Welche tatsächlich schreibbaren Geräteschnittstellen dürfen verwendet werden? |
| Einstellungen | Welche Bereiche sind aktiv, wo liegen die Daten und wie sichere ich alles? |

## Die erste Einrichtung

1. Unter **Datenquellen** Netzbezugsleistung und Bezugszählerstand zuordnen.
2. PV, Einspeisung, Batterie oder direkten Hausverbrauch ergänzen, soweit diese Messungen vorhanden sind.
3. Auf der **Übersicht** aktuelle Werte, Einheiten und Batterierichtung prüfen.
4. Die Aufzeichnung laufen lassen. Ein vollständiger Viertelstundenwert braucht ein entsprechend lange beobachtetes Intervall.
5. Gewünschte Verbraucher anlegen und deren Istleistungsquellen unter **Datenquellen → Verbraucher** zuordnen.
6. Zusatzbereiche unter **Einstellungen → Deine Verbrauchsbereiche** aktivieren und anschließend deren Datenquellen zuordnen.

Details zu passenden Einheiten und Quellen stehen im [Datenquellen-Leitfaden](datenquellen.md).

## Übersicht

Die oberen Karten zeigen aktuelle Leistung in **W** oder **kW**. Die Energieflussdarstellung ordnet PV, Netz, Batterie und Haus zu. Weitere Karten zeigen Verbrauch und Viertelstunden-Spitzen für heute beziehungsweise den aktuellen Monat.

**Was ist jetzt sinnvoll?** zeigt die aktuelle Empfehlung für zusätzliche Verbraucher. Diese Empfehlung löst selbst keine Schaltung aus. **Wie viel Solarstrom kommt?** verlinkt zur getrennten PV-Prognose.

- **Leistung (W, kW):** Verbrauch oder Erzeugung zu einem Zeitpunkt.
- **Energie (kWh):** Über einen Zeitraum erfasste Menge.
- **Zählerstand (kWh):** Fortlaufender Gesamtwert des Zählers, kein Tagesverbrauch.

Eine Anzeige **–** bedeutet, dass ein Wert fehlt oder nicht ausreichend bekannt ist. Eine gemessene **0** ist ein gültiger Wert.

## Viertelstunden und Lastspitzen

Die Viertelstunden folgen den festen Zeitgrenzen 00, 15, 30 und 45 Minuten. Der Adapter ermittelt den mittleren Netzbezug aus zeitgestempelten Bezugszählerdifferenzen. Die Messabdeckung entscheidet, ob ein Intervall für eine belastbare Spitze zählt.

Unter **Viertelstunden / Verlauf** kannst du heute, gestern, sieben Tage oder den Monat betrachten und die Tabelle als CSV exportieren. Lückenhafte Intervalle bleiben erkennbar. Die Spitze ist der höchste ausreichend erfasste 15-Minuten-Mittelwert, nicht der kurzzeitige höchste Wattwert.

Unter **Einstellungen → Berechnungsparameter** stellst du Leistungsziel, Reserve und erforderliche Abdeckung ein. Der Tarif-Orientierungswert ist eine manuelle Vorgabe für deine Auswertung. Der Adapter berechnet keine verbindliche Netzbetreiberrechnung.

## Energieauswertung

### Kalenderübersicht

Die Kalenderkarten stehen am Anfang der Seite:

- Jahr, Monat und Tag: Hausverbrauch, PV-Erzeugung, Netzbezug und Einspeisung.
- PV-Monatsziel: optionaler Zielwert, erreichter Anteil und verbleibende Energie.
- Batterie heute: Laden und Entladen getrennt.
- Smart Meter: aktuelle Netzwerte, kumulierte Zählerstände und optionale Phasenleistungen.

Kalenderzeiträume wechseln automatisch nach **Europe/Vienna**, einschließlich Sommer-/Winterzeit. Die zugrunde liegenden Gesamtzähler werden nicht zurückgesetzt. Ein neuer Monat beginnt damit automatisch ohne Löschen der alten Monate.

Die Karten berücksichtigen auch bereits gemessene Energie offener Intervalle. Beim späteren Archivieren wird diese nicht noch einmal addiert. Historische Messlücken bleiben gekennzeichnet.

### Heute im Vergleich

Der Tagesvergleich zeigt Hausverbrauch und einzelne Verbraucher getrennt. Primär werden dieselben ausreichend gemessenen Viertelstunden heute und an passenden Tagen der vorherigen sieben Tage verglichen. Mindestens 90 % des jeweiligen Tagesabschnitts müssen vergleichbar erfasst sein. Zeitraum und Anzahl der Referenztage stehen beim Ergebnis.

Die Funktion benötigt zunächst eine passende Datenbasis. Neuinstallation, geänderte Datenquellen und Messlücken können deshalb zu **Vergleich baut sich auf** führen. Am Tag einer Zeitumstellung pausiert der Vergleich gleicher Uhrzeiten.

Eine gesonderte Anzeige **Heute bereits mehr als ein ganzer Vergleichstag** kann schon früher erscheinen. Sie bedeutet: Der heute bereits gemessene Geräteverbrauch liegt über dem Mittel ausreichend erfasster ganzer Vortage derselben Quelle. Diese Anzeige ist ausdrücklich kein Vergleich zur gleichen Tageszeit.

Einzelverbraucher sind im Hausverbrauch enthalten. Ihre kWh werden nicht zusätzlich zum Hausverbrauch addiert.

### Leistungsverlauf und Zeiträume

Im Leistungsverlauf lassen sich PV, Haus, Netz, Batterie und einzelne Geräte ein- oder ausblenden. Du kannst 1, 6, 24 oder 48 Stunden oder einen eigenen Zeitraum wählen. Ein Export enthält die ausgewählten Reihen.

**Verbraucher & Zeiträume** bietet Tages-, Monats- und Jahresauswertungen mit wählbarer Kennzahl und Vergleichszeitraum. Die Einzelwerttabelle kann für Details aufgeklappt werden. Fehlende Tage werden nicht als Nullverbrauch gerechnet.

### Empfehlungen

Eine Startempfehlung braucht gültige Messungen und mehrere Minuten stabilen Überschuss nach Reserve. Priorität, benötigte Leistung, bereits laufende Verbraucher und maximale Parallelität gehen in die Empfehlung ein. Batterieentladung wird nicht als freier PV-Überschuss betrachtet.

Die Anzeige bewertet den beobachteten Zustand. Sie garantiert keinen künftigen Überschuss oder rechtzeitiges Programmende. Laufende Wasch- oder Spülprogramme sollten nicht wegen jeder kurzen Wolke unterbrochen werden.

## Verbraucher und Geräteausgänge

1. Unter **Verbraucher & Prioritäten** ein Gerät mit eindeutiger ID und verständlichem Namen anlegen.
2. Ein/Aus-Verbraucher oder regelbaren Verbraucher auswählen und den passenden Leistungsbedarf hinterlegen.
3. Priorität und gegebenenfalls Mindest-Auszeit einstellen. Eine kleinere Prioritätszahl bedeutet höheren Vorrang.
4. Unter **Datenquellen → Verbraucher** gemessene Istleistung und bei Bedarf eine Betriebsrückmeldung zuordnen.
5. Zunächst berechnete Freigaben und Empfehlungen beobachten.

Die virtuelle Prioritätenmatrix und die tatsächliche Hardwarefreigabe sind getrennt. Nur wenn die Matrix, der Hardware-Master und die Freigabe des einzelnen Ausgangs aktiv sind und die Messbedingungen passen, können echte Befehle gesendet werden.

Schreibbare Freigabe- und Leistungssollwerte werden unter **Geräteausgänge** zugeordnet. Prüfe dort Wirkrichtung, Einheit und elektrische Grenzen. Eine automatische Freigabe ist kein Ersatz für elektrische Schutztechnik oder eine geeignete Gerätesteuerung.

## PV-Ertragsprognose

1. **PV-Ertragsprognose → Standort & PV-Anlage** öffnen.
2. Ort oder Postleitzahl suchen und einen passenden Treffer auswählen; alternativ Koordinaten direkt eintragen.
3. Je Dachfläche tatsächliche Leistung in kWp, Neigung und Ausrichtung angeben. Bis zu vier Teilflächen sind möglich.
4. Ausrichtung als Kompassrichtung verwenden: 0° Nord, 90° Ost, 180° Süd, 270° West.
5. Anlagenfaktor prüfen, Methode auswählen, Prognose aktivieren und speichern.

**Open-Meteo** liefert Wetterprognosedaten ohne API-Schlüssel. Der kostenlose Dienst ist für private/nicht kommerzielle Nutzung innerhalb der Anbieterlimits vorgesehen. Bei aktiviertem Wetterabruf werden die gespeicherten Standortkoordinaten an Open-Meteo übertragen. Die Online-Ortssuche sendet den Suchtext erst beim Suchen.

Das **lokale Sonnenstandsmodell** benötigt keine Wetterabfrage. Sein einstellbarer Wetterfaktor skaliert ein sonniges Modellpotenzial; das Modell erkennt aktuelle Wolken nicht. Hier ist auch die Standortzeitzone zu prüfen.

Die Werte für heute, verbleibenden heutigen Ertrag und morgen sind Schätzungen. Verschattung, Schnee, Modultemperatur und reale Anlagenverluste können abweichen. Die Prognose löst keine Hardwarebefehle aus.

## Wasser und Regenwasser

1. Den Bereich unter **Einstellungen → Deine Verbrauchsbereiche** aktivieren.
2. Unter **Datenquellen → Wasser** beziehungsweise **Regenwasser** die Quelle für Durchfluss und/oder Gesamtzähler auswählen.
3. Einheit und positiven Umrechnungsfaktor zur tatsächlichen Quelle einstellen.
4. Auswählen, ob der Verbrauch aus dem Durchfluss über die Zeit oder aus Zählerdifferenzen entstehen soll.
5. Speichern und im jeweiligen Reiter beide aktuellen Werte sowie Tag, Monat und Jahr prüfen.

Durchfluss und Gesamtzähler können gleichzeitig angezeigt werden. Für die Verbrauchsberechnung zählt genau eine gewählte Methode. Es gibt keinen automatischen Wechsel auf die andere Quelle bei einem Ausfall.

Unterstützte Durchflusseinheiten sind l/min, l/h und m³/h; Gesamtzähler können l oder m³ liefern. Der Verbrauch wird in m³ mit ergänzender Literanzeige dargestellt. Regenwasser und Trinkwasser bleiben getrennt. Eine Tankhöhe oder ein Füllstand ist kein Verbrauchszähler; ein Zisternenvorrat wird nicht aus einem solchen Wert erfunden.

## Pellets, Öl und Gas

Unter **Datenquellen → Brennstoff** die Brennstoffart und eine Verbrauchsquelle zuordnen:

| Brennstoff | Verbrauchseinheit | Verbrauchsrate | Vorratsfunktion |
| --- | --- | --- | --- |
| Pellets | kg | kg/h | Ja |
| Öl | l | l/h | Ja |
| Gas | m³ | m³/h | Kein Tankvorrat |

Die Verbrauchsquelle kann ein aufaddierter Verbrauchszähler oder eine aktuelle Rate sein. Ein Tankstand ist kein kumulierter Verbrauchszähler. Die verschiedenen Einheiten werden nicht pauschal in kWh umgerechnet.

### Tankkapazität, Anfangsbestand und Nachfüllen

1. Im Brennstoffreiter Pellets oder Öl verwenden, **Tankkapazität hinterlegen** aufklappen und die Kapazität speichern.
2. Über **Startbestand festlegen** einen bekannten Anfangsbestand setzen oder eine tatsächlich vollständige Befüllung erfassen. Die Kapazität allein legt keinen Bestand an.
3. Spätere Lieferungen über **Neu befüllt / betankt** erfassen.
4. Berechnete Restmenge, Anteil und Füllhistorie kontrollieren.

**Bestand setzen** ist eine Bestandskorrektur; eine hinzugefügte Menge ist eine Nachfüllung. Eine vollständige Befüllung ohne bekannten vorherigen Restbestand liefert keinen nachträglich erfundenen Lieferwert.

Die Restmenge wird aus bekanntem Bestand minus erfasstem Verbrauch geschätzt. Bei Messlücken, einem Neustart oder ausgeschalteter Erfassung kann unbeobachteter Verbrauch fehlen. Der Bestand wird dann als unsicher beziehungsweise teilweise erfasst markiert. Eine bekannte Bestandskorrektur stellt wieder eine verlässliche Ausgangsbasis her.

Beim Wechsel der Brennstoffart bleiben Archive und Tankdaten getrennt. Eine bisherige Quelle muss entfernt oder durch eine passende neue Quelle ersetzt werden; dieselbe Messung wird nicht still von kg in l umbenannt.

## Heizung & Gebäudepuffer

### Mit Beobachtung beginnen

1. Unter **Einstellungen** Heizung & Gebäudepuffer freischalten.
2. Unter **Datenquellen → Heizung & Gebäude** Raumfühler hinzufügen, beschriften und deren tatsächliche Isttemperaturen auswählen.
3. Raumziele und Gewichtung setzen und einen Außenfühler zuordnen.
4. Im Heizungsreiter die Funktion im Modus **Nur beobachten & empfehlen** aktivieren und speichern.
5. Mittelwert, kältesten Raum, gültige Messungen und Temperaturtrend über mehrere Tage beobachten.

Für verlässliche Heiz-/Abkühlbeobachtungen ist eine echte Rückmeldung des Raumheizbetriebs wichtig. Ein Freigabebefehl ist keine Betriebsrückmeldung. Optional kann die gemessene elektrische Wärmepumpenleistung zugeordnet werden.

Das Modell lernt aus geeigneten Heiz- und Abkühlphasen mit Außenfühler. Lücken, unplausible Sprünge und Änderungen der gültigen Fühlerzusammensetzung unterbrechen die Bewertung. Eine befristete Lüftungs-/Abkühlwarnung erkennt ein Temperaturmuster, keinen echten Fensterkontakt.

### Optionale automatische Eingriffe

Eine Heizpause berücksichtigt gültige Raumwerte, Außenfühler, Betriebsrückmeldung, kältesten Raum und Mindestzeiten. Ein einzelner zu kalter Raum kann eine Pause verhindern. Begrenzte Heizkreis-Korrekturen benötigen geeignete **Regelungs-Raumsollwerte**; Kessel-, Warmwasser- und Vorlauf-Sollwerte sind dafür ungeeignet.

Automatik, Heizungs-Hardware und jeder gewünschte Ausgang sind separat freizugeben. Die Wärmepumpensperre darf ausschließlich einen dafür vorgesehenen Hersteller-Eingang verwenden. Keine Netzversorgung oder direkte Kompressorschaltung zuordnen. Herstellerfunktionen für Frostschutz, Abtauen und Warmwasser müssen erhalten bleiben.

Der Adapter überwacht eigene Befehle und deren Bestätigung. Er versucht bei Deaktivierung oder ungültigen Bedingungen, seine eigenen Änderungen auf die zuvor übernommenen Werte zurückzustellen. Manuelle Änderungen haben Vorrang; fremde Sperren werden nicht übernommen und entsperrt.

### PV-Energie als Wärmepuffer

PV-Vorwärmung ist eine weitere gesonderte Option. Zeitfenster, Mindestüberschuss, Reserve, erforderliche PV-Deckung und maximale Anhebung begrenzen die Empfehlung. Teildeckung kann einen begrenzten Netzanteil zulassen; sie ist kein garantiertes hartes Netzbezugslimit.

Für automatische Vorwärmung ist standardmäßig ein gültiger Boden-/Estrichfühler nötig. Ein ausdrücklich aktivierter Schätzbetrieb ohne Fühler kennt die tatsächliche Estrichtemperatur nicht. Raum- und Bodengrenzen sowie Herstellerbegrenzungen bleiben maßgeblich.

Bei ausreichender Lernbasis wird geschätzt, wie sich die Gebäudewärme bis zur eingestellten Abendzeit entwickelt. Das ist kein Nachweis gespeicherter Estrichenergie in kWh und keine Garantie für einen heizfreien Abend.

**Heizung in den Einstellungen ausblenden deaktiviert auch die Optimierung und ihre Hardwarefreigabe.** Fühlerzuordnungen, Verlauf und Lernwerte bleiben gespeichert. Erneutes Einblenden startet die Automatik nicht selbst.

## Berichte und Exporte

Unter **Berichte** wählst du Berichtsart und Zeitraum. Möglich sind Strombilanz, PV, Netzspitzen, Verbraucher sowie die aktivierten Wasser-, Regenwasser- und Brennstoffbereiche.

- **CSV:** Tabellen für Excel oder andere Auswertungsprogramme.
- **JSON:** Strukturierte Daten zur Weiterverarbeitung.
- **Drucken / als PDF speichern:** Druckansicht über den Browser.

Ressourcen behalten ihre Einheiten. Wasser und Gas werden nicht zu kWh addiert. Der Tankbestand ist der aktuelle geschätzte Bestand mit Zeitstempel; er wird nicht als rückwirkender Bestand zum frei ausgewählten Berichtstag ausgegeben. Füllereignisse werden dem Berichtszeitraum zugeordnet.

Berichtsexporte enthalten ausgewählte Auswertungen. Für eine Wiederherstellung des gesamten Adapters verwende die Vollsicherung.

## Datenspeicherung

Unter **Einstellungen → Intern oder Datenbank** ist Intern voreingestellt. Eine vorhandene `influxdb`, `sql` oder `history`-Instanz kann nach einer erfolgreichen Leseprüfung ausdrücklich ausgewählt werden.

Im Datenbankbetrieb werden gültige Messwert-Momentaufnahmen ungefähr jede Minute archiviert. Zusätzlich wird etwa stündlich ein komprimierter Sicherungsstand in kleinen Teilen übertragen. Ein vollständiges Manifest wird erst nach Prüfung aller gespeicherten Teile veröffentlicht. Die InfluxDB-Prüfung liest mit `getRawEntries` aus der Datenbank. Dieser Aufruf ist im InfluxDB-Adapter 5.1.8 vorhanden; andere Versionen müssen eine kompatible Schnittstelle bereitstellen. Für `sql` und `history` werden die Standardnachrichten `storeState` und `getHistory` genutzt. Deren Kompatibilität hängt von der jeweiligen Adapterversion ab; der Betrieb dieser Anbieter ist experimentell.

Die Zeitpunkte unter **Letzte geprüfte Messwertarchivierung** und **Letzter geprüfter Datenbankstand** erscheinen erst nach erfolgreichem Zurücklesen. Seit 0.10.1 gelten frühere reine Annahmebestätigungen aus 0.10.0 zunächst nicht als geprüfter Stand. Diese Anzeigeänderung löscht keine Messdaten.

Eine interne Kopie bleibt auch bei Datenbankbetrieb erhalten. Während eines externen Ausfalls werden interne Verbrauchsarchive weitergeführt; externe Detail-Momentaufnahmen können Lücken haben. Die Auswahl installiert keine neue Datenbank und übernimmt keine Zugangsdaten aus der Oberfläche. Diese bleiben im vorhandenen Datenbankadapter.

## Vollsicherung und Wiederherstellung

Es gibt eine gemeinsame Funktion unter **Einstellungen → Vollsicherung & Wiederherstellung**.

### Sichern

**Vollsicherung herunterladen** erstellt eine JSON-Datei mit:

- Einstellungen, Datenquellen, Verbrauchern und Prioritäten;
- eigenen Strom-, Batterie-, Wasser-, Regenwasser- und Brennstoffarchiven;
- Tagesvergleichsprofilen;
- Tankkapazitäten, Beständen und Füllhistorie;
- Temperaturverlauf und Heizungs-Lernmodell;
- Auswahl und Metadaten der Datenspeicherung.

Die Datei enthält Versionsangabe, Quellinstanz und SHA-256-Prüfsumme. Bewahre sie an einem Ort auf, an dem ein Ausfall des ioBroker-Hosts sie nicht mit betrifft.

### Wiederherstellen

1. Vollsicherungsdatei auswählen, höchstens 32 MiB.
2. Die Datei prüfen lassen und die Inhaltsübersicht kontrollieren.
3. Die gewünschte Wiederherstellung ausdrücklich bestätigen und starten.
4. Anschließend die Oberfläche neu laden und Quellen, Standort, Geräte und Datenbankinstanz prüfen.
5. Benötigte Steuerungen erst nach der Prüfung wieder freigeben.

Vor dem Ersetzen wird zusätzlich ein Sicherheitsstand in `0_userdata.0/energiemanagement-backups/` abgelegt. Eigene aktuelle Gerätebefehle müssen zuvor bestätigt zurückgenommen sein. Bleibt das unklar, wird die Wiederherstellung abgebrochen und der bestehende Besitz-/Rückstellstatus beibehalten.

Nach erfolgreicher Wiederherstellung sind Hardware-Master, Verbrauchersteuerung, Heizungsoptimierung und Ausgangsfreigaben aus. Die Funktion sichert die eigenen aktuellen Adapterdaten. Externe Sensorobjekte, andere Adapter, zusätzliche Inhalte einer History-Datenbank oder die gesamte ioBroker-Installation sind nicht Bestandteil der Datei. Sensoren und Geräte bleiben als Zuordnungen enthalten.

## Einzelne Fenster einbetten

**Einbetten** an einem Fenster öffnet einen Dialog für direkten Link und iframe-Code. So lassen sich beispielsweise Kalenderkarten, Leistungskurven, Heizungsübersicht, Regenwasser oder Tagesvergleich in eine vorhandene Visualisierung übernehmen.

Die reduzierte Ansicht blendet Konfiguration und Navigation aus; Diagrammfilter bleiben bedienbar. Die ioBroker-Anmeldung und Berechtigungen gelten weiterhin. Das Zielsystem muss die Adresse erreichen können. Wird die Hauptseite mit HTTPS geladen, braucht auch der iframe eine passende HTTPS-Adresse.

## Bestehende spezielle Skriptinstallation übernehmen

Die Legacy-Migration ist nur für die im Code ausdrücklich unterstützte frühere Skriptinstallation gedacht. Sie ist kein allgemeiner Import beliebiger ioBroker-Skripte.

Die Option **Bestehende Alt-Konfiguration einmalig übernehmen** befindet sich in den Admin-Instanzeinstellungen (`migrateLegacy`). Alternativ können erfahrene Anwender den eigenen Datenpunkt `commands.importLegacy` verwenden. Die normale Weboberfläche enthält dafür keine eigene Übernahmeschaltfläche.

Bei einer passenden Altinstallation zunächst Migration und Bericht prüfen. Die alte Konfiguration und die bekannten Skriptquellen werden in `migration.backup` gesichert. Eine spätere Bereinigung über `commands.cleanupLegacy` ist getrennt und an erfolgreiche Prüfungen gebunden. Alte Skripte und Datenpunkte nicht vor erfolgreicher Übernahme von Hand löschen.

Für normale Neuinstallationen oder ein Update dieses Adapters ist diese Option nicht erforderlich. Die unterstützte Altstruktur und technische Details stehen in [lib/migration.js](../../lib/migration.js).
