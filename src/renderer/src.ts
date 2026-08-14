import "./style.css";
import type { ControlState, ResetCredit, UsageSnapshot, UsageWindow } from "../shared/types";

const params = new URLSearchParams(window.location.search);
const requestedView = params.get("view");
const view = requestedView === "detail" || requestedView === "tray-menu" || requestedView === "control" ? requestedView : "pill";
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("renderer_root_missing");
const appRoot: HTMLElement = root;
document.body.dataset.view = view;

let snapshot: UsageSnapshot = { status: "loading", planType: null, windows: [], resetCredits: null, usageSummary: null, dailyUsageBuckets: null, fetchedAt: null };
let settings: ControlState["settings"] = { autoStart: false, launchMinimized: false, onboardingComplete: false };
let controlState: ControlState | null = null;
let controlTab: "overview" | "tools" | "settings" = "overview";
let controlMessage = "";

if (view === "pill" || view === "detail") {
  appRoot.addEventListener("mouseenter", () => window.codexUsage.setHovered(view, true));
  appRoot.addEventListener("mouseleave", () => window.codexUsage.setHovered(view, false));
}

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character] ?? character); }
function tone(remaining: number): "good" | "critical" { return remaining <= 20 ? "critical" : "good"; }
function formatPlan(plan: string | null): string { return plan ? `Codex ${plan.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase())}` : "Codex"; }
function formatDate(seconds: number | null, includeDate = false): string {
  if (!seconds) return "时间未提供";
  return new Intl.DateTimeFormat("zh-CN", { ...(includeDate ? { month: "numeric", day: "numeric" } : {}), hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(seconds * 1_000));
}
function countdown(seconds: number | null): string {
  if (!seconds) return "";
  const minutes = Math.ceil(Math.max(0, seconds * 1_000 - Date.now()) / 60_000);
  if (!minutes) return "即将重置";
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} 小时 ${rest} 分后` : `${hours} 小时后`;
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时后`;
}
function compactCountdown(seconds: number | null): string {
  if (!seconds) return "重置时间未知";
  const minutes = Math.ceil(Math.max(0, seconds * 1_000 - Date.now()) / 60_000);
  if (!minutes) return "即将重置";
  if (minutes < 60) return `${minutes}分后重置`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}时${minutes % 60 ? `${minutes % 60}分` : ""}后重置` : `${Math.floor(hours / 24)}天${hours % 24 ? `${hours % 24}时` : ""}后重置`;
}

function pillHtml(current: UsageSnapshot): string {
  if (current.status === "loading") return `<section class="pill pill--loading"><span class="pulse"></span><span>正在读取个人额度</span></section>`;
  if (current.status === "signed_out") return `<section class="pill"><span class="state-dot critical"></span><span>请先登录 Codex</span></section>`;
  if (!current.windows.length) return `<section class="pill"><span class="state-dot warn"></span><span>额度暂不可用</span></section>`;
  const metrics = current.windows.map((item, index) => `${index ? `<span class="window-separator">·</span>` : ""}<span class="pill-metric ${tone(item.remainingPercent)}"><span class="metric-label">${escapeHtml(item.label)}</span><strong>${item.remainingPercent}%</strong></span>`).join("");
  const streak = current.usageSummary?.currentStreakDays;
  const nextReset = current.windows.map((item) => item.resetsAt).filter((item): item is number => typeof item === "number").sort((a, b) => a - b)[0] ?? null;
  return `<section class="pill pill--metrics"><span class="pill-side pill-streak">${streak == null ? "连续 --" : `连续 ${streak} 天`}</span><span class="pill-center">${metrics}</span><span class="pill-side pill-reset">${compactCountdown(nextReset)}</span></section>`;
}

function compactTokens(value: number): string { return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: value >= 1_000_000 ? 1 : 0 }).format(value); }
function shortDate(value: string): string { const [, month = "", day = ""] = value.split("-"); return `${Number(month)}/${Number(day)}`; }
function trendHtml(current: UsageSnapshot): string {
  const buckets = current.dailyUsageBuckets ?? [];
  if (!buckets.length) return `<section class="trend"><div class="section-title"><span>最近 7 天</span><b>Token 用量</b></div><div class="trend-empty">暂无每日用量数据</div></section>`;
  const max = Math.max(...buckets.map((item) => item.tokens), 1);
  return `<section class="trend"><div class="section-title"><span>最近 7 天</span><b>Token 用量</b></div><div class="trend-chart">${buckets.map((item) => `<div class="trend-day" title="${escapeHtml(`${item.startDate} · ${item.tokens.toLocaleString("zh-CN")} tokens`)}"><span class="trend-value">${compactTokens(item.tokens)}</span><span class="trend-track"><i style="--level:${Math.max(.06, item.tokens / max)}"></i></span><time>${shortDate(item.startDate)}</time></div>`).join("")}</div></section>`;
}
function usageRow(item: UsageWindow): string { const currentTone = tone(item.remainingPercent); return `<article class="usage-row ${currentTone}"><div class="row-heading"><div><span class="window-name">${escapeHtml(item.label)} 窗口</span><span class="used-copy">已用 ${item.usedPercent}%</span></div><strong>${item.remainingPercent}<small>%</small></strong></div><div class="meter"><i style="width:${item.remainingPercent}%"></i></div><div class="row-meta"><span>重置 ${formatDate(item.resetsAt, (item.durationMins ?? 0) >= 1440)}</span><span>${countdown(item.resetsAt)}</span></div></article>`; }
function creditRow(credit: ResetCredit): string { return `<li><span>${escapeHtml(credit.title ?? "完整额度重置卡")}</span><time>${credit.expiresAt ? `${formatDate(credit.expiresAt, true)} 到期` : "到期日未提供"}</time></li>`; }
function tiboLatestHtml(): string { return `<section class="tibo-latest"><div class="section-title"><span>Tibo 最新动态</span><b>@thsottiaux</b></div><p>在 X 查看他的最新帖子、Codex 公告与公开动态。</p><button class="detail-interactive tibo-link" type="button" data-action="open-tibo-profile">在 X 查看最新帖子 <span aria-hidden="true">↗</span></button></section>`; }

function detailHtml(current: UsageSnapshot): string {
  const rows = current.windows.length ? current.windows.map(usageRow).join("") : `<div class="empty-state">${current.status === "signed_out" ? "请在 Codex 中登录 ChatGPT" : "当前账户没有返回可显示的额度窗口"}</div>`;
  const credits = current.resetCredits ? `<section class="credits"><div class="section-title"><span>重置卡</span><b>${current.resetCredits.availableCount} 张可用</b></div>${current.resetCredits.credits?.length ? `<ul>${current.resetCredits.credits.slice(0, 3).map(creditRow).join("")}</ul>` : `<p>${current.resetCredits.availableCount ? "服务端未提供每张重置卡的到期详情" : "当前没有可用重置卡"}</p>`}</section>` : "";
  const fetched = current.fetchedAt ? new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(current.fetchedAt)) : "尚未更新";
  return `<section class="detail-card"><header><h1>${escapeHtml(formatPlan(current.planType))}</h1><button class="detail-refresh" type="button" aria-label="立即刷新额度" title="立即刷新额度"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.4 8.2A6.7 6.7 0 1 0 16.7 12"/><path d="M16.4 3.8v4.7h-4.7"/></svg></button></header><div class="usage-list">${rows}</div>${tiboLatestHtml()}${trendHtml(current)}${credits}<footer><span>最后更新 ${fetched}</span></footer></section>`;
}
function trayMenuHtml(): string { return `<section class="tray-menu" aria-label="Codex Usage Companion 菜单"><button type="button" data-action="open-control">打开控制中心</button><button type="button" data-action="refresh">立即刷新</button><button type="button" data-action="auto-start">开机启动<span class="tray-check">${settings.autoStart ? "✓" : ""}</span></button><button type="button" data-action="quit">退出</button></section>`; }

