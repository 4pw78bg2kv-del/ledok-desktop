# LeDoK – Hinweise für Claude

LeDoK ist eine Offline-App für Grundschullehrkräfte in Bayern (Lernentwicklung, LEG, Klassenorganisation). Antworten und Texte auf Deutsch, in der App Du-Form und aktuelle amtliche Rechtschreibung.

## Projektregeln (von Dominik, verbindlich)

- **Versionsnummer** (`APP_VERSION`, `package.json`, `npm run release`) nur nach ausdrücklicher Freigabe von Dominik ändern, auch nicht nebenbei bei einem Feature. Releases, Tags und Update-Pakete ebenso nur nach seiner Zustimmung.
- **Neue Funktionen dokumentieren:** Eintrag unter `## Unveröffentlicht` in `CHANGELOG.md` (für Lehrkräfte, ganze Sätze, Namen wie in der App) und Abschnitt in der Bedienungsanleitung (`docs/anleitung/LeDoK-Bedienungsanleitung.md`, siehe unten). Die Hilfe in der App bietet genau diese Anleitung als Word-Datei an.
- PRs gegen `main`.

## Vorsicht, große Dateien (Token-Falle)

- `app/LeDoK.html` (~7 MB, ~8.400 Zeilen) ist die **ganze App** (HTML, CSS, ein Skriptblock). Eine Zeile (`<template id="anleitung-docx">`, ~5,6 MB Base64) und die Zeile `const LP_VORLAGE=` (Lehrplan) sind riesig.
  - Nie `cat`, nie ganze Datei lesen. Suchen immer mit gekürzter Ausgabe: `grep -n 'muster' app/LeDoK.html | cut -c1-200`.
  - Gliederung: `grep -n '/\* ---------- ' app/LeDoK.html | cut -c1-110` (Abschnittskommentare), dann mit Read `offset`/`limit` gezielt lesen.
- `docs/LeDoK-Bedienungsanleitung.docx` (4 MB) nie auspacken oder per XML bearbeiten: Die Quelle ist Markdown (unten).
- `docs/TECHNIK.md` (~70 KB) nicht ganz lesen: `grep -n '^#' docs/TECHNIK.md`, dann den Abschnitt. Wichtig: §3 Aufbau der App, §4 Datenmodell, §12 Tests, §14 Regeln für Änderungen.
- `tests/ledok.spec.js` (~100 KB): nach `test("` greppen statt ganz lesen. Der Helfer `neueKlasse(page)` legt die Beispielklasse an.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `app/LeDoK.html` | die App, einzige Quelle; läuft im Browser und in der Desktop-Hülle |
| `desktop/` | Electron-Hülle (`main.js`, `preload.js`, `update.js`) |
| `scripts/` | `csp-hash.js`, `anleitung-bauen.js`, `anleitung.js`, `bildschirmfoto.js`, `pruefen.js`, `release.js`, `version-sync.js`, `update-paket.js` |
| `tests/ledok.spec.js` | Playwright-Tests (Chromium, Desktop 1280×860 und `@handy`) |
| `docs/anleitung/` | Quelle der Bedienungsanleitung: `LeDoK-Bedienungsanleitung.md`, `bilder/`, `vorlage.docx`, `tabellen.lua` |
| `docs/TECHNIK.md` | technische Doku; `ANLEITUNG.md` Bauen/Verteilen für Dominik |

In der App: Reiter in `TABS` (`data-act="tab" data-v="heute|erfassen|uebersicht|kind|export|listen|…"`), Zustand `S` (verschlüsselt gespeichert), Oberfläche über `render()`, Ansichten in `VIEWS`/`*_VIEWS`, Klicks über `data-act="…"` → `ACT`/`*_ACT`, Eingaben über `*_CHG`. Datenformat ändern = `SCHEMA` erhöhen und `migrate()` erweitern. Daten aus Dateien durch die `…Bereinigen()`-Funktionen schicken, Angezeigtes durch `esc()`. Rückfragen mit `askText`/`frage`/`info`, nie `prompt`/`confirm`/`alert`. Keine Netzzugriffe, keine externen Bibliotheken. Im Skript nie `</script` schreiben.

## Befehle

```bash
npm ci --ignore-scripts                 # Abhängigkeiten (in Cloud-Sitzungen macht das .claude/hooks/session-start.sh)
node scripts/csp-hash.js                # nach JEDER Änderung am Skript in app/LeDoK.html, sonst bleibt die App weiß
npm run pruefen                         # schnell, ohne Browser: Syntax, Version, CHANGELOG, CSP-Hash, Anleitung
npx playwright test --reporter=dot      # alle Oberflächentests (~1 min); einzelne mit -g "Teil des Testnamens"
npm test                                # pruefen + alle Tests (wie CI)
npm run anleitung                       # Word-Anleitung aus docs/anleitung/ bauen und in die App einbetten (braucht pandoc)
npm run bild -- docs/anleitung/bilder/x.png --klick '[data-act="tab"][data-v="listen"]'   # Bildschirmfoto der Beispielklasse
```

Fehlt pandoc: `sudo apt-get install -y pandoc` bzw. `brew install pandoc`.

## Typischer Ablauf für eine neue Funktion

1. Code in `app/LeDoK.html`, dann `node scripts/csp-hash.js`.
2. Test in `tests/ledok.spec.js` ergänzen (vorhandenen ähnlichen Test als Vorlage suchen), gezielt mit `-g` laufen lassen.
3. `CHANGELOG.md` unter `## Unveröffentlicht` ergänzen.
4. Anleitung: passenden Abschnitt in `docs/anleitung/LeDoK-Bedienungsanleitung.md` ergänzen (Kapitel per `grep -n '^#'` finden). Bilder: `npm run bild -- docs/anleitung/bilder/name.png …`, eingebunden als `![Bildunterschrift](bilder/name.png){width="15.0cm"}` (eigener Absatz). Dann `npm run anleitung`.
5. `npm test`, committen, PR gegen `main`. Versionsnummer nicht anfassen.

## Merge-Konflikte

- `app/LeDoK.html` (Base64-Zeile der Anleitung) und `docs/LeDoK-Bedienungsanleitung.docx` sind erzeugt: Konflikte dort nicht von Hand lösen. Erst die Konflikte im Code und in `docs/anleitung/LeDoK-Bedienungsanleitung.md` lösen, die Base64-Zeile und die .docx von einer Seite nehmen, dann `npm run anleitung` und `node scripts/csp-hash.js`, dann `npm run pruefen`.
- Hat ein anderer Zweig die .docx direkt geändert (ohne Markdown): dessen .docx übernehmen, `npm run anleitung:aus-word`, eigene Änderungen an der Markdown-Datei wieder einfügen (`git diff docs/anleitung` zeigt, was fehlt), dann `npm run anleitung`.
- `CHANGELOG.md`: beide Einträge unter „Unveröffentlicht“ behalten.
