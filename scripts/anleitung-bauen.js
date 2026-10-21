// Baut die Bedienungsanleitung aus ihrer Textquelle:
//   docs/anleitung/LeDoK-Bedienungsanleitung.md + docs/anleitung/bilder/ + docs/anleitung/vorlage.docx (Formatvorlagen)
//   → docs/LeDoK-Bedienungsanleitung.docx, danach eingebettet in app/LeDoK.html (scripts/anleitung.js).
//
//   npm run anleitung                 Word-Datei bauen und einbetten (braucht pandoc)
//   npm run anleitung:aus-word        Änderungen, die jemand direkt in Word gemacht hat, in die Textquelle zurückholen
//   node scripts/anleitung-bauen.js --pruefen   nur prüfen, ob die Word-Datei zur Textquelle passt (ohne pandoc)
//
// Die Word-Datei trägt den SHA-256 ihrer Quelle als Dokumenteigenschaft „quelle-sha256“. So erkennt --pruefen
// (und damit npm test) eine vergessene Neuerzeugung oder eine Word-Änderung, die nicht zurückgeholt wurde.
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), os = require("os"), zlib = require("zlib");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const QDIR = path.join(root, "docs", "anleitung");
const MD = path.join(QDIR, "LeDoK-Bedienungsanleitung.md"), VORLAGE = path.join(QDIR, "vorlage.docx"), LUA = path.join(QDIR, "tabellen.lua");
const DOCX = path.join(root, "docs", "LeDoK-Bedienungsanleitung.docx");
const args = process.argv.slice(2);
const stopp = (t) => { console.error(t); process.exit(1); };
const rel = (p) => path.relative(root, p).split(path.sep).join("/");
// Ohne „smart“: Anführungszeichen „…“ bleiben genau so, wie sie im Text stehen
const FORMAT = "markdown-smart";
// Tabellen immer als |-Tabellen schreiben: lassen sich von Hand am leichtesten ergänzen
const FORMAT_AUS = FORMAT + "-multiline_tables-simple_tables-grid_tables";

function pandoc(a, opts = {}) {
  try { return execFileSync("pandoc", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }); }
  catch (e) {
    if (e.code === "ENOENT") stopp("pandoc ist nicht installiert (https://pandoc.org, z. B. brew install pandoc oder apt install pandoc).");
    stopp("pandoc meldet einen Fehler:\n" + String(e.stderr || e.message).trim());
  }
}

// Hash über Text, alle eingebundenen Bilder und die Vorlage
function quelleHash() {
  const md = fs.readFileSync(MD, "utf8"), h = crypto.createHash("sha256").update(md).update(fs.readFileSync(VORLAGE)).update(fs.readFileSync(LUA));
  for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const bild = path.join(QDIR, m[1]);
    if (!fs.existsSync(bild)) stopp(`Bild fehlt: ${rel(bild)} (eingebunden in ${rel(MD)})`);
    h.update(m[1]).update(fs.readFileSync(bild));
  }
  return h.digest("hex");
}