function usageOverview(current: UsageSnapshot): string { return `<div class="control-metrics">${current.windows.length ? current.windows.map((item) => `<article class="control-metric"><span>${escapeHtml(item.label)}剩余</span><strong>${item.remainingPercent}%</strong><small>${compactCountdown(item.resetsAt)}</small></article>`).join("") : `<article class="control-empty">${current.status === "loading" ? "正在读取个人额度…" : current.status === "signed_out" ? "请先登录 Codex" : "个人额度暂不可用"}</article>`}</div>`; }
function tiboOverviewHtml(): string { return `<section class="control-card tibo-overview"><div class="card-heading"><div><span>Tibo 最新动态</span><b>@thsottiaux</b></div><small>公开 X 主页</small></div><div><strong>直接关注公开动态</strong><p>不抓取、不分析、不预测；点击后在浏览器中查看他的最新帖子与 Codex 公告。</p><button class="secondary-button" type="button" data-action="open-tibo-profile">在 X 查看最新帖子 ↗</button></div></section>`; }
function overviewPage(state: ControlState): string { return `<section class="control-page"><div class="page-heading"><div><span>OVERVIEW</span><h2>你的 Codex 使用概览</h2></div><button class="primary-button" type="button" data-action="refresh-usage">刷新额度</button></div>${usageOverview(state.usage)}${tiboOverviewHtml()}</section>`; }
function toolsPage(): string { return `<section class="control-page"><div class="page-heading"><div><span>TOOLS</span><h2>安全工具</h2></div></div><div class="tool-grid"><button type="button" data-action="refresh-usage"><strong>刷新个人额度</strong><span>重新读取 Codex App Server</span></button><button type="button" data-action="open-tibo-profile"><strong>查看 Tibo 最新动态</strong><span>在浏览器打开 @thsottiaux 的 X 主页</span></button><button type="button" data-action="export-diagnostics"><strong>导出诊断信息</strong><span>仅包含个人额度与运行状态</span></button></div></section>`; }
function settingsPage(state: ControlState): string { return `<section class="control-page"><div class="page-heading"><div><span>SETTINGS</span><h2>应用设置</h2></div></div><section class="control-card settings-card"><label class="switch-line"><span><strong>开机启动</strong><small>使用当前 Portable EXE 路径</small></span><input type="checkbox" data-setting="autoStart" ${state.settings.autoStart ? "checked" : ""}></label><label class="switch-line"><span><strong>开机时静默进入托盘</strong><small>手动运行仍会打开控制中心</small></span><input type="checkbox" data-setting="launchMinimized" ${state.settings.launchMinimized ? "checked" : ""}></label></section></section>`; }
function onboardingHtml(): string { return `<div class="onboarding"><div class="onboarding-mark">C</div><span>CODEX USAGE COMPANION</span><h1>个人额度，清楚展示<br>公开动态，随时查看</h1><p>软件只读取你当前 Codex 账户的个人额度。需要了解负责人公开动态时，可直接前往 @thsottiaux 的 X 主页。</p><div><button class="primary-button" type="button" data-action="enter-app">进入工具</button></div></div>`; }
function controlHtml(state: ControlState): string {
  if (!state.settings.onboardingComplete) return onboardingHtml();
  const page = controlTab === "overview" ? overviewPage(state) : controlTab === "tools" ? toolsPage() : settingsPage(state);
  return `<section class="control-shell"><aside><div class="brand"><span>C</span><div><strong>Codex Usage</strong><small>Companion 1.0</small></div></div><nav><button type="button" data-tab="overview" class="${controlTab === "overview" ? "is-active" : ""}">概览</button><button type="button" data-tab="tools" class="${controlTab === "tools" ? "is-active" : ""}">工具</button><button type="button" data-tab="settings" class="${controlTab === "settings" ? "is-active" : ""}">设置</button></nav><footer><i class="status-light is-on"></i><span>个人额度监控</span></footer></aside><main class="control-main">${controlMessage ? `<div class="control-toast">${escapeHtml(controlMessage)}</div>` : ""}${page}</main></section>`;
}

