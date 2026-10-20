// Prüft die wichtigsten Abläufe von LeDoK im Browser.
// Verschlüsseln dauert absichtlich (PBKDF2), deshalb warten die Prüfungen dort länger.
// Jeder Test beginnt mit leerem Browser-Speicher. Ein Test schlägt auch fehl, wenn die Seite einen JavaScript-Fehler wirft.
"use strict";
const { test, expect } = require("@playwright/test");
const path = require("path");

const URL = "file://" + path.join(__dirname, "..", "app", "LeDoK.html");
const PW = "Testpasswort123";

test.beforeEach(async ({ page }, info) => {
  info.fehler = [];
  page.on("pageerror", (e) => info.fehler.push(e.message));
  page.on("dialog", (d) => d.dismiss());
});
test.afterEach(async ({}, info) => {
  expect(info.fehler, "JavaScript-Fehler auf der Seite").toEqual([]);
});

async function neueKlasse(page, { rolle = "kl", demo = true } = {}) {
  await page.goto(URL);
  await page.click('[data-act="startNew"]');
  if (rolle === "fl") await page.check('input[name=rolle][value="fl"]');
  await page.fill("#pw1", PW);
  await page.fill("#pw2", PW);
  if (rolle === "kl") await page.setChecked("#demo", demo);
  await page.click('#setupForm button[type="submit"]');
  // Ohne Schulschlüssel fragt der Dialog einmal nach; ein zweites „Starten“ beginnt ohne.
  await expect(page.locator("#err2")).toContainText("Schulschlüssel");
  await page.click('#setupForm button[type="submit"]');
  await expect(page.locator("header.top")).toBeVisible({ timeout: 30000 });
}

test("Startbildschirm lädt ohne Fehler @handy", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator("h1", { hasText: "LeDoK" })).toBeVisible();
  await expect(page.locator('[data-act="startNew"]')).toBeVisible();
  await expect(page.locator("#verTag")).toContainText("Version");
});

test("Passwort-Regeln beim Anlegen", async ({ page }) => {
  await page.goto(URL);
  await page.click('[data-act="startNew"]');
  await page.fill("#pw1", "kurz");
  await page.fill("#pw2", "kurz");
  await page.click('#setupForm button[type="submit"]');
  await expect(page.locator("#err2")).toContainText("mindestens 8 Zeichen");
  await page.fill("#pw1", PW);
  await page.fill("#pw2", PW + "x");
  await page.click('#setupForm button[type="submit"]');
  await expect(page.locator("#err2")).toContainText("stimmen nicht überein");
});

test("Beispielklasse: alle Tabs und Einstellungen öffnen @handy", async ({ page }) => {
  await neueKlasse(page);
  const tabs = page.locator("nav.tabs button");
  const n = await tabs.count();
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click();
    await expect(tabs.nth(i)).toHaveClass(/on/);
  }
  await page.click('[data-act="tab"][data-v="einst"]');
  const sek = page.locator("nav.snav button");
  const m = await sek.count();
  expect(m).toBeGreaterThan(3);
  for (let i = 0; i < m; i++) {
    await sek.nth(i).click();
    await expect(sek.nth(i)).toHaveClass(/on/);
  }
  await page.keyboard.press("?");
  await expect(page.locator(".hilfe h2", { hasText: "Hilfe" })).toBeVisible();
});

test("Hilfe bietet die Bedienungsanleitung als Word-Datei an", async ({ page }) => {
  await neueKlasse(page);
  await page.keyboard.press("?");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="anleitungLaden"]')]);
  const version = await page.evaluate(() => APP_VERSION);
  expect(dl.suggestedFilename()).toBe(`LeDoK-Bedienungsanleitung-${version}.docx`);
  const datei = require("fs").readFileSync(await dl.path());
  expect(datei.slice(0, 2).toString()).toBe("PK");
  const sha = await page.evaluate(() => document.getElementById("anleitung-docx").dataset.sha256);
  expect(require("crypto").createHash("sha256").update(datei).digest("hex")).toBe(sha);
});

test("Erfassen speichert eine Bewertung", async ({ page }) => {
  await neueKlasse(page);
  await page.click('nav.tabs [data-v="erfassen"]');
  const vorher = await page.evaluate(() => S.eintraege.length);
  const knopf = page.locator('[data-act="rate"]').first();
  await expect(knopf).toBeVisible();
  await knopf.click();
  expect(await page.evaluate(() => S.eintraege.length)).toBe(vorher + 1);
});

test("Daten bleiben verschlüsselt erhalten und öffnen nur mit dem Passwort", async ({ page }) => {
  await neueKlasse(page);
  const kinder = await page.evaluate(() => S.kinder.length);
  expect(kinder).toBeGreaterThan(0);
  await page.evaluate(() => saveNow());
  const roh = await page.evaluate(() => localStorage.getItem(STORE_KEY));
  expect(roh).toBeTruthy();
  expect(roh).not.toContain('"kinder"');
  expect(roh).not.toContain('"eintraege"');

  await page.reload();
  await page.fill("#pw", "falschesPasswort");
  await page.click('#openForm button[type="submit"]');
  await expect(page.locator("#err")).not.toHaveText(/Entschlüssele/, { timeout: 30000 });
  await expect(page.locator("header.top")).toHaveCount(0);

  await page.fill("#pw", PW);
  await page.click('#openForm button[type="submit"]');
  await expect(page.locator("header.top")).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => S.kinder.length)).toBe(kinder);
});

test("Zweites LeDoK am selben Rechner löschen lässt das erste erhalten", async ({ page }) => {
  await neueKlasse(page);
  await page.evaluate(() => lock());
  await page.click('[data-act="profilNeu"]');
  await page.fill("#profilName", "Frau Huber");
  await page.fill("#pw1", PW + "2");
  await page.fill("#pw2", PW + "2");
  await page.setChecked("#demo", false);
  await page.click('#setupForm button[type="submit"]');
  await page.click('#setupForm button[type="submit"]');
  await expect(page.locator("header.top")).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => lock());
  await expect(page.locator("#profilWahl option")).toHaveCount(2);

  await page.click("details.weitere summary");
  await expect(page.locator('details.weitere [data-act="wipeAll"]')).toHaveText("Dieses LeDoK löschen …");
  await page.click('details.weitere [data-act="wipeAll"]');
  await expect(page.locator("dialog[open]")).toContainText("Frau Huber");
  await page.fill("#msgTipp", "LÖSCHEN");
  await page.click("#msgJa");
  await expect(page.locator("#err")).toContainText("wurde gelöscht", { timeout: 30000 });

  // Das erste LeDoK ist weiter da und öffnet mit seinem Passwort
  await expect(page.locator("#profilWahl")).toHaveCount(0);
  await page.fill("#pw", PW);
  await page.click('#openForm button[type="submit"]');
  await expect(page.locator("header.top")).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => S.kinder.length)).toBeGreaterThan(0);
});

test("Fachlehrkraft startet ohne Klasse", async ({ page }) => {
  await neueKlasse(page, { rolle: "fl" });
  expect(await page.evaluate(() => [S.meta.rolle, S.kinder.length])).toEqual(["fl", 0]);
});

test("Versionsdialog und Problembericht ohne Schülernamen", async ({ page }) => {
  await neueKlasse(page);
  const name = await page.evaluate(() => S.kinder[0].vorname);
  await page.click("#verTag");
  await expect(page.locator("#dlg")).toContainText("Version");
  await page.click("#uePm");
  await page.fill("#pmText", "Test");
  await expect(page.locator("#pmVorschau")).toContainText("Rolle: Klassenlehrkraft");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#pmDatei")]);
  expect(dl.suggestedFilename()).toMatch(/^LeDoK-Problembericht-.*\.txt$/);
  const text = await page.textContent("#pmVorschau");
  if (name) expect(text).not.toContain(name);
});

