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
  if (rolle === "kl" && !demo) await page.uncheck("#demo");
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