async function runControlAction(action: string): Promise<void> {
  try {
    controlMessage = "";
    if (action === "enter-app") controlState = await window.codexUsage.updateSettings({ onboardingComplete: true });
    else if (action === "refresh-usage") { await window.codexUsage.refresh(); controlMessage = "个人额度刷新完成"; }
    else if (action === "open-tibo-profile") { await window.codexUsage.openTiboProfile(); controlMessage = "已在浏览器打开 Tibo 的 X 主页"; }
    else if (action === "export-diagnostics") { const result = await window.codexUsage.exportDiagnostics(); if (!result.canceled) controlMessage = `诊断信息已导出：${result.path ?? ""}`; }
  } catch (error) { controlMessage = error instanceof Error ? error.message : "操作失败"; }
  render();
}
function bindControlInteractions(): void {
  appRoot.addEventListener("click", (event) => { const tab = (event.target as Element).closest<HTMLButtonElement>("button[data-tab]"); if (tab && (tab.dataset.tab === "overview" || tab.dataset.tab === "tools" || tab.dataset.tab === "settings")) { controlTab = tab.dataset.tab; controlMessage = ""; render(); return; } const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action; if (action) void runControlAction(action); });
  appRoot.addEventListener("change", (event) => { const target = event.target as HTMLInputElement; if (!target.dataset.setting) return; void window.codexUsage.updateSettings({ [target.dataset.setting]: target.checked }).then((state) => { controlState = state; settings = state.settings; render(); }); });
}
function bindDetailInteractions(): void {
  const interactive = appRoot.querySelectorAll<HTMLElement>(".detail-interactive, .detail-refresh");
  for (const element of interactive) { element.addEventListener("mouseenter", () => window.codexUsage.setDetailInteractiveHovered(true)); element.addEventListener("mouseleave", () => window.codexUsage.setDetailInteractiveHovered(false)); }
  appRoot.querySelector<HTMLButtonElement>(".detail-refresh")?.addEventListener("click", () => void window.codexUsage.refresh());
  appRoot.querySelector<HTMLElement>("[data-action='open-tibo-profile']")?.addEventListener("click", () => void window.codexUsage.openTiboProfile());
}
function render(): void {
  appRoot.innerHTML = view === "pill" ? pillHtml(snapshot) : view === "detail" ? detailHtml(snapshot) : view === "tray-menu" ? trayMenuHtml() : controlState ? controlHtml(controlState) : `<div class="control-loading"><span class="pulse"></span><strong>正在启动控制中心…</strong></div>`;
  if (view === "detail") { bindDetailInteractions(); requestAnimationFrame(() => { const card = appRoot.querySelector<HTMLElement>(".detail-card"); if (!card) return; const style = getComputedStyle(card); const n = (value: string) => Number.parseFloat(value) || 0; const children = [...card.children] as HTMLElement[]; window.codexUsage.reportDetailHeight(Math.ceil(children.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0) + Math.max(0, children.length - 1) * n(style.rowGap || style.gap) + n(style.paddingTop) + n(style.paddingBottom) + n(style.borderTopWidth) + n(style.borderBottomWidth) + 18)); }); }
}

