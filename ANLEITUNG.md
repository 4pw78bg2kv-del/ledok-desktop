# LeDoK als Windows- und Mac-App

Dieses Projekt verpackt `LeDoK.html` als Programm für Windows (`.exe`) und macOS (`.dmg`).
Das Programm arbeitet vollständig offline, und Updates kommen als signierte Datei per Stick oder Mail.

```
app/LeDoK.html                 die App selbst (immer die aktuelle Fassung hier ablegen)
desktop/main.js                Programm-Hülle (Fenster, Menü, Update, Sicherungen)
desktop/update.js              prüft die Signatur von Update-Dateien
desktop/preload.js             schmale Schnittstelle zwischen App und Programm
desktop/ledok-update-key.json  DEIN öffentlicher Update-Schlüssel (legst du in Schritt 2 an)
build/icon.png, icon.ico       App-Symbol
.github/workflows/build.yml    baut die Installer auf GitHub
```

---

## 1 · Einmalig: Projekt auf GitHub

1. Lege auf github.com ein Konto an, falls du noch keins hast, und erstelle ein neues Repository, z. B. `ledok-desktop`.
   - **Öffentlich:** Die Mac-Builds sind dann unbegrenzt kostenlos.
   - **Privat:** Es gibt 2.000 Freiminuten pro Monat. Ein Mac-Build zählt zehnfach, ein kompletter Build kostet also etwa 100–150 Minuten. Für ein paar Versionen im Monat reicht das.
   - Schülerdaten sind in keinem Fall im Projekt. Es enthält nur den Programmcode.
2. Lade den Ordner mit **GitHub Desktop** hoch (`File → Add local repository → Publish`).
   - Wichtig: Der versteckte Ordner `.github` muss mit hochgeladen werden.
   - Der Upload im Browser lässt versteckte Ordner oft weg.

## 2 · Einmalig: Update-Schlüssel erzeugen

Nur Update-Dateien, die mit deinem privaten Schlüssel signiert sind, werden von den Apps angenommen.

1. Öffne `app/LeDoK.html` im Browser mit `#hersteller` am Ende der Adresse, z. B. `file:///…/LeDoK.html#hersteller`.
2. Gehe auf **LeDoK-Admin … → Hersteller · Updates**, vergib eine Passphrase (mind. 16 Zeichen) und klicke **Update-Schlüssel erzeugen**.
3. Du bekommst zwei Dateien:
   - `ledok-update-key.json` ist **öffentlich**. Lege sie nach `desktop/ledok-update-key.json` ins Projekt und lade sie hoch.
   - `LeDoK-Update-Schluessel-…-PRIVAT.ledok-updatekey` ist **privat**. Bewahre sie gut auf, z. B. auf einem USB-Stick und mit der Passphrase im Passwortmanager. Diese Datei kommt **nie** ins Projekt; die `.gitignore` verhindert das zusätzlich.

> Geht die private Datei verloren, kannst du keine Updates mehr signieren. Du musst dann einen neuen Schlüssel erzeugen und an die Schulen einmal einen neuen Installer verteilen.

## 3 · Installer bauen (.exe und .dmg)

1. Trage in `app/LeDoK.html` die Versionsnummer ein, ganz oben im Abschnitt „Version und Updates“:
   ```js
   const APP_VERSION="1.0.0", APP_DATUM="2026-10-18";
   ```
   Direkt darunter steht `const APP_KANAL="Beta";`. Dieser Zusatz erscheint nur in der Anzeige („Version 1.0.0 Beta“). Für die finale Version setzt du ihn auf `""`.
2. Lade die Änderung hoch und setze einen **Tag** mit derselben Nummer, z. B. `v1.0.0`. In GitHub Desktop geht das über `History → Rechtsklick auf den Commit → Create Tag`, danach `Push`.
3. Unter **Actions** läuft jetzt „Installer bauen“ (ca. 10–15 Minuten).
4. Unter **Releases** liegt danach ein Entwurf mit
   - `LeDoK-Setup-1.0.0.exe` (Windows) und
   - `LeDoK-1.0.0-mac.dmg` (macOS, für Intel und Apple-Chip).

   Du kannst den Entwurf veröffentlichen oder die Dateien einfach herunterladen.

Du kannst auch ohne Tag bauen, über `Actions → Installer bauen → Run workflow`. Die Dateien liegen dann im Lauf unter „Artifacts“.

## 4 · Updates verteilen (ohne Internet)

Für die meisten Änderungen brauchst du **keinen neuen Installer**:

