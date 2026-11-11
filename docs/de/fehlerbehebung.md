# Fehlerbehebung

[Zur Startseite](../../README.md) · [Installation](installation.md) · [Benutzerhandbuch](benutzerhandbuch.md) · [Datenquellen](datenquellen.md)

Beginne mit Adapterversion, Verbindungsstatus und dem betroffenen Datenpunkt. Die Oberfläche zeigt fehlende oder unvollständige Daten bewusst, statt einen scheinbar vollständigen Wert zu schätzen.

## Oberfläche oder neuer Reiter fehlt

1. Prüfen, ob `energiemanagement.0` und der verwendete `web`-Adapter laufen.
2. Die richtige Adresse und Instanz verwenden, etwa `http://IOBROKER:8082/energiemanagement/index.html?instance=energiemanagement.0`.
3. Nach einem Update die Seite vollständig neu laden und einen alten Browser-Cache ausschließen.
4. Wasser, Regenwasser, Brennstoff und Heizung unter **Einstellungen → Deine Verbrauchsbereiche** freischalten.
5. Auf dem Handy das vollständige Menü über die Menütaste oben links öffnen.

Falls die Oberfläche nach einer Installation nicht hochgeladen wurde, beschreibt die [Installationsanleitung](installation.md) den manuellen Upload. Einen vorhandenen Adapter beim Update nicht als zusätzliche Instanz neu anlegen.

## WebSocket-Fehler, Handy-Standby oder Verbindungsabbruch

- Die ioBroker-Webadresse muss vom aktuellen Netz des Handys erreichbar sein.
- Nach Standby oder Netzwechsel die Seite wieder öffnen und den Wiederverbindungsstatus beobachten.
- Bei Bedarf **Erneut verbinden** beziehungsweise die Seite vollständig neu laden.
- Konfiguration des `web`-Adapters, WebSocket-Zugriff, Reverse Proxy und gegebenenfalls Anmeldung prüfen.
- Bei HTTPS müssen auch eingebettete Ansichten über eine passende HTTPS-Adresse erreichbar sein.

Ungespeicherte Entwürfe bleiben im geöffneten Browser erhalten. Ein nicht bestätigter Schreibbefehl wird nach einer Wiederverbindung nicht automatisch erneut gesendet. Prüfe zuerst den tatsächlich gespeicherten Zustand, bevor du einen unklaren Speichervorgang wiederholst.

## Anzeige „–“ statt eines Werts

Die Anzeige kann bedeuten, dass keine Quelle zugeordnet ist, der Wert ungültig/veraltet ist oder noch keine ausreichende Messabdeckung besteht.

Unter **Datenquellen** prüfen:

1. Existiert die ID noch?
2. Liefert sie die richtige physikalische Größe und den richtigen Datentyp?
3. Passen Einheit, Faktor und Vorzeichen?
4. Sind Zeitstempel aktuell und Messungen bestätigt beziehungsweise ohne Qualitätsfehler?
5. Laufen Quelladapter und Energiemanagement?

Ein numerischer Nullwert bleibt als 0 sichtbar. Fehlende Messungen werden nicht automatisch als Nullverbrauch angenommen.

## Keine gültige Viertelstunde oder unerwartete Spitze

Die erste vollständige Auswertung braucht eine entsprechend lange Beobachtung. Nur Intervalle mit ausreichender Messabdeckung zählen für eine belastbare Spitze. Zählerwechsel, Neustarts und Meldelücken können unvollständige Intervalle erzeugen.

Als Bezugszähler ist ein kumulierter kWh-Zähler nötig. Eine momentane Wattmessung, ein Tageszähler oder ein Zähler mit falschem Faktor führt nicht zum erwarteten Ergebnis. Die Spitze ist ein 15-Minuten-Mittelwert, kein Sekunden-Maximalwert.

## „Vergleich baut sich auf“

Nach einer Neuinstallation liegen noch keine passenden Uhrzeitprofile vor. Der Adapter benötigt ausreichend gemessene Zeitabschnitte heute und an passenden Tagen der letzten sieben Tage. Die Profile werden während des laufenden Betriebs gesammelt.

Weitere Gründe sind eine neue Messquelle, unvollständige Vergleichstage, fehlende Geräte-Istleistung oder ein Tag mit Zeitumstellung. Historische Geräte-Tageswerte werden nicht als rückwirkend bekannte Uhrzeitprofile ausgegeben.

Falls heute bereits mehr gemessen wurde als an ausreichend vollständig erfassten ganzen Vergleichstagen, kann dieser gesondert beschriftete Hinweis trotzdem erscheinen. Er ist kein Vergleich gleicher Uhrzeit.

## Keine Startempfehlung trotz Einspeisung

Eine kurze Einspeisespitze genügt nicht. Empfehlungen berücksichtigen die Stabilitätsdauer, Reserve, höher priorisierte Verbraucher, benötigte Leistung, maximale Parallelität und aktuelle Istleistungswerte. Batterieentladung zählt nicht als verfügbarer PV-Überschuss.

