import { describe, expect, it } from "vitest";
import { parseHistoryResponse, parseStatusResponse } from "../src/main/reset-radar-model";

const source = { type: "x_post", author: "thsottiaux", url: "https://x.com/thsottiaux/status/123" };

describe("reset radar model", () => {
  it("parses a complete status response and preserves the non-official watch", () => {
    const parsed = parseStatusResponse({ data: {
      latest_reset: { id: "123", announced_at: "2026-08-13T01:01:37.000Z", text: "Usage reset announced", source },
      active_watch: { level: "strong", reset_chance_percent: 72, forecast_window: "within 24h", observed_at: "2026-08-15T01:00:00.000Z", expires_at: "2026-08-16T01:00:00.000Z", text: "Watch signal", source },
      stats: { total: 43, last_reset_at: "2026-08-13T01:01:37.000Z", days_since_last: 2.6, avg_interval_days: 7.9 }
    } }, 1234);
    expect(parsed).toMatchObject({ fetchedAt: 1234, activeWatch: { level: "strong", chancePercent: 72 }, stats: { total: 43 } });
  });

  it("rejects an untrusted source URL instead of passing it to the renderer", () => {
    const parsed = parseHistoryResponse({ data: [{ id: "123", announced_at: "2026-08-13T01:01:37.000Z", text: "Reset", source: { ...source, url: "https://evil.example/reset" } }] });
    expect(parsed).toBeNull();
  });
});
