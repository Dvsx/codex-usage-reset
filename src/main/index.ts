import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, Notification, screen, shell, Tray } from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ControlState, TrackerState, UsageSnapshot } from "../shared/types";
import { DelayedHide } from "./delayed-hide";
import { pillTopOffset } from "./overlay-position";
import { SettingsStore } from "./settings-store";
import { UsageService } from "./usage-service";
import { WindowTracker } from "./window-tracker";

const PILL_WIDTH = 340, PILL_HEIGHT = 36, DETAIL_WIDTH = 388, DETAIL_MIN_HEIGHT = 396, DETAIL_MAX_HEIGHT = 520;
const TRAY_MENU_WIDTH = 160, TRAY_MENU_HEIGHT = 176, CONTROL_WIDTH = 760, CONTROL_HEIGHT = 610, MIN_CODEX_WIDTH = 620;
const HOVER_POLL_INTERVAL_MS = 40, DETAIL_HIDE_DELAY_MS = 90, TIBO_PROFILE_URL = "https://x.com/thsottiaux";
let pillWindow: BrowserWindow | null = null, detailWindow: BrowserWindow | null = null, trayMenuWindow: BrowserWindow | null = null, controlWindow: BrowserWindow | null = null, tray: Tray | null = null;
let trackerState: TrackerState | null = null, pillHovered = false, detailHovered = false, overlayHoverTimer: NodeJS.Timeout | null = null, isQuitting = false, startupOutcomeNotified = false, detailHeight = DETAIL_MIN_HEIGHT;
const delayedDetailHide = new DelayedHide(DETAIL_HIDE_DELAY_MS, () => { if (process.env.CODEX_USAGE_SHOW_DETAIL !== "1" && !pillHovered && !detailHovered) detailWindow?.hide(); });
const usageService = new UsageService();
let settingsStore: SettingsStore;
const windowTracker = new WindowTracker();

if (!app.requestSingleInstanceLock()) app.quit();
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.setAppUserModelId("com.local.codex-usage-companion");
app.on("second-instance", () => { showControlCenter(); void usageService.refresh(); });
app.whenReady().then(async () => {
  settingsStore = new SettingsStore(); await settingsStore.load();
  createOverlayWindows(); createTrayMenuWindow(); createControlWindow(); createTray(); registerIpc();
  if (!process.argv.includes("--autostart") || !settingsStore.get().launchMinimized) showControlCenter();
  showNotification("Codex Usage Companion 已启动", "正在读取当前账户额度，通常需要几秒钟。");
  usageService.on("updated", (snapshot: UsageSnapshot) => { broadcastSnapshot(snapshot); updateTray(snapshot); broadcastControlState(); notifyStartupOutcome(snapshot); });
  windowTracker.on("state", (state: TrackerState) => { trackerState = state; positionOverlay(); });
  await usageService.start(); windowTracker.start();
});
app.on("before-quit", () => { usageService.stop(); windowTracker.stop(); });
app.on("window-all-closed", () => undefined);

