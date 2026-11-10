# Manuelle Installation auf ioBroker

Diese Anleitung beschreibt die erste Installation von **Energiemanagement 0.10.1** und das Einspielen eines neuen Pakets. Der Adapter wird direkt aus diesem GitHub-Projekt installiert. Eine Installation aus dem offiziellen ioBroker-Adapterkatalog oder von npm wird hier nicht vorausgesetzt.

**Bereits installiert?** Verwende die [Update-Anleitung](updates-und-sicherung.md#eine-neue-version-installieren). Beim Update wird keine zusätzliche Instanz angelegt.

## Voraussetzungen

| Voraussetzung | Benötigt für |
| --- | --- |
| Eine laufende ioBroker-Installation | Betrieb des Adapters |
| Node.js ab Version 20 | Ausführung des Pakets; verwende eine für deine ioBroker-Version unterstützte Node.js-Version |
| ioBroker js-controller ab 6.0.11 | Adapterbetrieb |
| ioBroker Admin ab Version 7 | Instanzverwaltung |
| Eine eingerichtete, laufende `web`-Instanz, beispielsweise `web.0` | Weboberfläche und Verbindung zu den Datenpunkten |
| Bereits vorhandene Messdatenpunkte in ioBroker | Zuordnung von Smart Meter, PV-Anlage und weiteren Messwerten |

Es werden kein bestimmter Smart Meter, Wechselrichter oder Heizungshersteller und keine externe Datenbank vorausgesetzt. Wasser, Regenwasser, Brennstoff und Heizung lassen sich später unter **Einstellungen** freischalten.

Falls noch keine `web`-Instanz vorhanden ist, installiere in ioBroker Admin den Adapter **Webserver / web**, lege eine Instanz an und richte deren Port und Anmeldung ein. Die Adresse der Admin-Oberfläche allein ist noch nicht die Adresse der Energiemanagement-Weboberfläche.

## 1. Installationsdatei auswählen

Lade das vollständige Paket aus dem Verzeichnis [GitHub-Veröffentlichungen](https://github.com/stephanflug/ioBroker.energiemanagement/releases) herunter:

- [iobroker.energiemanagement-0.10.1.tgz](https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.1/iobroker.energiemanagement-0.10.1.tgz)
- [SHA-256-Prüfsumme](https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.1/iobroker.energiemanagement-0.10.1.tgz.sha256)

Die `.tgz`-Datei ist bereits ein installierbares npm-Paket. Du musst sie für die Paketinstallation nicht entpacken. Sie enthält den Adapter und seine Oberfläche; persönliche Messwerte und Hauskonfigurationen werden damit nicht übertragen.

Die Downloadadressen gehören zur festen GitHub-Veröffentlichung `v0.10.1`. Wenn du später eine andere Version installierst, verwende deren Paketdatei und die dazugehörige Prüfsumme.

Wähle anschließend **einen** der folgenden Installationswege.

## Weg A: Installation über ioBroker Admin

Dieser Weg eignet sich, wenn dein ioBroker-Host GitHub erreichen kann.

1. Öffne ioBroker Admin und anschließend **Adapter**.
2. Aktiviere den **Expertenmodus**, falls die Installation aus einer eigenen URL noch nicht angeboten wird.
3. Öffne **Aus eigener URL installieren**. Die genaue Bezeichnung und Position des Schalters unterscheiden sich zwischen Admin-Versionen.
4. Trage diese Paketadresse ein:

   ```text
   https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.1/iobroker.energiemanagement-0.10.1.tgz
   ```

5. Starte die Installation und warte auf die Abschlussmeldung im Installationsprotokoll.
6. Prüfe unter **Instanzen**, ob `energiemanagement.0` bereits angelegt wurde. Falls noch keine Instanz existiert, füge beim Adapter **Energiemanagement** eine Instanz hinzu und starte sie.
7. Fahre mit [Weboberfläche öffnen](#3-weboberfläche-öffnen) fort.

Falls deine Admin-Version diesen Installationsweg nicht anbietet, verwende Weg B oder C.

## Weg B: Linux-Host über SSH

Ersetze in den Beispielen `BENUTZER` und `IOBROKER-IP` durch den SSH-Benutzer und die Adresse deines Systems. Die Befehle sind für einen bereits eingerichteten ioBroker-Host gedacht.

### Paket auf den Host übertragen

Wenn die Datei auf deinem Computer liegt, kopiere sie von dort aus auf den Host:

```bash
scp iobroker.energiemanagement-0.10.1.tgz BENUTZER@IOBROKER-IP:/tmp/
```

Alternativ kannst du das Paket nach der SSH-Anmeldung direkt auf den Host laden:

```bash
curl -fL --output /tmp/iobroker.energiemanagement-0.10.1.tgz \
  https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.1/iobroker.energiemanagement-0.10.1.tgz
```

Optional kannst du vor der Installation die Datei gegen die veröffentlichte Prüfsumme kontrollieren:

```bash
curl -fL --output /tmp/iobroker.energiemanagement-0.10.1.tgz.sha256 \
  https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.1/iobroker.energiemanagement-0.10.1.tgz.sha256
cd /tmp
sha256sum -c iobroker.energiemanagement-0.10.1.tgz.sha256
```

Die Prüfung sollte `iobroker.energiemanagement-0.10.1.tgz: OK` melden.

### Adapter installieren

Melde dich per SSH an und verwende die ioBroker-CLI mit dem für deine Installation vorgesehenen Benutzer. Bei einer üblichen Linux-Installation ist dies der Benutzer `iobroker`:

```bash
ssh BENUTZER@IOBROKER-IP
chmod 644 /tmp/iobroker.energiemanagement-0.10.1.tgz
sudo -u iobroker -H bash
cd /opt/iobroker
iobroker url /tmp/iobroker.energiemanagement-0.10.1.tgz
```

Der lokale Pfad `/tmp/...tgz` wird vom ioBroker-CLI als Installationsquelle verwendet. Die Installation lädt die Adapterdateien und die Weboberfläche hoch. Warte, bis der Befehl abgeschlossen ist.

Prüfe anschließend, ob bereits eine Instanz existiert:

```bash
iobroker list instances
```

**Nur bei der ersten Installation und nur wenn noch keine Energiemanagement-Instanz vorhanden ist:**

```bash
iobroker add energiemanagement
iobroker start energiemanagement.0
```

Existiert `energiemanagement.0` bereits, verwende stattdessen die [Update-Anleitung](updates-und-sicherung.md#eine-neue-version-installieren). Ein erneutes `add` würde eine weitere Instanz anlegen.

## Weg C: Docker oder Portainer

Die Installation erfolgt **im ioBroker-Container**. Im Beispiel heißt dieser Container `iobroker`; ersetze den Namen, falls dein Container anders heißt.

### Über eine Shell auf dem Docker-Host

Kopiere das heruntergeladene Paket in den Container:

```bash
chmod 644 iobroker.energiemanagement-0.10.1.tgz
docker cp iobroker.energiemanagement-0.10.1.tgz \
  iobroker:/tmp/iobroker.energiemanagement-0.10.1.tgz
```

Das Leserecht bezieht sich auf das öffentliche Installationspaket. Damit kann der ioBroker-Benutzer die in den Container kopierte Datei lesen.

Öffne dort eine Shell als ioBroker-Benutzer:

```bash
docker exec -it --user iobroker iobroker bash
cd /opt/iobroker
iobroker url /tmp/iobroker.energiemanagement-0.10.1.tgz
iobroker list instances
```

Füge ausschließlich dann eine Instanz hinzu, wenn noch keine vorhanden ist:

```bash
iobroker add energiemanagement
iobroker start energiemanagement.0
```

### Über Portainer

1. Öffne den **ioBroker-Container** und dessen **Konsole / Console**.
2. Wähle `/bin/bash` und den Benutzer `iobroker`, soweit dein Container diesen Benutzer bereitstellt.
3. Lade das Paket in der Container-Konsole herunter und installiere es:

   ```bash
   cd /opt/iobroker
   curl -fL --output /tmp/iobroker.energiemanagement-0.10.1.tgz \
     https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.1/iobroker.energiemanagement-0.10.1.tgz
   iobroker url /tmp/iobroker.energiemanagement-0.10.1.tgz
   iobroker list instances
   ```

4. Lege die erste Instanz bei Bedarf in ioBroker Admin an oder verwende die beiden `add`-/`start`-Befehle aus dem Docker-Beispiel.

Passe den Benutzer an dein Container-Image an, falls es eine andere Benutzerverwaltung verwendet. Die Anleitung setzt voraus, dass ioBroker mit seinen üblichen Schreibrechten auf die eigene Installation läuft.

## 2. Installation kontrollieren

Öffne in ioBroker Admin **Instanzen** und prüfe, ob `energiemanagement.0` läuft. Unter **Objekte → energiemanagement.0** helfen diese Datenpunkte:

| Datenpunkt | Erwarteter Zustand |
| --- | --- |
| `status.version` | `0.10.1` |
| `status.running` | `true` |
| `status.lastSample` | Wird bei laufender Erfassung aktualisiert |
| `status.lastError` | Kein aktueller Start- oder Auswertungsfehler |
| `config.hardwareMaster` | Bei einer neuen Installation `false` |

`status.dataOk` muss ohne zugeordnete Messdaten noch nicht `true` sein. Zuerst werden die Datenquellen eingerichtet. Eine Hardwarefreigabe ist für die Anzeige und Auswertung nicht erforderlich.

## 3. Weboberfläche öffnen

Öffne Energiemanagement über den Öffnen-Link im Admin oder über die Kachel auf der Startseite der `web`-Instanz. Alternativ verwende den direkten Link:

```text
http://IOBROKER-IP:8082/energiemanagement/index.html?instance=energiemanagement.0
```

`8082` ist ein häufig verwendeter Web-Port. Verwende den tatsächlichen Port und gegebenenfalls `https` deiner `web`-Instanz. Die bestehende Web-Anmeldung gilt auch für Energiemanagement. Bei Docker muss der verwendete Web-Port für deinen Browser erreichbar sein.

Für eine weitere Energiemanagement-Instanz ändere den Parameter, beispielsweise zu `?instance=energiemanagement.1`. Die Web-Dateien werden gemeinsam verwendet; die gewählte Instanz bestimmt die angezeigten Daten und Einstellungen.

### Oberfläche leer oder ältere Darstellung sichtbar

Lade die Seite vollständig neu. Wenn die Web-Dateien nach der Installation noch fehlen, lade sie über die ioBroker-CLI erneut hoch:

```bash
iobroker upload energiemanagement
iobroker restart energiemanagement.0
```

Prüfe außerdem, ob die verwendete `web`-Instanz läuft und deren WebSocket-/Objektzugriff funktioniert. Die [Fehlerbehebung](fehlerbehebung.md) enthält weitere Schritte.

## 4. Messwerte zuordnen

Fahre mit [Erste Schritte](erste-schritte.md) und der [Datenquellen-Anleitung](datenquellen.md) fort. Für den Einstieg in die Stromauswertung werden die aktuelle Netzbezugsleistung in W und ein kumulativer Bezugszählerstand in kWh zugeordnet.

Die neue Installation verwendet zunächst den internen Speicher. Eine vorhandene Datenbankinstanz wird erst nach bewusster Auswahl unter **Einstellungen → Intern oder Datenbank** genutzt. Zugeordnete Messquellen und die optionalen Bereiche werden unabhängig davon eingerichtet.

## Entwicklung aus dem Quellcode

Für Anwender ist das oben verlinkte `.tgz`-Paket der einfachere Installationsweg. Wer den Quellcode selbst prüfen oder ein eigenes Paket erzeugen möchte, findet die Hinweise in [Architektur und Entwicklung](architektur.md). Eine Installation aus einem sich ändernden Entwicklungszweig kann vom veröffentlichten Paket abweichen.

Die zu dieser Veröffentlichung gehörende Quellversion ist über das Tag [`v0.10.1`](https://github.com/stephanflug/ioBroker.energiemanagement/tree/v0.10.1) erreichbar. Das zugehörige Quellarchiv kann ebenfalls als ioBroker-Quelle verwendet werden:

```bash
iobroker url https://github.com/stephanflug/ioBroker.energiemanagement/tarball/v0.10.1
```

Prüfe anschließend wie bei der Paketinstallation, ob bereits eine Instanz vorhanden ist. Bei einem Update wird die bestehende Instanz weiterverwendet.
