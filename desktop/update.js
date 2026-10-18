// LeDoK – Prüfung signierter Update-Dateien (.ledok-update)
// Gleiche Berechnung wie updPayload/updFp in LeDoK.html.
"use strict";
const crypto = require("crypto");

const VERSION_RE = /^\d+\.\d+\.\d+$/;

function fingerabdruck(pub) {
  const h = crypto.createHash("sha256").update(pub.x + "." + pub.y).digest("hex").toUpperCase().slice(0, 12);
  return h.match(/.{4}/g).join("-");
}

function payload(u) {
  return JSON.stringify(["ledok-update", 1, u.version, u.datum, u.sha256, u.hinweise || ""]);
}

function vergleiche(a, b) {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  return 0;
}

function versionAusHtml(html) {
  const m = /const APP_VERSION="(\d+\.\d+\.\d+)"/.exec(html || "");
  return m ? m[1] : null;
}

// Liefert {ok:true, version, datum, hinweise, fp, html} oder {ok:false, fehler}
function pruefen(text, schluessel) {
  if (!schluessel || !schluessel.pub) return { ok: false, fehler: "In dieser App ist kein Update-Schlüssel hinterlegt." };
  if (fingerabdruck(schluessel.pub) !== schluessel.fp) return { ok: false, fehler: "Der eingebaute Update-Schlüssel ist beschädigt." };
  let u;
  try { u = JSON.parse(text); } catch (e) { return { ok: false, fehler: "Die Datei kann nicht gelesen werden." }; }
  if (!u || u.app !== "ledok-update" || u.v !== 1) return { ok: false, fehler: "Das ist keine LeDoK-Update-Datei." };
  if (!VERSION_RE.test(u.version || "") || typeof u.html !== "string" || typeof u.sig !== "string") return { ok: false, fehler: "Die Update-Datei ist unvollständig." };
  if (u.fp !== schluessel.fp) return { ok: false, fehler: `Die Datei wurde mit einem anderen Schlüssel (${u.fp}) signiert als dem des Herstellers (${schluessel.fp}).` };
  const sha = crypto.createHash("sha256").update(u.html, "utf8").digest("hex");
  if (sha !== u.sha256) return { ok: false, fehler: "Die Update-Datei ist beschädigt oder verändert worden (Prüfsumme stimmt nicht)." };
  let gueltig = false;
  try {
    const key = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: schluessel.pub.x, y: schluessel.pub.y }, format: "jwk" });
    gueltig = crypto.verify("sha256", Buffer.from(payload(u), "utf8"), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(u.sig, "base64"));
  } catch (e) { gueltig = false; }
  if (!gueltig) return { ok: false, fehler: "Die Signatur ist ungültig – die Datei stammt nicht vom Hersteller oder wurde verändert." };
  if (versionAusHtml(u.html) !== u.version) return { ok: false, fehler: "Versionsnummer in der Datei passt nicht zum Inhalt." };
  return { ok: true, version: u.version, datum: u.datum, hinweise: u.hinweise || "", fp: u.fp, html: u.html };
}

module.exports = { pruefen, fingerabdruck, payload, vergleiche, versionAusHtml };