test("Rückmeldung einer Fachlehrkraft am selben Rechner kommt mit Bestätigung an", async ({ page }) => {
  // Klassenlehrkraft legt eine Fachlehrkraft an; das Fachpaket wird hier direkt übergeben statt per Datei
  await neueKlasse(page);
  const paket = await page.evaluate(() => {
    const fach = S.raster[0].fach;
    const a = { name: "Frau Huber", faecher: [fach], asv: false, alle: true, kinder: [], namen: true, verlauf: false, id: neueId(), rkey: b64(rnd(32)), version: 0 };
    S.meta.fachlehrer.push(a);
    const d = fachpaketDaten(a, flKinder(a));
    a.version = d.version; save();
    return d;
  });
  await page.evaluate(() => lock());

  // Fachlehrkraft im eigenen LeDoK auf demselben Rechner
  await page.click('[data-act="profilNeu"]');
  await page.fill("#profilName", "Frau Huber");
  await page.check('input[name=rolle][value="fl"]');
  await page.fill("#pw1", PW + "2");
  await page.fill("#pw2", PW + "2");
  await page.click('#setupForm button[type="submit"]');
  await page.click('#setupForm button[type="submit"]');
  await expect(page.locator("header.top")).toBeVisible({ timeout: 30000 });
  await page.evaluate((d) => fachpaketUebernehmen(d), paket);
  await page.click('dialog[open] [data-act="closeDlg"]');
  await page.evaluate(async () => {
    const k = S.kinder[0], c = S.raster.find((r) => nimmtTeil(k, r.fach) && !kinderVon(r.id).length);
    addEntry(k.id, c.id, 7, "b"); await saveNow();
  });
  const post = await page.evaluate((pid) => localStorage.getItem("ledok.post." + pid), paket.pid);
  expect(post).toBeTruthy();
  expect(post).not.toContain('"eintraege"');
  await page.evaluate(() => lock());

  // Klassenlehrkraft öffnet ihr LeDoK: die Rückmeldung wird angeboten und erst nach „Übernehmen“ eingetragen
  await page.selectOption("#profilWahl", { index: 0 });
  await page.fill("#pw", PW);
  await page.click('#openForm button[type="submit"]');
  await expect(page.locator("header.top")).toBeVisible({ timeout: 30000 });
  const dlg = page.locator("dialog[open]");
  await expect(dlg).toContainText("auf diesem Rechner", { timeout: 15000 });
  const vorher = await page.evaluate(() => S.eintraege.length);
  await page.click("#rueckOk");
  const neu = await page.evaluate(() => S.eintraege.filter((e) => e.von === "Frau Huber"));
  expect(neu.length).toBe(1);
  expect(neu[0].w).toBe(7);
  expect(await page.evaluate(() => S.eintraege.length)).toBe(vorher + 1);
  expect(await page.evaluate((e) => flMark(e.k, e.c), neu[0])).toContain(">Hu<");
  expect(await page.evaluate((pid) => localStorage.getItem("ledok.post." + pid + ".ok"), paket.pid)).toBeTruthy();
  await page.evaluate(() => lock());

  // Beim nächsten Öffnen fragt LeDoK nicht noch einmal
  await page.selectOption("#profilWahl", { index: 0 });
  await page.fill("#pw", PW);
  await page.click('#openForm button[type="submit"]');
  await expect(page.locator("header.top")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.evaluate(() => lock());

  // Die Fachlehrkraft sieht ihre Bewertungen danach als zurückgemeldet
  await page.selectOption("#profilWahl", { index: 1 });
  await page.fill("#pw", PW + "2");
  await page.click('#openForm button[type="submit"]');
  await expect(page.locator("header.top")).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => saveNow());
  expect(await page.evaluate(() => paketNeu(S.meta.pakete[0]))).toBe(0);
});

test("Desktop: gefundenes Update wird erst nach Zustimmung eingespielt", async ({ page }) => {
  // Nachgebaute Schnittstelle der Desktop-App: Im Update-Ordner liegt eine neuere, gültige Datei.
  await page.addInitScript(() => {
    const daten = {};
    window.__upd = { installiert: 0 };
    window.ledokDesktop = {
      info: async () => ({ shell: "1.0.0", os: "win32", version: "1.0.0", mitgeliefert: "1.0.0", aktualisiert: false, updateKey: "CE5F-1656-01AF", updateSuchordner: "S:\\LeDoK" }),
      datenLaden: (k) => daten[k] || null,
      datenSpeichern: async (k, t) => { daten[k] = t; return { ok: true }; },
      datenLoeschen: async (k) => { delete daten[k]; return { ok: true }; },
      sicherung: async () => ({ ok: true, datei: "x.lernstand" }),
      sicherungenOeffnen: async () => "",
      updateSuchen: async () => ({ ok: true, gefunden: true, version: "9.9.9", datum: "2026-10-19T10:00:00Z", hinweise: "Neu: Testfunktion", fp: "CE5F-1656-01AF", datei: "LeDoK-9.9.9.ledok-update", ort: "S:\\LeDoK" }),
      updateOnlineSuchen: async () => { throw new Error("darf ohne Freigabe der Schule nicht aufgerufen werden"); },
      updateGefundenInstallieren: async () => { window.__upd.installiert++; return { ok: true, version: "9.9.9" }; },
    };
  });
  await neueKlasse(page, { demo: false });
  await expect(page.locator("#verTag")).toContainText("Update 9.9.9 verfügbar");
  const dlg = page.locator("#dlg");
  await expect(dlg).toContainText("Update 9.9.9 verfügbar – jetzt einspielen?", { timeout: 10000 });
  await expect(dlg).toContainText("Neu: Testfunktion");
  await page.click("#u2n");
  expect(await page.evaluate(() => window.__upd.installiert)).toBe(0);
  await page.click("#verTag");
  await page.click("#updJetzt");
  await page.click("#u2j");
  await expect.poll(() => page.evaluate(() => window.__upd.installiert)).toBe(1);
});

// ---------- Dokumente: Briefkopf, LEG-Abschnitte und Druck ----------
// Kleinstes gültiges PNG (1 × 1 Pixel)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function zuDokumente(page) {
  await page.click('[data-act="tab"][data-v="einst"]');
  await page.click('nav.snav [data-v="dokumente"]');
  await expect(page.locator("#dokPrev")).toBeVisible();
}

test("Dokumente: Briefkopf und Fußzeile erscheinen auf LEG-Bogen und Bericht", async ({ page }) => {
  await neueKlasse(page);
  await zuDokumente(page);
  const [wahl] = await Promise.all([page.waitForEvent("filechooser"), page.click('[data-act="kopfLogo"]')]);
  await wahl.setFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator(".dok-logo")).toBeVisible();
  await page.fill("#kopfAnschrift", "Schulstraße 1\n12345 Musterstadt");
  await page.fill('[data-bind="meta.kopf.fuss"]', "Vertraulich");
  const vorschau = page.locator("#dokPrev");
  await expect(vorschau.locator("img.bk-logo")).toBeVisible();
  await expect(vorschau.locator(".bk-txt")).toContainText("12345 Musterstadt");
  await expect(vorschau.locator(".pfuss")).toHaveText("Vertraulich");

  await page.click('[data-act="dokArt"][data-v="bericht"]');
  await expect(vorschau.locator("img.bk-logo")).toBeVisible();
  await expect(vorschau).toContainText("Bericht – Entwurf");

  // Listen bekommen den Briefkopf erst, wenn er dafür eingeschaltet ist
  expect(await page.evaluate(() => notenSeite())).not.toContain('class="bk"');
  await page.check('[data-bind="meta.kopf.liste"]');
  expect(await page.evaluate(() => notenSeite())).toContain('class="bk"');

  // Alles bleibt nach dem Speichern erhalten
  await page.evaluate(() => saveNow());
  await page.reload();
  await page.fill("#pw", PW);
  await page.click('#openForm button[type="submit"]');
  await expect(page.locator("header.top")).toBeVisible({ timeout: 30000 });
  const kopf = await page.evaluate(() => S.meta.kopf);
  expect(kopf.logo).toMatch(/^data:image\/png;base64,/);
  expect(kopf.anschrift).toBe("Schulstraße 1\n12345 Musterstadt");
  expect(kopf.fuss).toBe("Vertraulich");
  expect(kopf.liste).toBe(true);
});

