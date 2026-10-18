// Schmale, feste Schnittstelle zwischen LeDoK.html und dem Desktop-Programm.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ledokDesktop", {
  info: () => ipcRenderer.invoke("ledok:info"),
  updatePruefen: (text) => ipcRenderer.invoke("ledok:updatePruefen", String(text)),
  updateInstallieren: (text, daten) => ipcRenderer.invoke("ledok:updateInstallieren", String(text), String(daten || "")),
  updateZuruecksetzen: (daten) => ipcRenderer.invoke("ledok:updateZuruecksetzen", String(daten || "")),
  sicherungenOeffnen: () => ipcRenderer.invoke("ledok:sicherungenOeffnen"),
});
