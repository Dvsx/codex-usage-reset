// Legacy fallback only; measured content-region boundaries take precedence.
// The pill's visible CSS bounds are y=3..31 inside its 36 DIP window.
const MAXIMIZED_PILL_TOP_OFFSET = 1;
const WINDOWED_PILL_TOP_OFFSET = 1;

export interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pillTopOffset(maximized: boolean, captionCenterOffset?: number): number {
  // Visible capsule center is 17 DIP (CSS inset 3px top, 5px bottom).
  if (captionCenterOffset !== undefined && Number.isFinite(captionCenterOffset)
      && captionCenterOffset >= 12 && captionCenterOffset <= 64) {
    return Math.round(captionCenterOffset - 17);
  }
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
