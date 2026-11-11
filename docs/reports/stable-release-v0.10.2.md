# Stabile Ausgabe v0.10.2

Die erste öffentliche Ausgabe wird auf ausdrücklichen Wunsch als stabile Version veröffentlicht. `lib/build-info.json` verwendet dafür `releaseChannel: stable`. Das zunächst privat bereitgestellte Entwicklungspaket 0.10.2 wird nicht als unverändertes öffentliches Installationspaket ausgegeben: Das stabile TGZ wird aus dem veröffentlichten Quellstand mit aktueller Dokumentation neu gebaut und erhält eine eigene Prüfsumme.

Die bestehenden Mess-, Berechnungs- und Steuerungsalgorithmen bleiben unverändert. Die Änderung am Laufzeitbestand gegenüber dem zuvor geprüften Entwicklungspaket beschränkt sich auf die Kennzeichnung des Release-Kanals.

Die Syntaxprüfung und alle **268 Tests** wurden mit der stabilen Kennzeichnung unter Node.js 24.22.1 erneut erfolgreich ausgeführt. Die historischen Berichte dokumentieren zusätzlich die Prüfungen unter Node.js 22/24/26, mobile Browser und die isolierte echte ioBroker-Installation. Aktuelle öffentliche Plattformprüfungen stehen in [GitHub Actions](https://github.com/stephanflug/ioBroker.energiemanagement/actions/workflows/test-and-release.yml).

Das Release-Paket wird im manuell ausgelösten [GitHub-Workflow](https://github.com/stephanflug/ioBroker.energiemanagement/actions/workflows/release.yml) aus dem Versions-Tag gebaut. Dieser führt Syntax-, Unit- und echte isolierte ioBroker-Integrationstests aus und stellt TGZ, Projekt-ZIP, Kurzbericht sowie SHA-256-Dateien zunächst im Release-Entwurf bereit. Das öffentliche Freischalten folgt nach der Kontrolle der Dateien. Ein bestehendes öffentliches Release wird durch den Workflow nicht überschrieben. npm wird nicht veröffentlicht.

Wer die frühere vorbereitete 0.10.2 installiert hat, spielt für die lokale stabile Kennzeichnung das neue TGZ einmal bewusst über die normale ioBroker-Paketverwaltung ein. Die Veröffentlichung selbst installiert nichts auf einer laufenden Anlage. Nach dem öffentlichen Freischalten des stabilen Releases liefert „Jetzt prüfen“ dessen Version und Datum; für einen erneuten Abruf gelten die vorhandenen Wartezeiten und API-Limits.
