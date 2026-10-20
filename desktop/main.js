// LeDoK – Desktop-Programm (Windows / macOS)
// Lädt LeDoK.html über das eigene Protokoll ledok://app/ – vollständig offline.
// Updates kommen nur als signierte Datei (.ledok-update) und werden im Benutzerordner abgelegt.
// Die App sucht solche Dateien selbst in Downloads und einem wählbaren Ordner (Schulserver, Stick) – ohne Netzwerk.
// Nur wenn die Schule es im Schulschlüssel einschaltet, fragt der Hauptprozess zusätzlich die GitHub-Releases ab
// (einziger Netzwerkzugriff von LeDoK, eigene Sitzung, feste Hosts; die Oberfläche selbst bleibt ohne Netzwerk).
"use strict";
const { app, BrowserWindow, protocol, ipcMain, shell, Menu, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const U = require("./update");

const SCHEME = "ledok";
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const MITGELIEFERT = path.join(__dirname, "..", "app", "LeDoK.html");
const SCHLUESSEL_DATEI = path.join(__dirname, "ledok-update-key.json");
const updateOrdner = () => path.join(app.getPath("userData"), "update");
const sicherungsOrdner = () => path.join(app.getPath("documents"), "LeDoK-Sicherungen");

const suchEinstellung = () => path.join(app.getPath("userData"), "update-suche.json");

function leseJson(datei) { try { return JSON.parse(fs.readFileSync(datei, "utf8")); } catch (e) { return null; } }
const schluessel = () => { const k = leseJson(SCHLUESSEL_DATEI); return k && k.app === "ledok-update-key" ? k : null; };

// Je Speicherschlüssel (Profil) eine Datei im Benutzerordner
const KEY_RE = /^[A-Za-z0-9._-]{1,100}$/;
const datenDatei = (key) => { if (!KEY_RE.test(String(key))) throw new Error("ungültiger Speicherschlüssel"); return path.join(app.getPath("userData"), "daten", `${key}.lernstand`); };

// Welche LeDoK.html ist aktiv? Eingespieltes Update nur, wenn neuer als die mitgelieferte Version –
// und nur, wenn die abgelegte Update-Datei bei jedem Start erneut die Signaturprüfung besteht
// (der Benutzerordner ist für jedes Programm des Benutzers beschreibbar).
let updCache = null;
function eingespieltesUpdate(mit) {
  const info = leseJson(path.join(updateOrdner(), "info.json"));
  const paket = path.join(updateOrdner(), "paket.ledok-update");
  if (!info || !fs.existsSync(paket) || U.vergleiche(info.version, mit) <= 0) return null;
  const st = fs.statSync(paket);
  if (updCache && updCache.mtime === st.mtimeMs && updCache.size === st.size) return updCache.r;
  const r = U.pruefen(fs.readFileSync(paket, "utf8"), schluessel());
  const ok = r.ok && r.version === info.version ? { html: r.html, version: r.version, updateDatum: info.installiert } : null;
  updCache = { mtime: st.mtimeMs, size: st.size, r: ok };
  return ok;
}
function aktiv() {
  const html = fs.readFileSync(MITGELIEFERT, "utf8");
  const mit = U.versionAusHtml(html) || app.getVersion();
  const u = eingespieltesUpdate(mit);
  if (u) return { html: u.html, version: u.version, mitgeliefert: mit, aktualisiert: true, updateDatum: u.updateDatum };
  return { html, version: mit, mitgeliefert: mit, aktualisiert: false, updateDatum: null };
}

function zeitstempel() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }

