import { describe, expect, it } from "vitest";
import { clampOverlayToWorkArea, pillTopOffset } from "../src/main/overlay-position";

describe("overlay position", () => {
  it("keeps the current maximized alignment", () => {
    expect(pillTopOffset(true)).toBe(6);
  });

  it("moves the pill upward in a normal window", () => {
    expect(pillTopOffset(false)).toBe(2);
  });

  it("brings an off-screen overlay back into the current work area", () => {
    expect(clampOverlayToWorkArea(
      { x: 2800, y: -80, width: 340, height: 36 },
      { x: 0, y: 0, width: 1920, height: 1040 }
    )).toEqual({ x: 1580, y: 0, width: 340, height: 36 });
  });

  it("does not move an overlay that already fits the work area", () => {
    const bounds = { x: 790, y: 6, width: 340, height: 36 };
    expect(clampOverlayToWorkArea(bounds, { x: 0, y: 0, width: 1920, height: 1040 })).toEqual(bounds);
  });
});