test("Dokumente: LEG-Abschnitte ausschalten, verschieben und Freitext mit Platzhaltern", async ({ page }) => {
  await neueKlasse(page);
  await zuDokumente(page);
  const vorschau = page.locator("#dokPrev");
  await expect(vorschau).toContainText("So weit bist du in den Fächern");
  await page.uncheck('[aria-label="Fächertabelle zeigen"]');
  await expect(vorschau).not.toContainText("So weit bist du in den Fächern");

  await page.click('[data-act="legFrei"]');
  const frei = page.locator(".dabs").last();
  await frei.locator('input[type="text"]').fill("Termin");
  await frei.locator("textarea").fill("Liebe Eltern von {Vorname}, wir sprechen über {Stärken}. {Unbekannt}");
  const kuerzel = await page.evaluate(() => sortedKids("alle")[0].id);
  await expect(vorschau).toContainText(`Liebe Eltern von ${kuerzel}, wir sprechen über`);
  await expect(vorschau).toContainText("{Unbekannt}");
  await expect(vorschau.locator("h4", { hasText: "Termin" })).toBeVisible();

  // Zweimal nach oben: steht dann vor den Unterschriften
  const freiZeile = page.locator(".dabs", { has: page.locator('[aria-label="Text des Abschnitts"]') });
  for (let i = 0; i < 2; i++) await freiZeile.locator('[data-v="hoch"]').click();
  const typen = await page.evaluate(() => S.meta.leg.bloecke.map((b) => b.typ));
  expect(typen.slice(-3)).toEqual(["frei", "unterschrift", "verlauf"]);
  const text = await vorschau.textContent();
  expect(text.indexOf("Liebe Eltern")).toBeLessThan(text.indexOf("Erziehungsberechtigte"));

  // Im LEG-Editor des Kindes ist die ausgeschaltete Fächertabelle verschwunden
  await page.click('nav.tabs [data-v="kind"]');
  await page.click('[data-act="expTab"][data-v="leg"]');
  await expect(page.locator("[data-lefach]")).toHaveCount(0);
  await expect(page.locator(".preview")).toContainText("Liebe Eltern von");

  await page.click('[data-act="tab"][data-v="einst"]');
  await page.click('nav.snav [data-v="dokumente"]');
  await page.click('[data-act="legTitelReset"]');
  await page.click("#msgJa");
  expect(await page.evaluate(() => S.meta.leg.bloecke.map((b) => b.typ))).toEqual(await page.evaluate(() => LEG_STANDARD));
});

test("Dokumente: ältere LEG-Einstellungen werden übernommen", async ({ page }) => {
  await neueKlasse(page, { demo: false });
  const L = await page.evaluate(() =>
    legMigration({ titel: { stark: "Super!", ziele: "" }, zeigen: { faecher: false, verlauf: true }, selbst: ["Ich lese gern."] })
  );
  const b = Object.fromEntries(L.bloecke.map((x) => [x.typ, x]));
  expect(L.bloecke.map((x) => x.typ)).toEqual(["pers", "stark", "ueben", "faecher", "selbst", "ziele", "vereinb", "unterschrift", "verlauf"]);
  expect(b.stark.titel).toBe("Super!");
  expect(b.ziele.titel).toBe("");
  expect(b.ueben.titel).toBe("Daran arbeitest du noch");
  expect(b.faecher.an).toBe(false);
  expect(b.verlauf.an).toBe(true);
  expect(L.selbst).toEqual(["Ich lese gern."]);
  expect(L.titel).toBeUndefined();
  // Ungültige Abschnitte und Werte werden aussortiert
  const M = await page.evaluate(() => legMigration({ bloecke: [{ typ: "xss" }, { typ: "frei", text: 5, linien: 99 }, { typ: "stark" }, { typ: "stark" }] }));
  expect(M.bloecke.filter((x) => x.typ === "stark")).toHaveLength(1);
  expect(M.bloecke.find((x) => x.typ === "frei")).toMatchObject({ text: "", linien: 6 });
  expect(M.bloecke.some((x) => x.typ === "xss")).toBe(false);
});

test("Druck: alle Dokumente der Beispielklasse sind vollständig und ergeben ein PDF", async ({ page }) => {
  await neueKlasse(page);
  const { html, kinder } = await page.evaluate(() => {
    S.meta.schule = "Grundschule Musterstadt";
    Object.assign(S.meta.kopf, { anschrift: "Schulstraße 1", fuss: "Vertraulich", leg: true, bericht: true, liste: true });
    S.meta.leg.bloecke.push({ typ: "frei", an: true, titel: "Termin", text: "{Vorname} ({Jgst}) · {Schuljahr} · {Ziele}", linien: 2, id: neueId() });
    S.meta.leg.bloecke.find((b) => b.typ === "verlauf").an = true;
    UI.fgFach = S.raster[0].fach; UI.fgEb = 2;
    const ks = sortedKids("alle");
    return {
      kinder: ks.length,
      html: ks.map(legSeite).join("") + ks.map(berichtSeite).join("") + notenSeite() + asvBemerkungSeite("alle") + foerderSeite(),
    };
  });
  expect(kinder).toBeGreaterThan(0);
  expect(html).not.toMatch(/undefined|NaN|\[object /);
  expect(html).not.toMatch(/\{(Vorname|Name|Jgst|Schuljahr|Ziele|Fach|Liste|Kompetenz)\}/);
  // LEG mit Lernverlauf: zwei Seiten je Kind, dazu ein Bericht je Kind und drei Listen
  expect((html.match(/<section class="page/g) || []).length).toBe(kinder * 3 + 3);
  expect((html.match(/class="pfuss"/g) || []).length).toBe(kinder * 3 + 3);

  await page.evaluate((h) => { document.querySelector("#print-root").innerHTML = h; }, html);
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format: "A4" });
  const seiten = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  expect(seiten).toBeGreaterThanOrEqual(kinder * 3 + 3);
});

test("Dokumente: weitere LEG-Vorlage gilt für gewählte Jahrgangsstufen", async ({ page }) => {
  await neueKlasse(page);
  await zuDokumente(page);
  await page.click('[data-act="legVNeu"]');
  await page.fill("#atx", "LEG Jgst. 1");
  await page.click('#atf button[type="submit"]');
  await expect(page.locator('[aria-label="Vorlage bearbeiten"]')).toHaveValue(/.+/);
  await page.check('[data-chg="legVJgst"][data-v="1"]');
  await page.fill('[aria-label="Überschrift Stärken"]', "Das klappt super");
  await page.locator('[aria-label="Überschrift Stärken"]').blur();
  const r = await page.evaluate(() => {
    const k1 = S.kinder.find((k) => +k.jgst === 1), k2 = S.kinder.find((k) => +k.jgst !== 1);
    return { v: S.meta.legVorlagen.map((v) => ({ name: v.name, jgst: v.jgst })), l1: k1 && legSeite(k1), l2: k2 && legSeite(k2), std: legTitel("stark") };
  });
  expect(r.v).toEqual([{ name: "LEG Jgst. 1", jgst: [1] }]);
  expect(r.std).toBe("Das kannst du schon gut");
  if (r.l1) expect(r.l1).toContain("Das klappt super");
  if (r.l2) expect(r.l2).toContain("Das kannst du schon gut");

  // Eine zweite Vorlage, die Jgst. 1 übernimmt, nimmt sie der ersten weg
  await page.click('[data-act="legVNeu"]');
  await page.fill("#atx", "Zweite");
  await page.click('#atf button[type="submit"]');
  await page.check('[data-chg="legVJgst"][data-v="1"]');
  expect(await page.evaluate(() => S.meta.legVorlagen.map((v) => v.jgst))).toEqual([[], [1]]);

  await page.click('[data-act="legVWeg"]');
  await page.click("#msgJa");
  expect(await page.evaluate(() => S.meta.legVorlagen.map((v) => v.name))).toEqual(["LEG Jgst. 1"]);
  await expect(page.locator('[aria-label="Vorlage bearbeiten"]')).toHaveValue("std");
});

test("Dokumente: Vorlage als Datei exportieren und in einem anderen LeDoK einlesen", async ({ page }) => {
  await neueKlasse(page);
  const namen = await page.evaluate(() => {
    S.meta.kopf.anschrift = "Schulstraße 1";
    S.meta.leg.bloecke.push({ typ: "frei", an: true, titel: "Termin", text: "Am {Datum}", linien: 1, id: neueId() });
    save();
    return S.kinder.map((k) => k.vorname).filter(Boolean);
  });
  await zuDokumente(page);
  await page.click('[data-act="vorlageExport"]');
  await expect(page.locator("#vexKopf")).toBeChecked();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('#vexf button[type="submit"]')]);
  expect(dl.suggestedFilename()).toBe("LeDoK-Vorlage-Standard.ledok-vorlage");
  const text = require("fs").readFileSync(await dl.path(), "utf8");
  const d = JSON.parse(text);
  expect(d.app).toBe("ledok-vorlage");
  expect(d.kopf.anschrift).toBe("Schulstraße 1");
  for (const n of namen) expect(text).not.toContain(n);
  expect(text).not.toContain('"kinder"');

  // Zweites LeDoK ohne Beispielklasse liest die Datei ein
  await page.evaluate(() => lock());
  await page.click('[data-act="profilNeu"]');
  await page.fill("#profilName", "Frau Huber");
  await page.fill("#pw1", PW + "2");
  await page.fill("#pw2", PW + "2");
  await page.setChecked("#demo", false);
  await page.click('#setupForm button[type="submit"]');
  await page.click('#setupForm button[type="submit"]');
  await expect(page.locator("header.top")).toBeVisible({ timeout: 30000 });
  await zuDokumente(page);
  const [wahl] = await Promise.all([page.waitForEvent("filechooser"), page.click('[data-act="vorlageImport"]')]);
  await wahl.setFiles({ name: "v.ledok-vorlage", mimeType: "application/json", buffer: Buffer.from(text) });
  await expect(page.locator("#dlgMsg")).toContainText("Briefkopf");
  await page.click("#msgJa");
  const neu = await page.evaluate(() => ({ v: S.meta.legVorlagen, kopf: S.meta.kopf.anschrift }));
  expect(neu.kopf).toBe("Schulstraße 1");
  expect(neu.v).toHaveLength(1);
  expect(neu.v[0].name).toBe("Standard (2)");
  expect(neu.v[0].bloecke.some((b) => b.typ === "frei" && b.titel === "Termin")).toBe(true);

  // Fremde oder kaputte Dateien werden abgelehnt
  const [w2] = await Promise.all([page.waitForEvent("filechooser"), page.click('[data-act="vorlageImport"]')]);
  await w2.setFiles({ name: "x.ledok-vorlage", mimeType: "application/json", buffer: Buffer.from('{"app":"ledok-fachpaket"}') });
  await expect(page.locator("dialog[open]")).toContainText("kann nicht gelesen werden");
  expect(await page.evaluate(() => S.meta.legVorlagen.length)).toBe(1);
});

