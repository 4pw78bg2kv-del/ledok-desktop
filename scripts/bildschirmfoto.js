// Bildschirmfoto von app/LeDoK.html mit der Beispielklasse, z. B. für die Bedienungsanleitung:
//   npm run bild -- docs/anleitung/bilder/einstellungen-ansicht.png --klick '[data-act="tab"][data-v="einst"]' --klick 'text=Ansicht'
// Optionen (beliebig oft und in dieser Reihenfolge ausgeführt: --klick, --taste, --js, --warten):
//   --klick SELEKTOR    klickt ein Element (Playwright-Selektor, z. B. 'text=Listen' oder '[data-act="tab"][data-v="kind"]')
//   --taste TASTE       drückt eine Taste, z. B. '?' für die Hilfe oder 'Control+k' für die Schnellsuche
//   --js CODE           führt Code in der Seite aus, z. B. "S.meta.x=1;render()"
//   --warten MS         wartet so viele Millisekunden
//   --element SELEKTOR  nur dieses Element fotografieren statt des ganzen Fensters
//   --ganz              die ganze Seite statt nur des sichtbaren Fensters
//   --datum JJJJ-MM-TT  feste Uhrzeit (10:00) an diesem Tag, damit „Heute“ immer gleich aussieht (Voreinstellung 2026-10-20)
//   --breite 1280 --hoehe 800   Fenstergröße (Voreinstellung 1280×800), --handy für Pixel 7, --dunkel für das dunkle Farbschema
//   --leer              ohne Beispielklasse, nur der Startbildschirm
//   --mit-hinweis       eingeblendeten Hinweis unten („Tipp: …“) nicht entfernen
// Ohne Ziel-Datei kommt das Bild nach test-results/bild.png.
"use strict";
const path = require("path"), fs = require("fs");
const { chromium, devices } = require("@playwright/test");
const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const wert = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const schritte = [];
for (let i = 0; i < args.length; i++) if (["--klick", "--taste", "--js", "--warten"].includes(args[i])) schritte.push([args[i], args[++i]]);
const ziel = path.resolve(args.find((a, i) => /\.(png|jpe?g)$/i.test(a) && !String(args[i - 1]).startsWith("--")) || path.join(root, "test-results", "bild.png"));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...(args.includes("--handy") ? devices["Pixel 7"] : { viewport: { width: Number(wert("--breite", 1280)), height: Number(wert("--hoehe", 800)) } }),
    locale: "de-DE", timezoneId: "Europe/Berlin", colorScheme: args.includes("--dunkel") ? "dark" : "light",
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  page.on("dialog", (d) => d.dismiss());
  await page.clock.setFixedTime(new Date(wert("--datum", "2026-10-20") + "T10:00:00+02:00"));
  await page.goto("file://" + path.join(root, "app", "LeDoK.html"));
  if (!args.includes("--leer")) {
    // wie neueKlasse() in tests/ledok.spec.js
    await page.click('[data-act="startNew"]');
    await page.fill("#pw1", "Testpasswort123");
    await page.fill("#pw2", "Testpasswort123");
    await page.setChecked("#demo", true);
    await page.click('#setupForm button[type="submit"]');
    await page.waitForSelector("#err2:has-text('Schulschlüssel')");
    await page.click('#setupForm button[type="submit"]');
    await page.waitForSelector("header.top", { timeout: 30000 });
  }
  for (const [art, w] of schritte) {
    if (art === "--klick") await page.click(w);
    else if (art === "--taste") await page.keyboard.press(w);
    else if (art === "--js") await page.evaluate(w);
    else await page.waitForTimeout(Number(w));
  }
  await page.waitForTimeout(500);
  // Hinweise unten („Tipp: …“) verdecken sonst oft das Wichtige
  if (!args.includes("--mit-hinweis")) await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  const opt = { path: ziel, ...(/\.jpe?g$/i.test(ziel) ? { type: "jpeg", quality: 85 } : {}) };
  if (args.includes("--element")) await page.locator(wert("--element")).first().screenshot(opt);
  else await page.screenshot({ ...opt, fullPage: args.includes("--ganz") });
  await browser.close();
  console.log(`Bild gespeichert: ${ziel}`);
  if (fehler.length) { console.error("JavaScript-Fehler auf der Seite:\n- " + fehler.join("\n- ")); process.exit(1); }
})().catch((e) => { console.error(e.message.split("\n")[0]); process.exit(1); });
