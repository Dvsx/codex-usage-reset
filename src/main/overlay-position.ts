const MAXIMIZED_PILL_TOP_OFFSET = 6;
const WINDOWED_PILL_TOP_OFFSET = 2;

export function pillTopOffset(maximized: boolean): number {
  return maximized ? MAXIMIZED_PILL_TOP_OFFSET : WINDOWED_PILL_TOP_OFFSET;
}