test("Dokumente: LEG-Vorlagen aus Dateien werden bereinigt", async ({ page }) => {
  await neueKlasse(page, { demo: false });
  const v = await page.evaluate(() => legVorlageBereinigen({ id: "<b>", name: "  ", jgst: [0, 2, 2, "3", 9], bloecke: [{ typ: "frei", titel: 5 }] }));
  expect(v.id).toMatch(/^[0-9a-f]{16}$/);
  expect(v.name).toBe("Vorlage");
  expect(v.jgst).toEqual([2, 3]);
  expect(v.bloecke[0]).toMatchObject({ typ: "frei", titel: "" });
  const r = await page.evaluate(() => {
    try { vorlageEinlesen({ app: "ledok-vorlage", name: "X", leg: { bloecke: [] }, kopf: { logo: "javascript:alert(1)", anschrift: "A" } }); }
    catch (e) { return "fehler"; }
    return vorlageEinlesen({ app: "ledok-vorlage", name: "X", leg: { bloecke: [] }, kopf: { logo: "javascript:alert(1)", anschrift: "A" } }).kopf;
  });
  expect(r).toMatchObject({ logo: "", anschrift: "A" });
});

test("Schnellsuche: Strg+K findet Kinder, Themen und Einstellungen", async ({ page }) => {
  await neueKlasse(page);
  const kind = await page.evaluate(() => sortedKids("alle")[2].id);
  await page.keyboard.press("Control+k");
  await expect(page.locator("#suIn")).toBeFocused();
  await page.keyboard.type(kind);
  await expect(page.locator(".suitem").first()).toContainText(kind);
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog#dlg[open]")).toHaveCount(0);
  expect(await page.evaluate(() => [UI.tab, UI.kind])).toEqual(["kind", kind]);

  await page.click('[data-act="suche"]');
  await page.keyboard.type("dokumente");
  await page.keyboard.press("Enter");
  await expect(page.locator("#dokPrev")).toBeVisible();

  const thema = await page.evaluate(() => S.raster.find((r) => !r.aus && bewertbar(r) && hatModus(r, "beob")));
  await page.keyboard.press("Control+k");
  await page.keyboard.type(thema.text.split(" ").slice(0, 3).join(" "));
  await page.locator(".suitem", { hasText: "Thema" }).first().click();
  expect(await page.evaluate(() => UI.tab)).toBe("erfassen");

  await page.keyboard.press("Control+k");
  await page.keyboard.type("xyzgibtsnicht");
  await expect(page.locator("#suList")).toContainText("Nichts gefunden");
});

test("Druckvorschau erscheint vor dem Drucken", async ({ page }) => {
  await neueKlasse(page);
  await page.evaluate(() => { window.print = () => { window.__gedruckt = (window.__gedruckt || 0) + 1; }; });
  await page.click('nav.tabs [data-v="export"]');
  await page.click('[data-act="printNoten"]');
  await expect(page.locator("#dlg .druckprev")).toContainText("Notenvorschläge");
  await page.click('#dlg [data-act="closeDlg"]');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__gedruckt || 0)).toBe(0);

  await page.click('[data-act="printAll"][data-v="bericht"]');
  const n = await page.evaluate(() => sortedKids(UI.expJgst).length);
  await expect(page.locator("#dlg")).toContainText(`${n} Dokumente`);
  await page.click("#dvDruck");
  await expect.poll(() => page.evaluate(() => window.__gedruckt || 0)).toBe(1);
  expect(await page.evaluate(() => document.querySelectorAll("#print-root .page").length)).toBe(n);
});

test("Förderplan: anlegen, aus dem LEG-Bogen füllen, drucken und mit dem Kind löschen", async ({ page }) => {
  await neueKlasse(page);
  await page.evaluate(() => { window.print = () => { window.__druck = document.querySelector("#print-root").innerHTML; }; });
  await page.click('nav.tabs [data-v="kind"]');
  await page.click('[data-act="expTab"][data-v="foerder"]');
  await page.click('[data-act="fpNeu"]');
  const kid = await page.evaluate(() => UI.kind);
  await page.fill('[data-fp="zeitraum"]', "2. Halbjahr");
  await page.fill('[data-fp="text"][data-i="0"]', "Liest kurze Texte flüssig vor.");
  await page.fill('[data-fp="massnahmen"][data-i="0"]', "Lesepatenschaft");
  await page.selectOption('[data-fp="stand"][data-i="0"]', "teilweise");
  const f = await page.evaluate((k) => S.foerderplaene[k], kid);
  expect(f.zeitraum).toBe("2. Halbjahr");
  expect(f.ziele[0]).toMatchObject({ text: "Liest kurze Texte flüssig vor.", massnahmen: "Lesepatenschaft", stand: "teilweise" });
  await expect(page.locator(".preview")).toContainText("Lesepatenschaft");

  // LEG-Ziele kommen dazu, ohne vorhandene zu doppeln
  await page.evaluate((k) => { const kd = kidById(k); const t = S.texte[textKey(kd)] = S.texte[textKey(kd)] || {}; t.leg = { ...(t.leg || {}), ziele: ["Schreibt Wörter lautgetreu.", "Liest kurze Texte flüssig vor."] }; }, kid);
  const vorher = await page.evaluate((k) => legInhalt(kidById(k)).ziele, kid);
  await page.click('[data-act="fpAusLeg"]');
  const ziele = await page.evaluate((k) => S.foerderplaene[k].ziele.map((z) => z.text), kid);
  expect(vorher).toHaveLength(2);
  for (const z of vorher) expect(ziele.filter((t) => t === z)).toHaveLength(1);

  await page.click('[data-act="printOne"][data-v="foerder"]');
  await page.click("#dvDruck");
  await expect.poll(() => page.evaluate(() => window.__druck || "")).toContain("Förderplan");
  expect(await page.evaluate(() => window.__druck)).toContain("Lesepatenschaft");

  // Sammeldruck unter Export enthält nur Kinder mit Plan
  await page.evaluate(() => { window.__druck = ""; ACT.printFoerderAlle(); });
  await expect(page.locator(".druckprev section.page")).toHaveCount(1);
  await page.click('#dlg [data-act="closeDlg"]');

  await page.evaluate((k) => kindLoeschen(k), kid);
  expect(await page.evaluate((k) => k in S.foerderplaene, kid)).toBe(false);
});

test("Förderplan: Daten aus Dateien werden bereinigt", async ({ page }) => {
  await neueKlasse(page, { demo: false });
  const r = await page.evaluate(() => fpBereinigen({
    "<x>": { ziele: [] },
    a1: { zeitraum: 5, anlass: "A", ziele: [{ id: "<b>", text: "Z", stand: "kaputt", bis: "morgen" }, "quatsch"] },
  }));
  expect(Object.keys(r)).toEqual(["a1"]);
  expect(r.a1.zeitraum).toBe("");
  expect(r.a1.ziele).toHaveLength(1);
  expect(r.a1.ziele[0]).toMatchObject({ text: "Z", stand: "offen", bis: "" });
  expect(r.a1.ziele[0].id).toMatch(/^[0-9a-f]{16}$/);
});

