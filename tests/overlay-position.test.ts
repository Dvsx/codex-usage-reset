import { describe, expect, it } from "vitest";
import { clampOverlayToWorkArea, pillTopOffset } from "../src/main/overlay-position";

describe("overlay position", () => {
  it("centers the visible capsule in the compact maximized title bar", () => {
    expect(pillTopOffset(true) + (3 + 31) / 2).toBe(36 / 2);
  });

  it("centers the visible capsule in the compact normal title bar", () => {
    expect(pillTopOffset(false) + (3 + 31) / 2).toBe(36 / 2);
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
