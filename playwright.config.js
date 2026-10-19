// Oberflächentests für app/LeDoK.html (npm test).
"use strict";
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  timeout: 60000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { locale: "de-DE", timezoneId: "Europe/Berlin", acceptDownloads: true, trace: "retain-on-failure" },
  projects: [
    { name: "Desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
    { name: "Handy", use: { ...devices["Pixel 7"] }, grep: /@handy/ },
  ],
});