const AUFHEBEN = 15; // je Anlass so viele Sicherungen behalten, ältere automatisch löschen
function sichern(daten, anlass) {
  if (!daten) return null;
  anlass = String(anlass || "kopie").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(0, 40) || "kopie";
  fs.mkdirSync(sicherungsOrdner(), { recursive: true });
  let datei = path.join(sicherungsOrdner(), `ledok-sicherung-${anlass}-${zeitstempel()}.lernstand`);
  for (let n = 2; fs.existsSync(datei); n++) datei = path.join(sicherungsOrdner(), `ledok-sicherung-${anlass}-${zeitstempel()}-${n}.lernstand`);
  fs.writeFileSync(datei, daten, "utf8");
  ausduennen(anlass);
  return datei;
}
function ausduennen(anlass) {
  try {
    const re = new RegExp(`^ledok-sicherung-${anlass.replace(/[.]/g, "\\.")}-\\d{4}-\\d{2}-\\d{2}-\\d{4}(-\\d+)?\\.lernstand$`);
    const alle = fs.readdirSync(sicherungsOrdner()).filter((f) => re.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(sicherungsOrdner(), f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const x of alle.slice(AUFHEBEN)) fs.rmSync(path.join(sicherungsOrdner(), x.f), { force: true });
  } catch (e) { /* Ausdünnen ist nur Komfort */ }
}

function schreibeAtomar(datei, inhalt) { const tmp = datei + ".tmp"; fs.writeFileSync(tmp, inhalt, "utf8"); fs.renameSync(tmp, datei); }

function neustart() { setTimeout(() => { app.relaunch(); app.exit(0); }, 300); }

function installieren(text, daten) {
  const r = U.pruefen(text, schluessel());
  if (!r.ok) return r;
  const a = aktiv();
  if (U.vergleiche(r.version, a.version) <= 0) return { ok: false, fehler: `Version ${r.version} ist nicht neuer als die installierte Version ${a.version}.` };
  try {
    sichern(daten, `vor-update-${a.version}`);
    fs.mkdirSync(updateOrdner(), { recursive: true });
    schreibeAtomar(path.join(updateOrdner(), "paket.ledok-update"), text);
    fs.rmSync(path.join(updateOrdner(), "LeDoK.html"), { force: true }); // ältere Ablage ohne Signatur
    schreibeAtomar(path.join(updateOrdner(), "info.json"), JSON.stringify({ version: r.version, installiert: new Date().toISOString(), fp: r.fp, vorher: a.version }, null, 2));
  } catch (err) { return { ok: false, fehler: "Das Update konnte nicht gespeichert werden: " + err.message }; }
  updCache = null; gespeichert = true; neustart();
  return { ok: true, version: r.version };
}

// Automatische Suche: nur lokale Ordner, kein Netzwerk. Jede Datei muss die Signaturprüfung bestehen.
const MAX_UPDATE_GROESSE = 30 * 1024 * 1024;
let gefunden = null; // Pfad der zuletzt gefundenen, gültigen Update-Datei
function suchOrdner() {
  const e = leseJson(suchEinstellung());
  const eigener = e && typeof e.ordner === "string" ? e.ordner : null;
  let downloads = null; try { downloads = app.getPath("downloads"); } catch (err) { /* nicht überall vorhanden */ }
  return { eigener, liste: [eigener, downloads, path.join(updateOrdner(), "download")].filter(Boolean) };
}
function leseUpdateDatei(datei) {
  const st = fs.statSync(datei);
  if (!st.isFile() || st.size > MAX_UPDATE_GROESSE) throw new Error("keine gültige Update-Datei");
  return fs.readFileSync(datei, "utf8");
}
function updateSuchen() {
  const { eigener, liste } = suchOrdner(), a = aktiv(), k = schluessel();
  gefunden = null;
  if (!k) return { ok: true, gefunden: false, ordner: eigener };
  let best = null;
  for (const ordner of liste) {
    let namen = [];
    try { namen = fs.readdirSync(ordner).filter((f) => /\.ledok-update$/i.test(f)).slice(0, 200); } catch (err) { continue; } // Stick abgezogen, Server nicht erreichbar
    for (const f of namen) {
      const datei = path.join(ordner, f);
      let r;
      try { r = U.pruefen(leseUpdateDatei(datei), k); } catch (err) { continue; }
      if (!r.ok || U.vergleiche(r.version, a.version) <= 0) continue;
      if (!best || U.vergleiche(r.version, best.r.version) > 0) best = { datei, r };
    }
  }
  if (!best) return { ok: true, gefunden: false, ordner: eigener };
  gefunden = best.datei;
  const { version, datum, hinweise, fp } = best.r;
  const online = path.dirname(best.datei) === path.join(updateOrdner(), "download"); // früher von GitHub geladen
  return { ok: true, gefunden: true, online, version, datum, hinweise, fp, datei: path.basename(best.datei), ort: online ? "GitHub" : path.dirname(best.datei), ordner: eigener };
}

// Online-Suche (nur wenn die Schule sie freigegeben hat): neueste signierte Update-Datei der GitHub-Releases.
// Eigene Sitzung ohne Cookies und Speicher; erlaubt sind nur HTTPS-Anfragen an diese Hosts.
const RELEASES = "https://api.github.com/repos/4pw78bg2kv-del/ledok-desktop/releases?per_page=10";
const ONLINE_HOSTS = ["api.github.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"];
const ONLINE_ABSTAND = 12 * 3600 * 1000; // höchstens zweimal am Tag automatisch
let onlineSitzung = null;
function onlineFetch(url, opt) {
  if (!onlineSitzung) {
    onlineSitzung = session.fromPartition("ledok-update-online", { cache: false });
    onlineSitzung.webRequest.onBeforeRequest((d, cb) => {
      let ok = false; try { const u = new URL(d.url); ok = u.protocol === "https:" && ONLINE_HOSTS.includes(u.hostname); } catch (e) { ok = false; }
      cb({ cancel: !ok });
    });
    onlineSitzung.setPermissionRequestHandler((wc, perm, cb) => cb(false));
    onlineSitzung.setPermissionCheckHandler(() => false);
  }
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
  return onlineSitzung.fetch(url, { ...opt, signal: ctl.signal, credentials: "omit", headers: { "user-agent": `LeDoK/${app.getVersion()}`, ...(opt && opt.headers) } }).finally(() => clearTimeout(t));
}
async function updateOnlineSuchen(erzwingen) {
  const e = leseJson(suchEinstellung()) || {};
  if (!erzwingen && e.zuletztOnline && Date.now() - e.zuletztOnline < ONLINE_ABSTAND) return { ok: true, gefunden: false, uebersprungen: true };
  const a = aktiv(), k = schluessel();
  if (!k) return { ok: false, fehler: "In dieser App ist kein Update-Schlüssel hinterlegt." };
  try {
    const r = await onlineFetch(RELEASES, { headers: { accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(`GitHub antwortet mit ${r.status}`);
    const releases = await r.json();
    let best = null;
    for (const rel of Array.isArray(releases) ? releases : []) {
      if (rel.draft || rel.prerelease) continue;
      for (const as of rel.assets || []) {
        const m = /^LeDoK-(\d+\.\d+\.\d+)\.ledok-update$/.exec(as.name || "");
        if (!m || as.size > MAX_UPDATE_GROESSE || U.vergleiche(m[1], a.version) <= 0) continue;
        if (!best || U.vergleiche(m[1], best.version) > 0) best = { version: m[1], url: as.browser_download_url, name: as.name };
      }
    }
    schreibeAtomar(suchEinstellung(), JSON.stringify({ ...e, zuletztOnline: Date.now() }, null, 2));
    if (!best) return { ok: true, gefunden: false };
    const d = await onlineFetch(best.url, { headers: { accept: "application/octet-stream" } });
    if (!d.ok) throw new Error(`Download fehlgeschlagen (${d.status})`);
    const text = await d.text();
    if (text.length > MAX_UPDATE_GROESSE) throw new Error("Die Datei ist zu groß.");
    // Gleiche Prüfung wie bei Dateien vom Stick: Signatur des Herstellers und höhere Versionsnummer
    const p = U.pruefen(text, k);
    if (!p.ok) return { ok: false, fehler: p.fehler };
    if (U.vergleiche(p.version, a.version) <= 0) return { ok: true, gefunden: false };
    const ziel = path.join(updateOrdner(), "download");
    fs.mkdirSync(ziel, { recursive: true });
    for (const f of fs.readdirSync(ziel)) fs.rmSync(path.join(ziel, f), { force: true });
    const datei = path.join(ziel, `LeDoK-${p.version}.ledok-update`);
    schreibeAtomar(datei, text);
    gefunden = datei;
    return { ok: true, gefunden: true, online: true, version: p.version, datum: p.datum, hinweise: p.hinweise, fp: p.fp, datei: path.basename(datei), ort: "GitHub" };
  } catch (err) {
    return { ok: false, fehler: err.name === "AbortError" ? "Keine Antwort von GitHub (Zeitüberschreitung)." : String(err.message || err) };
  }
}

let fenster = null, gespeichert = false;

function fensterOeffnen() {
  fenster = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 500, title: "LeDoK", show: false,
    backgroundColor: "#f7f6f2",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
      spellcheck: process.platform === "darwin", // Windows/Linux würden Wörterbücher aus dem Internet laden
    },
  });
  fenster.once("ready-to-show", () => fenster.show());
  fenster.loadURL(`${SCHEME}://app/index.html`);

  // Vor dem Schließen speichern und höchstens einmal am Tag still eine Sicherung anlegen.
  // Schlägt das Speichern fehl, wird nicht still geschlossen.
  let schliesst = false;
  fenster.on("close", (e) => {
    if (gespeichert) return;
    e.preventDefault();
    if (schliesst) return;
    schliesst = true;
    const fertig = () => { gespeichert = true; if (fenster && !fenster.isDestroyed()) fenster.close(); };
    const t = setTimeout(fertig, 10000);
    fenster.webContents.executeJavaScript("typeof ledokSchliessen==='function'?ledokSchliessen():null", true)
      .catch(() => null).then((r) => {
        clearTimeout(t);
        if (r && r.ok === false) {
          const w = dialog.showMessageBoxSync(fenster, { type: "warning", title: "LeDoK", buttons: ["Nicht schließen", "Trotzdem schließen"], defaultId: 0, cancelId: 0,
            message: "Deine letzten Änderungen konnten nicht gespeichert werden.", detail: String(r.fehler || "") + "\n\nLade über den roten Knopf oben eine Kopie herunter, bevor du LeDoK schließt." });
          if (w === 0) { schliesst = false; return; }
        }
        fertig();
      });
  });

  // Keine fremden Seiten, keine neuen Fenster
  fenster.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(`${SCHEME}://app/`)) e.preventDefault(); });
  fenster.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