Prüfe die Begründung des betroffenen Verbrauchers unter **Energieauswertung → Empfehlungen**. Eine Startempfehlung und eine tatsächliche Freigabe über Geräteausgänge sind getrennte Funktionen.

## PV-Prognose bleibt leer oder veraltet

- Standort und positive reale Anlagenleistung in kWp eintragen.
- Dachneigung und Ausrichtung als Kompassrichtung prüfen.
- Prognose aktivieren und speichern.
- Beim lokalen Modell die Standortzeitzone prüfen.
- Für Open-Meteo Internetzugriff und Anbieterstatus prüfen.
- Nach einem Orts-/Anlagenwechsel wird die bisherige Prognose ungültig; auf eine neue Berechnung warten.

Die Wetterdaten werden mit begrenzter Abrufhäufigkeit zwischengespeichert. Nach Fehlern oder Anbieterbegrenzung erfolgt kein ununterbrochener Neuabruf. Der letzte Status beziehungsweise Fehler erklärt die Wartezeit. Fehlende Stunden werden nicht als vollständiger prognostizierter Tagesertrag ausgegeben.

## Wasser-/Brennstoffverbrauch steigt nicht

Bei einer neuen Quelle wird zuerst eine Referenz gesammelt. Ein Gesamtzählerstand selbst ist noch kein Verbrauch für den seitdem beobachteten Zeitraum.

Prüfe, ob die gewählte Berechnungsmethode zur zugeordneten Quelle passt. Bei gleichzeitig hinterlegtem Durchfluss und Zählerstand wird genau die ausgewählte Methode verwendet; es gibt keinen stillen Ersatz durch die andere Quelle. Ein Füllstand ist kein aufaddierter Verbrauchszähler.

Messlücken, Rückgänge des Zählers oder neue Einheiten/Faktoren unterbrechen die Erfassung und setzen eine neue Referenz. Der Adapter rechnet unbeobachtete Mengen nicht nachträglich hinzu.

## Tankbestand unbekannt oder als unsicher markiert

Die Kapazität allein legt keinen Anfangsbestand fest. Hinterlege einen tatsächlich bekannten Bestand oder erfasse eine vollständige Befüllung.

Der geschätzte Vorrat wird unsicher, wenn Verbrauch während Messlücken, ausgeschalteter Erfassung oder eines Neustarts unbekannt bleibt. Eine bekannte Bestandskorrektur schafft eine neue Ausgangsbasis. Nachfüllmengen nicht mehrfach neu erfassen, wenn eine vorherige Antwort unklar war: zunächst die aktuelle Füllhistorie prüfen.

## Heizungsfühler lässt sich nicht speichern

Die Quelle muss ein lesbarer Zahlen-Datenpunkt sein. Raum-, Außen- und Estrichtemperaturen werden als °C behandelt. Gängige Celsius-Beschriftungen sowie fehlende Einheitentexte sind zulässig; ausdrücklich andere Skalen oder Einheiten sind es nicht.

Einen Fühler nicht mehrfach als aktiven unabhängigen Raum zuordnen und keine Messquelle als Heizungs-Ausgang verwenden. Für schreibende Heizungs-Ausgänge sind direkte, ausdrücklich les- und beschreibbare Gerätedatenpunkte erforderlich; Aliase werden dort nicht als Ausgang verwendet.

## Heizung gibt keine Pause oder Vorwärmung frei

Lies die Begründung unter **Heizung & Gebäudepuffer**. Häufige Gründe sind fehlende Raumwerte, ein zu kalter Raum, fehlender Außenfühler, Frost, Mindestlauf-/Mindestpausenzeit oder eine ungeeignete Betriebsrückmeldung.

Automatische Vorwärmung benötigt zusätzlich stabile passende PV-Bedingungen, geeignete Grenzen und standardmäßig einen aktuellen Boden-/Estrichfühler. Ohne belastbare Lernbasis wird keine präzise Abendtemperatur behauptet. Beobachtungsmodus, Automatik und Hardwarefreigaben sind getrennt.

Heizung unter Einstellungen auszublenden deaktiviert auch die Optimierung. Erneutes Einblenden schaltet sie nicht selbst wieder ein.

## Gerätebefehl oder Rückstellung nicht bestätigt

Prüfe tatsächlichen Gerätewert, Bestätigung, Schreibberechtigung und Geräteschnittstelle. Eine ausbleibende Antwort ist kein Beleg dafür, dass ein Befehl nicht angekommen ist.

Der Adapter überwacht eigene Heizungsbefehle und Rücknahmen. Unklare Rückstellungen bleiben dokumentiert. Eine Wiederherstellung darf diesen Besitzstatus nicht einfach überschreiben und bricht daher gegebenenfalls ab. Nicht wiederholt freigeben, bevor der tatsächliche Zustand geklärt ist.

## Datenbank nicht bestätigt oder Zeitüberschreitung

**Der Status unterscheidet den laufenden ioBroker-Datenbankadapter vom erreichbaren Datenbankserver.** Eine grüne Adapterinstanz allein beweist keine erfolgreiche Speicherung.