function rendererOptions(): Electron.WebPreferences { return { preload: join(__dirname, "../preload/index.mjs"), contextIsolation: true, nodeIntegration: false, sandbox: false }; }
function createOverlayWindows(): void {
  const common: Electron.BrowserWindowConstructorOptions = { frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, closable: false, fullscreenable: false, show: false, skipTaskbar: true, focusable: false, alwaysOnTop: true, hasShadow: false, webPreferences: rendererOptions() };
  pillWindow = new BrowserWindow({ ...common, title: "Codex Usage Companion · Pill", width: PILL_WIDTH, height: PILL_HEIGHT });
  detailWindow = new BrowserWindow({ ...common, title: "Codex Usage Companion · Detail", width: DETAIL_WIDTH, height: detailHeight });
  for (const item of [pillWindow, detailWindow]) { item.setAlwaysOnTop(true, "floating"); item.setIgnoreMouseEvents(true, { forward: true }); }
  loadRenderer(pillWindow, "pill"); loadRenderer(detailWindow, "detail");
  nativeTheme.on("updated", () => { pillWindow?.webContents.send("theme:updated", nativeTheme.shouldUseDarkColors); detailWindow?.webContents.send("theme:updated", nativeTheme.shouldUseDarkColors); });
}
function createTrayMenuWindow(): void {
  trayMenuWindow = new BrowserWindow({ frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, show: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: true, width: TRAY_MENU_WIDTH, height: TRAY_MENU_HEIGHT, webPreferences: rendererOptions() });
  trayMenuWindow.setAlwaysOnTop(true, "pop-up-menu"); trayMenuWindow.on("blur", () => trayMenuWindow?.hide()); loadRenderer(trayMenuWindow, "tray-menu");
}
function createControlWindow(): void {
  controlWindow = new BrowserWindow({ title: "Codex Usage Companion", width: CONTROL_WIDTH, height: CONTROL_HEIGHT, minWidth: 680, minHeight: 520, show: false, backgroundColor: nativeTheme.shouldUseDarkColors ? "#16181d" : "#f7f7f5", autoHideMenuBar: true, webPreferences: rendererOptions() });
  controlWindow.on("close", (event) => { if (!isQuitting) { event.preventDefault(); controlWindow?.hide(); } });
  loadRenderer(controlWindow, "control");
}
function loadRenderer(target: BrowserWindow, view: "pill" | "detail" | "tray-menu" | "control"): void {
  target.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  if (process.env.ELECTRON_RENDERER_URL) void target.loadURL(`${process.env.ELECTRON_RENDERER_URL}?view=${view}`); else void target.loadFile(join(__dirname, "../renderer/index.html"), { query: { view } });
}
function showControlCenter(): void { if (!controlWindow) return; if (controlWindow.isMinimized()) controlWindow.restore(); controlWindow.show(); controlWindow.focus(); }
function positionOverlay(): void {
  const state = trackerState;
  if (!pillWindow || !detailWindow || !state?.active || state.minimized || !state.rect) return hideOverlay();
  const topLeft = screen.screenToDipPoint({ x: state.rect.left, y: state.rect.top }); const bottomRight = screen.screenToDipPoint({ x: state.rect.right, y: state.rect.bottom }); const codexWidth = bottomRight.x - topLeft.x;
  if (codexWidth < MIN_CODEX_WIDTH) return hideOverlay();
  const x = Math.round(topLeft.x + (codexWidth - PILL_WIDTH) / 2); const y = Math.round(topLeft.y + pillTopOffset(state.maximized));
  pillWindow.setBounds({ x, y, width: PILL_WIDTH, height: PILL_HEIGHT }, false); detailWindow.setBounds({ x: Math.round(topLeft.x + (codexWidth - DETAIL_WIDTH) / 2), y: y + PILL_HEIGHT - 1, width: DETAIL_WIDTH, height: detailHeight }, false);
  if (!pillWindow.isVisible()) pillWindow.showInactive(); if (process.env.CODEX_USAGE_SHOW_DETAIL === "1") pillHovered = true; startOverlayHoverTracking(); updateDetailVisibility();
}
function hideOverlay(): void { pillWindow?.hide(); detailWindow?.hide(); detailWindow?.setIgnoreMouseEvents(true, { forward: true }); pillHovered = false; detailHovered = false; if (overlayHoverTimer) clearInterval(overlayHoverTimer); overlayHoverTimer = null; delayedDetailHide.cancel(); }
function quitApplication(): void { if (isQuitting) return; isQuitting = true; delayedDetailHide.cancel(); usageService.stop(); windowTracker.stop(); tray?.destroy(); tray = null; for (const item of [pillWindow, detailWindow, trayMenuWindow, controlWindow]) if (item && !item.isDestroyed()) item.destroy(); pillWindow = detailWindow = trayMenuWindow = controlWindow = null; app.exit(0); }
function isCursorInside(target: BrowserWindow): boolean { const cursor = screen.getCursorScreenPoint(), bounds = target.getBounds(); return cursor.x >= bounds.x && cursor.x <= bounds.x + bounds.width && cursor.y >= bounds.y && cursor.y <= bounds.y + bounds.height; }
function syncOverlayHoverFromCursor(): void { if (!pillWindow?.isVisible() || !detailWindow) return; pillHovered = isCursorInside(pillWindow); detailHovered = detailWindow.isVisible() && isCursorInside(detailWindow); updateDetailVisibility(); }
function startOverlayHoverTracking(): void { if (overlayHoverTimer) return; syncOverlayHoverFromCursor(); overlayHoverTimer = setInterval(syncOverlayHoverFromCursor, HOVER_POLL_INTERVAL_MS); }
function updateDetailVisibility(): void { if (!detailWindow || !pillWindow?.isVisible()) return; if (process.env.CODEX_USAGE_SHOW_DETAIL === "1" || pillHovered || detailHovered) { delayedDetailHide.cancel(); if (!detailWindow.isVisible()) detailWindow.showInactive(); } else delayedDetailHide.schedule(); }

