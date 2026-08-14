const REFRESH_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

export const REFRESH_FAILURES_BEFORE_RECONNECT = 3;

export function refreshRetryDelay(failureCount: number): number {
  const index = Math.max(0, Math.trunc(failureCount) - 1);
  return REFRESH_RETRY_DELAYS_MS[Math.min(index, REFRESH_RETRY_DELAYS_MS.length - 1)] ?? 30_000;
}
