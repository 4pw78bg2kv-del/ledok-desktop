# LeDoK – Technische Dokumentation

Stand: 20.10.2026 · `main` nach PR #25 · App-Version 1.1.0 Beta (mit unveröffentlichten Änderungen)

Diese Datei beschreibt, wie LeDoK innen aufgebaut ist: für die Wartung, für Code-Prüfungen und für alle, die später am Projekt arbeiten. Die Bedienung für Lehrkräfte steht in der Bedienungsanleitung ([`docs/LeDoK-Bedienungsanleitung.docx`](LeDoK-Bedienungsanleitung.docx), auch in der App unter Hilfe), Bauen und Verteilen Schritt für Schritt in [ANLEITUNG.md](../ANLEITUNG.md).

## Inhalt

1. [Überblick](#1--überblick)
2. [Dateien im Repository](#2--dateien-im-repository)
3. [Die App `app/LeDoK.html`](#3--die-app-appledokhtml)
4. [Datenmodell](#4--datenmodell)
5. [Speichern, Profile und Sicherungen](#5--speichern-profile-und-sicherungen)
6. [Verschlüsselung (Container v2)](#6--verschlüsselung-container-v2)
7. [Schlüssel und Dateiformate](#7--schlüssel-und-dateiformate)
8. [Rollen und Datenaustausch](#8--rollen-und-datenaustausch)
9. [Desktop-Hülle (Electron)](#9--desktop-hülle-electron)
10. [Updates](#10--updates)
11. [Bauen und Veröffentlichen](#11--bauen-und-veröffentlichen)
12. [Tests und Prüfungen](#12--tests-und-prüfungen)
13. [Content-Security-Policy und Skript-Hash](#13--content-security-policy-und-skript-hash)
14. [Regeln für Änderungen](#14--regeln-für-änderungen)
15. [Offene Punkte](#15--offene-punkte)

---

## 1 · Überblick

LeDoK ist eine einzige HTML-Datei mit eingebettetem CSS und Vanilla-JavaScript, ohne Build-Schritt und ohne Bibliotheken. Sie läuft auf zwei Wegen:

- **Browser-Fassung:** `LeDoK.html` per Doppelklick öffnen. Daten liegen im `localStorage` des Browsers.
- **Desktop-App:** Electron lädt dieselbe Datei über das eigene Protokoll `ledok://app/index.html`. Daten liegen als Datei im Benutzerordner.

```
┌──────────────────────── Desktop-App (Electron) ────────────────────────┐
│  Hauptprozess  desktop/main.js                                         │
│   • Protokoll ledok://  → liefert app/LeDoK.html oder geprüftes Update │
│   • Netzsperre, keine Berechtigungen, eine Instanz                     │
│   • IPC: Daten lesen/schreiben, Sicherungen, Update prüfen/einspielen  │
│   • desktop/update.js  → Signaturprüfung (ECDSA P-256)                 │
│                ▲ ipcRenderer (nur von ledok://app/)                     │
│  Preload  desktop/preload.js → window.ledokDesktop                     │
│                ▲                                                       │
│  Renderer  app/LeDoK.html (Sandbox, contextIsolation, CSP)             │
│   • Zustand S, Oberfläche, Kryptografie (WebCrypto), Rollen            │
└────────────────────────────────────────────────────────────────────────┘
```

Feste Grundsätze, die jede Änderung einhalten muss:

- **Kein Netz.** CSP `connect-src 'none'`, in der Desktop-App zusätzlich `webRequest`-Sperre. Updates kommen als signierte Datei. Einzige Ausnahme: die Online-Suche nach Updates im Hauptprozess, nur wenn die Schule sie im Schulschlüssel einschaltet (Kapitel 10).
- **Immer verschlüsselt.** Nichts wird im Klartext gespeichert. Ausnahmen sind ausdrücklich unverschlüsselte Exporte (CSV, Druck/PDF, KI-Export), vor denen die Oberfläche warnt.
- **Keine Hintertür.** Es gibt keinen Hersteller-Generalschlüssel. Wiederherstellung nur über den Schulschlüssel (Masterkennwort der Schule) oder den von der Schule freigegebenen, sichtbaren Hersteller-Support.
- **Sprache:** Oberfläche deutsch, Du-Form, aktuelle amtliche Rechtschreibung, Rolle „der LeDoK-Admin“.

## 2 · Dateien im Repository

| Pfad | Inhalt |
|---|---|
| `app/LeDoK.html` | die App (ca. 6.400 Zeilen, davon eine Zeile `LP_VORLAGE` mit dem Lehrplan und eine mit der eingebetteten Bedienungsanleitung). Einzige Quelle. |
| `desktop/main.js` | Electron-Hauptprozess: Fenster, Menü, Protokoll, Netzsperre, IPC, Sicherungen, Update |
| `desktop/update.js` | Prüfung von `.ledok-update`-Dateien; gleiche Berechnung wie `updPayload`/`updFp` in der App |
| `desktop/preload.js` | stellt `window.ledokDesktop` bereit (feste, schmale Schnittstelle) |
| `desktop/ledok-update-key.json` | öffentlicher Update-Schlüssel, Fingerabdruck `CE5F-1656-01AF` |
| `build/icon.png`, `build/icon.ico` | App-Symbol |
| `scripts/version-sync.js` | übernimmt `APP_VERSION` in `package.json`, prüft Tag und CSP-Hash |
| `scripts/csp-hash.js` | trägt den SHA-256 des App-Skripts in die CSP ein bzw. prüft ihn (`--pruefen`) |
| `scripts/pruefen.js` | schnelle Prüfung ohne Browser: Syntax, Version, CHANGELOG, CSP-Hash, eingebettete Anleitung |
| `scripts/anleitung.js` | bettet `docs/LeDoK-Bedienungsanleitung.docx` in `app/LeDoK.html` ein bzw. prüft sie (`--pruefen`) |
| `scripts/release.js` | `npm run release x.y.z`: Version, Datum, CHANGELOG, Tests, Commit, optional Tag |
| `tests/ledok.spec.js`, `playwright.config.js` | Oberflächentests (Playwright, Chromium) |
| `.github/workflows/tests.yml` | Tests bei jedem Push und Pull Request |
| `.github/dependabot.yml` | Dependabot: monatliche Aktualisierungsvorschläge für GitHub Actions und npm-Werkzeuge |
| `.github/workflows/build.yml` | baut Windows- und Mac-Installer, bei Tag `v*` als Release-Entwurf |
| `.gitattributes` | erzwingt LF, damit der CSP-Hash auf Windows stimmt |
| `.gitignore` | schließt u. a. `*.ledok-updatekey` und `*-PRIVAT*` aus |
| `ANLEITUNG.md` | Bauen, Updates verteilen, Installation, Arbeitsweise |
| `docs/LeDoK-Bedienungsanleitung.docx` | Bedienungsanleitung für Lehrkräfte (Word, mit Bildern); wird in die App eingebettet |
| `docs/TECHNIK.md` | diese Datei |
| `CHANGELOG.md` | Änderungen für Lehrkräfte, Abschnitt „Unveröffentlicht“ zuerst |

## 3 · Die App `app/LeDoK.html`

### Aufbau der Datei

| Zeilen (ca.) | Abschnitt |
|---|---|
| 1–620 | `<head>`, CSP-Meta, CSS (helles und dunkles Farbschema über `:root`-Variablen, Druck-CSS) |
| 620 | `<template id="anleitung-docx">`: die Word-Anleitung als Base64 (ca. 1,6 MB in einer Zeile), außerhalb des Skripts |
| 623 | `<script>` (genau ein Skriptblock; sein Hash steht in der CSP) |
| 622–659 | Konstanten: `STORE_BASE`, `PROFIL_KEY`, ASV-Merkmale, Skala, `QUELLE` |
| 660 | `LP_VORLAGE`: LehrplanPLUS 1/2, 3/4 und DaZ 1–4, ca. 3.700 Texte |
| 2633–2792 | Migration des alten flachen Rasters, LEG-Abschnitte und -Vorlagen, Briefkopf, Einladung, `defaultState()` |
| 2818–2991 | Kryptografie, Speicher, Profile, Sicherungen |
| 2992–3061 | `migrate()`, `fpBereinigen()`, `datenBereinigen()` |
| 3062–3188 | Berechnungen: Kompetenzbaum, `evalNode`, Fachwert, Note, Lernniveau, Jahrgangsstufen |
| 3189–3476 | Textgenerierung (Bericht, LEG), Druckseiten (LEG, Bericht, Förderplan, Einladung, Terminliste), Briefkopf, Platzhalter, Druckvorschau `drucke()` |
| 3477–3881 | UI-Zustand, Startbildschirm, Einrichtung, `render()`, Einstellungen, Raster-Teilansichten |
| 3882–4741 | `VIEWS` (Hilfe, Heute, Erfassen, Übersicht, Kind, Sammelexport, Einstellungsseiten), Proben, Diagramme, LEG-Editor, KI-Export |
| 4742–5310 | Rollen: Schulschlüssel, LeDoK-Admin, Hersteller-Bereich, Fachpakete, Rückmeldungen, Rückmeldung am selben Rechner |
| 5311–5475 | Version und Updates, Problem melden |
| ca. 5560–5985 | QR-Encoder (`qrMatrix`, `qrSvg`) und Klassenorganisation: Sammellisten, Klassenkasse, Fehltage, Stundenplan (`ORGA_VIEWS`, `ORGA_ACT`, `ORGA_CHG`) |
| 5476–5579 | Dialoge: `dialog`, `askText`, `frage`, `info`, `askPassword`, `pickFile`, `askFile`; Schnellsuche |
| 5580–6238 | `ACT` (Aktionen), Übergabe/Import/CSV, Lehrplan-CSV |
| 6239–6411 | Ereignisse, Speichern beim Tippen (Förderplan, Dokumente, Bericht/LEG), automatische Sperre, Beispieldaten, Start |

Die Zeilennummern verschieben sich mit jeder Änderung. Die Abschnitte beginnen mit Kommentaren der Form `/* ---------- Name ---------- */`, nach denen du suchen kannst.

### Oberfläche

- `render()` baut die Hauptansicht per `innerHTML` neu auf. Seiten liegen in `VIEWS` (`heute`, `erfassen`, `uebersicht`, `kind`, `export`, `hilfe` und die Einstellungsseiten `klasse`, `team`, `pakete`, `schuljahr`, `raster`, `bausteine`, `dokumente`, `daten`). `ROLLEN_VIEWS` und `ORGA_VIEWS` (`listen`, `stundenplan`) werden in `VIEWS` gemischt.
- Ereignisse sind delegiert: `data-act="x"` → `ACT.x(el)`, `data-chg="x"` → `CHG.x(el)`, `data-bind="pfad"` schreibt direkt in `S`. `ADMIN_ACT`, `ROLLEN_ACT` und `ORGA_ACT` werden in `ACT` gemischt, `ORGA_CHG` in `CHG`.
- Inline-Handler (`onclick=` im HTML) sind durch die CSP gesperrt. Handler werden nach dem Rendern in JS gesetzt.
- Alle Texte aus Daten laufen durch `esc()`.
- `UI` hält den flüchtigen Zustand (aktiver Reiter, Filter, Namen-Schalter). Er wird nicht gespeichert.
- **Schnellsuche** (Strg/⌘+K, Knopf ⌕): `sucheQuellen()` sammelt Bereiche, Einstellungsseiten, Kinder, beobachtbare Themen und drei Aktionen (Sicherungskopie, Bedienungsanleitung, Sperren); `sucheTreffer()` filtert und sortiert (höchstens 12), `sucheOeffnen()` zeigt das Ergebnis in `#dlg`. Im Kürzel-Modus wird nur nach Kürzeln gesucht.
- **Dein Tag** (Heute): `tagesFortschritt()` fasst Fokustag und Fokuswoche zu einem Balken zusammen. Ein Kind des Fokustags zählt als erledigt, wenn alle seine Fokus-Themen bewertet sind; dazu kommen die erledigten Kinder der Fokuswoche. Bei 100 % bekommt die Karte die Klasse `fertig` (grün). Nicht an Wochenenden, nicht für Fachlehrkräfte und nicht, wenn `S.meta.tagesbalken === false`.
- **Bedienungsanleitung:** Der Knopf „Bedienungsanleitung (Word)“ in der Hilfe und die gleichnamige Aktion der Schnellsuche rufen `ACT.anleitungLaden`. Es dekodiert den Inhalt von `#anleitung-docx` und lädt ihn über `download()` als `LeDoK-Bedienungsanleitung-<APP_VERSION>.docx` herunter. Fehlt der Block, erscheint ein Hinweis.
- **Druck:** Jeder Druck läuft über `drucke(html)`. Es zeigt zuerst eine Vorschau in `#dlg`; erst „Drucken …“ schreibt das HTML in `#print-root` und ruft `window.print()`. Nach `afterprint` wird `#print-root` geleert.
- **Kopfzeile:** Bis 1800 px Breite stehen die sechs Reiter in einer eigenen Zeile unter Logo und Knöpfen (`@media (max-width:1800px)`), damit nichts abgeschnitten wird.
- **Listen** (Reiter, `VIEWS.listen`, Unterseiten über `UI.lTab`): Sammellisten (`listenView`), Klassenkasse (`kasseView`) und Fehltage (`fehltageView`). Auf **Heute** kommen dazu `anwesenheitCard` („Wer fehlt heute?“), `stundenplanCard` (Stunden des Tages, laufende Stunde hervorgehoben, „beobachten“ springt per `goFach` in die Beobachtung, dazu bis zu zwei ★-Themen je Fach mit den wenigsten Beobachtungen der letzten 14 Tage) und `listenCard` (offene Listen).
- **Zahlungsbrief:** `zahlbriefSeite(l, kid)` füllt den Text der Liste ({Zweck}, {Betrag}, {Frist} und die üblichen Platzhalter). Ist die Bankverbindung gültig (`kontoOk`: Inhaber und IBAN mit Prüfziffer, deutsche IBAN 22 Zeichen), druckt er Überweisungsdaten und einen GiroCode: `epcText()` baut die EPC-Nutzlast (Version 002, UTF-8, ohne BIC zulässig), `qrSvg()` zeichnet sie. Der QR-Encoder ist eigener Code ohne Bibliothek (Byte-Modus, Fehlerkorrektur M, Versionen 1–20, Maskenwahl nach Strafpunkten). Ohne gültiges Konto gibt es stattdessen einen Abschnitt zum Zurückgeben mit dem Bargeld.
- Darstellung hell/dunkel: pro Gerät in `localStorage` (`themeLesen`), nicht in den Daten.

### Berechnungen

- **Raster als Baum:** Ebene 1 Lernbereich → 2 Kompetenz → 3 Kompetenzerwartung → 4 Teilbereich. `cache()` baut bei jeder Änderung (`DV++`) Indizes `byId`, `kids`, `idx` (Einträge je Kind und Knoten) neu auf.
- **Stand** eines Blatts: Mittel der letzten drei Einträge. **Trend:** letzter minus erster Wert im laufenden Schuljahr (ab 1. August), ↑ ab +2, ↓ ab −2.
- **`evalNode(k, id, cut)`:** eigene Bewertungen und alle sichtbaren Unterbereiche, gleich gewichtet. `cut` ist ein Stichtag für den Lernverlauf. `fachEval` mittelt die Wurzeln eines Fachs.
- **Bewertungsebene:** `hier` an einem Knoten mit Kindern. `hierBew(r)`, `hierVon(r)`, `bewertbar(r)` und `teilaspekte(c)` steuern, dass der Oberbereich bewertet wird und die Unterbereiche nur als „Worauf achten“ erscheinen.
- **Soll:** `soll1`–`soll4` je Knoten, sonst 5 (Jgst. 1) bzw. 7. **Lernniveau ↑** (`begabt`): das Kind wird in den gewählten Fächern an `jgst + 1` gemessen (`bewJgst`).
- **Note:** `note(v)` über `S.meta.notenGrenzen` (Standard `[8.5, 7.5, 6, 4.5, 3]`, darunter 6). Nur Vorschlag, ab Jgst. 2.
- **Jahrgangsstufen 3/4:** `fachStufe()` ordnet Fächer `12`, `34` oder `alle` zu (Name enthält „3/4“, DaZ ist übergreifend). `faecherFuerStufen()` blendet passend ein, `stufenHinweis()` warnt bei Lücken.

### Dialoge

`prompt()`, `confirm()` und `alert()` gibt es in der App nicht (in Electron fehlen sie teils, und Browser können sie stummschalten). Stattdessen:

- `askText(titel, text, vorgabe, mehrzeilig)`, `askPassword(titel, text)`, `frage(text, {titel, ja, gefahr, tippen})`, `info(text, titel)`.
- `frage(..., {tippen: "LÖSCHEN"})` verlangt das Eintippen eines Worts vor gefährlichen Schritten.
- `pickFile(accept)` öffnet den Dateidialog direkt. Ein **zweiter** Dateidialog im selben Ablauf geht nur über `askFile(...)` mit eigenem Knopf, weil Browser Dateidialoge nur direkt nach einem Klick öffnen.

## 4 · Datenmodell

Der entschlüsselte Zustand liegt nur im Arbeitsspeicher in der globalen Variable `S`:

```js
S = {
  version: 1,
  meta: { schule, klasse, lehrkraft, schuljahr: "2026/27", halbjahr: 1|2, lastBackup, tagesSicherung,
          notenGrenzen, skala9, rs2026, schema: 2, kiPrompt, leg{bloecke[], selbst[]}, legVorlagen[], kopf{}, einladung{titel, text, rueck}, druck{groesse, schrift, grau}, tagesbalken, faecher[], asvModus{}, jgStufen[],
          rolle: "kl"|"fl", klassenId, schulKey, fachlehrer[], pakete[], protokoll[], demo, sjCheck{} },
  kinder:    [ { id: "S01", vorname, nachname, geburt, jgst: 1–4, klasse, gruppe: "A"–"E",
                 faecherNur[], begabt[] /* Fächer oder "*" */, pronomen, pk?, ausPaket? } ],
  raster:    [ { id: "D-1.1.1.1", fach, text, lp, info, ebene: 1–4, parent,
                 soll1–soll4, modus, modus1–modus4, hier, aus, hj1, hj2, akt } ],
  eintraege: [ { t /*ms, eindeutig*/, d: "JJJJ-MM-TT", k /*Kind*/, c /*Knoten oder SV1…AV4*/, w: 1–9,
                 q: "b"|"l"|"f", n /*Notiz*/, p? /*Probe*/, vp? /*Fachlehrkraft-ID*/, von?, ext? } ],
  notizen:   [ { id, k, ts, kat, text, vp?, von?, ext? } ],
  bausteine: { asv: {SV1: {2|5|7|9: {b, l}, ziel}}, fach: {...}, phrasen: {...}, notizen: [] },
  texte:     { "S01|2026/27|1": { bericht, leg, termin: {d, z, ok} } },
  foerderplaene: { S01: { zeitraum, anlass, beteiligt, geaendert,
                 ziele: [ { id, text, massnahmen, wer, bis, stand: "offen"|"teilweise"|"erreicht" } ] } },
  proben:    [ { id, name, datum, fach, jg, art: "punkte"|…, items[], werte{}, fehlt{} } ],
  listen:    [ { id, titel, d, betrag /*Cent je Kind, 0 = nur abhaken*/, frist, kasse, zu, text,
                 st: { S01: { w: "ok"|"bar"|"ue"|"frei", b /*Cent*/, d } }, alt /*Cent*/ } ],
  kasse:     { konto: { inhaber, iban, bic }, buchungen: [ { id, d, text, b /*Cent, − = Ausgabe*/, beleg } ] },
  fehltage:  [ { k, d, ganz, ent, std, n, sj, hj } ]
}
```

- `modus`: `beob`, `fokus`, `woche`, `kind`, `kein`, `auto`. `modus1`–`modus4` überschreiben ihn je Jahrgangsstufe.
- `q` (Quelle): `b` Beobachtung, `l` Probe, `f` Fokuswoche.
- `vp`/`von`: Eintrag stammt aus der Rückmeldung einer Fachlehrkraft (bei der Klassenlehrkraft). `ext:1`: Eintrag der Klassenlehrkraft, der als Verlauf im Fachpaket kam (bei der Fachlehrkraft); er wird nie zurückgemeldet.
- `S.meta.protokoll`: höchstens 60 Einträge `{ts, text}`, für die Lehrkraft sichtbar unter Daten & Sicherheit.

- `S.meta.leg`: Aufbau des LEG-Bogens als Folge von Abschnitten, `bloecke: [{typ, an, titel?, id?, text?, linien?}]`, dazu `selbst[]` (Sätze der Selbsteinschätzung). `typ` ist einer aus `LEG_ABSCHNITTE`: `pers`, `stark`, `ueben`, `faecher`, `selbst`, `ziele`, `vereinb`, `frei`, `unterschrift`, `verlauf`. Nur `frei` darf mehrfach vorkommen; es hat eine `id`, einen `text` mit Platzhaltern und 0–6 Schreiblinien. `legMigration()` überführt ältere `titel`/`zeigen`-Einstellungen ohne Verlust, sortiert ungültige oder doppelte Abschnitte aus und ergänzt fehlende Standardabschnitte. Platzhalter (`PLATZHALTER`, gefüllt von `platzhalterFuellen`): `{Vorname}`, `{Name}`, `{Klasse}`, `{Jgst}`, `{Schule}`, `{Schuljahr}`, `{Halbjahr}`, `{Lehrkraft}`, `{Datum}`, `{Stärken}`, `{Übungsfelder}`, `{Ziele}`.
- `S.meta.legVorlagen`: weitere LEG-Vorlagen `[{id, name, jgst[], bloecke[], selbst[]}]`. `S.meta.leg` bleibt die Standardvorlage (in der Oberfläche „Standard“, intern `id` `"std"`). `legFuer(kid)` nimmt die erste Vorlage, deren `jgst` die Jahrgangsstufe des Kindes enthält, sonst die Standardvorlage; eine Jahrgangsstufe gehört immer nur zu einer Vorlage. `legSeite(kid, L)`, `legBlock`, `legAn` und `legTitel` bekommen die Vorlage als Parameter. Im Druckdialog kann man eine andere Vorlage wählen. `legVorlageBereinigen()` baut auf `legMigration()` auf und prüft zusätzlich `id`, `name` (höchstens 60 Zeichen) und `jgst` (1–4).
- `S.texte[…].termin`: Gesprächstermin aus dem LEG-Planer, `d` = Datum (JJJJ-MM-TT), `z` = Uhrzeit, `ok` = geführt. Er hängt am Schlüssel Kind|Schuljahr|Halbjahr, gilt also je Halbjahr, wird mit dem Kind gelöscht und reist in der Übergabedatei mit. „Auf Entwurf zurücksetzen“ bei Bericht und LEG lässt den Termin stehen. Platzhalter `{Termin}` (Wochentag, Datum, Uhrzeit) gilt in Freitext-Abschnitten und in der Einladung.
- `S.meta.einladung`: Elternbrief zum LEG `{titel, text, rueck}`; `rueck` hängt einen Rückmeldeabschnitt an. `migrate()` ergänzt fehlende Felder aus `DEFAULT_EINLADUNG()`. Druckseiten: `einladungSeite(kid)`, `terminSeite(kids)`; Oberfläche: `legPlanerCard()` im Sammelexport.
- `S.foerderplaene`: Förderpläne nach Kind-ID (Kind → Förderplan, Sammeldruck im Export). `fpBereinigen()` säubert sie beim Laden und Einlesen (gültige IDs, Datum `bis` nur im Format JJJJ-MM-TT, Stand aus `FP_STAND`). `kindLoeschen()`, das Umbenennen ungültiger Kürzel in `datenBereinigen()` und „Schülerdaten löschen“ ziehen die Pläne mit. Die Übergabedatei eines Kindes (`kindPaket`) enthält keinen Förderplan.
- `S.meta.druck`: Druckbild `{groesse, schrift, grau}` für alle Ausdrucke. `groesse` ist einer aus `DRUCK_GROESSEN` (90, 100, 110, 125 Prozent), `schrift` `serif` oder `sans`, `grau` druckt Logo und Diagramme in Graustufen. `druckBereinigen()` säubert den Wert beim Laden und Einlesen; `druckKlassen()` liefert die Klassen `d-sans` und `d-grau` für `#print-root` und die Vorschau, `druckZoom()` den `zoom`-Stil.
- `S.meta.tagesbalken`: `false` blendet den Balken „Dein Tag“ auf **Heute** aus (`ACT.tagesbalkenAus`/`tagesbalkenAn`); fehlt der Wert, wird er gezeigt.
- `S.listen`: Sammellisten. Mit `betrag > 0` ist es eine Geldliste (`w` = `bar`, `ue` überwiesen, `frei` erlassen, Betrag `b` je Kind änderbar), sonst eine Liste zum Abhaken (`w` = `ok`). Ein fehlender Eintrag in `st` heißt „offen“. `kasse` bucht die Einnahmen ins Kassenbuch, `zu` schließt die Liste ab. Verlässt ein Kind die Klasse (`kindLoeschen`, „Schülerdaten löschen“), schiebt `listenKindWeg()` seine Zahlung nach `alt`, damit Summe und Kassenbuch stimmen. Beträge sind immer ganze Cent; `centAus()` liest Eingaben wie „8,50“ oder „1.234,50 €“.
- `S.kasse`: Bankverbindung für Zahlungsbriefe und manuelle Buchungen. `kassenbuch()` mischt sie mit einer Zeile je Geldliste (`kasse: true`) und rechnet den laufenden Saldo; die Listenzeilen werden nicht gespeichert, sondern jedes Mal berechnet.
- `S.fehltage`: höchstens ein Eintrag je Kind und Tag (`fehltagSetzen`). `ganz` ganzer Tag, sonst `std` versäumte Stunden (0–10); `ent` entschuldigt; `n` kurze Bemerkung (ohne Gesundheitsangaben). `sj`/`hj` werden beim Eintragen gesetzt (vor Schuljahresbeginn aus dem Datum, Halbjahr ab 15. Februar), damit `fehlSumme()` je Halbjahr zählt. Wer heute fehlt, zählt beim Fokustag und im Balken „Dein Tag“ nicht mit; in Erfassen und auf der Kind-Seite steht „fehlt“.
- `S.meta.stundenplan`: `{n, zeiten[8], A–E[8]}`, je Wochentag ein Fach oder freier Text je Stunde, `zeiten` optional als „HH:MM“. `spFach()` ordnet einen Eintrag einem Fach zu (Name, Kürzel oder mindestens drei Anfangsbuchstaben); was nicht passt (z. B. „Religion“, „AG“), wird nur angezeigt. Einstellungsseite `stundenplan` (nicht für Fachlehrkräfte).
- Die neuen Bereiche säubern `listenBereinigen`, `kasseBereinigen`, `fehltageBereinigen` und `stundenplanBereinigen` bei jedem `migrate()`. `datenBereinigen` zieht umbenannte Kürzel in Fehltagen und Listen mit, die Datenprüfung meldet Fehltage ohne Kind. Weil nur neue Felder dazukamen, bleibt `SCHEMA` bei 2: ältere Versionen lassen unbekannte Felder beim Speichern stehen.
- `S.meta.kopf`: Briefkopf `{logo, anschrift, fuss, leg, bericht, liste}`. `logo` ist eine Data-URL, die nur gerendert wird, wenn sie auf `LOGO_RE` passt (PNG, JPEG oder WebP in Base64). Beim Einlesen verkleinert `logoVerkleinern()` das Bild auf höchstens 600 × 240 px und speichert es als PNG. Die drei Schalter legen fest, für welche Druckart der Briefkopf gilt.

### Migration

`migrate(st)` läuft bei jedem Öffnen und Einspielen:

- Skala 1–10 → 1–9 (`meta.skala9`), altes flaches Raster → Baum (`baumMigration`), fehlende Felder aus `defaultState()`.
- Rechtschreibkorrekturen 2026 in gespeicherten Rastern und Bausteinen (`RS_FIX`, Flag `meta.rs2026`).
- **Datenprüfung** (Daten & Sicherheit, `ACT.datenPruefen`): `datenPruefung()` zählt Einträge ohne Kind, Einträge ohne Thema (weder Knoten noch ASV-Merkmal), Notizen, Texte, Förderpläne und Fehltage ohne Kind sowie Einträge mit Datum in der Zukunft. Nach Rückfrage legt sie eine Sicherung `vor-aufraeumen` an und entfernt mit `datenAufraeumen()` die Reste ohne Kind oder Thema; Einträge in der Zukunft werden nur gemeldet.
- `datenBereinigen(st)`: verwirft ungültige Einträge, Notizen und IDs (`ID_RE` erlaubt keine `<>"'`&\` und Steuerzeichen) und vergibt bei Bedarf neue Kürzel. Das schützt vor eingeschleustem Code aus Dateien anderer Personen.
- `meta.schema = SCHEMA` (derzeit 2). Daten mit höherem Schema öffnet eine ältere App nicht („neuer“), statt sie falsch zu lesen.

## 5 · Speichern, Profile und Sicherungen

### Speicherorte

| Schlüssel | Inhalt | Browser | Desktop |
|---|---|---|---|
| `lernstand12.store.v1` | Daten des ersten LeDoK (Container `lernstand12`) | `localStorage` | `userData/daten/lernstand12.store.v1.lernstand` |
| `lernstand12.store.v1.p<8 hex>` | Daten weiterer Profile | `localStorage` | `userData/daten/<key>.lernstand` |
| `ledok.profile.v1` | Profilliste `[{key, name}]` | `localStorage` | `localStorage` |
| `ledok.profile.v1.zuletzt` | zuletzt gewähltes Profil | `localStorage` | `localStorage` |
| `<store>.stand` | Stand-Marke gegen zwei Fenster | `localStorage` | – |
| `ledok.post.<pid>` | Rückmeldung am selben Rechner (Container `ledok-rueckmeldung`) | `localStorage` | `userData/daten/ledok.post.<pid>.lernstand` |
| `ledok.post.<pid>.ok` | Quittung der Klassenlehrkraft (Zeitstempel) | `localStorage` | `localStorage` |

`userData` ist `%APPDATA%\LeDoK` bzw. `~/Library/Application Support/LeDoK`.

- `save()` markiert die Daten als geändert und speichert nach 300 ms; `saveNow()` speichert sofort und liefert ein Promise. Gespeichert wird immer `sealState()`: der ganze Zustand, gzip-komprimiert und verschlüsselt.
- **Desktop:** `storeWrite` ruft `ledokDesktop.datenSpeichern(key, text)`. Der Hauptprozess prüft `app` und `ct`, kopiert die alte Datei nach `.vorher` und schreibt atomar (`.tmp` + `rename`). Gelesen wird synchron (`sendSync`), weil der Startbildschirm sofort wissen muss, ob Daten da sind. Liegen noch Daten aus 1.0.0 im `localStorage`, werden sie gelesen und beim ersten Speichern in die Datei übernommen.
- **Zwei Fenster (nur Browser):** Jedes Speichern schreibt eine Stand-Marke. Weicht sie vor dem nächsten Speichern ab, sperrt das Fenster (`ST.konflikt`). Über `BroadcastChannel("ledok")` speichert und sperrt ein offenes Fenster, sobald ein zweites öffnet.
- **Profile:** `profilStart()` wählt beim Start das zuletzt genutzte Profil. „Eigenes LeDoK anlegen“ (`ACT.profilNeu`) erzeugt einen neuen Schlüssel `STORE_BASE + ".p" + 8 Hex-Zeichen`. Jedes Profil hat eigenes Passwort und eigenen Datenschlüssel.
- **Automatische Sperre:** nach 15 Minuten ohne Eingabe (`IDLE_MIN`). `lock()` übernimmt vorher offene Texte in Dialogen und legt eine Notfallkopie an, falls das Speichern fehlschlägt.

### Sicherungen

`sicherungAnlegen(anlass, roh)` schreibt in der Desktop-App über `ledokDesktop.sicherung` still nach `Dokumente/LeDoK-Sicherungen/ledok-sicherung-<anlass>-JJJJ-MM-TT-HHMM.lernstand`; im Browser wird die Datei heruntergeladen.

| Anlass | Auslöser |
|---|---|
| `kopie` | „Beenden“, „Kopie jetzt herunterladen“ (im Browser höchstens einmal am Tag beim Beenden) |
| `tag` | Schließen des Fensters in der Desktop-App, höchstens einmal am Tag (`ledokSchliessen`, `meta.tagesSicherung`) |
| `vor-loeschen` | „Alles löschen“, „Dieses LeDoK löschen“, „Schülerdaten löschen“ |
| `vor-schuljahreswechsel` | Schuljahreswechsel |
| `vor-kind-loeschen` | ein Kind löschen (nur Desktop-App) |
| `vor-einspielen` | „Kopie einspielen“ |
| `vor-aufraeumen` | „Aufräumen“ in der Datenprüfung |
| `vor-update-<version>`, `vor-zuruecksetzen-<version>` | Update einspielen bzw. zurücksetzen (im Hauptprozess) |
| `notfall` | Sperren, obwohl das Speichern fehlgeschlagen ist |

Der Hauptprozess behält je Anlass die 15 neuesten Dateien (`AUFHEBEN`) und löscht ältere. Gelöscht wird nur nach dem Muster `ledok-sicherung-<anlass>-<Datum>.lernstand`.

Löschen ohne Passwort (`ACT.wipeAll`) ist vom Startbildschirm erreichbar. Deshalb legt LeDoK vorher immer eine verschlüsselte Sicherung an und verlangt „LÖSCHEN“. Bei mehreren Profilen wird nur das gewählte gelöscht.

## 6 · Verschlüsselung (Container v2)

Alle Kryptografie läuft über WebCrypto im Renderer.

| Zweck | Verfahren |
|---|---|
| Daten | AES-256-GCM, zufälliger Datenschlüssel (DEK), IV 12 Byte |
| Passwort → Schlüssel | PBKDF2-SHA256, 250.000 Runden (`KDF_IT`), Salt 16 Byte |
| Masterkennwort, Support- und Update-Passphrase → Schlüssel | PBKDF2-SHA256, 600.000 Runden (`MASTER_IT`) |
| Schulschlüssel und Support-Schlüssel | RSA-OAEP 3072 Bit, SHA-256 |
| Signaturen (Schulschlüssel, Updates) | ECDSA P-256, SHA-256, Signatur im Format IEEE P1363 |

`versiegeln(app, obj, {dek, pwKey, salt, rawKey, sk, zip})` erzeugt:

```js
{ app, v: 2, kdf: "PBKDF2-SHA256-250000",
  salt, wp: {iv, ct},          // DEK, verpackt mit dem Passwort-Schlüssel
  wk:   {iv, ct},              // DEK, verpackt mit einem 256-Bit-Paketschlüssel (rawKey)
  ws:   {sid, name, fp, pub, msalt, ek, ct},   // DEK, RSA-verpackt mit dem Schulschlüssel
  wv:   {name, fp, ct},        // DEK, RSA-verpackt mit dem Support-Schlüssel (nur wenn freigegeben)
  z: "gzip",                   // Klartext vor dem Verschlüsseln komprimiert
  iv, ct, saved }              // die Nutzdaten
```

- Welche Verpackungen vorkommen, hängt vom Zweck ab: eigene Daten `wp`, Fachpakete und Übergabedateien `wp` mit dem Paket- bzw. Übergabepasswort, Rückmeldungen `wk` (Paketschlüssel `rkey`). Ist ein Schulschlüssel hinterlegt, kommen bei allen `ws` und, falls der Support freigegeben ist, `wv` dazu (`versiegeln` nimmt standardmäßig `S.meta.schulKey`).
- `ws` enthält zusätzlich `msalt` und `ek` (den mit dem Masterkennwort verschlüsselten privaten Schulschlüssel). So kann der LeDoK-Admin eine Datei mit dem Masterkennwort allein öffnen, auch ohne die `.ledok-schule`-Datei.
- `entsiegeln(obj, {pw | rawKey | master | dek})` öffnet jede Variante und liest auch Container v1 (`{salt, iv, ct}` mit direkt aus dem Passwort abgeleitetem Schlüssel).
- **Passwort ändern** erzeugt einen neuen DEK. Wer das alte Passwort und eine alte Kopie hat, kann neue Daten damit nicht öffnen.
- Der DEK bleibt während der Sitzung in `SESSION = {dek, pwKey, salt}`, der Klartext nur in `S`.

## 7 · Schlüssel und Dateiformate

### Schlüssel

| Schlüssel | Erzeugt in | Öffentlicher Teil | Privater Teil |
|---|---|---|---|
| **Schulschlüssel** | LeDoK-Admin → 1 | `Schulschluessel-<schule>.ledok-schule`, bei allen Lehrkräften | `ek` (RSA) und `esk` (ECDSA) in derselben Datei, verschlüsselt mit dem Masterkennwort |
| **Support-Schlüssel** | `LeDoK.html#hersteller` → Support-Schlüssel erzeugen | `LeDoK-Support-<name>.ledok-support` (Fingerabdruck 0EB7-9F92-A698) | `…-PRIVAT.ledok-support-privat`, nur beim Hersteller, Passphrase ≥ 16 Zeichen |
| **Update-Schlüssel** | `LeDoK.html#hersteller` → Hersteller · Updates | `desktop/ledok-update-key.json` (Fingerabdruck CE5F-1656-01AF), in jedem Installer | `LeDoK-Update-Schluessel-CE5F-1656-01AF-PRIVAT.ledok-updatekey`, nur beim Hersteller, Passphrase ≥ 16 Zeichen |

Private Dateien und Passphrasen gehören **nie** ins Repository.

**Schulschlüssel `.ledok-schule` (v2):**

```js
{ app: "ledok-schule", v: 2, sid, name, created, ver,
  pub:  {kty, n, e, alg},        // RSA-OAEP, verpackt Datenschlüssel
  spub: {kty, crv, x, y},        // ECDSA P-256, prüft die Signatur
  msalt, ek: {iv, ct}, esk: {iv, ct},
  support: null | {name, kontakt, fp, pub, seit},
  online: undefined | {seit},   // Online nach Updates suchen, nur vom LeDoK-Admin
  fp, sig }
```

- `fp` (Fingerabdruck): SHA-256 über `n.e.x.y`, die ersten 20 Hex-Zeichen in Blöcken `XXXX-XXXX-XXXX-XXXX-XXXX`. Ältere Dateien tragen 3 Blöcke; `fpPasst()` akzeptiert beides.
- `sig`: ECDSA über `skPayload(o) = JSON.stringify([sid, name, pub.n, pub.e, msalt, ek.iv, ek.ct, ver, support ? [name, kontakt, fp, pub.n, pub.e, seit] : null, ...(online ? [["online", online.seit]] : [])])`. Ohne `online` bleibt die Nutzlast wie bisher, alte Signaturen gelten weiter; ältere App-Versionen lehnen einen Schlüssel mit `online` ab.
- Hersteller-Support ein/aus und Online-Suche ein/aus (LeDoK-Admin → 4 bzw. 5): neue Version (`ver + 1`), neu signiert, gleicher Fingerabdruck. Die App übernimmt einen Schlüssel derselben Schule (`sid`) nur, wenn `pub` und `spub` unverändert sind. Ein Schlüssel einer anderen Schule braucht eine Warnung mit Eintippen.

### Dateiformate (Feld `app`)

| `app` | Endung | Inhalt | Verschlüsselt mit |
|---|---|---|---|
| `lernstand12` | `.lernstand` | ganzer Zustand `S` (Daten, Kopien, Sicherungen) | `wp` (+ `ws`, `wv`), gzip |
| `lernstand12-kind` | `.lernstand-kind` | Übergabedatei für ein Kind | Passwort (+ `ws`, `wv`) |
| `ledok-fachpaket` | `.ledok` | Fachpaket Klassenlehrkraft → Fachlehrkraft, mit `pid` und `info` außen | Paket-Passwort (+ `ws`, `wv`) |
| `ledok-rueckmeldung` | `.ledok` | Rückmeldung Fachlehrkraft → Klassenlehrkraft, mit `pid` außen | `wk` = `rkey` aus dem Fachpaket (+ `ws`, `wv`) |
| `ledok-schule` | `.ledok-schule` | Schulschlüssel | – (signiert) |
| `ledok-support`, `ledok-support-privat` | `.ledok-support`, `.ledok-support-privat` | Support-Schlüssel | privat: Passphrase |
| `ledok-update-key`, `ledok-updatekey-privat` | `.json`, `.ledok-updatekey` | Update-Schlüssel | privat: Passphrase |
| `ledok-update` | `.ledok-update` | Update-Paket (siehe Kapitel 10) | – (signiert) |
| `ledok-vorlage` | `.ledok-vorlage` | LEG-Vorlage `{v: 1, name, schule, erstellt, leg: {bloecke, selbst}, kopf?}`, ohne Schülerdaten | – (JSON, nicht signiert) |

Unverschlüsselt sind nur: Klassen-CSV (nur Kürzel), Lehrplan-CSV, LEG-Vorlage (ohne Schülerdaten), KI-Export, Problembericht (`.txt`) und Druck/PDF.

Eine importierte `.ledok-vorlage` (höchstens 3 MB) läuft durch `vorlageEinlesen()`. Das prüft `app`, hängt bei doppeltem Namen „(2)“, „(3)“ … an und bereinigt Abschnitte und Briefkopf mit `legVorlageBereinigen()` und `kopfBereinigen()`. Ein Logo, das nicht auf `LOGO_RE` passt, wird verworfen. Die neue Vorlage gilt zunächst für keine Jahrgangsstufe. Ob ein mitgelieferter Briefkopf den eigenen ersetzt, entscheidet die Lehrkraft.

## 8 · Rollen und Datenaustausch

`S.meta.rolle` ist `kl` oder `fl`. Der LeDoK-Admin ist keine Rolle in den Daten, sondern ein Bildschirm ohne Anmeldung (`screenAdmin`).

### Fachpaket und Rückmeldung

```
Klassenlehrkraft                                         Fachlehrkraft
S.meta.fachlehrer[]                                      S.meta.pakete[]
{id, name, faecher, asv, alle, kinder, namen,            {pid, map{orig→lokal}, rkey, version,
 verlauf, rkey, version, sig, zurueck, ...}               klasse, faecher, export, exportT, ...}
        │  fachpaketDaten(a, kinder)                              ▲
        │  sealObj("ledok-fachpaket", d, Paket-Passwort) ───────►  fachpaketUebernehmen(d)
        │                                                          │ bewerten
        │  rueckDialog ◄─── entsiegeln(obj, {rawKey: a.rkey}) ◄─── rueckmeldungDaten(P)
        │                                                          versiegeln("ledok-rueckmeldung", d, {rawKey: P.rkey})
```

- `rkey` (32 Byte, Base64) entsteht beim Anlegen der Fachlehrkraft und reist im verschlüsselten Fachpaket mit. Nur das LeDoK der Klassenlehrkraft kennt ihn außerdem; deshalb braucht die Rückmeldung kein Passwort.
- Das Fachpaket enthält Kinder (Kürzel, auf Wunsch Vorname und Initial), Raster und Erfassung der Fächer, `asvModus`, Notengrenzen und auf Wunsch den Verlauf. Nie: volle Nachnamen, Geburtsdaten, Notizen, andere Fächer.
- `flSig(a)` ist ein Hash über Kinder und Raster des Pakets. Weicht er ab, zeigt die Karte „Neues Paket nötig“.
- Beim Einlesen ersetzt `rueckDialog` alle Einträge und Notizen mit `vp === a.id` vollständig. So kommen auch Änderungen und Löschungen der Fachlehrkraft an. Einträge zu unbekannten Kindern werden übersprungen.
- Bei der Fachlehrkraft bilden `P.map` die Kürzel ab. Kollidieren Kürzel zweier Klassen, wird `<Klasse>-S01` vergeben. Kinder, die aus dem Paket fallen, bleiben mit `ausPaket`, bis ihre offenen Einträge zurückgemeldet sind.

### Rückmeldung am selben Rechner

Arbeiten beide mit je eigenem Profil am selben Rechner:

1. `postAblegen()` läuft im LeDoK der Fachlehrkraft bei jedem `saveNow()`. Hat sich die Rückmeldung geändert (`P.postSig`), wird sie wie eine Rückmeldungsdatei versiegelt und unter `ledok.post.<pid>` abgelegt.
2. `postPruefen()` läuft im LeDoK der Klassenlehrkraft 700 ms nach dem Öffnen. Es entsiegelt mit `a.rkey`, prüft `klassenId` und ob die Rückmeldung neuer ist als die zuletzt übernommene, und öffnet `rueckDialog` mit „Übernehmen“/„Später“.
3. Nach „Übernehmen“ schreibt die Klassenlehrkraft eine Quittung `ledok.post.<pid>.ok`. Die Fachlehrkraft wertet sie beim nächsten Speichern als abgegebene Rückmeldung (`P.exportT`).

Kein LeDoK öffnet dabei die Daten eines anderen. Der Hauptprozess erlaubt für `ledok.post.*` nur Inhalte mit `app: "ledok-rueckmeldung"`.

### Wiederherstellung

- **LeDoK-Admin** (`adminRetten`, Modus `schule`): Masterkennwort → `schulPrivat` → DEK aus `ws` → neues Passwort → `versiegeln` mit demselben DEK. Protokolleintrag in den Daten.
- **Hersteller-Support** (Modus `support`, nur im Bereich `#hersteller`): private Support-Datei über `askFile`, Passphrase → DEK aus `wv`. Nur möglich, wenn die Daten nach dem Einschalten des Supports gespeichert wurden.

## 9 · Desktop-Hülle (Electron)

Versionen in `package.json` (fest): Electron 44.9.0, electron-builder 26.17.0, Playwright 1.56.1. Node 22 in GitHub Actions.

**Fenster und Sicherheit** (`desktop/main.js`):

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`. Rechtschreibprüfung nur auf macOS (Windows/Linux würden Wörterbücher laden).
- `protocol.handle("ledok")` liefert nur `ledok://app/` bzw. `/index.html`: das eingespielte Update, falls gültig und neuer, sonst `app/LeDoK.html`.
- `session.webRequest.onBeforeRequest` bricht alles ab, was nicht `ledok:`, `blob:`, `data:`, `devtools:` oder `chrome-extension:` ist. Alle Berechtigungen werden abgelehnt.
- `will-navigate` nur innerhalb von `ledok://app/`, keine neuen Fenster.
- Eine Instanz (`requestSingleInstanceLock`); eine zweite holt das bestehende Fenster nach vorn.
- Electron-Fuses: `runAsNode` aus, keine `NODE_OPTIONS`, keine Inspect-Argumente, ASAR-Integrität, nur aus ASAR laden.
- Entwicklerwerkzeuge nur in nicht gepackten Builds.

**IPC** (nur von `ledok://app/`, geprüft über `senderFrame.url`):

| Kanal | Zweck |
|---|---|
| `ledok:datenLaden` (sync) | verschlüsselte Datei je Speicherschlüssel lesen; Schlüssel nur `[A-Za-z0-9._-]{1,100}` |
| `ledok:datenSpeichern` | prüfen (`app`, `ct`), `.vorher` anlegen, atomar schreiben |
| `ledok:datenLoeschen` | Datei und `.vorher` löschen |
| `ledok:sicherung` | Sicherung nach `Dokumente/LeDoK-Sicherungen`, ausdünnen |
| `ledok:info` | Programmversion, Betriebssystem, aktive und ausgelieferte Version, Update-Datum, Fingerabdruck des Update-Schlüssels, gewählter Update-Ordner (`updateSuchordner`) |
| `ledok:updatePruefen`, `ledok:updateInstallieren`, `ledok:updateZuruecksetzen` | siehe Kapitel 10 |
| `ledok:updateSuchen`, `ledok:updateOnlineSuchen`, `ledok:updateGefundenInstallieren` | automatische Suche, siehe Kapitel 10 |
| `ledok:updateOrdnerWaehlen`, `ledok:updateOrdnerEntfernen` | Update-Ordner festlegen (`userData/update-suche.json`) |
| `ledok:sicherungenOeffnen` | Sicherungsordner im Dateimanager öffnen |

**Schließen:** Beim `close`-Ereignis ruft der Hauptprozess `ledokSchliessen()` im Renderer auf (höchstens 10 s). Sie speichert und legt höchstens einmal am Tag die Sicherung `tag` an. Schlägt das Speichern fehl, fragt ein Dialog „Nicht schließen / Trotzdem schließen“.

**Menü:** Datei (Sicherungsordner öffnen, Beenden), Bearbeiten, Ansicht (Zoom, Vollbild), Hilfe (Über LeDoK / Update …, Problem melden …); auf macOS zusätzlich das App-Menü.

## 10 · Updates

### Update-Paket

`LeDoK-x.y.z.ledok-update` entsteht im Browser unter `LeDoK.html#hersteller` → Hersteller · Updates:

```js
{ app: "ledok-update", v: 1, version, datum, hinweise, fp, sha256, sig, html }
```

- `sha256`: Hex-SHA-256 über `html`.
- `sig`: ECDSA P-256 über `JSON.stringify(["ledok-update", 1, version, datum, sha256, hinweise])`, Base64, IEEE-P1363.
- Vor dem Signieren prüft die App, ob der CSP-Hash der gewählten `LeDoK.html` stimmt. Sonst würde das Update nicht starten.

### Prüfung (`desktop/update.js` → `pruefen`)

1. Update-Schlüssel vorhanden und sein Fingerabdruck stimmt.
2. `app`, `v`, Versionsformat, `html` und `sig` vorhanden.
3. `fp` der Datei = `fp` des eingebauten Schlüssels.
4. SHA-256 über `html` = `sha256`.
5. Signatur gültig.
6. `APP_VERSION` im HTML = `version`.

### Einspielen

- `updateInstallieren`: nur wenn neuer als die aktive Version. Erst Sicherung `vor-update-<alt>`, dann `userData/update/paket.ledok-update` und `info.json` atomar schreiben, Neustart.
- Bei **jedem Start** prüft `eingespieltesUpdate()` die abgelegte Datei erneut (der Benutzerordner ist für jedes Programm des Benutzers beschreibbar). Das Ergebnis wird nach Größe und Änderungszeit zwischengespeichert. Ist die Datei ungültig oder nicht neuer als die ausgelieferte Version, gilt `app/LeDoK.html`.
- `updateZuruecksetzen`: Sicherung, Ordner `update` löschen, Neustart.

### Wann ein neuer Installer nötig ist

Bei Änderungen an `desktop/`, `build/`, `package.json`/`package-lock.json` (Electron-Version), am Symbol oder bei einem neuen Update-Schlüssel. `npm run release` weist darauf hin, wenn sich seit dem letzten Tag etwas davon geändert hat.

### Automatische Suche

- **Ordner (immer):** Beim Start, nach der Anmeldung (`startApp`) und stündlich ruft die App `updateSuchen` auf. Der Hauptprozess liest `*.ledok-update` (höchstens 200 Dateien, je ≤ 30 MB) aus dem Update-Ordner, dem Download-Ordner und `userData/update/download`, prüft jede mit `pruefen` und merkt sich den Pfad der neuesten gültigen Datei, die neuer als die aktive Version ist. Die App bekommt nur Version, Datum, Hinweise und Dateiname, nie einen Pfad zum Zurückgeben.
- **Online (nur mit `schulKey.online`):** `updateOnlineSuchen` läuft im Hauptprozess in der Sitzung `ledok-update-online` (ohne Cache und Cookies). `onBeforeRequest` erlaubt dort nur HTTPS zu `api.github.com`, `github.com`, `objects.githubusercontent.com` und `release-assets.githubusercontent.com`. Abgefragt wird `/repos/4pw78bg2kv-del/ledok-desktop/releases?per_page=10`; Entwürfe und Vorabversionen zählen nicht. Gesucht wird ein Anhang `LeDoK-x.y.z.ledok-update`, der neuer ist; erst dann wird er geladen, mit `pruefen` geprüft und nach `userData/update/download` gelegt. Automatisch höchstens alle 12 Stunden (`zuletztOnline` in `update-suche.json`), „Jetzt suchen“ fragt sofort. Die Standardsitzung bleibt vollständig gesperrt, die CSP der App unverändert.
- **Bestätigung:** Ist ein Update gefunden und jemand angemeldet, fragt `updateAnbieten` „Update x.y.z verfügbar – jetzt einspielen?“ (einmal je Version und Sitzung; ist gerade ein anderer Dialog offen, 30 s später). Unten rechts steht bis dahin „Update x.y.z verfügbar“. „Jetzt aktualisieren“ ruft `updateGefundenInstallieren`, das die Datei erneut liest und über `installieren()` denselben Weg wie `updateInstallieren` nimmt.
- **Nachträglich einschalten:** Liest die Lehrkraft einen Schulschlüssel mit neu eingeschaltetem `online` ein, steht das im Protokoll und die Online-Suche startet sofort.

## 11 · Bauen und Veröffentlichen

```bash
npm ci
npm start                          # App lokal starten
npm test                           # Prüfung + Playwright (vorher einmal: npx playwright install chromium)
npm run release 1.0.1 [--tag] [--kanal Beta|""] [--probe] [--ohne-tests]
npm run dist:win | dist:mac | dist:linux
```

**Release-Ablauf:**

1. Änderungen für Lehrkräfte laufend unter `## Unveröffentlicht` in `CHANGELOG.md` eintragen und die Bedienungsanleitung nachziehen (siehe unten).
2. `npm run release x.y.z`: setzt `APP_VERSION` und `APP_DATUM` (heute, Europe/Berlin), macht aus „Unveröffentlicht“ den Abschnitt `## x.y.z (Kanal)`, gibt den Hinweistext für das Update-Paket aus, bettet die aktuelle Word-Anleitung ein (`anleitung.js`, mit Hinweis, falls darin noch nicht „Version x.y.z“ steht), führt die Tests aus und committet „Version x.y.z“. Schlagen die Tests fehl, wird alles zurückgenommen.
3. Pushen.
4. Update-Paket in `LeDoK.html#hersteller` erzeugen und verteilen.
5. Nur bei Änderungen an der Hülle: `--tag` bzw. Tag `vx.y.z` pushen. `build.yml` baut dann beide Installer und legt einen Release-Entwurf an.

**Bedienungsanleitung:** Die Word-Datei `docs/LeDoK-Bedienungsanleitung.docx` ist die Fassung für Lehrkräfte. Nach jeder neuen Fassung `node scripts/anleitung.js` ausführen; es schreibt sie als Base64 mit SHA-256 (`data-sha256`) in `<template id="anleitung-docx">` vor `#print-root`. Weil der Block außerhalb des Skripts steht, bleibt der CSP-Hash gleich. `pruefen.js` (also `npm test` und CI) schlägt fehl, wenn eingebettete und abgelegte Datei voneinander abweichen. Da das Update-Paket die ganze `LeDoK.html` enthält, kommt die Anleitung mit jedem Update zu den Lehrkräften (die App wächst dadurch auf ca. 2,7 MB, Grenze für Update-Pakete 30 MB).

**Versionsanzeige:** `const APP_VERSION="x.y.z", APP_DATUM="JJJJ-MM-TT";` und `const APP_KANAL="Beta";` in `app/LeDoK.html`. Unten rechts erscheint „Version x.y.z Beta“ (bzw. „Update x.y.z verfügbar“); ein Klick öffnet `ueberDialog()`. Den Abschnitt „Automatisch suchen“ zeigt der Dialog nur, wenn die Hülle `window.ledokDesktop.updateSuchen` anbietet; mit einem älteren Installer fehlt er. `version-sync.js` überträgt die Nummer beim Bauen in `package.json` und bricht ab, wenn ein Tag nicht zur Version passt.

**Installer:**

- Windows: NSIS, x64, pro Benutzer (`perMachine: false`), Zielordner wählbar, Deutsch, Desktop-Verknüpfung, `deleteAppDataOnUninstall: false`. Datei `LeDoK-Setup-x.y.z.exe`.
- macOS: DMG universal, ad-hoc signiert (`identity: "-"`), nicht notarisiert. Datei `LeDoK-x.y.z-mac.dmg`.
- `appId` `com.deep-moments.ledok`.
- Build-Jobs haben nur Leserechte; nur der Release-Job darf schreiben. Alle Actions sind auf Commit-SHAs festgelegt.

## 12 · Tests und Prüfungen

`npm test` = `scripts/pruefen.js` + Playwright.

**`pruefen.js`** (ohne Browser): Skript syntaktisch lesbar (`vm.Script`), `APP_VERSION` im Format x.y.z, gültiges `APP_DATUM`, Abschnitt `## <Version>` in `CHANGELOG.md`, CSP-Hash stimmt, eingebettete Bedienungsanleitung entspricht `docs/LeDoK-Bedienungsanleitung.docx`.

**`tests/ledok.spec.js`** (Chromium, Projekte „Desktop“ 1280×860 und „Handy“ Pixel 7 für `@handy`). Jeder Test startet mit leerem Speicher und schlägt auch bei einem JavaScript-Fehler auf der Seite fehl.

| Test | prüft |
|---|---|
| Startbildschirm lädt ohne Fehler | Start, Versionsanzeige |
| Passwort-Regeln beim Anlegen | mindestens 8 Zeichen, Wiederholung |
| Beispielklasse: alle Tabs und Einstellungen öffnen | alle Reiter und Einstellungsseiten, Hilfe |
| Hilfe bietet die Bedienungsanleitung als Word-Datei an | Dateiname mit Version, Word-Datei, SHA-256 passt zu `data-sha256` |
| Erfassen speichert eine Bewertung | Eintrag entsteht |
| Heute: Tagesfortschritt zeigt Fokustag und Fokuswoche und lässt sich ausblenden | Zählung, Ausblenden bleibt nach erneutem Zeichnen, Einblenden über den Knopf oben |
| Daten bleiben verschlüsselt erhalten … | Neuladen, falsches und richtiges Passwort |
| Zweites LeDoK am selben Rechner löschen … | Profile, Löschen nur des gewählten |
| Fachlehrkraft startet ohne Klasse | Willkommensseite |
| Versionsdialog und Problembericht ohne Schülernamen | Bericht enthält keine Namen |
| Rückmeldung einer Fachlehrkraft am selben Rechner … | Rundlauf über `ledok.post.*` mit Bestätigung |
| Dokumente: Briefkopf und Fußzeile … | Logo-Upload, Speichern, Briefkopf auf LEG-Bogen und Bericht |
| Dokumente: LEG-Abschnitte ausschalten, verschieben und Freitext … | Reihenfolge, Schalter, Platzhalter werden gefüllt |
| Dokumente: ältere LEG-Einstellungen werden übernommen | `legMigration()` |
| Druck: alle Dokumente der Beispielklasse … | keine `undefined`/`NaN`/Platzhalter-Reste, Seitenzahl, PDF entsteht |
| Dokumente: weitere LEG-Vorlage gilt für gewählte Jahrgangsstufen | `legFuer`, Übernahme einer Jgst., Löschen |
| Dokumente: Vorlage als Datei exportieren und … einlesen | Rundlauf mit Briefkopf, keine Schülernamen in der Datei, fremde Datei abgelehnt |
| Dokumente: LEG-Vorlagen aus Dateien werden bereinigt | `legVorlageBereinigen`, `kopfBereinigen` |
| Schnellsuche: Strg+K findet Kinder, Themen und Einstellungen | Treffer, Sprung, ohne Treffer |
| Druckvorschau erscheint vor dem Drucken | Abbrechen ohne Druck, Drucken mit richtiger Seitenzahl |
| Förderplan: anlegen, aus dem LEG-Bogen füllen, drucken und mit dem Kind löschen | `fpAusLeg`, Druck, `kindLoeschen` |
| Förderplan: Daten aus Dateien werden bereinigt | `fpBereinigen` |
| LEG-Planer: Termine vergeben, Einladungen und Terminliste drucken | fortlaufend vergeben, „geführt“, LEG-Datum, Zurücksetzen behält den Termin, leeres Datum entfernt ihn |
| Dokumente: Einladungstext anpassen mit Vorschau | `S.meta.einladung`, Vorschau „Einladung“ |
| Dokumente: Druckbild mit Schriftgröße, Schriftart und Graustufen | `S.meta.druck`, Klassen und Zoom in Vorschau und Druck |
| Datenprüfung: findet Reste ohne Kind oder Thema und räumt sie auf | `datenPruefung`, `datenAufraeumen`, Sicherung vorher |
| Sammelliste: Geld einsammeln, Zahlungsbriefe mit GiroCode und Kassenbuch (`@handy`) | Betrag, bar/überwiesen/erlassen, geänderter Betrag, Kassenbuchzeile, ein Brief mit GiroCode je offenem Kind, EPC-Nutzlast, Geld bleibt nach `kindLoeschen` in `alt` |
| Sammelliste: Liste zum Abhaken und offene Listen auf „Heute“ | Abhaken, keine Kassenbuchzeile, Karte „Offene Listen“, Sprung zur Liste |
| Klassenkasse: Bankverbindung prüfen, Beträge lesen und Buchungen mit Saldo | `centAus`, `ibanOk`, `euro`, Buchung mit Saldo, Brief ohne GiroCode bei ungültiger IBAN |
| Fehltage: auf „Heute“ eintragen, Fokustag ohne fehlende Kinder, … | Klick auf „Wer fehlt heute?“, Fokustag zählt das Kind nicht, Dialog teilweise/unentschuldigt, `fehlSumme`, „Doch anwesend“, Datenprüfung |
| Stundenplan: Fächer erkennen, „Heute“ zeigt den Tag … | `spFach`, Karte am Dienstag, `goFach`, Eintrag in den Einstellungen |
| Klassenorganisation: Daten aus Dateien werden bereinigt | `listenBereinigen`, `kasseBereinigen`, `fehltageBereinigen`, `stundenplanBereinigen` |
| GiroCode: QR-Code hat Größe, Suchmuster, Taktlinien und Formatinformation … | Version je Länge, feste Muster, beide Formatkopien gleich, zu langer Text → `null` |
| Desktop: gefundenes Update wird erst nach Zustimmung eingespielt | `updateAnbieten`, Hinweis unten rechts |
| Desktop mit älterem Installer: Versionsdialog ohne automatische Suche | kein Abschnitt „Automatisch suchen“ ohne `updateSuchen` |

CI: `.github/workflows/tests.yml` bei jedem Push und Pull Request; bei Fehlern liegt ein Artefakt „testbericht“ am Lauf.

Nicht automatisch getestet: das Einlesen des GiroCodes in echten Banking-Apps (bei der Entwicklung für die Versionen 1–20 mit dem Decoder jsQR geprüft), echte Installation unter Windows und macOS, Update-Einspielen in einer gepackten App, der Druckdialog des Betriebssystems.

## 13 · Content-Security-Policy und Skript-Hash

```
default-src 'none'; script-src 'sha256-…'; style-src 'unsafe-inline'; img-src data: blob:;
connect-src 'none'; form-action 'none'; base-uri 'none'
```

- Es darf nur genau **ein** `<script>`-Block geben. `scripts/csp-hash.js` nimmt den Text zwischen `\n<script>\n` und dem letzten `\n</script>\n</body>` und trägt `'sha256-…'` in `script-src` ein.
- **Nach jeder Änderung am Skript:** `node scripts/csp-hash.js`. Ohne passenden Hash führt der Browser das Skript nicht aus, und die App bleibt weiß. `pruefen.js`, `version-sync.js` (Build) und der Update-Paket-Erzeuger prüfen den Hash.
- Im Skript nie `</script` schreiben, sondern `<\/script`.
- Der Hash wird über LF-Zeilenenden berechnet. `.gitattributes` erzwingt LF, auch unter Windows mit `core.autocrlf`.
- Inline-Handler (`onclick="…"`) und `javascript:`-Links sind durch die CSP wirkungslos.

## 14 · Regeln für Änderungen

1. Nur `app/LeDoK.html` in diesem Repository bearbeiten. Das private Repository `LeDoK` wird nicht mehr gebraucht.
2. Nach Skriptänderungen `node scripts/csp-hash.js`, nach einer neuen Fassung der Word-Anleitung `node scripts/anleitung.js`, dann `npm test`.
3. Jede für Lehrkräfte sichtbare Änderung unter „Unveröffentlicht“ in `CHANGELOG.md` eintragen, in ganzen Sätzen und mit den Namen aus der App.
4. Rückfragen nie mit `prompt()`/`confirm()`/`alert()`, sondern mit `askText`, `frage`, `info`. Einen zweiten Dateidialog nie automatisch öffnen, sondern über `askFile`.
5. Daten aus fremden Dateien immer durch `eintragOk`, `notizOk`, `idOk` bzw. `datenBereinigen` schicken und alles Angezeigte durch `esc()`.
6. Änderungen am Datenformat: `SCHEMA` erhöhen und `migrate()` erweitern. Nie Felder umdeuten, die ältere Versionen anders lesen.
7. Keine Netzzugriffe, keine externen Bibliotheken, keine Schriften oder Bilder aus dem Netz.
8. Texte: Du-Form, aktuelle amtliche Rechtschreibung, „der LeDoK-Admin“.

## 15 · Offene Punkte

- **Signierte Schulvorlagen:** `.ledok-vorlage` wird nicht mit dem Schulschlüssel signiert. Das wäre nötig, wenn eine „Vorlage der Schule“ verbindlich gekennzeichnet werden soll.
- **Import fremder Klassenlisten (CSV):** vorgeschlagen, nicht umgesetzt. Der vorhandene `csvParse()` erkennt bereits Trennzeichen, Anführungszeichen und BOM.
- **Code-Signing:** Apple-Developer-Konto bzw. Windows-Zertifikat, damit die Warnungen beim ersten Start entfallen. Ergänzung in `build.yml`.
- **Lizenzierung:** besprochen, nicht umgesetzt.
