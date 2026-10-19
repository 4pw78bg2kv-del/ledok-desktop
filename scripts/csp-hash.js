// Trägt den SHA-256-Hash des App-Skripts in die Content-Security-Policy von app/LeDoK.html ein.
// So laufen nur genau dieses Skript und kein eingeschleuster Code (kein 'unsafe-inline').
// Nach jeder Änderung am Skript ausführen: node scripts/csp-hash.js
// Nur prüfen (Build): node scripts/csp-hash.js --pruefen
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const datei = process.argv.find((a) => a.endsWith(".html")) || path.join(__dirname, "..", "app", "LeDoK.html");
const html = fs.readFileSync(datei, "utf8");
const a = html.indexOf("\n<script>\n"), b = html.lastIndexOf("\n</script>\n</body>");
if (a < 0 || b < a) { console.error("App-Skript in " + datei + " nicht gefunden."); process.exit(1); }
const skript = html.slice(a + "\n<script>".length, b + 1);
if (/<\/script/i.test(skript)) { console.error("Das App-Skript enthält \"</script\" – bitte als <\\/script schreiben, sonst bricht der Browser das Skript dort ab."); process.exit(1); }
const hash = "'sha256-" + crypto.createHash("sha256").update(skript, "utf8").digest("base64") + "'";
const re = /(<meta http-equiv="Content-Security-Policy" content="[^"]*script-src )([^;"]*)/;
const m = re.exec(html.slice(0, a));
if (!m) { console.error("CSP-Meta mit script-src nicht gefunden."); process.exit(1); }
if (m[2] === hash) { console.log("CSP-Hash stimmt."); process.exit(0); }
if (process.argv.includes("--pruefen")) {
  console.error("Der CSP-Hash in " + path.basename(datei) + " passt nicht zum Skript. Bitte `node scripts/csp-hash.js` ausführen – sonst startet die App nicht.");
  process.exit(1);
}
fs.writeFileSync(datei, html.slice(0, m.index) + m[1] + hash + html.slice(m.index + m[0].length));
console.log("CSP-Hash eingetragen: " + hash);