function menue() {
  const ueber = { label: "Über LeDoK / Update …", click: () => fenster && fenster.webContents.executeJavaScript("typeof ueberDialog==='function'&&ueberDialog()").catch(() => {}) };
  const vorlage = [
    ...(process.platform === "darwin" ? [{ label: "LeDoK", submenu: [ueber, { type: "separator" }, { role: "hide", label: "LeDoK ausblenden" }, { role: "hideOthers", label: "Andere ausblenden" }, { type: "separator" }, { role: "quit", label: "LeDoK beenden" }] }] : []),
    { label: "Datei", submenu: [{ label: "Sicherungsordner öffnen", click: () => { fs.mkdirSync(sicherungsOrdner(), { recursive: true }); shell.openPath(sicherungsOrdner()); } }, { type: "separator" }, process.platform === "darwin" ? { role: "close", label: "Fenster schließen" } : { role: "quit", label: "Beenden" }] },
    { label: "Bearbeiten", submenu: [{ role: "undo", label: "Rückgängig" }, { role: "redo", label: "Wiederholen" }, { type: "separator" }, { role: "cut", label: "Ausschneiden" }, { role: "copy", label: "Kopieren" }, { role: "paste", label: "Einfügen" }, { role: "selectAll", label: "Alles auswählen" }] },
    { label: "Ansicht", submenu: [{ role: "zoomIn", label: "Größer" }, { role: "zoomOut", label: "Kleiner" }, { role: "resetZoom", label: "Originalgröße" }, { type: "separator" }, { role: "togglefullscreen", label: "Vollbild" }, ...(app.isPackaged ? [] : [{ role: "toggleDevTools", label: "Entwicklerwerkzeuge" }])] },
    { label: "Hilfe", submenu: [ueber, { label: "Problem melden …", click: () => fenster && fenster.webContents.executeJavaScript("typeof problemMelden==='function'&&problemMelden()").catch(() => {}) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(vorlage));
}

app.on("second-instance", () => { if (fenster) { if (fenster.isMinimized()) fenster.restore(); fenster.focus(); } });
app.on("window-all-closed", () => app.quit());

app.whenReady().then(() => {
  const s = session.defaultSession;
  // Nichts verlässt den Rechner: alle Netzwerkzugriffe blockieren
  s.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(ledok|blob|data|devtools|chrome-extension):/.test(d.url) }));
  s.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  s.setPermissionCheckHandler(() => false);

  protocol.handle(SCHEME, (req) => {
    const u = new URL(req.url);
    if (u.host === "app" && (u.pathname === "/" || u.pathname === "/index.html")) {
      return new Response(aktiv().html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    return new Response("Nicht gefunden", { status: 404 });
  });

  // Nur die eigene Seite (ledok://app/) darf das Programm ansprechen
  // Nur die App selbst darf diese Kanäle nutzen (Node meldet für eigene Schemata origin "null", daher Protokoll + Host).
  const vonApp = (e) => { try { const u = new URL(e.senderFrame.url); return u.protocol === `${SCHEME}:` && u.host === "app"; } catch (err) { return false; } };
  const handle = (kanal, fn) => ipcMain.handle(kanal, (e, ...a) => vonApp(e) ? fn(e, ...a) : { ok: false, fehler: "nicht erlaubt" });

  // Daten der Lehrkraft (verschlüsselt) als Datei statt im begrenzten localStorage
  ipcMain.on("ledok:datenLaden", (e, key) => {
    if (!vonApp(e)) { e.returnValue = null; return; }
    try { const f = datenDatei(key); e.returnValue = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null; } catch (err) { e.returnValue = null; }
  });
  handle("ledok:datenSpeichern", (e, key, text) => {
    try {
      const f = datenDatei(key), o = JSON.parse(text);
      // Rückmeldungen für die Klassenlehrkraft am selben Rechner (versiegelt) liegen unter eigenem Schlüssel
      const erwartet = String(key).startsWith("ledok.post.") ? "ledok-rueckmeldung" : "lernstand12";
      if (!o || o.app !== erwartet || !o.ct) return { ok: false, fehler: "ungültige Daten" };
      fs.mkdirSync(path.dirname(f), { recursive: true });
      if (fs.existsSync(f)) fs.copyFileSync(f, f + ".vorher"); // vorheriger Stand als Rückfall
      schreibeAtomar(f, text);
      return { ok: true };
    } catch (err) { return { ok: false, fehler: err.message }; }
  });
  handle("ledok:datenLoeschen", (e, key) => {
    try { const f = datenDatei(key); for (const x of [f, f + ".vorher"]) fs.rmSync(x, { force: true }); return { ok: true }; }
    catch (err) { return { ok: false, fehler: err.message }; }
  });
  handle("ledok:sicherung", (e, text, anlass) => {
    try { const o = JSON.parse(text); if (!o || !o.ct) return { ok: false, fehler: "ungültige Daten" }; return { ok: true, datei: path.basename(sichern(text, anlass)) }; }
    catch (err) { return { ok: false, fehler: err.message }; }
  });

  ipcMain.handle("ledok:info", () => {
    const a = aktiv(), k = schluessel();
    return { shell: app.getVersion(), os: process.platform, version: a.version, mitgeliefert: a.mitgeliefert, aktualisiert: a.aktualisiert, updateDatum: a.updateDatum, updateKey: k ? k.fp : null, updateSuchordner: suchOrdner().eigener };
  });
  handle("ledok:updatePruefen", (e, text) => {
    const r = U.pruefen(text, schluessel()); if (r.ok) delete r.html; return r;
  });
  handle("ledok:updateInstallieren", (e, text, daten) => installieren(text, daten));
  handle("ledok:updateSuchen", () => updateSuchen());
  // Die App ruft das nur auf, wenn der Schulschlüssel der Lehrkraft die Online-Suche freigibt.
  handle("ledok:updateOnlineSuchen", (e, erzwingen) => updateOnlineSuchen(!!erzwingen));
  // Installiert die zuletzt gefundene Datei. Die App nennt keinen Pfad; die Datei wird erneut gelesen und geprüft.
  handle("ledok:updateGefundenInstallieren", (e, daten) => {
    if (!gefunden) return { ok: false, fehler: "Es wurde keine Update-Datei gefunden." };
    let text;
    try { text = leseUpdateDatei(gefunden); } catch (err) { return { ok: false, fehler: "Die Update-Datei ist nicht mehr da: " + err.message }; }
    return installieren(text, daten);
  });
  handle("ledok:updateOrdnerWaehlen", async () => {
    const r = await dialog.showOpenDialog(fenster, { title: "Ordner für LeDoK-Updates wählen", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    schreibeAtomar(suchEinstellung(), JSON.stringify({ ordner: r.filePaths[0] }, null, 2));
    return { ok: true, ordner: r.filePaths[0] };
  });
  handle("ledok:updateOrdnerEntfernen", () => { fs.rmSync(suchEinstellung(), { force: true }); return { ok: true }; });
  handle("ledok:updateZuruecksetzen", (e, daten) => {
    try { sichern(daten, `vor-zuruecksetzen-${aktiv().version}`); fs.rmSync(updateOrdner(), { recursive: true, force: true }); }
    catch (err) { return { ok: false, fehler: err.message }; }
    gespeichert = true; neustart();
    return { ok: true };
  });
  handle("ledok:sicherungenOeffnen", () => { fs.mkdirSync(sicherungsOrdner(), { recursive: true }); return shell.openPath(sicherungsOrdner()); });

  menue();
  fensterOeffnen();
}).catch((err) => { dialog.showErrorBox("LeDoK", String(err && err.stack || err)); app.quit(); });
