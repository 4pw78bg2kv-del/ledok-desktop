// Erzeugt das signierte Update-Paket LeDoK-x.y.z.ledok-update aus app/LeDoK.html –
// dieselbe Berechnung wie „Hersteller · Updates“ in LeDoK.html#hersteller, nur ohne Browser.
// Gedacht für die Aktion „Update veröffentlichen“; der private Schlüssel kommt aus Umgebungsvariablen:
//   LEDOK_UPDATE_KEY         Inhalt der Datei …-PRIVAT.ledok-updatekey
//   LEDOK_UPDATE_PASSPHRASE  die Passphrase dazu
// Aufruf: node scripts/update-paket.js [ausgabeordner]   (Standard: dist)
// Das Paket wird vor dem Schreiben mit desktop/update.js gegen desktop/ledok-update-key.json geprüft.
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const U = require("../desktop/update");
const root = path.join(__dirname, "..");
const { subtle } = crypto.webcrypto;
const MASTER_IT = 600000; // wie MASTER_IT in LeDoK.html

const stopp = (t) => { console.error("Abgebrochen: " + t); process.exit(1); };
const b64 = (buf) => Buffer.from(buf).toString("base64");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

async function privatSchluessel(text, pass) {
  let pk;
  try { pk = JSON.parse(text); } catch (e) { stopp("LEDOK_UPDATE_KEY ist kein gültiges JSON. Bitte den kompletten Inhalt der …-PRIVAT.ledok-updatekey-Datei als Secret eintragen."); }
  if (!pk || pk.app !== "ledok-updatekey-privat" || !pk.ek || !pk.msalt) stopp("LEDOK_UPDATE_KEY ist kein privater LeDoK-Update-Schlüssel.");
  const base = await subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  const mk = await subtle.deriveKey({ name: "PBKDF2", salt: unb64(pk.msalt), iterations: MASTER_IT, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  let pk8;
  try { pk8 = await subtle.decrypt({ name: "AES-GCM", iv: unb64(pk.ek.iv) }, mk, unb64(pk.ek.ct)); } catch (e) { stopp("Die Passphrase (LEDOK_UPDATE_PASSPHRASE) passt nicht zum Schlüssel."); }
  return { fp: pk.fp, key: await subtle.importKey("pkcs8", pk8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]) };
}

// Hinweise für die Lehrkräfte: Abschnitt der Version aus CHANGELOG.md, ohne Markdown (wie in release.js)
function hinweiseAusChangelog(version) {
  const cl = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const m = new RegExp(`^## ${version.replace(/\./g, "\\.")}\\b[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(cl);
  if (!m || !m[1].trim()) stopp(`In CHANGELOG.md fehlt der Abschnitt "## ${version}". Erst \`npm run release ${version}\` ausführen.`);
  return { markdown: m[1].trim(), klartext: m[1].trim().replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^- /gm, "• ") };
}

(async () => {
  const keyText = process.env.LEDOK_UPDATE_KEY, pass = process.env.LEDOK_UPDATE_PASSPHRASE;
  if (!keyText || !pass) stopp("LEDOK_UPDATE_KEY und LEDOK_UPDATE_PASSPHRASE müssen gesetzt sein (GitHub: Settings → Environments → update-release → Secrets).");
  const html = fs.readFileSync(path.join(root, "app", "LeDoK.html"), "utf8");
  const version = U.versionAusHtml(html);
  if (!version) stopp("APP_VERSION nicht in app/LeDoK.html gefunden.");
  // Ohne passenden CSP-Hash würde die neue Fassung nicht starten
  try { require("child_process").execFileSync(process.execPath, [path.join(__dirname, "csp-hash.js"), "--pruefen"], { stdio: "pipe" }); }
  catch (e) { stopp(String(e.stderr || e.message).trim()); }

  const oeffentlich = JSON.parse(fs.readFileSync(path.join(root, "desktop", "ledok-update-key.json"), "utf8"));
  const { fp, key } = await privatSchluessel(keyText, pass);
  if (fp !== oeffentlich.fp) stopp(`Der private Schlüssel hat den Fingerabdruck ${fp}, die Apps vertrauen aber ${oeffentlich.fp}. Bitte den richtigen Schlüssel als Secret eintragen.`);

  const { markdown, klartext } = hinweiseAusChangelog(version);
  const datum = new Date().toISOString();
  const sha256 = crypto.createHash("sha256").update(html, "utf8").digest("hex");
  const u = { app: "ledok-update", v: 1, version, datum, hinweise: klartext, fp, sha256 };
  u.sig = b64(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(U.payload(u))));
  u.html = html;
  const text = JSON.stringify(u);

  // Genau so prüfen, wie es die installierten Apps tun
  const r = U.pruefen(text, oeffentlich);
  if (!r.ok) stopp("Das erzeugte Paket besteht die Prüfung der App nicht: " + r.fehler);

  const ziel = path.resolve(process.argv[2] || path.join(root, "dist"));
  fs.mkdirSync(ziel, { recursive: true });
  const datei = path.join(ziel, `LeDoK-${version}.ledok-update`);
  fs.writeFileSync(datei, text);
  fs.writeFileSync(path.join(ziel, "release-notes.md"), markdown + "\n");
  console.log(`Update-Paket erstellt und geprüft: ${path.relative(root, datei)} (Version ${version}, Schlüssel ${fp})`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
})().catch((e) => stopp(e.stack || String(e)));
