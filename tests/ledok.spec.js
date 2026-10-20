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
