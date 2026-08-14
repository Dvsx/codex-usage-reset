import type {
  AccountUsageSummary,
  DailyUsageBucket,
  ResetCredit,
  ResetCreditsSnapshot,
  UsageSnapshot,
  UsageWindow
} from "../shared/types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function windowLabel(durationMins: number | null): string {
  if (durationMins === null) return "额度";
  if (durationMins === 300) return "5h";
  if (durationMins === 10_080) return "周";
  if (durationMins % 1_440 === 0) return `${durationMins / 1_440}d`;
  if (durationMins % 60 === 0) return `${durationMins / 60}h`;
  return `${durationMins}m`;
}

function parseWindow(value: unknown, key: string): UsageWindow | null {
  const record = asRecord(value);
  if (!record) return null;
  const used = finiteNumber(record.usedPercent);
  if (used === null) return null;
  const durationMins = finiteNumber(record.windowDurationMins);
  const resetsAt = finiteNumber(record.resetsAt);
  const usedPercent = clampPercent(used);
  return {
    key,
    label: windowLabel(durationMins),
    durationMins,
    usedPercent,
    remainingPercent: clampPercent(100 - used),
    resetsAt
  };
}

function selectCodexLimits(result: JsonRecord): JsonRecord | null {
  const byLimitId = asRecord(result.rateLimitsByLimitId);
  const codex = byLimitId ? asRecord(byLimitId.codex) : null;
  return codex ?? asRecord(result.rateLimits);
}

function parseResetCredits(value: unknown): ResetCreditsSnapshot | null {
  const record = asRecord(value);
  if (!record) return null;
  const count = finiteNumber(record.availableCount);
  if (count === null) return null;
  const rawCredits = Array.isArray(record.credits) ? record.credits : null;
  const credits: ResetCredit[] | null = rawCredits
    ? rawCredits.map((credit) => {
        const row = asRecord(credit) ?? {};
        return {
          id: nullableString(row.id),
          title: nullableString(row.title),
          status: nullableString(row.status),
          expiresAt: finiteNumber(row.expiresAt)
        };
      })
    : null;
  return { availableCount: Math.max(0, Math.trunc(count)), credits };
}

function optionalMetric(value: unknown): number | null {
  const number = finiteNumber(value);
  return number === null ? null : Math.max(0, Math.trunc(number));
}

function parseAccountUsage(value: unknown): {
  summary: AccountUsageSummary | null;
  dailyUsageBuckets: DailyUsageBucket[] | null;
} {
  const envelope = asRecord(value);
  const rawSummary = envelope ? asRecord(envelope.summary) : null;
  const summary = rawSummary
    ? {
        lifetimeTokens: optionalMetric(rawSummary.lifetimeTokens),
        peakDailyTokens: optionalMetric(rawSummary.peakDailyTokens),
        longestRunningTurnSec: optionalMetric(rawSummary.longestRunningTurnSec),
        currentStreakDays: optionalMetric(rawSummary.currentStreakDays),
        longestStreakDays: optionalMetric(rawSummary.longestStreakDays)
      }
    : null;

  const rawBuckets = envelope && Array.isArray(envelope.dailyUsageBuckets)
    ? envelope.dailyUsageBuckets
    : null;
  if (!rawBuckets) return { summary, dailyUsageBuckets: null };

  const byDate = new Map<string, DailyUsageBucket>();
  for (const value of rawBuckets) {
    const bucket = asRecord(value);
    const startDate = bucket ? nullableString(bucket.startDate) : null;
    const tokens = bucket ? finiteNumber(bucket.tokens) : null;
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || tokens === null || tokens < 0) continue;
    byDate.set(startDate, { startDate, tokens: Math.trunc(tokens) });
  }
  const dailyUsageBuckets = [...byDate.values()]
    .sort((left, right) => left.startDate.localeCompare(right.startDate))
    .slice(-7);
  return { summary, dailyUsageBuckets };
}

export function parseUsageSnapshot(
  accountResult: unknown,
  rateLimitResult: unknown,
  accountUsageResult: unknown = null,
  now = Date.now()
): UsageSnapshot {
  const accountEnvelope = asRecord(accountResult);
  const account = accountEnvelope ? asRecord(accountEnvelope.account) : null;
  if (!account) {
    return {
      status: "signed_out",
      planType: null,
      windows: [],
      resetCredits: null,
      usageSummary: null,
      dailyUsageBuckets: null,
      fetchedAt: now
    };
  }

  const result = asRecord(rateLimitResult) ?? {};
  const limits = selectCodexLimits(result);
  const windows: UsageWindow[] = [];
  if (limits) {
    const primary = parseWindow(limits.primary, "primary");
    const secondary = parseWindow(limits.secondary, "secondary");
    if (primary) windows.push(primary);
    if (secondary) windows.push(secondary);
  }
  windows.sort((left, right) => (left.durationMins ?? Number.MAX_SAFE_INTEGER) - (right.durationMins ?? Number.MAX_SAFE_INTEGER));

  const planType = nullableString(account.planType) ?? nullableString(limits?.planType);
  const accountUsage = parseAccountUsage(accountUsageResult);
  return {
    status: "ready",
    planType,
    windows,
    resetCredits: parseResetCredits(result.rateLimitResetCredits),
    usageSummary: accountUsage.summary,
    dailyUsageBuckets: accountUsage.dailyUsageBuckets,
    fetchedAt: now
  };
}

export function refreshFailedSnapshot(snapshot: UsageSnapshot, errorCode?: string): UsageSnapshot {
  return {
    ...snapshot,
    status: snapshot.status === "ready" || snapshot.status === "signed_out"
      ? snapshot.status
      : "unavailable",
    ...(errorCode ? { errorCode } : {})
  };
}
