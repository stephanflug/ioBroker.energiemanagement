# Bericht zur offiziellen Repository-Prüfung

## Umfang und Aussagekraft

Verwendet wurde **`@iobroker/repochecker` 5.24.0**, Regelbasis `bb893d7a1230fb090859ed34c3448f668890754d`, im lokalen Modus für den vorbereiteten Stand 0.10.2. Dieser Modus ist laut Werkzeug experimentell und kann Fehlbefunde liefern oder Probleme übersehen. Er berücksichtigt außerdem externe Angaben zu GitHub und npm.

Es wurden keine Veröffentlichungen, Repository-Einstellungen, npm-Pakete oder Pull Requests angelegt. Die produktive 0.10.1 wurde für diese Prüfung nicht installiert, ersetzt oder umkonfiguriert.

Der protokollierte Lauf enthält die Zeile `FINAL status 'OK'`, listet danach aber ausdrücklich Fehler, Warnungen und Vorschläge auf. Diese Zeile wird deshalb **nicht als vollständig bestandene Prüfung oder als Aufnahmefreigabe** gewertet.

## Korrigierte Ausgangsbefunde

Der erste lokale Lauf meldete unter anderem fehlende beziehungsweise unpassende Metadaten. Im vorbereiteten Arbeitsstand wurden folgende Punkte bearbeitet:

- Node.js-Mindestversion 22 und aktuelle Laufzeit-/Testabhängigkeiten deklariert.
- `ioBroker` in den Schlüsselwörtern ergänzt; nicht unterstütztes `x-release-channel` aus `package.json` entfernt und den Entwicklungsstand in `lib/build-info.json` hinterlegt.
- Titel, Beschreibung und News übersetzt; ältere News auf den vorgesehenen Metadatenumfang begrenzt.
- Admin-Mindestversion, Lizenzfelder und veraltete Metadatenattribute korrigiert.
- `welcomeScreen` in das erwartete Array-Format gebracht; vorhandene Kachel- und Linkinhalte erhalten.
- Öffentlichen Entwicklerkontakt `steuerung@gmx.at` nach ausdrücklicher Zustimmung übernommen und Copyright-/MIT-Angaben vervollständigt.
- Admin-Übersetzungen sowie responsive Größenangaben ergänzt.
- Englische Haupt-README einschließlich `Changelog` und `License` sowie vollständige deutsche Dokumentation vorbereitet.
- `.commitinfo` in `.gitignore` aufgenommen.
- Den vom Zwischenlauf beanstandeten direkten Mocha-Eintrag wieder entfernt: Mocha wird bereits durch `@iobroker/testing` bereitgestellt.

Der abschließende lokale Lauf am **11. November 2026** bestätigt diese Korrekturen. Auch Tag-Auslöser, Parallelitätssteuerung und Node-/Betriebssystemmatrix des vorbereiteten Workflows wurden danach erneut geprüft; die entsprechenden früheren Fehler werden nicht mehr gemeldet.

## Offene Befunde des protokollierten Laufs

| Kennung | Befund | Einordnung und nächster Schritt |
| --- | --- | --- |
| `E2000` | Paket auf npm nicht gefunden | Beabsichtigter unveröffentlichter Zustand. npm-Veröffentlichung erst nach gesonderter Freigabe und geklärter Maintainer-Berechtigung. |
| `E3012` | Automatischer Deploy-Job fehlt | Bewusst kein automatischer npm-Deploy im vorbereiteten Workflow. Nach ausdrücklicher Veröffentlichungsfreigabe mit dem offiziellen Ablauf ergänzen. |
| `E5004` | Native `setInterval()`-Aufrufe in bestehendem Code | Vorhandener Mess-/Steuerungscode wurde nicht ohne Freigabe umgestellt. Separat bewerten und testen. Neue Versionsinformationen laufen unabhängig davon. |
| `E5005` | Native `setTimeout()`-Aufrufe in bestehenden Modulen | Gleiches Vorgehen: gezielte Prüfung und getrennte Freigabe, soweit vorhandene Abläufe betroffen sind. |
| `E8001` | GitHub-Beschreibung fehlt | Das Zielrepository bleibt während der Vorbereitung leer; Beschreibung erst im freigegebenen Veröffentlichungsschritt setzen. |
| `E8002` | GitHub-Topics fehlen | Geeignete Topics erst nach Freigabe am Repository setzen. |

Der Abschlusslauf enthält damit **6 offene Fehlerkennungen**. Die zwischenzeitlichen Befunde `E0063` zum direkten Mocha-Paket, `E3009` zur Parallelitätssteuerung sowie `E3025`/`E3027` zur Node-/Betriebssystemmatrix sind behoben und werden nicht mehr ausgegeben.

## Warnungen und Empfehlungen

Der gespeicherte Lauf nennt zusätzlich:

- Entwicklungshilfen wie `@alcalzone/release-script`, `@iobroker/adapter-dev` und `@iobroker/eslint-config` sowie ein Lint-Skript.
- Vorgeschlagene offizielle Test-Actions und fehlende öffentlich abrufbare Workflow-Ergebnisse bei leerem Repository. Die vorbereitete Matrix enthält Node.js 22/24/26 auf Ubuntu, Windows und macOS; lokale erfolgreiche Prüfungen ersetzen keine ausgeführten GitHub-Läufe.
- Noch fehlenden Eintrag in der offiziellen Adapterliste.
- Vorhandene eigene Wartefunktionen und die mögliche Nutzung der Adapter-Timer-/Delay-API.
- Auslagerung älterer Changelog-Einträge beziehungsweise Changelog-Inhalt direkt in der Haupt-README.
- Ergänzende Typprüfungs-, Editor-, Compact-Mode- und Dependabot-Einstellungen.
- Fehlendes öffentliches GitHub-Release im ausdrücklich unveröffentlichten Zustand.

Die DNS-/MX-Prüfung der Kontaktadresse meldete, dass kein MX-Nachweis für `gmx.at` ermittelt werden konnte. Daraus wird keine falsche Behauptung über die Gültigkeit der freigegebenen E-Mail-Adresse abgeleitet. Diese Prüfung ist vor Einreichung mit geeigneter DNS-Auflösung zu wiederholen.

## Ergebnis

Die Metadaten- und Dokumentationsvorbereitung ist weitergeführt; **eine fehlerfreie offizielle Repository-Prüfung oder eine Aufnahme ist noch nicht belegt**. Insbesondere absichtlich unterlassene Veröffentlichungen und vorhandene Code-/Workflow-Punkte bleiben nachvollziehbar offen. Maßgeblich sind der spätere vollständig wiederholte Prüflauf und die Entscheidung der ioBroker-Maintainer.

Die [Adapteraufnahme-Checkliste](../de/adapteraufnahme-checkliste.md), [Veröffentlichungsschritte](publication-open-points.md) und der [Testbericht](test-results-v0.10.2.md) enthalten die weiteren Schritte und tatsächlichen funktionalen Prüfergebnisse.