test("LEG-Planer: Termine vergeben, Einladungen und Terminliste drucken", async ({ page }) => {
  await neueKlasse(page);
  await page.click('nav.tabs [data-v="export"]');
  const kinder = await page.evaluate(() => sortedKids(UI.expJgst).map((k) => k.id));
  await page.click('[data-act="terminFolge"]');
  await page.fill("#tfD", "2026-11-10");
  await page.fill("#tfZ", "14:00");
  await page.fill("#tfM", "20");
  await page.fill("#tfP", "5");
  await page.click('#tff button[type="submit"]');
  const t = await page.evaluate(() => sortedKids(UI.expJgst).map((k) => terminVon(k)));
  expect(t[0]).toEqual({ d: "2026-11-10", z: "14:00", ok: false });
  expect(t[1].z).toBe("14:25");
  expect(t.every(Boolean)).toBe(true);

  // Einzelnen Termin ändern und als geführt markieren
  await page.fill(`[aria-label="Uhrzeit ${kinder[0]}"]`, "08:15");
  await page.locator(`[aria-label="Uhrzeit ${kinder[0]}"]`).blur();
  await page.check(`[aria-label="Gespräch mit ${kinder[0]} geführt"]`);
  expect(await page.evaluate((id) => terminVon(kidById(id)), kinder[0])).toEqual({ d: "2026-11-10", z: "08:15", ok: true });
  await expect(page.locator(".card", { hasText: "LEG-Planer" })).toContainText("1 geführt");

  const r = await page.evaluate((id) => {
    const k = kidById(id);
    return { einl: einladungSeite(k), leg: legSeite(k), liste: terminSeite(sortedKids("alle")) };
  }, kinder[0]);
  expect(r.einl).toContain("Dienstag, 10.11.2026, um 08:15 Uhr");
  expect(r.einl).toContain("bitte abtrennen");
  expect(r.einl).not.toMatch(/\{[A-Za-zÄÖÜäöü]+\}|undefined/);
  expect(r.leg).toContain("Gespräch am 10.11.2026");
  expect(r.liste).toContain("08:15");
  expect(r.liste.indexOf("08:15")).toBeLessThan(r.liste.indexOf("14:25"));

  // Ein LEG-Entwurf zurücksetzen lässt den Termin stehen
  await page.evaluate((id) => { const k = kidById(id); S.texte[textKey(k)].leg = { stark: [], ueben: [], ziele: [], faecher: {} }; UI.kind = id; }, kinder[0]);
  await page.evaluate(() => { ACT.legReset(); });
  await page.click("#msgJa");
  expect(await page.evaluate((id) => terminVon(kidById(id)), kinder[0])).toBeTruthy();

  // Datum leeren entfernt den Termin
  await page.fill(`[aria-label="Datum ${kinder[1]}"]`, "");
  await page.locator(`[aria-label="Datum ${kinder[1]}"]`).blur();
  expect(await page.evaluate((id) => terminVon(kidById(id)), kinder[1])).toBeNull();
});

test("Dokumente: Einladungstext anpassen mit Vorschau", async ({ page }) => {
  await neueKlasse(page);
  await zuDokumente(page);
  await page.click('[data-act="dokArt"][data-v="einladung"]');
  const vorschau = page.locator("#dokPrev");
  await expect(vorschau).toContainText("Einladung zum Lernentwicklungsgespräch");
  await expect(vorschau).toContainText("am ______________ um ________ Uhr");
  await page.fill('[data-bind="meta.einladung.text"]', "Hallo {Vorname}, Termin {Termin}.");
  const kuerzel = await page.evaluate(() => sortedKids("alle")[0].id);
  await expect(vorschau).toContainText(`Hallo ${kuerzel}, Termin am`);
  await page.uncheck('[data-bind="meta.einladung.rueck"]');
  await expect(vorschau).not.toContainText("bitte abtrennen");
  await page.click('[data-act="einladungReset"]');
  await page.click("#msgJa");
  expect(await page.evaluate(() => S.meta.einladung.rueck)).toBe(true);
});

test("Desktop mit älterem Installer: Versionsdialog ohne automatische Suche", async ({ page }) => {
  // Programm-Hülle vor der automatischen Update-Suche: nur Update per Datei
  await page.addInitScript(() => {
    window.ledokDesktop = {
      info: async () => ({ shell: "1.0.0", os: "win32", version: "1.0.0", mitgeliefert: "1.0.0", aktualisiert: false, updateKey: "CE5F-1656-01AF" }),
      datenLaden: () => null, datenSpeichern: async () => ({ ok: true }), datenLoeschen: async () => ({ ok: true }),
      sicherung: async () => ({ ok: true }), sicherungenOeffnen: async () => "",
      updatePruefen: async () => ({ ok: false, fehler: "–" }), updateInstallieren: async () => ({ ok: false }), updateZuruecksetzen: async () => ({ ok: true }),
    };
  });
  await page.goto(URL);
  await page.click("#verTag");
  await expect(page.locator("#dlg")).toContainText("kommt mit dem nächsten Installer");
  await expect(page.locator("#updWahl")).toBeEnabled();
  await expect(page.locator("#updSuchen")).toHaveCount(0);
});

test("Desktop: nach einem Update zur vorherigen Version zurück", async ({ page }) => {
  await page.addInitScript(() => {
    window.__zurueck = 0;
    window.ledokDesktop = {
      info: async () => ({ shell: "1.1.0", os: "darwin", version: "1.1.3", mitgeliefert: "1.1.0", aktualisiert: true, updateDatum: "2026-10-20T10:00:00Z", updateKey: "CE5F-1656-01AF", vorherigeVersion: "1.1.2", ausgelassen: null }),
      datenLaden: () => null, datenSpeichern: async () => ({ ok: true }), datenLoeschen: async () => ({ ok: true }),
      sicherung: async () => ({ ok: true }), sicherungenOeffnen: async () => "",
      updatePruefen: async () => ({ ok: false, fehler: "–" }), updateInstallieren: async () => ({ ok: false }), updateZuruecksetzen: async () => ({ ok: true }),
      updateSuchen: async () => ({ ok: true, gefunden: false }),
      updateVorherige: async () => { window.__zurueck++; return { ok: true }; },
    };
  });
  await page.goto(URL);
  await page.click("#verTag");
  await expect(page.locator("#updReset")).toContainText("ausgelieferten Version 1.1.0");
  await page.click("#updVorher");
  await expect(page.locator(".msgtext")).toContainText("Zur vorherigen Version 1.1.2 zurückkehren?");
  await page.click("#msgNein");
  expect(await page.evaluate(() => window.__zurueck)).toBe(0);
  await page.click("#updVorher");
  await page.click("#msgJa");
  await expect.poll(() => page.evaluate(() => window.__zurueck)).toBe(1);
});

test("Desktop: ohne vorheriges Update-Paket nur zurück zur ausgelieferten Version", async ({ page }) => {
  await page.addInitScript(() => {
    window.ledokDesktop = {
      info: async () => ({ shell: "1.1.0", os: "win32", version: "1.1.3", mitgeliefert: "1.1.0", aktualisiert: true, updateDatum: "2026-10-20T10:00:00Z", updateKey: "CE5F-1656-01AF", vorherigeVersion: "1.1.0", ausgelassen: "1.1.4" }),
      datenLaden: () => null, datenSpeichern: async () => ({ ok: true }), datenLoeschen: async () => ({ ok: true }),
      sicherung: async () => ({ ok: true }), sicherungenOeffnen: async () => "",
      updatePruefen: async () => ({ ok: false, fehler: "–" }), updateInstallieren: async () => ({ ok: false }), updateZuruecksetzen: async () => ({ ok: true }),
      updateSuchen: async () => ({ ok: true, gefunden: false }), updateVorherige: async () => ({ ok: true }),
    };
  });
  await page.goto(URL);
  await page.click("#verTag");
  await expect(page.locator("#updReset")).toBeVisible();
  await expect(page.locator("#updVorher")).toHaveCount(0);
  await expect(page.locator("#dlg")).toContainText("Versionen bis 1.1.4 werden nicht mehr automatisch angeboten");
});

