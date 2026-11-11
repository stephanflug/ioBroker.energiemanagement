# Datenquellen richtig zuordnen

[Zur Startseite](../../README.md) · [Benutzerhandbuch](benutzerhandbuch.md) · [Fehlerhilfe](fehlerbehebung.md)

Alle Messquellen werden im Menü **Datenquellen** nach Bereich geordnet. Du kannst einen vorhandenen Datenpunkt über **Auswählen** suchen oder dessen vollständige ID eingeben. Der Quelladapter bleibt Eigentümer des Sensors; die Zuordnung erstellt keinen neuen Messsensor.

## Vor dem Speichern

1. In ioBroker **Objekte** den aktuellen Wert des Sensors prüfen.
2. Kontrollieren, was der Wert physikalisch bedeutet: Leistung, Energiezähler, Durchfluss, Temperatur oder Betriebsrückmeldung.
3. Einheit und gegebenenfalls Vorzeichen beziehungsweise Umrechnungsfaktor festlegen.
4. Quelle im passenden Bereich zuordnen und speichern.
5. Die resultierende Anzeige mit der Quelle vergleichen.

Für Messquellen sollten Zahlen als ioBroker-Datentyp **number** vorliegen. Eine Zeichenkette wie `"123 W"` ist keine saubere Zahlenmessung. Die Auswahl von Wasser-/Brennstoff- und Heizungsquellen prüft den Datentyp. Ungültige, unbestätigte oder fehlerhafte Messungen werden je nach Modul nicht zur Auswertung verwendet.

## Strom, Netz und PV

| Zuordnung | Erwartete Bedeutung | Zieleinheit / Vorzeichen |
| --- | --- | --- |
| Netzbezug aktuell | Momentane Leistung aus dem Netz | W, Bezug positiv |
| Bezugszählerstand | Fortlaufender kumulierter Netzbezug | kWh, monoton steigend |
| Netzeinspeisung aktuell | Momentane Leistung ins Netz | W, Einspeisung positiv |
| Einspeisezählerstand | Fortlaufende kumulierte Einspeisung | kWh, monoton steigend |
| PV-Quelle | Tatsächliche Leistung eines Wechselrichters/einer Teilanlage | W, Erzeugung positiv |
| Batterieleistung | Aktuelle Leistung der Batterie | W, **positiv entladen**, **negativ laden** |
| Hausverbrauch direkt | Optional tatsächlich gemessene Hausleistung | W, Verbrauch positiv |
| Phasenleistung L1–L3 | Leistung je Phase | W |
| Zählerstand Tages-/Monatsbeginn | Optionaler Referenzstand desselben Gesamtzählers | kWh |

Netzbezugsleistung und Bezugszählerstand sind die Grundzuordnungen. Für vollständige PV-, Einspeise-, Batterie- und Hausbilanzen müssen die entsprechenden Quellen zusätzlich verfügbar sein. Fehlt eine vollständige Bilanz, wird kein scheinbar vollständiger Hausverbrauch aus Teilwerten behauptet.

### Einheiten umrechnen

Bei Stromquellen bestimmt der Faktor die Umrechnung in die erwartete Zieleinheit:

| Quelle liefert | Ziel | Beispiel-Faktor |
| --- | --- | --- |
| 2,4 kW | 2.400 W | 1.000 |
| 3.250 Wh | 3,25 kWh | 0,001 |
| Batterieleistung mit Laden positiv | Laden negativ | −1, falls die Quelle bereits W liefert |

Ein negativer Faktor ist für erforderliche Vorzeichenumkehr möglich. Er ist kein Ersatz für eine Quelle, die unterschiedliche physikalische Werte vermischt. Ein kombinierter Netzsaldo ist nicht automatisch dieselbe Quelle wie getrennte positive Bezug-/Einspeisewerte.

### Mehrere PV-Quellen

Über **PV-Quelle hinzufügen** können mehrere Erzeuger zugeordnet werden. Jede Quelle nur einmal aufnehmen. Keine zusätzliche Gesamtsumme eintragen, die dieselben Einzelwechselrichter bereits enthält, sonst wird die Erzeugung doppelt gezählt.

### Kumulative Zähler und Kalenderwerte

Ein fortlaufender Bezugszähler ist richtig, ein jeden Morgen auf Null zurückgesetzter Tageszähler ist für diese Zuordnung ungeeignet. Tages-, Monats- und Jahresverbräuche berechnet der Adapter selbst. Ein Zählertausch oder Quellenwechsel braucht eine neue Messreferenz; alte und neue Zählerstände dürfen nicht miteinander verrechnet werden.

## Wasser und Regenwasser

Die Bereiche müssen zunächst unter **Einstellungen → Deine Verbrauchsbereiche** aktiviert werden. Beide Bereiche haben eigene Quellen und bleiben getrennt.

| Quelle | Zulässige Einheiten | Verwendung |
| --- | --- | --- |
| Aktueller Durchfluss | l/min, l/h, m³/h | Integration der Rate über die erfasste Zeit |
| Gesamtzählerstand | l, m³ | Verbrauch aus positiven Zählerdifferenzen |

Du kannst beide Quellen gleichzeitig hinterlegen. Über **Verbrauch berechnen aus** bestimmst du genau eine Rechenmethode. Die andere Quelle wird zusätzlich angezeigt, aber nicht noch einmal zum Verbrauch addiert. Fehlt die gewählte Quelle, bleibt die Lücke sichtbar.

Die ausdrücklich ausgewählte Einheit und der positive Faktor bestimmen die Umrechnung. Ein fehlender oder ungewöhnlicher Einheitentext im Quelladapter ist deshalb allein kein Hindernis. Prüfe die reale Bedeutung des Zahlenwerts selbst.

