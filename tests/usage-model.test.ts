import { describe, expect, it } from "vitest";
import { clampPercent, parseUsageSnapshot, refreshFailedSnapshot, windowLabel } from "../src/main/usage-model";

const ACCOUNT = { account: { type: "chatgpt", planType: "pro" }, requiresOpenaiAuth: true };

describe("usage model", () => {
  it("prefers the codex limit id and converts used to remaining", () => {
    const snapshot = parseUsageSnapshot(ACCOUNT, {
      rateLimits: {
        primary: { usedPercent: 99, windowDurationMins: 60, resetsAt: 10 }
      },
      rateLimitsByLimitId: {
        codex: {
          primary: { usedPercent: 6.4, windowDurationMins: 300, resetsAt: 1_800_000_000 },
          secondary: { usedPercent: 34, windowDurationMins: 10_080, resetsAt: 1_800_100_000 }
        }
      }
    }, null, 1234);

    expect(snapshot.status).toBe("ready");
    expect(snapshot.planType).toBe("pro");
    expect(snapshot.windows).toEqual([
      expect.objectContaining({ label: "5h", usedPercent: 6, remainingPercent: 94 }),
      expect.objectContaining({ label: "周", usedPercent: 34, remainingPercent: 66 })
    ]);
    expect(snapshot.fetchedAt).toBe(1234);
  });

  it("supports one generic window without inventing a missing window", () => {
    const snapshot = parseUsageSnapshot(ACCOUNT, {
      rateLimits: {
        primary: { usedPercent: 22, windowDurationMins: 10_080, resetsAt: null },
        secondary: null
      }
    });
    expect(snapshot.windows).toHaveLength(1);
    expect(snapshot.windows[0]).toMatchObject({ label: "周", remainingPercent: 78, resetsAt: null });
  });

  it("parses reset credit counts with and without detail rows", () => {
    const detailed = parseUsageSnapshot(ACCOUNT, {
      rateLimits: { primary: null, secondary: null },
      rateLimitResetCredits: {
        availableCount: 2,
        credits: [{ id: "one", title: "Full reset", status: "available", expiresAt: 1_900_000_000 }]
      }
    });
    expect(detailed.resetCredits?.availableCount).toBe(2);
    expect(detailed.resetCredits?.credits?.[0]?.title).toBe("Full reset");

    const countOnly = parseUsageSnapshot(ACCOUNT, {
      rateLimits: { primary: null, secondary: null },
      rateLimitResetCredits: { availableCount: 3, credits: null }
    });
    expect(countOnly.resetCredits).toEqual({ availableCount: 3, credits: null });
  });

  it("parses account activity and keeps only the latest seven valid daily buckets", () => {
    const dailyUsageBuckets = Array.from({ length: 9 }, (_, index) => ({
      startDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
      tokens: (index + 1) * 1_000
    })).reverse();
    dailyUsageBuckets.push({ startDate: "invalid", tokens: 99 });

    const snapshot = parseUsageSnapshot(ACCOUNT, { rateLimits: {} }, {
      summary: { currentStreakDays: 11, longestStreakDays: 44 },
      dailyUsageBuckets
    }, 1234);

    expect(snapshot.usageSummary?.currentStreakDays).toBe(11);
    expect(snapshot.usageSummary?.longestStreakDays).toBe(44);
    expect(snapshot.dailyUsageBuckets).toHaveLength(7);
    expect(snapshot.dailyUsageBuckets?.[0]?.startDate).toBe("2026-08-03");
    expect(snapshot.dailyUsageBuckets?.[6]?.tokens).toBe(9_000);
  });

  it("reports signed out instead of turning missing data into zero", () => {
    const snapshot = parseUsageSnapshot({ account: null, requiresOpenaiAuth: true }, {});
    expect(snapshot.status).toBe("signed_out");
    expect(snapshot.windows).toEqual([]);
  });

  it("clamps percentages and labels arbitrary durations", () => {
    expect(clampPercent(-20)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(windowLabel(120)).toBe("2h");
    expect(windowLabel(2_880)).toBe("2d");
    expect(windowLabel(45)).toBe("45m");
    expect(windowLabel(null)).toBe("额度");
  });

  it("preserves ready data without exposing a stale state after a failed refresh", () => {
    const ready = parseUsageSnapshot(ACCOUNT, {
      rateLimits: { primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: null } }
    }, null, 5678);
    const failed = refreshFailedSnapshot(ready, "offline");
    expect(failed.status).toBe("ready");
    expect(failed.windows[0]?.remainingPercent).toBe(80);
    expect(failed.errorCode).toBe("offline");
  });
});