test("Dokumente: Druckbild mit Schriftgröße, Schriftart und Graustufen", async ({ page }) => {
  await neueKlasse(page);
  await page.evaluate(() => { window.print = () => { window.__druck = { k: document.querySelector("#print-root").className, z: document.querySelector("#print-root").style.zoom }; }; });
  await page.click('[data-act="tab"][data-v="einst"]');
  await page.click('nav.snav [data-v="dokumente"]');
  await page.selectOption('[data-bind="meta.druck.groesse"]', "125");
  await page.selectOption('[data-bind="meta.druck.schrift"]', "sans");
  await page.check('[data-bind="meta.druck.grau"]');
  expect(await page.evaluate(() => S.meta.druck)).toEqual({ groesse: 125, schrift: "sans", grau: true });
  await expect(page.locator("#dokPrev")).toHaveClass(/d-sans/);
  // Die Vorschau wird nach dem Umschalten neu aufgebaut; ein abgelöstes Element liefert eine leere Schriftart
  await expect.poll(() => page.locator("#dokPrev .page p").first().evaluate((e) => e.isConnected ? getComputedStyle(e).fontFamily : "")).toContain("Arial");
  await page.evaluate(() => ACT.printNoten());
  await expect(page.locator(".druckprev")).toHaveClass(/d-sans/);
  await page.click("#dvDruck");
  await expect.poll(() => page.evaluate(() => window.__druck)).toEqual({ k: "d-sans d-grau", z: "1.25" });
  expect(await page.evaluate(() => druckBereinigen({ groesse: 300, schrift: "<x>", grau: "ja" }))).toEqual({ groesse: 100, schrift: "serif", grau: true });
});

test("Datenprüfung: findet Reste ohne Kind oder Thema und räumt sie auf", async ({ page }) => {
  await neueKlasse(page);
  await page.click('[data-act="tab"][data-v="einst"]');
  await page.click('nav.snav [data-v="daten"]');
  await page.click('[data-act="datenPruefen"]');
  await expect(page.locator("dialog[open]")).toContainText("Alles in Ordnung");
  await page.locator("dialog[open] button[type=submit]").click();

  const vorher = await page.evaluate(() => {
    const e = S.eintraege[0], k = S.kinder[0].id;
    S.eintraege.push({ ...e, k: "X99", t: 1 }, { ...e, c: "weg01", t: 2 });
    S.notizen.push({ k: "X99", ts: new Date().toISOString(), text: "alt" });
    S.texte["X99|2026/27|1"] = { bericht: "alt" };
    S.foerderplaene.X99 = fpBereinigen({ X99: { ziele: [] } }).X99;
    return { e: S.eintraege.length, n: S.notizen.length, k };
  });
  await page.click('[data-act="datenPruefen"]');
  const dlg = page.locator("dialog[open]");
  await expect(dlg).toContainText("1 Bewertungen zu Kindern");
  await expect(dlg).toContainText("1 Bewertungen zu Themen");
  await expect(dlg).toContainText("1 Förderpläne");
  await page.click("#msgJa");
  await expect(page.locator(".toast, #toast").first()).toContainText("Aufgeräumt");
  const nachher = await page.evaluate(() => ({ e: S.eintraege.length, n: S.notizen.length, t: Object.keys(S.texte).some((x) => x.startsWith("X99")), f: "X99" in S.foerderplaene }));
  expect(nachher).toEqual({ e: vorher.e - 2, n: vorher.n - 1, t: false, f: false });
});

test("Heute: Tagesfortschritt zeigt Fokustag und Fokuswoche und lässt sich ausblenden", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T09:00:00")); // ein Dienstag
  await neueKlasse(page);
  await page.click('nav.tabs button[data-v="heute"]');
  const balken = page.locator("#tagesbalken");
  await expect(balken).toContainText("Dein Tag");
  await expect(balken).toContainText(/Fokustag \d+ von \d+/);
  const [jetzt, max] = await Promise.all(["aria-valuenow", "aria-valuemax"].map((a) => balken.locator('[role="progressbar"]').getAttribute(a)));
  expect(+max).toBeGreaterThan(0);
  expect(+jetzt).toBeLessThanOrEqual(+max);
  await balken.locator('[data-act="tagesbalkenAus"]').click();
  await expect(balken).toHaveCount(0);
  // Bleibt nach erneutem Zeichnen aus und kommt über den Knopf oben zurück
  await page.click('nav.tabs button[data-v="erfassen"]');
  await page.click('nav.tabs button[data-v="heute"]');
  await expect(balken).toHaveCount(0);
  await page.click("#tagesbalkenAn");
  await expect(balken).toBeVisible();
});

async function askAntwort(page, text) {
  await page.fill("#atx", text);
  await page.click('#atf button[type="submit"]');
}

test("Sammelliste: Geld einsammeln, Zahlungsbriefe mit GiroCode und Kassenbuch @handy", async ({ page }) => {
  await neueKlasse(page);
  await page.click('nav.tabs [data-v="listen"]');
  await page.click('[data-act="listeNeu"][data-v="geld"]');
  await askAntwort(page, "Kopiergeld");
  await askAntwort(page, "3,50");
  const l = await page.evaluate(() => listeVon(UI.liste));
  expect(l).toMatchObject({ titel: "Kopiergeld", betrag: 350, kasse: true });
  const [a, b, c] = await page.evaluate(() => sortedKids("alle").slice(0, 3).map((k) => k.id));
  await page.click(`[data-act="lZahl"][data-k="${a}"][data-w="bar"]`);
  await page.click(`[data-act="lZahl"][data-k="${b}"][data-w="ue"]`);
  await page.click(`[data-act="lZahl"][data-k="${c}"][data-w="frei"]`);
  await page.fill(`[data-chg="lBetrag"][data-k="${b}"]`, "4");
  await page.locator(`[data-chg="lBetrag"][data-k="${b}"]`).dispatchEvent("change");
  const stand = await page.evaluate(() => { const s = listeStand(listeVon(UI.liste)); return { ok: s.ok, n: s.n, ein: s.ein }; });
  expect(stand.ok).toBe(3);
  expect(stand.ein).toBe(750);
  await expect(page.locator(".lwrap")).toContainText("eingenommen 7,50 €");
  // Die Einnahmen stehen im Kassenbuch, der Saldo läuft mit
  const zeile = await page.evaluate(() => kassenbuch().find((x) => x.text === "Sammelliste: Kopiergeld"));
  expect(zeile.b).toBe(750);

  // Zahlungsbriefe nur für Kinder, die noch offen sind, jeweils mit GiroCode
  await page.click('[data-act="printZahlbrief"]');
  await expect(page.locator('#zbf input[name=zbArt][value="pers"]')).toBeChecked();
  await page.click('#zbf button[type="submit"]');
  const seiten = page.locator(".druckprev section.page");
  await expect(seiten).toHaveCount(stand.n - 3);
  await expect(page.locator(".druckprev svg.qr")).toHaveCount(stand.n - 3);
  const html = await page.locator(".druckprev").innerHTML();
  expect(html).not.toMatch(/undefined|NaN|\{(Vorname|Zweck|Betrag|Frist|Lehrkraft)\}/);
  expect(html).toContain("3,50 €");
  await page.click('#dlg [data-act="closeDlg"]');
  const epc = await page.evaluate(() => epcText(350, "Kopiergeld, 3a, Ben (S01)").split("\n"));
  expect(epc.slice(0, 4)).toEqual(["BCD", "002", "1", "SCT"]);
  expect(epc[6]).toBe("DE02120300000000202051");
  expect(epc[7]).toBe("EUR3.50");
  expect(epc[10]).toBe("Kopiergeld, 3a, Ben (S01)");

  // Verlässt ein Kind die Klasse, bleibt sein Geld in der Summe
  await page.evaluate((k) => kindLoeschen(k), a);
  const nachher = await page.evaluate(() => { const l = S.listen.find((x) => x.titel === "Kopiergeld"); return { ein: listeStand(l).ein, alt: l.alt }; });
  expect(nachher).toEqual({ ein: 750, alt: 350 });
});

