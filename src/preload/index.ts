import { contextBridge, ipcRenderer } from "electron";
import type { CompanionApi, CompanionSettings, ControlState, ResetRadarSnapshot, UsageSnapshot } from "../shared/types";

const api: CompanionApi = {
  getSnapshot: () => ipcRenderer.invoke("usage:getSnapshot") as Promise<UsageSnapshot>,
  onUsageUpdated: (listener) => { const handler = (_: Electron.IpcRendererEvent, value: UsageSnapshot) => listener(value); ipcRenderer.on("usage:updated", handler); return () => ipcRenderer.removeListener("usage:updated", handler); },
  getResetRadar: () => ipcRenderer.invoke("reset-radar:get") as Promise<ResetRadarSnapshot>,
  onResetRadarUpdated: (listener) => { const handler = (_: Electron.IpcRendererEvent, value: ResetRadarSnapshot) => listener(value); ipcRenderer.on("reset-radar:updated", handler); return () => ipcRenderer.removeListener("reset-radar:updated", handler); },
  refreshResetRadar: () => ipcRenderer.invoke("reset-radar:refresh") as Promise<ResetRadarSnapshot>,
  loadResetHistory: () => ipcRenderer.invoke("reset-radar:loadHistory") as Promise<ResetRadarSnapshot>,
  setHovered: (surface, hovered) => ipcRenderer.send("overlay:setHovered", surface, hovered),
  refresh: () => ipcRenderer.invoke("app:refresh") as Promise<void>,
  quit: () => ipcRenderer.invoke("app:quit") as Promise<void>,
  hideTrayMenu: () => ipcRenderer.send("tray:hideMenu"),
  setDetailInteractiveHovered: (hovered) => ipcRenderer.send("detail:setInteractiveHovered", hovered),
  reportDetailHeight: (height) => ipcRenderer.send("detail:reportHeight", height),
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<CompanionSettings>,
  onSettingsUpdated: (listener) => { const handler = (_: Electron.IpcRendererEvent, value: CompanionSettings) => listener(value); ipcRenderer.on("settings:updated", handler); return () => ipcRenderer.removeListener("settings:updated", handler); },
  setAutoStart: (enabled) => ipcRenderer.invoke("settings:setAutoStart", enabled) as Promise<CompanionSettings>,
  getControlState: () => ipcRenderer.invoke("control:getState") as Promise<ControlState>,
  onControlUpdated: (listener) => { const handler = (_: Electron.IpcRendererEvent, value: ControlState) => listener(value); ipcRenderer.on("control:updated", handler); return () => ipcRenderer.removeListener("control:updated", handler); },
  updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch) as Promise<ControlState>,
  exportDiagnostics: () => ipcRenderer.invoke("tools:exportDiagnostics"),
  openResetSource: (url) => ipcRenderer.invoke("reset-radar:openSource", url) as Promise<boolean>,
  showControlCenter: () => ipcRenderer.invoke("control:show") as Promise<void>
};
contextBridge.exposeInMainWorld("codexUsage", api);