window.codexUsage.onUsageUpdated((next) => { snapshot = next; if (controlState) controlState = { ...controlState, usage: next }; render(); });
void window.codexUsage.getSnapshot().then((next) => { snapshot = next; render(); });
if (view === "tray-menu") { window.codexUsage.onSettingsUpdated((next) => { settings = next; render(); }); void window.codexUsage.getSettings().then((next) => { settings = next; render(); }); appRoot.addEventListener("click", (event) => { const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action; if (action === "open-control") void window.codexUsage.showControlCenter().finally(() => window.codexUsage.hideTrayMenu()); else if (action === "refresh") void window.codexUsage.refresh().finally(() => window.codexUsage.hideTrayMenu()); else if (action === "auto-start") void window.codexUsage.setAutoStart(!settings.autoStart).then((next) => { settings = next; render(); }); else if (action === "quit") void window.codexUsage.quit(); }); }
if (view === "control") { bindControlInteractions(); window.codexUsage.onControlUpdated((state) => { controlState = state; settings = state.settings; snapshot = state.usage; render(); }); void window.codexUsage.getControlState().then((state) => { controlState = state; settings = state.settings; snapshot = state.usage; render(); }); }
setInterval(() => { if ((view === "pill" || view === "detail") && snapshot.windows.some((item) => item.resetsAt)) render(); }, 30_000);
render();
