// Bereitet eine neue Version vor: npm run release 1.0.1
//   setzt APP_VERSION und APP_DATUM in app/LeDoK.html (und package.json) sowie Stand und Version in der Bedienungsanleitung,
//   macht aus "## Unveröffentlicht" in CHANGELOG.md den Abschnitt der neuen Version,
//   führt die Tests aus, committet und setzt auf Wunsch den Tag für neue Installer.
// Optionen:
//   --tag            zusätzlich Tag vX.Y.Z setzen (nur nötig bei Änderungen an der Hülle, siehe ANLEITUNG)
//   --kanal Beta     Zusatz neben der Versionsnummer setzen; --kanal "" entfernt ihn
//   --ohne-tests     Tests überspringen (nicht empfohlen)
//   --probe          nichts ändern, nur zeigen, was passieren würde
// Gepusht wird nicht. Das Update-Paket erzeugst du weiter in LeDoK.html#hersteller.
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const HTML = path.join(root, "app", "LeDoK.html"), CL = path.join(root, "CHANGELOG.md");
const ANL = path.join(root, "docs", "anleitung", "LeDoK-Bedienungsanleitung.md"), DOCX = "docs/LeDoK-Bedienungsanleitung.docx";

const args = process.argv.slice(2);
const opt = (n) => args.includes(n);
const wert = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const neu = args.find((a, i) => /^\d+\.\d+\.\d+$/.test(a) && args[i - 1] !== "--kanal");
const kanal = wert("--kanal"), probe = opt("--probe");

const stopp = (t) => { console.error("Abgebrochen: " + t); process.exit(1); };
const git = (...a) => {
  try { return execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch (e) { if (e.code === "ENOENT") stopp("git ist nicht installiert oder nicht im Pfad."); throw e; }
};
const vergleiche = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; };

if (!neu) stopp("Bitte die neue Versionsnummer angeben, z. B.  npm run release 1.0.1");
if (opt("--kanal") && kanal === undefined) stopp('Nach --kanal fehlt der Wert, z. B. --kanal Beta oder --kanal ""');

let html = fs.readFileSync(HTML, "utf8");
const alt = /const APP_VERSION="(\d+\.\d+\.\d+)", APP_DATUM="([^"]*)"/.exec(html);
if (!alt) stopp("APP_VERSION nicht in app/LeDoK.html gefunden.");
if (vergleiche(neu, alt[1]) <= 0) stopp(`${neu} ist nicht höher als die aktuelle Version ${alt[1]}. Installierte Apps würden das Update ablehnen.`);

if (!probe && git("status", "--porcelain")) stopp("Es gibt noch nicht committete Änderungen. Bitte erst committen oder verwerfen.");
if (opt("--tag") && git("tag", "-l", "v" + neu)) stopp(`Den Tag v${neu} gibt es schon.`);

// CHANGELOG: Unveröffentlicht → neue Version
let cl = fs.existsSync(CL) ? fs.readFileSync(CL, "utf8") : stopp("CHANGELOG.md fehlt.");
const m = /^## Unveröffentlicht[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(cl);
if (!m) stopp('In CHANGELOG.md fehlt die Überschrift "## Unveröffentlicht".');
const hinweise = m[1].trim();
if (!hinweise) stopp('Unter "## Unveröffentlicht" in CHANGELOG.md steht noch nichts. Trage ein, was sich geändert hat.');
const kanalNeu = kanal !== undefined ? kanal : ((/const APP_KANAL="([^"]*)"/.exec(html) || [])[1] || "");
const kopf = `## ${neu}${kanalNeu ? ` (${kanalNeu})` : ""}`;
cl = cl.replace(m[0], `## Unveröffentlicht\n\n${kopf}\n\n${hinweise}\n\n`);