test("Sammelliste: Kinder nach Name, Klasse und Jahrgangsstufe auswählen", async ({ page }) => {
  await neueKlasse(page);
  await page.evaluate(() => { const ks = sortedKids("alle"); ks[0].klasse = "1a"; ks[1].klasse = "1b"; ks[2].klasse = "1b"; save(); });
  await page.click('nav.tabs [data-v="listen"]');
  await page.click('[data-act="listeNeu"][data-v="geld"]');
  await askAntwort(page, "Lesenacht");
  await askAntwort(page, "5");
  const alle = await page.evaluate(() => S.kinder.length);
  await expect(page.locator(".lwer")).toContainText(`alle ${alle} Kinder`);
  await page.click('[data-act="listeKinder"]');
  // Klassenfilter: nur 1b anzeigen, alles abwählen, dann die angezeigten auswählen
  await page.selectOption("#lkKl", "1b");
  await expect(page.locator("#lkKids label:visible")).toHaveCount(2);
  await page.selectOption("#lkKl", "");
  await page.click("#lkAus");
  await page.selectOption("#lkKl", "1b");
  await page.click("#lkAn");
  await page.click('#lkf button[type="submit"]');
  let l = await page.evaluate(() => listeVon(UI.liste));
  const b = await page.evaluate(() => sortedKids("alle").filter((k) => k.klasse === "1b").map((k) => k.id));
  expect(l.kinder).toEqual(b);
  expect(await page.evaluate(() => listeStand(listeVon(UI.liste)).n)).toBe(2);
  await expect(page.locator(".ltab tr")).toHaveCount(3);
  // Jahrgangsstufe und Name ergänzen
  await page.click('[data-act="listeKinder"]');
  const jg = await page.evaluate(() => { const k = sortedKids("alle").find((k) => !k.klasse); return { jgst: String(k.jgst), n: sortedKids("alle").filter((x) => String(x.jgst) === String(k.jgst)).length }; });
  await page.selectOption("#lkJg", jg.jgst);
  await expect(page.locator("#lkKids label:visible")).toHaveCount(jg.n);
  await page.selectOption("#lkJg", "");
  await page.fill("#lkName", "s04");
  await expect(page.locator("#lkKids label:visible")).toHaveCount(1);
  await page.click("#lkAn");
  await page.click('#lkf button[type="submit"]');
  l = await page.evaluate(() => listeVon(UI.liste));
  expect(l.kinder).toEqual([...b, "S04"].sort());
  // Ein Kind mit Zahlung abwählen: Rückfrage, dann ist die Zahlung weg
  await page.click(`[data-act="lZahl"][data-k="${b[0]}"][data-w="bar"]`);
  await page.click('[data-act="listeKinder"]');
  await page.uncheck(`#lkKids input[value="${b[0]}"]`);
  await page.click('#lkf button[type="submit"]');
  await expect(page.locator("#msgJa")).toBeVisible();
  await page.click("#msgJa");
  l = await page.evaluate(() => listeVon(UI.liste));
  expect(l.st[b[0]]).toBeUndefined();
  expect(l.kinder).not.toContain(b[0]);
  // Alle wieder anhaken: die Liste gilt wieder für alle Kinder
  await page.click('[data-act="listeKinder"]');
  await page.click("#lkAn");
  await page.click('#lkf button[type="submit"]');
  expect(await page.evaluate(() => listeVon(UI.liste).kinder)).toBeNull();
});

test("Zahlungsbrief: allgemein oder personalisiert, mit oder ohne GiroCode", async ({ page }) => {
  await neueKlasse(page);
  await page.click('nav.tabs [data-v="listen"]');
  await page.click('.lit:has-text("Ausflug Tierpark")');
  const offen = await page.evaluate(() => listeStand(listeVon(UI.liste)).offen.length);
  // allgemein mit GiroCode: eine Seite ohne Namen
  await page.click('[data-act="printZahlbrief"]');
  await page.check('#zbf input[name=zbArt][value="allg"]');
  await page.click('#zbf button[type="submit"]');
  await expect(page.locator(".druckprev section.page")).toHaveCount(1);
  await expect(page.locator(".druckprev svg.qr")).toHaveCount(1);
  const html = await page.locator(".druckprev").innerHTML();
  expect(html).toContain("Liebe Eltern,");
  expect(html).toContain("Nachnamen Ihres Kindes");
  expect(html).not.toMatch(/undefined|NaN|\{(Vorname|Name|Zweck|Betrag|Frist|Klasse)\}/);
  const namen = await page.evaluate(() => S.kinder.map((k) => k.vorname).filter(Boolean));
  for (const n of namen) expect(html).not.toContain(`von ${n}`);
  await page.click('#dlg [data-act="closeDlg"]');
  expect(await page.evaluate(() => listeVon(UI.liste).brief)).toEqual({ allg: true, code: true });
  // personalisiert ohne GiroCode: ein Brief je offenem Kind, Überweisungsdaten ohne QR-Code
  await page.click('[data-act="printZahlbrief"]');
  await expect(page.locator('#zbf input[name=zbArt][value="allg"]')).toBeChecked();
  await page.check('#zbf input[name=zbArt][value="pers"]');
  await page.check('#zbf input[name=zbCode][value="0"]');
  await page.click('#zbf button[type="submit"]');
  await expect(page.locator(".druckprev section.page")).toHaveCount(offen);
  await expect(page.locator(".druckprev svg.qr")).toHaveCount(0);
  await expect(page.locator(".druckprev .ztab").first()).toContainText("IBAN");
  await page.click('#dlg [data-act="closeDlg"]');
  // ohne gültige Bankverbindung ist „mit GiroCode“ gesperrt, der Brief bekommt den Abschnitt zum Zurückgeben
  await page.evaluate(() => { S.kasse.konto.iban = ""; });
  await page.click('[data-act="printZahlbrief"]');
  await expect(page.locator('#zbf input[name=zbCode][value="1"]')).toBeDisabled();
  await page.check('#zbf input[name=zbArt][value="allg"]');
  await page.click('#zbf button[type="submit"]');
  await expect(page.locator(".druckprev")).toContainText("Name des Kindes");
  await expect(page.locator(".druckprev svg.qr")).toHaveCount(0);
});

test("Sammelliste: Liste zum Abhaken und offene Listen auf „Heute“", async ({ page }) => {
  await neueKlasse(page);
  await page.click('nav.tabs [data-v="listen"]');
  await page.click('[data-act="listeNeu"][data-v="haken"]');
  await askAntwort(page, "Zeugnis unterschrieben");
  const k = await page.evaluate(() => sortedKids("alle")[0].id);
  await page.check(`[data-chg="lHaken"][data-k="${k}"]`);
  const l = await page.evaluate(() => listeVon(UI.liste));
  expect(l.betrag).toBe(0);
  expect(l.st[k]).toMatchObject({ w: "ok", b: 0 });
  expect(await page.evaluate(() => kassenbuch().some((x) => x.text.includes("Zeugnis")))).toBe(false);
  await page.click('nav.tabs [data-v="heute"]');
  await expect(page.locator(".hcard", { hasText: "Offene Listen" })).toContainText("Zeugnis unterschrieben");
  await page.click('[data-act="goListe"]:has-text("Zeugnis unterschrieben")');
  await expect(page.locator(".lwrap h3")).toHaveText("Zeugnis unterschrieben");
});

test("Klassenkasse: Bankverbindung prüfen, Beträge lesen und Buchungen mit Saldo", async ({ page }) => {
  await neueKlasse(page);
  const r = await page.evaluate(() => ({
    cent: ["8,50", "8.5", "1.234,50 €", "12", "0,05", "abc", "-3", "1,234"].map(centAus),
    iban: ["DE02 1203 0000 0000 2020 51", "de02120300000000202051", "DE02120300000000202052", "DE0212030000000020205", "AT611904300234573201"].map(ibanOk),
    euro: [euro(123450), euro(-1890), euro(5)],
  }));
  expect(r.cent).toEqual([850, 850, 123450, 1200, 5, null, null, null]);
  expect(r.iban).toEqual([true, true, false, false, true]);
  expect(r.euro).toEqual(["1.234,50 €", "−18,90 €", "0,05 €"]);

  await page.click('nav.tabs [data-v="listen"]');
  await page.click('[data-act="lTab"][data-v="kasse"]');
  const saldo = () => page.evaluate(() => { const z = kassenbuch(); return z.length ? z[z.length - 1].saldo : 0; });
  const vorher = await saldo();
  await page.fill("#bD", "2026-10-20");
  await page.fill("#bT", "Bastelmaterial");
  await page.fill("#bB", "12,40");
  await page.selectOption("#bA", "aus");
  await page.click('[data-act="buchungNeu"]');
  expect(await saldo()).toBe(vorher - 1240);
  await expect(page.locator("main")).toContainText("Bastelmaterial");
  // Eine ungültige IBAN wird angezeigt, der Zahlungsbrief kommt dann ohne GiroCode
  await page.evaluate(() => { S.kasse.konto.iban = "DE00123"; });
  expect(await page.evaluate(() => kontoOk())).toBe(false);
  const brief = await page.evaluate(() => zahlbriefSeite(S.listen.find((l) => l.betrag > 0), sortedKids("alle")[0]));
  expect(brief).not.toContain("<svg");
});