function registerIpc(): void {
  ipcMain.handle("usage:getSnapshot", () => usageService.getSnapshot());
  ipcMain.handle("app:refresh", () => usageService.refresh()); ipcMain.handle("app:quit", () => quitApplication());
  ipcMain.handle("settings:get", () => settingsStore.get()); ipcMain.handle("settings:setAutoStart", async (_event, enabled: boolean) => { const next = await settingsStore.setAutoStart(Boolean(enabled)); broadcastControlState(); return next; });
  ipcMain.handle("control:getState", () => controlState()); ipcMain.handle("control:show", () => showControlCenter());
  ipcMain.handle("settings:update", async (_event, patch: unknown) => { await settingsStore.update(validateSettingsPatch(patch)); broadcastControlState(); return controlState(); });
  ipcMain.handle("tibo:openProfile", async () => { await shell.openExternal(TIBO_PROFILE_URL); return true; });
  ipcMain.handle("tools:exportDiagnostics", () => exportDiagnostics()); ipcMain.on("tray:hideMenu", () => trayMenuWindow?.hide());
  ipcMain.on("detail:setInteractiveHovered", (event, hovered: boolean) => { if (event.sender === detailWindow?.webContents) detailWindow?.setIgnoreMouseEvents(!hovered, { forward: true }); });
  ipcMain.on("detail:reportHeight", (event, requested: number) => { if (event.sender !== detailWindow?.webContents || !Number.isFinite(requested)) return; const next = Math.max(DETAIL_MIN_HEIGHT, Math.min(DETAIL_MAX_HEIGHT, Math.ceil(requested))); if (next !== detailHeight) { detailHeight = next; positionOverlay(); } });
  ipcMain.on("overlay:setHovered", (_event, surface: "pill" | "detail", hovered: boolean) => { if (surface === "pill") pillHovered = hovered; else detailHovered = hovered; updateDetailVisibility(); });
}
function broadcastSnapshot(snapshot: UsageSnapshot): void { pillWindow?.webContents.send("usage:updated", snapshot); detailWindow?.webContents.send("usage:updated", snapshot); }
function controlState(): ControlState { return { usage: usageService.getSnapshot(), settings: settingsStore.get() }; }
function broadcastControlState(): void { controlWindow?.webContents.send("control:updated", controlState()); }
function createTray(): void { const icon = nativeImage.createFromPath(resolveTrayIcon()).resize({ width: 16, height: 16 }); if (icon.isEmpty()) throw new Error("tray_icon_missing"); icon.setTemplateImage(false); tray = new Tray(icon); tray.setToolTip("Codex Usage Companion · 正在读取额度"); tray.on("click", showControlCenter); tray.on("right-click", showTrayMenu); }
function resolveTrayIcon(): string { return app.isPackaged ? join(process.resourcesPath, "app-icon.ico") : join(__dirname, "../../resources/app-icon.ico"); }
function showTrayMenu(): void { if (!tray || !trayMenuWindow) return; const bounds = tray.getBounds(), display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }), area = display.workArea; const x = Math.round(Math.max(area.x, Math.min(bounds.x + Math.round(bounds.width / 2) - Math.round(TRAY_MENU_WIDTH / 2), area.x + area.width - TRAY_MENU_WIDTH))); const above = bounds.y - TRAY_MENU_HEIGHT - 8, y = above >= area.y ? above : bounds.y + bounds.height + 8; trayMenuWindow.setBounds({ x, y: Math.round(y), width: TRAY_MENU_WIDTH, height: TRAY_MENU_HEIGHT }, false); trayMenuWindow.webContents.send("settings:updated", settingsStore.get()); trayMenuWindow.show(); trayMenuWindow.focus(); }
function validateSettingsPatch(value: unknown): Parameters<SettingsStore["update"]>[0] { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("settings_patch_invalid"); const item = value as Record<string, unknown>; const patch: Parameters<SettingsStore["update"]>[0] = {}; if (typeof item.autoStart === "boolean") patch.autoStart = item.autoStart; if (typeof item.launchMinimized === "boolean") patch.launchMinimized = item.launchMinimized; if (typeof item.onboardingComplete === "boolean") patch.onboardingComplete = item.onboardingComplete; return patch; }
async function exportDiagnostics(): Promise<{ canceled: boolean; path: string | null }> { const options = { title: "导出诊断信息", defaultPath: `codex-usage-companion-diagnostics-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "JSON", extensions: ["json"] }] }; const result = controlWindow ? await dialog.showSaveDialog(controlWindow, options) : await dialog.showSaveDialog(options); if (result.canceled || !result.filePath) return { canceled: true, path: null }; await writeFile(result.filePath, `${JSON.stringify({ generatedAt: new Date().toISOString(), appVersion: app.getVersion(), platform: process.platform, arch: process.arch, usage: usageService.getSnapshot() }, null, 2)}\n`, "utf8"); return { canceled: false, path: result.filePath }; }
function updateTray(snapshot: UsageSnapshot): void { if (!tray) return; if (snapshot.status === "ready" && snapshot.windows.length) tray.setToolTip(`Codex 剩余额度 · ${snapshot.windows.map((item) => `${item.label} ${item.remainingPercent}%`).join(" · ")}`); else if (snapshot.status === "signed_out") tray.setToolTip("Codex Usage Companion · 尚未登录 ChatGPT"); else tray.setToolTip("Codex Usage Companion · 额度暂不可用"); }
function showNotification(title: string, body: string): void { if (Notification.isSupported()) new Notification({ title, body }).show(); }
function notifyStartupOutcome(snapshot: UsageSnapshot): void { if (startupOutcomeNotified || snapshot.status === "loading") return; startupOutcomeNotified = true; if (snapshot.status === "ready") showNotification("Codex 额度已就绪", snapshot.windows.length ? snapshot.windows.map((item) => `${item.label} ${item.remainingPercent}%`).join(" · ") : "当前账户未返回可显示的额度窗口"); else if (snapshot.status === "signed_out") showNotification("Codex 尚未登录", "请先在 Codex 桌面端登录 ChatGPT 账户。"); else showNotification("Codex 额度暂不可用", "仍在后台重试连接，可稍后从托盘立即刷新。"); }
