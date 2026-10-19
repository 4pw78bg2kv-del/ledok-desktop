// Übernimmt die Versionsnummer aus app/LeDoK.html (const APP_VERSION="x.y.z") in package.json.
// So tragen Installer, Programm und Anzeige unten rechts immer dieselbe Nummer.
"use strict";
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "app", "LeDoK.html"), "utf8");
const m = /const APP_VERSION="(\d+\.\d+\.\d+)"/.exec(html);
if (!m) { console.error("APP_VERSION nicht in app/LeDoK.html gefunden."); process.exit(1); }
const pj = path.join(root, "package.json"), pkg = JSON.parse(fs.readFileSync(pj, "utf8"));
if (pkg.version !== m[1]) { pkg.version = m[1]; fs.writeFileSync(pj, JSON.stringify(pkg, null, 2) + "\n"); }
const tag = process.env.GITHUB_REF_NAME;
if (tag && /^v\d/.test(tag) && tag !== "v" + m[1]) { console.error(`Tag ${tag} passt nicht zu APP_VERSION ${m[1]}.`); process.exit(1); }
if (!fs.existsSync(path.join(root, "desktop", "ledok-update-key.json"))) console.warn("Hinweis: desktop/ledok-update-key.json fehlt – Updates per Datei sind in diesem Build deaktiviert.");
// Passt der CSP-Hash nicht zum Skript, startet die App nicht – dann lieber den Build abbrechen
require("child_process").execFileSync(process.execPath, [path.join(__dirname, "csp-hash.js"), "--pruefen"], { stdio: "inherit" });
console.log("LeDoK Version " + m[1]);