// Eine Datei aus einem ZIP (docx) lesen, ohne Zusatzpakete
function zipDatei(buf, gesucht) {
  const ende = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (ende < 0) return null;
  let p = buf.readUInt32LE(ende + 16);
  for (let n = buf.readUInt16LE(ende + 10); n > 0; n--) {
    const name = buf.toString("utf8", p + 46, p + 46 + buf.readUInt16LE(p + 28));
    if (name === gesucht) {
      const lokal = buf.readUInt32LE(p + 42), start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
      const daten = buf.slice(start, start + buf.readUInt32LE(p + 20));
      return (buf.readUInt16LE(p + 10) === 8 ? zlib.inflateRawSync(daten) : daten).toString("utf8");
    }
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return null;
}
const docxHash = () => {
  const custom = fs.existsSync(DOCX) ? zipDatei(fs.readFileSync(DOCX), "docProps/custom.xml") || "" : "";
  return (/name="quelle-sha256"[^>]*>\s*<vt:lpwstr>([0-9a-f]{64})</.exec(custom) || [])[1];
};

function bauen() {
  const hash = quelleHash();
  // Feste Zeit: gleiche Quelle → gleiche Word-Datei, sonst gäbe es bei jedem Bauen einen neuen Diff
  pandoc([rel(MD), "-f", FORMAT, "-o", rel(DOCX), "--reference-doc=" + rel(VORLAGE), "--resource-path=" + rel(QDIR), "--lua-filter=" + rel(LUA), "-M", "quelle-sha256=" + hash],
    { env: { ...process.env, SOURCE_DATE_EPOCH: "1767225600" } });
  console.log(`${rel(DOCX)} gebaut (${Math.round(fs.statSync(DOCX).size / 1024)} KB).`);
  execFileSync(process.execPath, [path.join(__dirname, "anleitung.js")], { cwd: root, stdio: "inherit" });
}

// Word → Text: Bilder werden über ihren Inhalt den vorhandenen Dateien zugeordnet, neue bekommen einen Namen aus der Bildunterschrift
function ausWord(datei) {
  if (!fs.existsSync(datei)) stopp(`${datei} gibt es nicht.`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ledok-anleitung-"));
  try {
    pandoc([path.resolve(datei), "-f", "docx", "-t", FORMAT_AUS, "--wrap=none", "--extract-media=" + tmp, "-o", path.join(tmp, "a.md")]);
    const L = fs.readFileSync(path.join(tmp, "a.md"), "utf8").split("\n");
    const bilderDir = path.join(QDIR, "bilder");
    fs.mkdirSync(bilderDir, { recursive: true });
    const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    const vorhanden = new Map(fs.readdirSync(bilderDir).map((n) => [sha(path.join(bilderDir, n)), n]));
    const belegt = new Set(fs.readdirSync(bilderDir));
    const slug = (t) => {
      let s = t.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^(der|die|das)-/, "");
      if (s.length > 40) s = s.slice(0, s.lastIndexOf("-", 40) > 10 ? s.lastIndexOf("-", 40) : 40);
      return s || "bild";
    };
    const aus = [], benutzt = new Set();
    for (let i = 0; i < L.length; i++) {
      // pandoc trennt Listen mit einem leeren HTML-Kommentar; in Word ist das unsichtbar
      // (Leerzeile davor weglassen, sonst wird aus zwei engen Listen eine lockere mit größeren Abständen)
      if (L[i] === "```{=html}" && L[i + 1] === "<!-- -->" && L[i + 2] === "```") {
        const listeDavor = /^( {4}|- |\d+\. )/.test(aus[aus.length - 2] || ""), listeDanach = /^(- |\d+\. )(?! *!\[)/.test(L[i + 3] || "");
        if (aus[aus.length - 1] === "" && listeDavor && listeDanach) aus.pop();
        i += 2; continue;
      }
      const m = /^ *(?:- {3}|\d+\. {2})?!\[(.*?)\]\(([^)]+)\)(\{[^}]*\})?$/.exec(L[i]);
      if (!m) { aus.push(L[i]); continue; }
      // Bild mit Bildunterschrift: pandoc schreibt die Unterschrift als eigenen Absatz darunter.
      // Im Markdown ist der Alternativtext die Unterschrift, daher den Absatz übernehmen und nicht doppeln.
      let text = m[1];
      // Erkennbar daran, dass sie kurz ist und nicht wie ein Satz mit Punkt oder Doppelpunkt endet.
      const u = (L[i + 2] || "").trim();
      if (L[i + 1] === "" && u && u.length < 150 && !/[.:]$/.test(u) && !/^(#|!\[|- |\d+\. )/.test(u)) { text = u; i += 2; }
      const quelle = path.isAbsolute(m[2]) ? m[2] : path.join(tmp, m[2]);
      const h = sha(quelle), ext = path.extname(quelle).toLowerCase();
      let name = vorhanden.get(h);
      if (!name) {
        const basis = slug(text); let k = 1;
        name = basis + ext;
        while (belegt.has(name)) name = `${basis}-${++k}${ext}`;
        fs.copyFileSync(quelle, path.join(bilderDir, name));
        belegt.add(name); vorhanden.set(h, name);
        console.log("Neues Bild: docs/anleitung/bilder/" + name);
      }
      benutzt.add(name);
      if (aus.length && aus[aus.length - 1] !== "") aus.push("");
      const breite = /width="([\d.]+)in"/.exec(m[3] || "");
      aus.push(`![${text}](bilder/${name})${breite ? `{width="${(parseFloat(breite[1]) * 2.54).toFixed(1)}cm"}` : ""}`);
    }
    fs.writeFileSync(MD, aus.join("\n").replace(/\n+$/, "") + "\n");
    console.log(`${rel(MD)} aus ${datei} übernommen. Prüfe den Unterschied mit git diff.`);
    const frei = [...belegt].filter((n) => !benutzt.has(n));
    if (frei.length) console.log("Nicht mehr verwendet (bei Bedarf löschen): " + frei.map((n) => "docs/anleitung/bilder/" + n).join(", "));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (args.includes("--aus-word")) ausWord(args.find((a) => a.endsWith(".docx")) || DOCX);
else {
  if (!fs.existsSync(MD)) stopp(`${rel(MD)} fehlt.`);
  if (args.includes("--pruefen")) {
    const soll = quelleHash(), ist = docxHash();
    if (ist === soll) { console.log("Word-Anleitung passt zur Textquelle."); process.exit(0); }
    stopp(ist
      ? "docs/LeDoK-Bedienungsanleitung.docx passt nicht zu docs/anleitung/. Bitte `npm run anleitung` ausführen."
      : "docs/LeDoK-Bedienungsanleitung.docx wurde nicht aus docs/anleitung/ gebaut (vielleicht direkt in Word geändert?). " +
        "Word-Änderungen mit `npm run anleitung:aus-word` übernehmen, sonst `npm run anleitung` ausführen.");
  }
  bauen();
}
