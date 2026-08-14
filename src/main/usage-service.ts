import { EventEmitter } from "node:events";
import { join } from "node:path";
import { app } from "electron";
import type { UsageSnapshot } from "../shared/types";
import { AppServerRpc } from "./app-server-rpc";
import { readJsonFile, writeJsonFile } from "./json-store";
import { resolveCodexExecutable } from "./runtime-paths";
import { refreshFailedSnapshot, parseUsageSnapshot } from "./usage-model";
import { REFRESH_FAILURES_BEFORE_RECONNECT, refreshRetryDelay } from "./retry-policy";

const REFRESH_INTERVAL_MS = 1 * 60 * 1_000;
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export class UsageService extends EventEmitter {
  private snapshot: UsageSnapshot = {
    status: "loading",
    planType: null,
    windows: [],
    resetCredits: null,
    usageSummary: null,
    dailyUsageBuckets: null,
    fetchedAt: null
  };
  private rpc: AppServerRpc | null = null;
  private restartAttempt = 0;
  private stopped = false;
  private refreshPromise: Promise<void> | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private refreshRetryTimer: NodeJS.Timeout | null = null;
  private resetTimer: NodeJS.Timeout | null = null;
  private notificationTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private refreshFailureCount = 0;
  private readonly cachePath = join(app.getPath("userData"), "usage-snapshot.json");

  async start(): Promise<void> {
    const cached = await readJsonFile<UsageSnapshot>(this.cachePath);
    if (cached?.fetchedAt) {
      const { errorCode: _errorCode, ...cleanCached } = cached;
      this.update({
        ...cleanCached,
        usageSummary: cleanCached.usageSummary ?? null,
        dailyUsageBuckets: cleanCached.dailyUsageBuckets ?? null,
        status: "ready"
      }, false);
    }
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.rpc?.stop();
    this.rpc = null;
  }

  getSnapshot(): UsageSnapshot {
    return structuredClone(this.snapshot);
  }

  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private connect(): void {
    if (this.stopped) return;
    let executable: string;
    try {
      executable = resolveCodexExecutable();
    } catch (error) {
      this.markUnavailable(error);
      this.scheduleRestart();
      return;
    }

    const rpc = new AppServerRpc(executable);
    this.rpc = rpc;
    rpc.on("notification", (method: string) => {
      if (method !== "account/rateLimits/updated" && method !== "account/updated") return;
      if (this.notificationTimer) clearTimeout(this.notificationTimer);
      this.notificationTimer = setTimeout(() => void this.refresh(), 800);
    });
    rpc.on("exit", (error: Error) => {
      if (this.rpc !== rpc || this.stopped) return;
      this.rpc = null;
      this.clearRefreshRetry();
      this.clearRefreshInterval();
      this.markUnavailable(error);
      this.scheduleRestart();
    });
    rpc.on("diagnostic", (line: string) => {
      if (process.env.CODEX_USAGE_DEBUG) console.warn(`[app-server] ${line}`);
    });

    void rpc.start()
      .then(async () => {
        if (this.rpc !== rpc || this.stopped) return;
        this.restartAttempt = 0;
        this.refreshFailureCount = 0;
        this.clearRefreshRetry();
        await this.refresh();
        if (this.rpc !== rpc || this.stopped) return;
        this.startRefreshInterval();
      })
      .catch((error: unknown) => {
        if (this.rpc === rpc) {
          this.rpc = null;
          rpc.stop();
          this.clearRefreshRetry();
          this.clearRefreshInterval();
          this.markUnavailable(error);
          this.scheduleRestart();
        }
      });
  }

  private async performRefresh(): Promise<void> {
    const rpc = this.rpc;
    if (!rpc) {
      this.handleRefreshFailure(new Error("app_server_not_connected"), null);
      return;
    }
    try {
      const [account, limits, accountUsage] = await Promise.all([
        rpc.request("account/read", { refreshToken: false }),
        rpc.request("account/rateLimits/read"),
        rpc.request("account/usage/read").then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const, value: null })
        )
      ]);
      const next = parseUsageSnapshot(account, limits, accountUsage.value);
      if (!accountUsage.ok) {
        next.usageSummary = this.snapshot.usageSummary;
        next.dailyUsageBuckets = this.snapshot.dailyUsageBuckets;
      }
      this.refreshFailureCount = 0;
      this.clearRefreshRetry();
      this.update(next, true);
      this.scheduleResetRefresh(next);
    } catch (error) {
      this.handleRefreshFailure(error, rpc);
    }
  }

  private handleRefreshFailure(error: unknown, rpc: AppServerRpc | null): void {
    this.refreshFailureCount += 1;
    this.markUnavailable(error);
    if (rpc && this.rpc === rpc && this.refreshFailureCount >= REFRESH_FAILURES_BEFORE_RECONNECT) {
      this.rpc = null;
      this.refreshFailureCount = 0;
      this.clearRefreshRetry();
      this.clearRefreshInterval();
      rpc.stop();
      this.scheduleRestart();
      return;
    }
    this.scheduleRefreshRetry();
  }

  private update(snapshot: UsageSnapshot, persist: boolean): void {
    this.snapshot = snapshot;
    this.emit("updated", this.getSnapshot());
    if (persist && snapshot.status === "ready") {
      void writeJsonFile(this.cachePath, snapshot).catch(() => undefined);
    }
  }

  private markUnavailable(error: unknown): void {
    const message = error instanceof Error ? error.message : "unknown_error";
    this.update(refreshFailedSnapshot(this.snapshot, message.slice(0, 160)), false);
  }

  private scheduleRefreshRetry(): void {
    if (this.stopped || this.refreshRetryTimer) return;
    const delay = refreshRetryDelay(this.refreshFailureCount);
    this.refreshRetryTimer = setTimeout(() => {
      this.refreshRetryTimer = null;
      void this.refresh();
    }, delay);
  }

  private scheduleRestart(): void {
    if (this.stopped || this.restartTimer) return;
    const delay = BACKOFF_MS[Math.min(this.restartAttempt, BACKOFF_MS.length - 1)] ?? 30_000;
    this.restartAttempt += 1;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.connect();
    }, delay);
  }

  private startRefreshInterval(): void {
    this.clearRefreshInterval();
    this.refreshInterval = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
  }

  private clearRefreshInterval(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = null;
  }

  private clearRefreshRetry(): void {
    if (this.refreshRetryTimer) clearTimeout(this.refreshRetryTimer);
    this.refreshRetryTimer = null;
  }

  private scheduleResetRefresh(snapshot: UsageSnapshot): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    const nowSeconds = Date.now() / 1_000;
    const nextReset = snapshot.windows
      .map((window) => window.resetsAt)
      .filter((value): value is number => typeof value === "number" && value > nowSeconds)
      .sort((a, b) => a - b)[0];
    if (!nextReset) return;
    const delay = Math.min(REFRESH_INTERVAL_MS, Math.max(1_000, nextReset * 1_000 - Date.now() + 1_500));
    this.resetTimer = setTimeout(() => void this.refresh(), delay);
  }

  private clearTimers(): void {
    this.clearRefreshInterval();
    this.clearRefreshRetry();
    if (this.resetTimer) clearTimeout(this.resetTimer);
    if (this.notificationTimer) clearTimeout(this.notificationTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.resetTimer = null;
    this.notificationTimer = null;
    this.restartTimer = null;
  }
}
