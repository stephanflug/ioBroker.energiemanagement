# Manuelle Installation auf ioBroker

Diese Anleitung gehört zur **Entwicklungsversion 0.10.2**. Lade das [Installationspaket als TGZ](https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.2/iobroker.energiemanagement-0.10.2.tgz), die [Prüfsumme](https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.2/iobroker.energiemanagement-0.10.2.tgz.sha256) und bei Bedarf den [vollständigen Projektordner als ZIP](https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.2/ioBroker.energiemanagement-v0.10.2-projekt.zip) direkt aus dem [GitHub-Release](https://github.com/stephanflug/ioBroker.energiemanagement/releases/tag/v0.10.2). npm-Veröffentlichung und offizielle Adapteraufnahme stehen noch aus.

**Ein Download oder GitHub-Release installiert nichts auf einer laufenden Anlage.** Eine produktive 0.10.1 wird erst verändert, wenn ihr Betreiber die neue Version bewusst installiert. Für die erste Prüfung ist eine getrennte Testinstanz beziehungsweise ein Testsystem sinnvoll.

**Bereits installiert?** Verwende die [Update-Anleitung](updates-und-sicherung.md#eine-neue-version-installieren). Beim Update wird keine zusätzliche Instanz angelegt.

## Voraussetzungen

| Voraussetzung | Benötigt für |
| --- | --- |
| Eine laufende ioBroker-Installation | Betrieb des Adapters |
| Node.js ab Version 22 | Ausführung von v0.10.2; verwende eine für deine ioBroker-Version unterstützte LTS-Version |
| ioBroker js-controller ab 6.0.11 | Adapterbetrieb gemäß Metadaten |
| ioBroker Admin ab Version 7.6.20 | Instanzverwaltung |
| Eine eingerichtete, laufende `web`-Instanz, beispielsweise `web.0` | Weboberfläche und Verbindung zu den Datenpunkten |
| Bereits vorhandene Messdatenpunkte in ioBroker | Zuordnung von Smart Meter, PV-Anlage und weiteren Messwerten |

Die frühere 0.10.1 hatte noch Node.js ab Version 20 in ihren Paketmetadaten. Für das Paket 0.10.2 gilt Node.js ab Version 22. Prüfe dies auch auf einem zweiten ioBroker-System vor einem Update.

Es werden kein bestimmter Smart Meter, Wechselrichter oder Heizungshersteller und keine externe Datenbank vorausgesetzt. Wasser, Regenwasser, Brennstoff und Heizung lassen sich später unter **Einstellungen** freischalten.

Falls noch keine `web`-Instanz vorhanden ist, installiere in ioBroker Admin den Adapter **Webserver / web**, lege eine Instanz an und richte Port und Anmeldung ein. Die Adresse der Admin-Oberfläche allein ist noch nicht die Adresse der Energiemanagement-Weboberfläche.

## 1. Installationsdatei und Prüfsumme

Verwende die Datei **`iobroker.energiemanagement-0.10.2.tgz`** und die zugehörige `.sha256`-Datei aus dem [Release](https://github.com/stephanflug/ioBroker.energiemanagement/releases/tag/v0.10.2). Das TGZ ist bereits ein installierbares npm-Paket und muss vor der Installation nicht entpackt werden. Es enthält Adapter, Weboberfläche, Lizenztexte und Dokumentation, aber keine persönliche Hauskonfiguration oder Messhistorie.

Der Projekt-ZIP enthält den vollständigen veröffentlichten Quellstand für Prüfung und Weiterentwicklung. Für eine normale Installation ist das TGZ der direkte Weg.

Unter Linux lässt sich die Prüfsumme im Downloadordner kontrollieren:

```bash
sha256sum -c iobroker.energiemanagement-0.10.2.tgz.sha256
```

Erwartet wird `iobroker.energiemanagement-0.10.2.tgz: OK`. Die Prüfsumme muss zu genau diesem bereitgestellten Paket gehören.

## Weg A: Linux-Host über SSH

Ersetze `BENUTZER` und `IOBROKER-IP` durch die Angaben deines Systems. Kopiere das heruntergeladene Paket von deinem Computer auf den Host:

```bash
scp iobroker.energiemanagement-0.10.2.tgz BENUTZER@IOBROKER-IP:/tmp/
```

Melde dich per SSH an und verwende die ioBroker-CLI mit dem für deine Installation vorgesehenen Benutzer. Bei einer üblichen Linux-Installation ist dies der Benutzer `iobroker`:

```bash
ssh BENUTZER@IOBROKER-IP
chmod 644 /tmp/iobroker.energiemanagement-0.10.2.tgz
sudo -u iobroker -H bash
cd /opt/iobroker
iobroker url /tmp/iobroker.energiemanagement-0.10.2.tgz
```

Das Leserecht betrifft das öffentliche Installationspaket. Warte auf den Abschluss des CLI-Befehls. Die Paketinstallation lädt normalerweise auch die Webdateien hoch.

Prüfe anschließend die Instanzen:

```bash
iobroker list instances
```

**Nur bei der ersten Installation und nur wenn noch keine Energiemanagement-Instanz vorhanden ist:**

```bash
iobroker add energiemanagement
iobroker start energiemanagement.0
```

Existiert `energiemanagement.0` bereits, gilt die [Update-Anleitung](updates-und-sicherung.md#eine-neue-version-installieren). Ein erneutes `add` kann eine zusätzliche Instanz erzeugen.

## Weg B: Docker oder Portainer

Die Installation erfolgt **im ioBroker-Container**. Im Beispiel heißt dieser Container `iobroker`; ersetze den Namen bei Bedarf.

### Über eine Shell auf dem Docker-Host

Kopiere das Paket in den Container:

```bash
chmod 644 iobroker.energiemanagement-0.10.2.tgz
docker cp iobroker.energiemanagement-0.10.2.tgz \
  iobroker:/tmp/iobroker.energiemanagement-0.10.2.tgz
```

Öffne dort eine Shell mit dem für das Container-Image vorgesehenen ioBroker-Benutzer:

```bash
docker exec -it --user iobroker iobroker bash
cd /opt/iobroker
iobroker url /tmp/iobroker.energiemanagement-0.10.2.tgz
iobroker list instances
```

Füge ausschließlich dann eine Instanz hinzu, wenn noch keine vorhanden ist:

```bash
iobroker add energiemanagement
iobroker start energiemanagement.0
```

### Über Portainer

1. Übertrage das TGZ zunächst mit `docker cp` in den ioBroker-Container, wie oben beschrieben.
2. Öffne in Portainer den **ioBroker-Container** und dessen **Konsole / Console**.
3. Wähle `/bin/bash` und den Benutzer `iobroker`, soweit das Container-Image diesen Benutzer bereitstellt.
4. Führe in `/opt/iobroker` den Befehl `iobroker url /tmp/iobroker.energiemanagement-0.10.2.tgz` aus.
5. Prüfe anschließend mit `iobroker list instances`, ob eine Instanz angelegt werden muss.

Die Anleitung setzt voraus, dass ioBroker seine üblichen Schreibrechte auf die eigene Installation hat. Passe Benutzer und Pfade an ein abweichendes Container-Image an.

## Weg C: ioBroker Admin mit eigener URL

Wenn der ioBroker-Host GitHub erreichen kann, lässt sich das TGZ auch direkt über seine öffentliche Release-Adresse installieren.

1. Öffne ioBroker Admin und **Adapter**.
2. Aktiviere gegebenenfalls den **Expertenmodus**.
3. Öffne **Aus eigener URL installieren**; die genaue Bezeichnung hängt von der Admin-Version ab.
4. Trage diese TGZ-Downloadadresse ein:

   ```text
   https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.2/iobroker.energiemanagement-0.10.2.tgz
   ```
5. Warte auf die Abschlussmeldung und prüfe unter **Instanzen**, ob `energiemanagement.0` bereits vorhanden ist.

Das [Projekt-Repository](https://github.com/stephanflug/ioBroker.energiemanagement) enthält Quellcode und Dokumentation. Verwende zur Installation die TGZ-Datei aus dem Release. Weg A oder B funktioniert auch mit einer zuvor heruntergeladenen Datei.

## 2. Installation kontrollieren

Öffne in ioBroker Admin **Instanzen** und prüfe, ob `energiemanagement.0` läuft. Unter **Objekte → energiemanagement.0** helfen diese Datenpunkte:

| Datenpunkt | Erwarteter Zustand |
| --- | --- |
| `status.version` | `0.10.2` |
| `status.running` | `true` |
| `status.lastSample` | Wird bei laufender Erfassung aktualisiert |
| `status.lastError` | Kein aktueller Start- oder Auswertungsfehler |
| `config.hardwareMaster` | Bei einer neuen Installation `false` |
| `update.status_JSON` | Informationsstatus der serverseitigen Versionsprüfung |

`status.dataOk` muss ohne zugeordnete Messdaten noch nicht `true` sein. Eine Hardwarefreigabe ist für Anzeige, Auswertung und Versionsinformationen nicht erforderlich.

## 3. Weboberfläche öffnen

Öffne die Anwendung über den Öffnen-Link im Admin oder über die Kachel auf der Startseite der `web`-Instanz. Alternativ:

```text
http://IOBROKER-IP:8082/energiemanagement/index.html?instance=energiemanagement.0
```

`8082` ist ein häufig verwendeter Web-Port. Verwende den tatsächlichen Port und gegebenenfalls `https` deiner `web`-Instanz. Die bestehende Web-Anmeldung gilt auch für Energiemanagement. Bei Docker muss dieser Port für den Browser erreichbar sein.

Für eine weitere Instanz ändere den Parameter, beispielsweise zu `?instance=energiemanagement.1`. Webdateien werden gemeinsam verwendet; der Parameter wählt die Daten und Einstellungen der Instanz.

### Oberfläche leer oder ältere Darstellung sichtbar

Nach einer bewusst durchgeführten Paketinstallation die Seite einmal vollständig neu laden. Fehlen die Webdateien, lade sie über die ioBroker-CLI erneut hoch:

```bash
iobroker upload energiemanagement
iobroker restart energiemanagement.0
```

Die regelmäßige Versionsprüfung selbst benötigt keinen Seiten-Reload. Sie darf Scrollpositionen, Menüs und Formularentwürfe nicht zurücksetzen. Weitere Hilfe steht unter [Fehlerbehebung](fehlerbehebung.md).

## 4. Messwerte zuordnen

Fahre mit [Erste Schritte](erste-schritte.md) und der [Datenquellen-Anleitung](datenquellen.md) fort. Für die grundlegende Stromauswertung werden eine aktuelle Netzbezugsleistung in W und ein kumulativer Bezugszählerstand in kWh zugeordnet.

Die neue Installation verwendet zunächst den internen Speicher. Eine Datenbankinstanz wird erst nach bewusster Auswahl unter **Einstellungen → Intern oder Datenbank** genutzt.

## Projekt-ZIP und Weiterentwicklung

Den vollständigen Projekt-ZIP in einen separaten Arbeitsordner entpacken. Hinweise zu den lokalen Prüfungen stehen in [Architektur und Entwicklung](architektur.md). Der Projektordner enthält Quellcode, Tests, Dokumentation und GitHub-Vorlagen; `node_modules` und persönliche Hausdaten sind nicht enthalten.

Das Programm installiert keine Updates automatisch. Ein Updatehinweis zeigt lediglich einen öffentlichen Release-Link und Metadaten. Die eigentliche Installation erfolgt bewusst über die normale ioBroker-Verwaltung beziehungsweise deren CLI.
