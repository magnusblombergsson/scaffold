/** The window edge whose chrome is shown in zen: the header or the status bar. */
export type ChromeEdge = 'top' | 'bottom';

/** How close to an edge, in CSS pixels, the pointer reveals its chrome. */
const AT_EDGE = 8;
/** How far from each edge revealed chrome reaches, so it stays while pointed at. */
const HEADER_HEIGHT = 60;
const STATUS_BAR_HEIGHT = 40;

/**
 * The chrome zen shows with the pointer at `y` in a window `height` high,
 * `now` showing: the header or status bar slides in at its edge, and stays
 * while the pointer is over it.
 */
export function revealedEdge(
  y: number,
  height: number,
  now: ChromeEdge | null,
): ChromeEdge | null {
  if (y < AT_EDGE || (now === 'top' && y < HEADER_HEIGHT)) return 'top';
  if (
    y >= height - AT_EDGE ||
    (now === 'bottom' && y >= height - STATUS_BAR_HEIGHT)
  ) {
    return 'bottom';
  }
  return null;
}
