import { describe, expect, it } from "vitest";
import { REFRESH_FAILURES_BEFORE_RECONNECT, refreshRetryDelay } from "../src/main/retry-policy";

describe("refresh retry policy", () => {
  it("retries transient failures quickly with bounded backoff", () => {
    expect(refreshRetryDelay(1)).toBe(1_000);
    expect(refreshRetryDelay(2)).toBe(2_000);
    expect(refreshRetryDelay(3)).toBe(5_000);
    expect(refreshRetryDelay(20)).toBe(30_000);
  });

  it("reconnects after repeated request failures", () => {
    expect(REFRESH_FAILURES_BEFORE_RECONNECT).toBe(3);
  });
});
