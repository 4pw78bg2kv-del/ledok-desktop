// Legt die Bedienungsanleitung (docs/LeDoK-Bedienungsanleitung.docx) in app/LeDoK.html ab,
// damit Lehrkräfte sie unter Hilfe → „Bedienungsanleitung (Word)“ herunterladen können.
// Sie steht als Base64 in <template id="anleitung-docx"> außerhalb des App-Skripts, der CSP-Hash bleibt also gleich.
// Nach jeder neuen Fassung der Word-Datei ausführen: node scripts/anleitung.js
// Nur prüfen (Build): node scripts/anleitung.js --pruefen
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), zlib = require("zlib");
const root = path.join(__dirname, "..");
const HTML = path.join(root, "app", "LeDoK.html"), DOCX = path.join(root, "docs", "LeDoK-Bedienungsanleitung.docx");
const pruefen = process.argv.includes("--pruefen");
const stopp = (t) => { console.error(t); process.exit(1); };

if (!fs.existsSync(DOCX)) stopp("docs/LeDoK-Bedienungsanleitung.docx fehlt.");
const docx = fs.readFileSync(DOCX);
if (docx.slice(0, 2).toString() !== "PK") stopp("docs/LeDoK-Bedienungsanleitung.docx ist keine Word-Datei.");
const sha = crypto.createHash("sha256").update(docx).digest("hex");
const block = `<template id="anleitung-docx" data-sha256="${sha}">${docx.toString("base64")}</template>\n`;

let html = fs.readFileSync(HTML, "utf8");
const re = /<template id="anleitung-docx" data-sha256="([0-9a-f]*)">[A-Za-z0-9+/=]*<\/template>\n/;
const alt = re.exec(html);

// Steht die aktuelle Versionsnummer im Text der Anleitung? Sonst ist sie vermutlich nicht nachgezogen.
function dokumentText(buf) {
  const ende = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (ende < 0) return "";
  let p = buf.readUInt32LE(ende + 16);
  for (let n = buf.readUInt16LE(ende + 10); n > 0; n--) {
    const name = buf.toString("utf8", p + 46, p + 46 + buf.readUInt16LE(p + 28));
    if (name === "word/document.xml") {
      const lokal = buf.readUInt32LE(p + 42), start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
      const daten = buf.slice(start, start + buf.readUInt32LE(p + 20));
      return (buf.readUInt16LE(p + 10) === 8 ? zlib.inflateRawSync(daten) : daten).toString("utf8").replace(/<[^>]+>/g, "");
    }
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return "";
}
const version = (/const APP_VERSION="(\d+\.\d+\.\d+)"/.exec(html) || [])[1];
if (version && !dokumentText(docx).includes("Version " + version))
  console.warn(`Hinweis: In der Bedienungsanleitung steht nicht „Version ${version}“. Ist sie für diese Version schon aktualisiert?`);

if (alt && alt[1] === sha) { console.log("Bedienungsanleitung ist aktuell eingebettet."); process.exit(0); }
if (pruefen) stopp("Die eingebettete Bedienungsanleitung in LeDoK.html passt nicht zu docs/LeDoK-Bedienungsanleitung.docx. Bitte `node scripts/anleitung.js` ausführen.");
if (alt) html = html.replace(re, () => block);
else {
  const i = html.indexOf('<div id="print-root"></div>');
  if (i < 0) stopp('<div id="print-root"></div> nicht in LeDoK.html gefunden.');
  html = html.slice(0, i) + block + html.slice(i);
}
fs.writeFileSync(HTML, html);
console.log(`Bedienungsanleitung eingebettet (${Math.round(docx.length / 1024)} KB).`);
