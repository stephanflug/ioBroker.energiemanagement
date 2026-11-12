# FUP-Vorlagen teilen und importieren

Vorlagen sind einfache JSON-Dateien. Sie können über GitHub, ein Forum oder eine Nachricht weitergegeben werden; für die Nutzung ist keine externe Vorlagenplattform nötig.

## Im Energiemanagement

1. **Vorlage teilen** lädt nur die ausgewählte Logik als `.json` herunter.
2. Dabei werden sämtliche lokalen Datenpunkt-IDs entfernt. Die Vorlage ist deaktiviert; eine Ausgangs-Schreibfreigabe wird nicht mitgegeben.
3. **Importieren** lädt eine Vorlage oder eine vollständige FUP-Sicherung. Vorhandene Logiken bleiben erhalten; importierte Logiken erhalten neue IDs und sind zunächst deaktiviert.
4. Danach Eingänge und Ausgänge den eigenen ioBroker-Datenpunkten zuordnen, Logik prüfen und **Logiken speichern** anklicken.
5. Bei Bedarf die importierte Logik aktivieren. Fremde Ausgänge benötigen eigene Schreibfreigaben, die beim Import grundsätzlich zurückgesetzt werden.

## Vollständige Sicherung

**Alle exportieren** erzeugt eine JSON-Datei mit den Logiken einschließlich lokaler Datenpunkt-IDs und der bisherigen Einstellungen. Diese Datei ist als Backup gedacht und sollte nicht öffentlich geteilt werden. Beim Rückimport werden die Logiken als neue, deaktivierte Kopien eingefügt; bestehende Logiken werden nicht überschrieben.

## Zyklische Ausgabe

Am Ausgangsbaustein **Ausgang einstellen** wählen. **Zyklisch schreiben** kann pro Ausgang aktiviert werden. Das Intervall ist zwischen 10 und 3600 Sekunden einstellbar (Standard 60 Sekunden). Bei deaktivierter Zyklik wird ein unveränderter Wert nicht erneut geschrieben. Änderungen werden unabhängig davon sofort übernommen, sofern der Ausgang für das Schreiben freigegeben ist.

Für fremde Datenpunkte gelten weiterhin die globale FUP-Schreibfreigabe und die einzelne Ausgangsfreigabe. Eine importierte Vorlage kann keine dieser Freigaben aktivieren. Die allgemeine Hardware-Masterfreigabe wird nicht verändert.

## Beispiel

- [Batterie über Grenzwert](batterie-ueber-grenzwert.json): einfacher Vergleich von Batterie-SOC und Prozentgrenze. Der Eingangs- und Ausgangsdatenpunkt muss nach dem Import ausgewählt werden.

**Hinweis:** Ein Vergleich „Größer als 80“ liefert TRUE, sobald der Eingang über 80 liegt. Das Beispiel schaltet keine Geräte, solange du keinen fremden Ausgang ausdrücklich freigibst.
