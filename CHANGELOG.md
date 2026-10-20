# Änderungen an LeDoK

Hier steht zu jeder Version, was neu ist, was sich geändert hat und was behoben wurde.
Den Abschnitt einer Version kopierst du beim Erzeugen des Update-Pakets in das Feld **Hinweise**.
Die Lehrkräfte sehen ihn dann vor dem Einspielen. Denselben Text kannst du für den Release auf GitHub verwenden.

Schreibe für Lehrkräfte, nicht für Entwickler: kurz, in ganzen Sätzen und mit den Namen, die in der App stehen.
Neue Einträge kommen zuerst unter **Unveröffentlicht** und wandern beim Release unter die neue Versionsnummer.

## Unveröffentlicht

**Neu**
- Unter **Einstellungen → Dokumente** gibt es einen **Briefkopf der Schule**: Logo, Anschrift und eine Fußzeile. Du legst fest, ob er auf LEG-Bögen, Berichten oder Listen erscheint.
- Den **LEG-Bogen** baust du dort aus Abschnitten zusammen. Du schaltest Abschnitte ein und aus, benennst sie um und änderst ihre Reihenfolge. Eigene **Freitext-Abschnitte** können Platzhalter wie {Vorname}, {Datum} oder {Stärken} enthalten und Schreiblinien bekommen. Eine Vorschau zeigt sofort, wie der Bogen aussieht.
- Arbeiten Klassenlehrkraft und Fachlehrkraft am selben Rechner mit je einem eigenen LeDoK, braucht es für die Rückmeldung keinen USB-Stick mehr. Das LeDoK der Fachlehrkraft legt ihre Bewertungen verschlüsselt bereit, und dein LeDoK bietet sie beim Öffnen zum Übernehmen an. Deine eigenen Bewertungen bleiben unberührt.
- Werte, in denen Bewertungen einer Fachlehrkraft stecken, tragen ein kleines Kürzel mit ihrem Namen.
- Bevor LeDoK Daten löscht, eine Sicherungskopie einspielt oder ein neues Schuljahr beginnt, legt es automatisch eine Sicherung an. Zum Löschen tippst du zur Bestätigung „LÖSCHEN“ ein.
- Die Desktop-App speichert deine Daten in einer eigenen Datei auf dem Rechner. Beim Schließen legt sie einmal am Tag eine Sicherung im Ordner **LeDoK-Sicherungen** an.
- Die Beispielklasse ist beim Anlegen nicht mehr vorausgewählt. Solange sie da ist, zeigt ein Hinweis oben, wie du sie mit einem Klick wieder entfernst.
- Die Desktop-App sucht selbst nach neuen Versionen: beim Start, nach der Anmeldung und stündlich im Download-Ordner und in einem Update-Ordner, den du unter **Version … → Update-Ordner wählen …** festlegst (z. B. Schulserver oder Stick). Findet sie eine neuere Update-Datei, fragt sie „Update … verfügbar – jetzt einspielen?“. Eingespielt wird nur, wenn du zustimmst.
- Der LeDoK-Admin kann unter **LeDoK-Admin → Online nach Updates suchen** erlauben, dass die Desktop-App höchstens zweimal am Tag bei GitHub nach einer neuen Version fragt. Das ist ausgeschaltet, bis die Schule es einschaltet. Alle Lehrkräfte sehen den Status unter **Daten & Sicherheit**.

**Geändert**
- Der Aufbau des LEG-Bogens ist von **Textbausteine** nach **Dokumente** umgezogen. Deine bisherigen Überschriften und Einstellungen werden übernommen.
- Fragen und Hinweise erscheinen in LeDoK-eigenen Fenstern statt in Browser-Meldungen.
- Gespeicherte Daten sind deutlich kleiner. Ältere LeDoK-Versionen können neue Sicherungskopien deshalb nicht öffnen.
- Wenn du dein Passwort änderst, verschlüsselt LeDoK die Daten mit einem neuen Schlüssel.

**Behoben**
- Wenn sich LeDoK automatisch sperrt, geht ein angefangener Text (Notiz, Bericht, LEG) nicht mehr verloren.
- Ist LeDoK in zwei Fenstern offen, überschreibt ein Fenster nicht mehr still die Arbeit des anderen.
- Dateien von Kolleginnen und Kollegen (Fachpakete, Rückmeldungen) werden vor dem Übernehmen geprüft. Fehlerhafte Einträge werden übersprungen.
- Ein fremder Schulschlüssel kann den Schulschlüssel deiner Schule nicht mehr unbemerkt ersetzen.

## 1.0.0 (Beta)

Erste Testversion für den Einsatz im Kollegium.

**Neu**
- Neben der Versionsnummer steht „Beta“. So ist sichtbar, dass es sich um eine Testversion handelt.
- Über „Version …“ unten rechts, im Menü **Hilfe** und in der Hilfe unter „Wenn etwas nicht klappt“ gibt es jetzt **Problem melden …**. Du beschreibst kurz, was passiert ist, und speicherst den Bericht als Datei oder kopierst ihn in eine Mail. Der Bericht enthält Version, Betriebssystem und die letzten Fehlermeldungen, aber keine Schülerdaten. LeDoK selbst versendet nichts.
