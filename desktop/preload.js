// Schmale, feste Schnittstelle zwischen LeDoK.html und dem Desktop-Programm.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ledokDesktop", {
  info: () => ipcRenderer.invoke("ledok:info"),
  updatePruefen: (text) => ipcRenderer.invoke("ledok:updatePruefen", String(text)),
  updateInstallieren: (text, daten) => ipcRenderer.invoke("ledok:updateInstallieren", String(text), String(daten || "")),
  updateSuchen: () => ipcRenderer.invoke("ledok:updateSuchen"),
  updateOnlineSuchen: (erzwingen) => ipcRenderer.invoke("ledok:updateOnlineSuchen", !!erzwingen),
  updateGefundenInstallieren: (daten) => ipcRenderer.invoke("ledok:updateGefundenInstallieren", String(daten || "")),
  updateOrdnerWaehlen: () => ipcRenderer.invoke("ledok:updateOrdnerWaehlen"),
  updateOrdnerEntfernen: () => ipcRenderer.invoke("ledok:updateOrdnerEntfernen"),
  updateZuruecksetzen: (daten) => ipcRenderer.invoke("ledok:updateZuruecksetzen", String(daten || "")),
  sicherungenOeffnen: () => ipcRenderer.invoke("ledok:sicherungenOeffnen"),
  // Verschlüsselte Daten je Speicherschlüssel als Datei im Benutzerordner (Lesen synchron, weil die App beim Start sofort prüft, ob Daten da sind)
  datenLaden: (key) => ipcRenderer.sendSync("ledok:datenLaden", String(key)),
  datenSpeichern: (key, text) => ipcRenderer.invoke("ledok:datenSpeichern", String(key), String(text)),
  datenLoeschen: (key) => ipcRenderer.invoke("ledok:datenLoeschen", String(key)),
  sicherung: (text, anlass) => ipcRenderer.invoke("ledok:sicherung", String(text), String(anlass || "")),
});