// LeDoK.html: Version, Datum, ggf. Kanal
const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
html = html.replace(alt[0], `const APP_VERSION="${neu}", APP_DATUM="${heute}"`);
if (kanal !== undefined) {
  if (!/const APP_KANAL="[^"]*"/.test(html)) stopp("In app/LeDoK.html gibt es keine Zeile const APP_KANAL=… – --kanal geht hier nicht.");
  html = html.replace(/const APP_KANAL="[^"]*"/, `const APP_KANAL="${kanal.replace(/["\\]/g, "")}"`);
}

// Bedienungsanleitung: Stand und Versionsnummer nachziehen (die Word-Datei baut danach scripts/anleitung-bauen.js)
let anl = null;
if (fs.existsSync(ANL)) {
  try { execFileSync("pandoc", ["--version"], { stdio: "ignore" }); }
  catch (e) { stopp("pandoc ist nicht installiert, damit wird die Word-Anleitung gebaut (https://pandoc.org)."); }
  const vk = neu + (kanalNeu ? " " + kanalNeu : "");
  const [j, mo, t] = heute.split("-");
  const lang = `${Number(t)}. ${new Date(heute + "T12:00:00").toLocaleDateString("de-DE", { month: "long" })} ${j}`;
  anl = fs.readFileSync(ANL, "utf8")
    .replace(/^Stand: .* · Version .*$/m, `Stand: ${lang} · Version ${vk}`)
    .replace(/(Diese Anleitung beschreibt die Version )\*\*[^*]+\*\* vom \d{1,2}\.\d{1,2}\.\d{4}/, `$1**${vk}** vom ${t}.${mo}.${j}`)
    .replace(/„Version \d+\.\d+\.\d+[^“]*“ \(bzw\. die aktuelle Nummer\)/, `„Version ${vk}“ (bzw. die aktuelle Nummer)`);
  if (!anl.includes("Version " + vk)) console.warn("Hinweis: Die Zeile „Stand: … · Version …“ fehlt in der Bedienungsanleitung.");
}

// Hat sich die Hülle seit der letzten Version mit Tag geändert?
let huelle = null;
try {
  const letzter = git("describe", "--tags", "--abbrev=0", "--match", "v*");
  huelle = git("diff", "--name-only", letzter, "HEAD", "--", "desktop", "build", "package.json", "package-lock.json") ? letzter : "";
} catch (e) { /* keine Tags vorhanden oder flacher Klon */ }

console.log(`Version ${alt[1]} → ${neu} vom ${heute}${kanalNeu ? ` (${kanalNeu})` : ""}`);
// Für das Hinweisfeld ohne Markdown, denn die App zeigt den Text unformatiert an
const klartext = hinweise.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^- /gm, "• ");
console.log(`\nHinweise für das Update-Paket (zum Einfügen):\n${klartext}\n`);
if (huelle) console.log(`Achtung: Seit ${huelle} hat sich die Programm-Hülle geändert. Dafür brauchen die Schulen einen neuen Installer${opt("--tag") ? "." : " – starte mit --tag."}\n`);
if (probe) { console.log("Probelauf: nichts geändert."); process.exit(0); }

fs.writeFileSync(HTML, html);
fs.writeFileSync(CL, cl);
if (anl !== null) fs.writeFileSync(ANL, anl);
// Die Versionszeile steht im App-Skript, also ändert sich dessen CSP-Hash mit
execFileSync(process.execPath, [path.join(__dirname, "csp-hash.js")], { cwd: root, stdio: "inherit" });
// Die aktuelle Word-Anleitung kommt mit jeder Version mit (Hilfe → „Bedienungsanleitung (Word)“)
execFileSync(process.execPath, [path.join(__dirname, anl !== null ? "anleitung-bauen.js" : "anleitung.js")], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, [path.join(__dirname, "version-sync.js")], { cwd: root, stdio: "inherit" });

const geaendert = ["app/LeDoK.html", "CHANGELOG.md", "package.json", ...(anl !== null ? ["docs/anleitung/LeDoK-Bedienungsanleitung.md", DOCX] : [])];
const rueckgaengig = () => { try { git("checkout", "--", ...geaendert); } catch (e) {} };
if (!opt("--ohne-tests")) {
  try { execFileSync("npm", ["test"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" }); }
  catch (e) { rueckgaengig(); stopp("Die Tests sind fehlgeschlagen. Die Änderungen an Version und CHANGELOG wurden zurückgenommen."); }
}

git("add", ...geaendert);
git("commit", "-m", `Version ${neu}`);
if (opt("--tag")) git("tag", "v" + neu);

console.log(`\nFertig: Commit „Version ${neu}“${opt("--tag") ? ` und Tag v${neu}` : ""} angelegt.`);
console.log("Nächste Schritte:");
console.log(`  1. Hochladen: git push${opt("--tag") ? " && git push --tags" : ""}  (oder in GitHub Desktop „Push origin“)`);
console.log("  2. Update-Paket erzeugen: app/LeDoK.html#hersteller → Hersteller · Updates, Hinweise von oben einfügen.");
if (opt("--tag")) console.log("  3. Auf GitHub unter Releases den Entwurf mit den neuen Installern prüfen und veröffentlichen.");
