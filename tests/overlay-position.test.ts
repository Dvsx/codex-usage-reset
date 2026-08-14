import { describe, expect, it } from "vitest";
import { pillTopOffset } from "../src/main/overlay-position";

describe("overlay position", () => {
  it("keeps the current maximized alignment", () => {
    expect(pillTopOffset(true)).toBe(6);
  });

  it("moves the pill upward in a normal window", () => {
    expect(pillTopOffset(false)).toBe(2);
  });
});
