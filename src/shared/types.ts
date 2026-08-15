export type UsageStatus = "loading" | "ready" | "signed_out" | "unavailable";

export interface UsageWindow { key: string; label: string; durationMins: number | null; usedPercent: number; remainingPercent: number; resetsAt: number | null; }
export interface ResetCredit { id: string | null; title: string | null; status: string | null; expiresAt: number | null; }
export interface ResetCreditsSnapshot { availableCount: number; credits: ResetCredit[] | null; }
export interface AccountUsageSummary { lifetimeTokens: number | null; peakDailyTokens: number | null; longestRunningTurnSec: number | null; currentStreakDays: number | null; longestStreakDays: number | null; }
export interface DailyUsageBucket { startDate: string; tokens: number; }
export interface UsageSnapshot { status: UsageStatus; planType: string | null; windows: UsageWindow[]; resetCredits: ResetCreditsSnapshot | null; usageSummary: AccountUsageSummary | null; dailyUsageBuckets: DailyUsageBucket[] | null; fetchedAt: number | null; errorCode?: string; }
export type ResetRadarStatus = "loading" | "ready" | "unavailable";
export interface ResetAnnouncement { id: string; announcedAt: string; text: string; sourceUrl: string; }
export interface ResetWatch { level: "elevated" | "strong"; chancePercent: number | null; forecastWindow: string; observedAt: string; expiresAt: string; text: string; sourceUrl: string; }
export interface ResetRadarStats { total: number; lastResetAt: string | null; daysSinceLast: number | null; avgIntervalDays: number | null; }
export interface ResetRadarSnapshot { status: ResetRadarStatus; latestReset: ResetAnnouncement | null; activeWatch: ResetWatch | null; stats: ResetRadarStats | null; history: ResetAnnouncement[] | null; fetchedAt: number | null; errorCode?: string; }
export interface CompanionSettings { autoStart: boolean; launchMinimized: boolean; onboardingComplete: boolean; }
export interface ControlState { usage: UsageSnapshot; resetRadar: ResetRadarSnapshot; settings: CompanionSettings; appVersion: string; }
export interface DiagnosticExportResult { canceled: boolean; path: string | null; }
export interface TrackerRect { left: number; top: number; right: number; bottom: number; }
export interface TrackerState { active: boolean; hwnd: number; minimized: boolean; maximized: boolean; rect: TrackerRect | null; dpi: number; }
export interface CompanionApi {
  getSnapshot(): Promise<UsageSnapshot>;
  onUsageUpdated(listener: (snapshot: UsageSnapshot) => void): () => void;
  getResetRadar(): Promise<ResetRadarSnapshot>;
  onResetRadarUpdated(listener: (snapshot: ResetRadarSnapshot) => void): () => void;
  refreshResetRadar(): Promise<ResetRadarSnapshot>;
  loadResetHistory(): Promise<ResetRadarSnapshot>;
  setHovered(surface: "pill" | "detail", hovered: boolean): void;
  refresh(): Promise<void>;
  quit(): Promise<void>;
  hideTrayMenu(): void;
  setDetailInteractiveHovered(hovered: boolean): void;
  reportDetailHeight(height: number): void;
  getSettings(): Promise<CompanionSettings>;
  onSettingsUpdated(listener: (settings: CompanionSettings) => void): () => void;
  setAutoStart(enabled: boolean): Promise<CompanionSettings>;
  getControlState(): Promise<ControlState>;
  onControlUpdated(listener: (state: ControlState) => void): () => void;
  updateSettings(patch: Partial<CompanionSettings>): Promise<ControlState>;
  exportDiagnostics(): Promise<DiagnosticExportResult>;
  openResetSource(url: string): Promise<boolean>;
  showControlCenter(): Promise<void>;
}
