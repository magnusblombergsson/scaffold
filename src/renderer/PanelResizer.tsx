import type { KeyboardEvent, PointerEvent } from 'react';

type Props = {
  label: string;
  /** The width of the panel it resizes, in CSS pixels. */
  width: number;
  /** Which side of the handle that panel is on; the left by default. */
  panel?: 'left' | 'right';
  min: number;
  max: number;
  /** While dragging, and on each arrow key. */
  onResize(width: number): void;
  /** Once the Author lets go, with the width to remember. */
  onResized(width: number): void;
};

/** A pane's width, and what to call as the Author resizes it. */
export type PaneSize = Pick<Props, 'width' | 'onResize' | 'onResized'>;

const KEY_STEP = 16;

/**
 * A handle on the edge of a panel, its right edge for one on the left and its
 * left edge for one on the right; drag it, or use the arrow keys.
 */
export function PanelResizer({
  label,
  width,
  panel = 'left',
  min,
  max,
  onResize,
  onResized,
}: Props) {
  const clamp = (value: number) =>
    Math.round(Math.min(max, Math.max(min, value)));
  /** A panel on the right grows as the handle moves left. */
  const sign = panel === 'left' ? 1 : -1;

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const handle = event.currentTarget;
    const startX = event.clientX;
    let current = width;
    handle.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) => {
      current = clamp(width + sign * (e.clientX - startX));
      onResize(current);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      onResized(current);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function nudge(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = clamp(width + sign * step);
    onResize(next);
    onResized(next);
  }

  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={startDrag}
      onKeyDown={nudge}
    />
  );
}
