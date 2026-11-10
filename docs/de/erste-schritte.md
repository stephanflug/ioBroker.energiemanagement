# Erste Schritte

Nach der [Installation](installation.md) kannst du zunächst Messwerte ansehen und auswerten. Dafür werden keine physischen Gerätefreigaben benötigt.

## 1. Strommessung einrichten

Öffne **Datenquellen** und beginne mit dem Netzanschlusspunkt:

1. Ordne die **aktuelle Netzbezugsleistung** zu. Der konfigurierte Wert muss eine Leistung in W ergeben.
2. Ordne den **kumulativen Bezugszählerstand** zu. Der konfigurierte Wert muss einen Gesamtzähler in kWh ergeben.
3. Prüfe die angezeigten Werte und Umrechnungsfaktoren. Ein Gesamtzählerstand ist kein Tagesverbrauch.
4. Ergänze vorhandene Einspeisewerte, PV-Quellen, Batterie- und gegebenenfalls direkte Hausverbrauchsmessung.
5. Speichere die Zuordnung und prüfe die **Übersicht**.

Die Felder, Einheiten und Beispiele sind in [Datenquellen zuordnen](datenquellen.md) beschrieben. Ohne passende Quellen bleiben einzelne Kennzahlen leer. Fehlende Werte werden nicht als echter Nullverbrauch behandelt.

## 2. Die ersten Auswertungen ansehen

Unter **Energieauswertung** findest du die Kalenderübersicht, den Leistungsverlauf und die Detailauswertung. Kurven lassen sich einzeln ausblenden. Die Viertelstundenansicht benötigt einen ausreichend erfassten Messzeitraum; ein neu gestarteter Adapter kann noch keine vollständige Vergangenheit anzeigen.

Der Tagesvergleich sammelt passende Messabschnitte für den Vergleich mit vorherigen Tagen. Solange die Daten dafür nicht ausreichen, erscheint ein Aufbauhinweis. Bereits vorhandene geeignete Verbrauchsdaten können zusätzlich zeigen, wenn heute schon mehr als an einem ganzen Vergleichstag verbraucht wurde; der Bezug steht direkt am Ergebnis.

## 3. Verbraucher hinzufügen

Lege unter **Verbraucher & Prioritäten** deine Geräte an. Ihre Istleistungsmessung und gegebenenfalls Statusrückmeldung werden zentral unter **Datenquellen** zugeordnet. Erst damit können Geräteverbrauch und Empfehlungen anhand echter Messwerte bewertet werden.

Für physische Ansteuerung sind die zusätzlichen Zuordnungen und Freigaben unter **Geräteausgänge** erforderlich. Die neue Installation schaltet keine Geräte automatisch ein.

## 4. Nur benötigte Zusatzbereiche anzeigen

Unter **Einstellungen** kannst du Wasser, Regenwasser, Brennstoff und Heizung & Gebäudepuffer freischalten. Nicht benötigte Reiter bleiben ausgeblendet. Die Messquellen werden anschließend im passenden Abschnitt unter **Datenquellen** zugeordnet.

- **Wasser / Regenwasser:** Durchfluss und Gesamtzähler lassen sich unabhängig hinterlegen. Eine ausgewählte Methode berechnet den Verbrauch; der zweite Wert wird zusätzlich angezeigt.
- **Brennstoff:** Wähle Pellets, Öl oder Gas mit den Einheiten kg, l beziehungsweise m³. Für Pellets und Öl kannst du außerdem Tankkapazität und tatsächlichen Anfangsbestand festlegen und Nachfüllungen erfassen.
- **Heizung & Gebäudepuffer:** Beginne mit Raumfühlern und Außenfühler sowie der Beobachtung der Temperaturen. Prüfe Sollwerte und Grenzen, bevor du eine automatische Optimierung verwendest. Das Ausblenden dieses Bereichs deaktiviert auch die Heizungsoptimierung.

## 5. Prognose und Datenspeicherung auswählen

Unter **PV-Ertragsprognose** trägst du Standort und tatsächliche PV-Teilflächen ein. Open-Meteo funktioniert für private Nutzung ohne API-Schlüssel; alternativ steht ein lokales Sonnenstandsmodell zur Verfügung.

Die Speicherwahl unter **Einstellungen** startet mit **Intern**. Eine vorhandene Datenbankinstanz wird erst nach bewusster Auswahl und Speichern verwendet. Ihre Betriebsbereitschaft ist unabhängig von den Sensorwerten des Hauses.

## 6. Eine Vollsicherung erstellen

Wenn deine Zuordnungen stimmen, lade unter **Einstellungen → Vollsicherung & Wiederherstellung** eine gemeinsame Sicherungsdatei herunter. Sie enthält Einstellungen und aufgezeichnete Adapterdaten. Details zu Updates, Umfang und Wiederherstellung stehen unter [Updates und Sicherung](updates-und-sicherung.md).

Die ausführliche [Bedienungsanleitung](benutzerhandbuch.md) führt durch die einzelnen Menüs.
