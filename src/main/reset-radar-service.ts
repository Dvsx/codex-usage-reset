import { EventEmitter } from "node:events";
import { join } from "node:path";
import { app } from "electron";
import type { ResetRadarSnapshot } from "../shared/types";
import { readJsonFile, writeJsonFile } from "./json-store";
import { parseHistoryResponse, parseStatusResponse } from "./reset-radar-model";

const API_ORIGIN = "https://codex-resets.com";
const REFRESH_INTERVAL_MS = 15 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 8_000;

interface RadarCache { snapshot: ResetRadarSnapshot; statusEtag: string | null; historyEtag: string | null; }

export class ResetRadarService extends EventEmitter {
  private snapshot: ResetRadarSnapshot = { status: "loading", latestReset: null, activeWatch: null, stats: null, history: null, fetchedAt: null };
  private statusEtag: string | null = null;
  private historyEtag: string | null = null;
  private stopped = false;
  private refreshTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<ResetRadarSnapshot> | null = null;
  private historyPromise: Promise<ResetRadarSnapshot> | null = null;
  private readonly cachePath = join(app.getPath("userData"), "reset-radar.json");

  async start(): Promise<void> {
    const cached = await readJsonFile<RadarCache>(this.cachePath);
    if (cached?.snapshot?.fetchedAt) {
      this.snapshot = { ...cached.snapshot, status: "ready", history: cached.snapshot.history ?? null };
      this.statusEtag = cached.statusEtag ?? null;
      this.historyEtag = cached.historyEtag ?? null;
      this.emit("updated", this.getSnapshot());
    }
    void this.refresh();
    this.refreshTimer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
  }

  stop(): void { this.stopped = true; if (this.refreshTimer) clearInterval(this.refreshTimer); if (this.retryTimer) clearTimeout(this.retryTimer); this.refreshTimer = null; this.retryTimer = null; }
  getSnapshot(): ResetRadarSnapshot { return structuredClone(this.snapshot); }

  async refresh(): Promise<ResetRadarSnapshot> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.fetchStatus().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async loadHistory(): Promise<ResetRadarSnapshot> {
    if (this.historyPromise) return this.historyPromise;
    this.historyPromise = this.fetchHistory().finally(() => { this.historyPromise = null; });
    return this.historyPromise;
  }

  private async fetchStatus(): Promise<ResetRadarSnapshot> {
    try {
      const response = await this.request("/api/v1/status", this.statusEtag);
      if (response.status === 304) return this.getSnapshot();
      if (!response.ok) { this.scheduleRetry(response, () => void this.refresh()); throw new Error(`reset_radar_http_${response.status}`); }
      const parsed = parseStatusResponse(await response.json());
      if (!parsed) throw new Error("reset_radar_invalid_status_response");
      this.statusEtag = response.headers.get("etag");
      const { errorCode: _errorCode, ...cleanSnapshot } = this.snapshot;
      this.update({ ...cleanSnapshot, ...parsed, status: "ready" });
    } catch (error) { this.markUnavailable(error); }
    return this.getSnapshot();
  }

  private async fetchHistory(): Promise<ResetRadarSnapshot> {
    try {
      const response = await this.request("/api/v1/resets?limit=20", this.historyEtag);
      if (response.status === 304) return this.getSnapshot();
      if (!response.ok) { this.scheduleRetry(response, () => void this.loadHistory()); throw new Error(`reset_radar_history_http_${response.status}`); }
      const history = parseHistoryResponse(await response.json());
      if (!history) throw new Error("reset_radar_invalid_history_response");
      this.historyEtag = response.headers.get("etag");
      const { errorCode: _errorCode, ...cleanSnapshot } = this.snapshot;
      this.update({ ...cleanSnapshot, history, status: "ready" });
    } catch (error) { this.markUnavailable(error); }
    return this.getSnapshot();
  }

  private async request(path: string, etag: string | null): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${API_ORIGIN}${path}`, { headers: etag ? { "If-None-Match": etag } : {}, signal: controller.signal });
    } finally { clearTimeout(timer); }
  }

  private scheduleRetry(response: Response, action: () => void): void {
    if (this.stopped || response.status !== 429 || this.retryTimer) return;
    const seconds = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
    const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1_000, 60 * 60 * 1_000) : 60_000;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; action(); }, delay);
  }

  private update(snapshot: ResetRadarSnapshot): void {
    this.snapshot = snapshot;
    this.emit("updated", this.getSnapshot());
    if (!this.stopped) void writeJsonFile(this.cachePath, { snapshot, statusEtag: this.statusEtag, historyEtag: this.historyEtag } satisfies RadarCache).catch(() => undefined);
  }

  private markUnavailable(error: unknown): void {
    const errorCode = error instanceof Error ? error.message.slice(0, 160) : "reset_radar_unknown_error";
    this.update({ ...this.snapshot, status: this.snapshot.fetchedAt ? "ready" : "unavailable", errorCode });
  }
}