test("Fehltage: auf „Heute“ eintragen, Fokustag ohne fehlende Kinder, Übersicht und Datenprüfung", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T09:00:00")); // ein Dienstag
  await neueKlasse(page);
  await page.click('nav.tabs button[data-v="heute"]');
  const k = await page.evaluate(() => S.kinder.filter((k) => k.gruppe === "B" && !fehltagVon(k.id, today())).sort((a, b) => a.id.localeCompare(b.id))[0].id);
  const fokus = page.locator(".hcard", { hasText: "Fokustag Dienstag" }).locator(".badge");
  const vorher = await fokus.textContent();
  await page.click(`#anwesenheit [data-k="${k}"]`);
  await expect(page.locator(`#anwesenheit [data-k="${k}"]`)).toHaveClass(/fehlt/);
  expect(await page.evaluate((k) => fehltagVon(k, today()), k)).toMatchObject({ ganz: true, ent: true });
  const [, fertig, von] = /(\d+) von (\d+)/.exec(vorher);
  await expect(fokus).toHaveText(`${fertig} von ${+von - 1} fertig`);

  // Zweiter Klick: teilweise und unentschuldigt
  await page.click(`#anwesenheit [data-k="${k}"]`);
  await page.fill("#ftStd", "2");
  await page.uncheck("#ftEnt");
  await page.click('#ftf button[type="submit"]');
  const summe = await page.evaluate((k) => fehlSumme(k), k);
  expect(summe).toMatchObject({ n: 1, tage: 0, teil: 1, std: 2, stdU: 2 });

  // Übersicht unter Listen → Fehltage
  await page.click('nav.tabs [data-v="listen"]');
  await page.click('[data-act="lTab"][data-v="fehltage"]');
  await expect(page.locator(".ftab")).toBeVisible();
  // „Doch anwesend“ entfernt den Eintrag wieder
  await page.evaluate((k) => fehltDialog(k, today()), k);
  await page.click("#ftWeg");
  expect(await page.evaluate((k) => fehltagVon(k, today()), k)).toBeNull();

  // Datenprüfung findet Fehltage ohne Kind
  await page.evaluate(() => { S.fehltage.push({ k: "X99", d: "2026-10-19", ganz: true, ent: true, std: 0, n: "", sj: S.meta.schuljahr, hj: 1 }); });
  await page.click('[data-act="tab"][data-v="einst"]');
  await page.click('nav.snav [data-v="daten"]');
  await page.click('[data-act="datenPruefen"]');
  await expect(page.locator("dialog[open]")).toContainText("1 Fehltage zu Kindern");
  await page.click("#msgJa");
  await expect.poll(() => page.evaluate(() => S.fehltage.some((f) => f.k === "X99"))).toBe(false);
});

test("Stundenplan: Fächer erkennen, „Heute“ zeigt den Tag und führt zur Beobachtung", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T09:00:00")); // ein Dienstag
  await neueKlasse(page);
  const r = await page.evaluate(() => ["Mathe", "mathematik", "Deu", "Religion", "", "Ma"].map(spFach));
  expect(r.slice(0, 3)).toEqual(["Mathematik", "Mathematik", "Deutsch"]);
  expect(r[3]).toBeNull();
  expect(r[4]).toBeNull();
  await page.click('nav.tabs button[data-v="heute"]');
  const karte = page.locator("#stundenplanHeute");
  await expect(karte).toContainText("Stundenplan Dienstag");
  const fach = await karte.locator('[data-act="goFach"]').first().getAttribute("data-v");
  await karte.locator('[data-act="goFach"]').first().click();
  expect(await page.evaluate(() => ({ tab: UI.tab, mode: UI.mode, fach: UI.fach }))).toEqual({ tab: "erfassen", mode: "beob", fach });

  // Eintragen in den Einstellungen
  await page.click('[data-act="tab"][data-v="einst"]');
  await page.click('nav.snav [data-v="stundenplan"]');
  const feld = page.locator('[data-chg="spFeld"][data-t="B"][data-i="0"]');
  await feld.fill("Mathe");
  await feld.dispatchEvent("change");
  await expect(feld).toHaveClass(/spok/);
  expect(await page.evaluate(() => S.meta.stundenplan.B[0])).toBe("Mathe");
});

test("Klassenorganisation: Daten aus Dateien werden bereinigt", async ({ page }) => {
  await neueKlasse(page, { demo: false });
  const r = await page.evaluate(() => ({
    l: listenBereinigen([null, "x", { id: "<x>", titel: 5, betrag: -3, st: { "<b>": { w: "bar", b: 100 }, a1: { w: "bar", b: "12.5" }, a2: { w: "quatsch" } }, kasse: false, frist: "morgen" }]),
    k: kasseBereinigen({ konto: { inhaber: 7, iban: "DE02120300000000202051" }, buchungen: [{ b: 1.5 }, { b: 2e9 }, { id: "b1", d: "2026-10-01", text: "Spende", b: 500 }] }),
    f: fehltageBereinigen([{ k: "a1", d: "2026-03-02" }, { k: "a1", d: "2026-03-02", ganz: false }, { k: "<x>", d: "2026-03-03" }, { k: "a2", d: "gestern" }, { k: "a2", d: "2026-10-05", ganz: false, std: 99, ent: false }]),
    s: stundenplanBereinigen({ n: 20, zeiten: ["08:00", "8 Uhr"], A: ["  Deutsch ", 5], B: "kaputt" }),
  }));
  expect(r.l).toHaveLength(1);
  expect(r.l[0]).toMatchObject({ titel: "Liste", betrag: 0, kasse: false, frist: "", alt: 0, st: { a1: { w: "bar", b: 0, d: "" } } });
  expect(r.l[0].id).toMatch(/^[0-9a-f]{16}$/);
  expect(r.k.konto).toEqual({ inhaber: "", iban: "DE02120300000000202051", bic: "" });
  expect(r.k.buchungen).toEqual([{ id: "b1", d: "2026-10-01", text: "Spende", b: 500, beleg: "" }]);
  expect(r.f).toEqual([
    { k: "a1", d: "2026-03-02", ganz: true, ent: true, std: 0, n: "", sj: "2025/26", hj: 2 },
    { k: "a2", d: "2026-10-05", ganz: false, ent: false, std: 10, n: "", sj: "2026/27", hj: 1 },
  ]);
  expect(r.s.n).toBe(8);
  expect(r.s.zeiten.slice(0, 2)).toEqual(["08:00", ""]);
  expect(r.s.A.slice(0, 2)).toEqual(["Deutsch", ""]);
  expect(r.s.B).toEqual(Array(8).fill(""));
});

test("GiroCode: QR-Code hat Größe, Suchmuster, Taktlinien und Formatinformation an der richtigen Stelle", async ({ page }) => {
  await page.goto(URL);
  const r = await page.evaluate(() => [1, 40, 150, 330].map((n) => {
    const Q = qrMatrix("x".repeat(n)), N = Q.length, v = (N - 17) / 4;
    const finder = (r0, c0) => [0, 1, 2, 3, 4, 5, 6].every((i) => [0, 1, 2, 3, 4, 5, 6].every((j) => Q[r0 + i][c0 + j] === (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4))));
    const takt = [...Array(N - 16).keys()].every((i) => Q[6][i + 8] === ((i + 8) % 2 === 0) && Q[i + 8][6] === ((i + 8) % 2 === 0));
    // Beide Kopien der Formatinformation stimmen überein
    const f1 = [0, 1, 2, 3, 4, 5, 7, 8].map((r) => Q[r][8]).concat([7, 5, 4, 3, 2, 1, 0].map((c) => Q[8][c]));
    const f2 = [...Array(8).keys()].map((i) => Q[8][N - 1 - i]).concat([...Array(7).keys()].map((i) => Q[N - 7 + i][8]));
    return { v, ganz: Number.isInteger(v), finder: finder(0, 0) && finder(0, N - 7) && finder(N - 7, 0), takt, format: f1.join() === f2.join(), dunkel: Q[N - 8][8] };
  }));
  expect(r.map((x) => x.v)).toEqual([1, 3, 8, 13]); // Kapazität bei Fehlerkorrektur M
  for (const x of r) expect(x).toMatchObject({ ganz: true, finder: true, takt: true, format: true, dunkel: true });
  expect(await page.evaluate(() => qrMatrix("x".repeat(900)))).toBeNull();
});