Ein Regenwasser-Füllstand, eine prozentuale Zisternenfüllung oder eine Tankhöhe ist kein aufaddierter Verbrauchszähler. Ohne geeignete Durchfluss- oder Verbrauchszählerquelle kann daraus kein verlässlicher Verbrauch entstehen.

## Brennstoff

| Art | Gesamtverbrauchszähler | Momentane Verbrauchsrate |
| --- | --- | --- |
| Pellets | kg | kg/h |
| Öl | l | l/h |
| Gas | m³ | m³/h |

Die Quelle muss den **Verbrauch** messen. Eine Restmenge im Tank fällt während des Verbrauchs und ist damit kein monoton steigender Verbrauchszähler. Einen Tankbestand gibst du stattdessen im Brennstoffreiter als bekannten Anfangsbestand beziehungsweise Bestandskorrektur an.

Beim Wechsel der Brennstoffart wird die Quelle bewusst neu geprüft. Eine noch zugeordnete alte Quelle erst entfernen und speichern oder eine passende neue Quelle verwenden. Aufzeichnungen in kg, l und m³ bleiben getrennt.

## Verbraucherrückmeldungen

Verbraucher werden unter **Verbraucher & Prioritäten** angelegt. Deren Messquellen bearbeitest du anschließend zentral unter **Datenquellen → Verbraucher**.

| Quelle | Typ | Zweck |
| --- | --- | --- |
| Istleistung | number, W | Tatsächlichen Verbrauch erkennen, Geräteenergie integrieren und Empfehlungen bewerten |
| Betriebsrückmeldung | boolean | Optionalen Betriebszustand zuordnen |

Eine konfigurierte Nennleistung ist keine Istleistungsmessung. Ohne reale Messung kann der Geräteverbrauch nicht rückwirkend entstehen. Eine geänderte Istleistungsquelle unterbricht die Vergleichbarkeit mit der bisherigen Quelle.

## Raum- und Heizungsfühler

| Quelle | Typ und Bedeutung |
| --- | --- |
| Raumfühler | number, tatsächliche Raumtemperatur in °C |
| Außenfühler | number, Außentemperatur in °C |
| Boden-/Estrichfühler | number, tatsächliche Boden-/Estrichtemperatur in °C |
| Raumheizbetrieb | boolean, bestätigte tatsächliche Raumheizung |
| Wärmepumpenleistung | number, gemessene elektrische Leistung in W |

Raumfühler können frei benannt, gewichtet und je Raum mit einer Zieltemperatur versehen werden. Derselbe aktive Sensor wird nicht mehrfach als unabhängiger Raum gewichtet. Deaktivierte oder ungültige Räume zählen nicht zum aktuellen Mittelwert.

Der Adapter akzeptiert gängige Celsius-Beschriftungen wie `°C`, `ºC`, `℃`, `Celsius` oder `Grad`. Fehlt die Einheit, wird der Zahlenwert als °C interpretiert. Explizit andere Skalen wie °F oder K werden nicht umgerechnet und nicht als Celsius akzeptiert. Der Quelltyp muss weiterhin numerisch sein.

Eine Warmwasserbereitung oder Abtauphase sollte nicht als laufende Raumheizung gemeldet werden. Ein Heizfreigabe-Befehl ist keine Bestätigung dafür, dass die Heizung tatsächlich läuft.

## Schreibbare Geräte- und Heizungs-Ausgänge

Eingangsquellen und Ausgänge haben unterschiedliche Aufgaben. Istleistungswerte und Fühler liest der Adapter. Freigabe-/Sollwert-Ausgänge können nach ausdrücklicher Freigabe beschrieben werden.

Für Heizungs-Ausgänge werden direkte, les- und beschreibbare Gerätedatenpunkte benötigt. Alias-Ausgänge werden dort abgewiesen. Ein Sensor darf nicht gleichzeitig Heizungs-Ausgang sein. Geräteausgänge, Energiequellen und Heizungs-Ausgänge dürfen nicht widersprüchlich doppelt belegt werden.

Geeignete Schnittstellen sind etwa eine dokumentierte Hersteller-Heizfreigabe oder ein Regelungs-Raumsollwert. Ungeeignet sind Netzversorgung, unmittelbare Kompressor-/Schützschaltung sowie Kessel- oder Warmwasser-Solltemperaturen als Raum-Sollwert.

## Wenn Messdaten nicht plausibel sind

- **Wert um Faktor 1.000 falsch:** Einheit und Faktor prüfen.
- **Batterierichtung vertauscht:** Vorzeichenkonvention der Quelle prüfen.
- **Hausverbrauch zu hoch:** Doppelte PV-Quellen oder unvollständige Energiebilanz prüfen.
- **Zählerstand wird als Tagesverbrauch angezeigt:** Kumulierte Quelle und berechneten Kalenderverbrauch auseinanderhalten.
- **Messwert fehlt trotz vorhandener ID:** Datentyp, Zeitstempel, Bestätigung und Qualitätskennzeichen im Quelladapter prüfen.
- **Nach Quellenwechsel fehlen neue Vergleichswerte:** Es wird eine neue Referenz beziehungsweise ein passendes Profil gesammelt.

Weitere Hinweise stehen in der [Fehlerbehebung](fehlerbehebung.md).

## Versionsinformationen sind keine Messquelle

Die Anzeige oben und **Über & Lizenzen** verwenden den eigenen Versions-/Prüfstatus des Adapters. Dafür wird unter **Datenquellen** kein Sensor ausgewählt. Die GitHub-Prüfung greift nicht in bestehende Quellzuordnungen, Zählerstände oder Geräteausgänge ein.
