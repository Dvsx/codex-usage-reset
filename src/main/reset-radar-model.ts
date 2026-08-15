import type { ResetAnnouncement, ResetRadarSnapshot, ResetRadarStats, ResetWatch } from "../shared/types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : null; }
function string(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function sourceUrl(value: unknown): string | null {
  const source = asRecord(value);
  const url = string(source?.url);
  if (!url) return null;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && parsed.hostname === "x.com" ? parsed.href : null; } catch { return null; }
}

export function parseAnnouncement(value: unknown): ResetAnnouncement | null {
  const item = asRecord(value);
  const id = string(item?.id), announcedAt = string(item?.announced_at), text = string(item?.text), url = sourceUrl(item?.source);
  return id && announcedAt && text && url ? { id, announcedAt, text, sourceUrl: url } : null;
}

export function parseWatch(value: unknown): ResetWatch | null {
  const item = asRecord(value);
  const level = string(item?.level);
  const forecastWindow = string(item?.forecast_window), observedAt = string(item?.observed_at), expiresAt = string(item?.expires_at), text = string(item?.text), url = sourceUrl(item?.source);
  const chancePercent = item?.reset_chance_percent == null ? null : number(item.reset_chance_percent);
  if ((level !== "elevated" && level !== "strong") || !forecastWindow || !observedAt || !expiresAt || !text || !url || (chancePercent != null && (chancePercent < 0 || chancePercent > 100))) return null;
  return { level, chancePercent, forecastWindow, observedAt, expiresAt, text, sourceUrl: url };
}

export function parseStats(value: unknown): ResetRadarStats | null {
  const item = asRecord(value);
  const total = number(item?.total), daysSinceLast = item?.days_since_last == null ? null : number(item.days_since_last), avgIntervalDays = item?.avg_interval_days == null ? null : number(item.avg_interval_days);
  const lastResetAt = item?.last_reset_at == null ? null : string(item.last_reset_at);
  if (total == null || total < 0 || daysSinceLast != null && daysSinceLast < 0 || avgIntervalDays != null && avgIntervalDays < 0 || item?.last_reset_at != null && !lastResetAt) return null;
  return { total, lastResetAt, daysSinceLast, avgIntervalDays };
}

export function parseStatusResponse(value: unknown, fetchedAt = Date.now()): Pick<ResetRadarSnapshot, "latestReset" | "activeWatch" | "stats" | "fetchedAt"> | null {
  const root = asRecord(value), data = asRecord(root?.data);
  if (!data) return null;
  const latestReset = data.latest_reset == null ? null : parseAnnouncement(data.latest_reset);
  const activeWatch = data.active_watch == null ? null : parseWatch(data.active_watch);
  const stats = parseStats(data.stats);
  if (data.latest_reset != null && !latestReset || data.active_watch != null && !activeWatch || !stats) return null;
  return { latestReset, activeWatch, stats, fetchedAt };
}

export function parseHistoryResponse(value: unknown): ResetAnnouncement[] | null {
  const root = asRecord(value), data = root ? root.data : null;
  if (!Array.isArray(data)) return null;
  const items = data.map(parseAnnouncement);
  return items.every((item): item is ResetAnnouncement => item !== null) ? items : null;
}
