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