1. Unter **Einstellungen → Intern oder Datenbank** ausgewählte Instanz und Verbindung prüfen.
2. **Verbindung prüfen** verwenden. Diese Prüfung liest und schreibt keine Testmesswerte.
3. Logs des Datenbankadapters ansehen. Timeouts auch bei anderen Sensoren sprechen für ein Problem der gemeinsamen Datenbankverbindung.
4. Host, Port und Datenbankdienst prüfen. Bei InfluxDB beispielsweise dessen `/health`- beziehungsweise `/ping`-Antwort vom ioBroker-Host aus kontrollieren.
5. Dienstzustand, freier Speicher, Datenträger und Datenbankprotokoll auf dem Datenbankserver prüfen. Zugangsdaten und Serververwaltung gehören zur eingerichteten Datenbankinstanz.

Seit 0.10.1 sendet das Energiemanagement Sicherungsstände komprimiert in kleinen Teilen statt als einzelnen mehrere Megabyte großen Wert. Schreibanfragen sind begrenzt. InfluxDB-Werte werden über `getRawEntries` zurückgelesen; erst erfolgreich gelesene Messwerte und vollständige Sicherungsstände erhalten einen geprüften Zeitpunkt. Dieser Aufruf ist im InfluxDB-Adapter 5.1.8 vorhanden. Stellt die verwendete Version `getRawEntries` nicht bereit, kann dieser Speichernachweis nicht erbracht werden; den Datenbankadapter entsprechend aktualisieren oder intern speichern.

Beim Update von 0.10.0 können vorherige reine Adapterbestätigungen zunächst als **Noch nicht erfolgt** erscheinen. Das entfernt keine alten Datenbankwerte. Ein neuer geprüfter Zeitpunkt erscheint nach erfolgreicher Übertragung und Rückleseprüfung.

Die interne Erfassung wird bei einem externen Ausfall weitergeführt. Zusätzliche externe Minuten-Momentaufnahmen können Lücken haben. Die gemeinsame Vollsicherung bleibt verfügbar und enthält die intern vorhandenen Adapterdaten. Datenbankpuffer nicht pauschal löschen: Sie können Messwerte anderer Adapter enthalten.

## Sicherung lässt sich nicht wiederherstellen

- Eine gültige **Vollsicherung dieses Adapters** auswählen, keine Bericht-CSV und keinen alten reinen Konfigurationsexport.
- Datei unverändert lassen; eine geänderte Prüfsumme wird abgewiesen.
- Dateigröße höchstens 32 MiB.
- Zuerst **Datei prüfen** ausführen und die Inhalte kontrollieren.
- Erst danach die Wiederherstellung bestätigen.

Vor dem Ersetzen wird eine Sicherheitskopie in `0_userdata.0/energiemanagement-backups/` gespeichert. Aktuelle eigene Gerätebefehle müssen zuvor bestätigt zurückgenommen sein. Kann das nicht nachgewiesen werden, bleibt die Wiederherstellung abgebrochen und die bestehenden Ausgangs-Besitzdaten bleiben erhalten. Nach einer erfolgreichen Wiederherstellung sind Steuerungen zur erneuten Prüfung ausgeschaltet.

## Unterstützung über GitHub

Für einen [Fehlerbericht](https://github.com/stephanflug/ioBroker.energiemanagement/issues) sind hilfreich:

- Adapterversion und Versionen von Node.js, ioBroker-Controller und relevantem Quell-/Datenbankadapter;
- betroffene Ansicht oder Funktion;
- erwartetes und tatsächliches Verhalten;
- kurze Schritte zum Nachstellen;
- gekürzter relevanter Logauszug und gegebenenfalls ein anonymisiertes Bild.

Keine Passwörter, API-Tokens, privaten Standortdaten oder vollständigen Haus-Sicherungen öffentlich anhängen. Die Vollsicherung kann Zuordnungen, Standort, Raumbezeichnungen und Verbrauchshistorien enthalten.

## Versionsprüfung nicht möglich

Diese Meldung betrifft die Abfrage öffentlicher GitHub-Releases. Messwerterfassung, interne Archive und bestehende Gerätefreigaben werden dadurch nicht geändert.

- Prüfe, ob der ioBroker-Host GitHub über HTTPS erreichen kann und die Systemzeit stimmt.
- Bei einem GitHub-API-Limit warte bis zum nächsten vorgesehenen Versuch. Häufiges manuelles Prüfen kann die Wartezeit nicht aufheben.
- Ein gespeicherter letzter erfolgreicher Prüfzeitpunkt erklärt, wann zuvor eine verwertbare Antwort vorlag. Ein aktueller Fehler bedeutet keine neue Bestätigung.
- **Noch kein stabiles Release** ist bei einem neuen/leeren Repository oder ausschließlich vorhandenen Vorab-Releases ein neutraler Zustand.
- **Vorabversion** ist bei der vorbereiteten 0.10.2 vorgesehen. Eine Entwicklungsversion ist keine Aussage über einen Fehler der Messwerte.

Ein Updatehinweis installiert keine Software. Verwende bei einer bewusst gewählten neuen Version die [Update-Anleitung](updates-und-sicherung.md). Formulare müssen für das Aktualisieren der Versionsinformation nicht neu geladen werden.
