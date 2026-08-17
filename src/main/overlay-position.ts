const MAXIMIZED_PILL_TOP_OFFSET = 6;
const WINDOWED_PILL_TOP_OFFSET = 2;

export interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pillTopOffset(maximized: boolean): number {
  return maximized ? MAXIMIZED_PILL_TOP_OFFSET : WINDOWED_PILL_TOP_OFFSET;
}

/** Keeps a transparent overlay fully reachable after a display or DPI change. */
export function clampOverlayToWorkArea(bounds: OverlayBounds, workArea: OverlayBounds): OverlayBounds {
  const maxX = workArea.x + Math.max(0, workArea.width - bounds.width);
  const maxY = workArea.y + Math.max(0, workArea.height - bounds.height);
  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, workArea.x), maxX),
    y: Math.min(Math.max(bounds.y, workArea.y), maxY)
  };
}
