# Änderungen in der vorbereiteten Version 0.10.2

> Historischer Prüfstand vor der GitHub-Veröffentlichung. Den aktuellen Veröffentlichungsstand enthält [Veröffentlichung und offene Schritte](publication-open-points.md).

## Neue Informationen in der Weboberfläche

- Eigener Menüpunkt **Über & Lizenzen**, erreichbar auch über das mobile Menü.
- Beschreibung des tatsächlichen Funktionsumfangs, Entwicklung: **Stephan Ebner**, Projekt-/Dokumentations-/Fehlerlinks und installierte Version.
- Vollständige MIT-Lizenz und Hinweise zu Drittanbietern im Paket und in der Anwendung.
- Kompakte Versionsinformation im Kopfbereich auf allen Seiten.
- Unterscheidung zwischen aktueller Version, Update verfügbar, laufender/nicht möglicher Prüfung, Entwicklungsversion und neutralem Zustand ohne stabiles öffentliches Release.
- Bei einem Update: verfügbare Version, Veröffentlichungsdatum, kurze Änderungen und Release-Link.

## Serverseitige Versionsprüfung

- Öffentliche GitHub-Release-Metadaten werden beim Start und danach ungefähr alle zwölf Stunden geprüft.
- Entwürfe und Vorab-Releases werden nicht als stabile Updateziele behandelt.
- Gültige Versionsnummern werden semantisch verglichen.
- Fehler, Zeitüberschreitungen und API-Limits werden als Informationsstatus behandelt; Prüfzeitpunkte werden gespeichert.
- Öffentliche Release-Prüfung ohne GitHub-Token, ohne Hausdatenübertragung und ohne automatische Installation.
- Browser teilen sich den Serverstatus. Eine Statusänderung lädt die Seite nicht neu und verwirft keine Formularentwürfe.

## Projekt und Dokumentation

- Version 0.10.2 als vorbereiteter Entwicklungsstand; Node.js ab Version 22.
- Deutsche Dokumentation und zusätzliche englische Start-, Installations- und Bedienungsanleitung.
- Informationen zur manuellen TGZ-Installation, Update ohne zweite Instanz und Projekt-ZIP.
- Metadaten-/Lizenzprüfung und Checkliste für die spätere offizielle Adapteraufnahme.
- Keine GitHub- oder npm-Veröffentlichung und kein Pull Request während dieses Auftrags.

## Erhaltener Bestand

Die produktive 0.10.1 bleibt unverändert. Vorhandene Berechnungen, Archive, Zuordnungen und Steuerungsregeln werden nicht durch eine neue automatische Updatefunktion ersetzt. Änderungen an bestehenden Steuerungsalgorithmen gehören nicht zu dieser Version. Ein gesonderter vorhandener Prüfpunkt ist im [Kompatibilitätsbericht](control-compatibility.md) festgehalten.

Artefakte, Prüfsummen und tatsächliche Prüfresultate gehören zur abschließenden Bereitstellung. GitHub-Release-Downloads werden erst nach einer späteren ausdrücklichen Veröffentlichung verfügbar.
