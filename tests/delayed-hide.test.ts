import { afterEach, describe, expect, it, vi } from "vitest";
import { DelayedHide } from "../src/main/delayed-hide";

describe("delayed overlay hide", () => {
  afterEach(() => vi.useRealTimers());

  it("does not postpone hiding when cursor polling schedules it repeatedly", () => {
    vi.useFakeTimers();
    const hide = vi.fn();
    const delayedHide = new DelayedHide(90, hide);

    delayedHide.schedule();
    vi.advanceTimersByTime(40);
    delayedHide.schedule();
    vi.advanceTimersByTime(40);
    delayedHide.schedule();
    vi.advanceTimersByTime(10);

    expect(hide).toHaveBeenCalledOnce();
  });

  it("cancels a pending hide when the cursor returns", () => {
    vi.useFakeTimers();
    const hide = vi.fn();
    const delayedHide = new DelayedHide(90, hide);

    delayedHide.schedule();
    vi.advanceTimersByTime(40);
    delayedHide.cancel();
    vi.advanceTimersByTime(100);

    expect(hide).not.toHaveBeenCalled();
  });
});
