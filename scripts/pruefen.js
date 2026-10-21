// Schnelle Prüfung von app/LeDoK.html ohne Browser:
// Skript fehlerfrei lesbar, Versionsnummer und Datum gültig, CHANGELOG-Eintrag vorhanden,
// CSP-Hash, Word-Anleitung (passt zu docs/anleitung/) und eingebettete Bedienungsanleitung aktuell.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "app", "LeDoK.html"), "utf8");
const fehler = [];

const skripte = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!skripte.length) fehler.push("Kein <script>-Block in app/LeDoK.html gefunden.");
skripte.forEach((code, i) => {
  try { new vm.Script(code, { filename: `LeDoK.html <script> ${i + 1}` }); }
  catch (e) { fehler.push(`Syntaxfehler in Skript ${i + 1}: ${e.message}`); }
});

const v = /const APP_VERSION="([^"]*)", APP_DATUM="([^"]*)"/.exec(html);
if (!v) fehler.push('Zeile const APP_VERSION="x.y.z", APP_DATUM="JJJJ-MM-TT" fehlt.');
else {
  if (!/^\d+\.\d+\.\d+$/.test(v[1])) fehler.push(`APP_VERSION "${v[1]}" hat nicht die Form x.y.z.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v[2]) || isNaN(new Date(v[2]))) fehler.push(`APP_DATUM "${v[2]}" ist kein gültiges Datum (JJJJ-MM-TT).`);
  const cl = path.join(root, "CHANGELOG.md");
  if (fs.existsSync(cl) && !new RegExp(`^## ${v[1].replace(/\./g, "\\.")}\\b`, "m").test(fs.readFileSync(cl, "utf8")))
    fehler.push(`In CHANGELOG.md fehlt ein Abschnitt "## ${v[1]}".`);
}

for (const s of ["csp-hash.js", "anleitung-bauen.js", "anleitung.js"]) {
  try { require("child_process").execFileSync(process.execPath, [path.join(__dirname, s), "--pruefen"], { stdio: ["ignore", "ignore", "pipe"] }); }
  catch (e) { fehler.push(String(e.stderr || e.message).trim()); }
}

if (fehler.length) { console.error("Prüfung fehlgeschlagen:\n- " + fehler.join("\n- ")); process.exit(1); }
console.log(`Prüfung bestanden: ${skripte.length} Skript(e), Version ${v[1]} vom ${v[2]}.`);