1. Erhöhe in der neuen `LeDoK.html` die Version, z. B. auf `1.1.0` mit neuem `APP_DATUM`.
2. Gehe auf `LeDoK.html#hersteller` → **Hersteller · Updates**, trage Hinweise ein, z. B. „Neu: … / Behoben: …“, und klicke **LeDoK.html wählen …**. Wähle zuerst die neue Datei, dann deinen privaten Update-Schlüssel und gib die Passphrase ein.
3. Heraus kommt `LeDoK-1.1.0.ledok-update`. Verteile diese Datei per Stick, Mail oder Schulserver.
4. An der Schule klickt man **unten rechts auf „Version …“ → „Update-Datei wählen …“**. Die App
   - prüft die Signatur,
   - zeigt deine Hinweise,
   - legt eine Sicherung der Daten an und
   - startet neu.

Was passiert im Detail?
- Manipulierte Dateien und solche mit fremder Signatur werden abgelehnt.
- Eine ältere Version lässt sich nicht einspielen.
- Über denselben Dialog geht es auf Wunsch zurück zur ausgelieferten Version, die Daten bleiben dabei erhalten.

**Wann ist doch ein neuer Installer nötig?** Nur wenn sich die Programm-Hülle ändert (Ordner `desktop/`, Electron-Version, Symbol) oder ein neuer Update-Schlüssel kommt. Ein neuer Installer ersetzt das Programm; die Daten bleiben erhalten. Etwa einmal im Jahr ist ein neuer Installer sinnvoll, damit die eingebaute Browser-Technik aktuell bleibt.

Lege die neue `LeDoK.html` zusätzlich immer nach `app/LeDoK.html` ins Projekt. Dann enthält der nächste Installer gleich die aktuelle Version.

## 5 · Installation an der Schule (Apps ohne Zertifikat)

Weil die Apps (noch) nicht mit einem gekauften Zertifikat signiert sind, warnen beide Systeme beim **ersten** Start.

**Windows**
1. `LeDoK-Setup-x.y.z.exe` starten.
2. Bei „Der Computer wurde durch Windows geschützt“ auf **Weitere Informationen → Trotzdem ausführen** klicken.
3. Die Installation läuft ohne Administratorrechte, nur für den angemeldeten Benutzer.

**macOS**
1. Die `.dmg` öffnen und LeDoK in **Programme** ziehen.
2. LeDoK per **Rechtsklick → Öffnen** starten und bestätigen.
3. Erscheint stattdessen „kann nicht geöffnet werden“: **Systemeinstellungen → Datenschutz & Sicherheit → ganz unten „Dennoch öffnen“**.
4. Nur falls macOS meldet, die App sei „beschädigt“: im Terminal einmalig `xattr -cr /Applications/LeDoK.app` ausführen.

Mit einem Apple-Developer-Konto (99 €/Jahr) bzw. einem Windows-Code-Signing-Zertifikat fallen diese Warnungen weg. Das lässt sich später in `build.yml` ergänzen.

## 6 · Daten vom Browser in die App übernehmen

1. Im Browser-LeDoK: **Kopie herunterladen**.
2. In der App: auf dem Startbildschirm **Kopie einspielen …**, die Datei wählen und mit dem bisherigen Passwort öffnen.

## 7 · Wo liegen die Daten?

| | Windows | macOS |
|---|---|---|
| Daten (verschlüsselt) | `%APPDATA%\LeDoK` | `~/Library/Application Support/LeDoK` |
| Automatische Sicherungen vor jedem Update | `Dokumente\LeDoK-Sicherungen` | `Dokumente/LeDoK-Sicherungen` |
| Eingespieltes Update | `%APPDATA%\LeDoK\update` | `~/Library/Application Support/LeDoK/update` |

- Beim Deinstallieren bleiben die Daten erhalten.
- Die Sicherungen sind normale LeDoK-Kopien (`.lernstand`). Man öffnet sie mit „Kopie einspielen“ und dem Passwort.

## 8 · Datenschutz

- Die App lädt nichts aus dem Internet und sendet nichts. Jeder Netzwerkzugriff wird im Programm blockiert.
- Kamera, Mikrofon und Standort sind gesperrt.
- Die Rechtschreibprüfung ist nur auf dem Mac aktiv, weil sie dort im System läuft. Unter Windows würde sie Wörterbücher aus dem Netz laden und bleibt deshalb aus.
- Updates kommen ausschließlich als Datei, deren Signatur das Programm mit dem eingebauten öffentlichen Schlüssel prüft.

## Für Entwickler

```bash
npm ci
npm start            # App lokal starten
npm run dist:win     # Windows-Installer (unter Linux/macOS wird Wine benötigt)
npm run dist:mac     # nur auf einem Mac
```
