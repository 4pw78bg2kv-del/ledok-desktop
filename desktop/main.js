// LeDoK – Desktop-Programm (Windows / macOS)
// Lädt LeDoK.html über das eigene Protokoll ledok://app/ – vollständig offline.
// Updates kommen nur als signierte Datei (.ledok-update) und werden im Benutzerordner abgelegt.
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

function leseJson(datei) { try { return JSON.parse(fs.readFileSync(datei, "utf8")); } catch (e) { return null; } }
const schluessel = () => { const k = leseJson(SCHLUESSEL_DATEI); return k && k.app === "ledok-update-key" ? k : null; };

// Welche LeDoK.html ist aktiv? Eingespieltes Update nur, wenn neuer als die mitgelieferte Version.
function aktiv() {
  const html = fs.readFileSync(MITGELIEFERT, "utf8");
  const mit = U.versionAusHtml(html) || app.getVersion();
  const info = leseJson(path.join(updateOrdner(), "info.json"));
  const updDatei = path.join(updateOrdner(), "LeDoK.html");
  if (info && fs.existsSync(updDatei) && U.vergleiche(info.version, mit) > 0) {
    const uhtml = fs.readFileSync(updDatei, "utf8");
    if (U.versionAusHtml(uhtml) === info.version) return { html: uhtml, version: info.version, mitgeliefert: mit, aktualisiert: true, updateDatum: info.installiert };
  }
  return { html, version: mit, mitgeliefert: mit, aktualisiert: false, updateDatum: null };
}

function zeitstempel() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }

function sichern(daten, anlass) {
  if (!daten) return null;
  fs.mkdirSync(sicherungsOrdner(), { recursive: true });
  const datei = path.join(sicherungsOrdner(), `ledok-sicherung-${anlass}-${zeitstempel()}.lernstand`);
  fs.writeFileSync(datei, daten, "utf8");
  return datei;
}

function schreibeAtomar(datei, inhalt) { const tmp = datei + ".tmp"; fs.writeFileSync(tmp, inhalt, "utf8"); fs.renameSync(tmp, datei); }

function neustart() { setTimeout(() => { app.relaunch(); app.exit(0); }, 300); }

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

  // Vor dem Schließen ausstehende Änderungen verschlüsselt speichern
  fenster.on("close", (e) => {
    if (gespeichert) return;
    e.preventDefault();
    const fertig = () => { gespeichert = true; if (fenster && !fenster.isDestroyed()) fenster.close(); };
    const t = setTimeout(fertig, 4000);
    fenster.webContents.executeJavaScript("(typeof saveNow==='function'&&typeof S!=='undefined'&&S)?Promise.resolve(saveNow()).then(()=>true):true", true)
      .catch(() => true).then(() => { clearTimeout(t); fertig(); });
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
    { label: "Hilfe", submenu: [ueber] },
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

  ipcMain.handle("ledok:info", () => {
    const a = aktiv(), k = schluessel();
    return { shell: app.getVersion(), os: process.platform, version: a.version, mitgeliefert: a.mitgeliefert, aktualisiert: a.aktualisiert, updateDatum: a.updateDatum, updateKey: k ? k.fp : null };
  });
  ipcMain.handle("ledok:updatePruefen", (e, text) => {
    const r = U.pruefen(text, schluessel()); if (r.ok) delete r.html; return r;
  });
  ipcMain.handle("ledok:updateInstallieren", (e, text, daten) => {
    const r = U.pruefen(text, schluessel());
    if (!r.ok) return r;
    const a = aktiv();
    if (U.vergleiche(r.version, a.version) <= 0) return { ok: false, fehler: `Version ${r.version} ist nicht neuer als die installierte Version ${a.version}.` };
    try {
      sichern(daten, `vor-update-${a.version}`);
      fs.mkdirSync(updateOrdner(), { recursive: true });
      schreibeAtomar(path.join(updateOrdner(), "LeDoK.html"), r.html);
      schreibeAtomar(path.join(updateOrdner(), "info.json"), JSON.stringify({ version: r.version, installiert: new Date().toISOString(), fp: r.fp, vorher: a.version }, null, 2));
    } catch (err) { return { ok: false, fehler: "Das Update konnte nicht gespeichert werden: " + err.message }; }
    gespeichert = true; neustart();
    return { ok: true, version: r.version };
  });
  ipcMain.handle("ledok:updateZuruecksetzen", (e, daten) => {
    try { sichern(daten, `vor-zuruecksetzen-${aktiv().version}`); fs.rmSync(updateOrdner(), { recursive: true, force: true }); }
    catch (err) { return { ok: false, fehler: err.message }; }
    gespeichert = true; neustart();
    return { ok: true };
  });
  ipcMain.handle("ledok:sicherungenOeffnen", () => { fs.mkdirSync(sicherungsOrdner(), { recursive: true }); return shell.openPath(sicherungsOrdner()); });

  menue();
  fensterOeffnen();
}).catch((err) => { dialog.showErrorBox("LeDoK", String(err && err.stack || err)); app.quit(); });
