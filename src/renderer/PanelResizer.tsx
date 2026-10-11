import type { KeyboardEvent, PointerEvent } from 'react';

type Props = {
  label: string;
  /** The size of the panel it resizes, its width or its height, in CSS pixels. */
  size: number;
  /**
   * Which side of the handle that panel is on; the left by default. A panel
   * above or below is resized by its height.
   */
  panel?: 'left' | 'right' | 'above' | 'below';
  min: number;
  max: number;
  /** While dragging, and on each arrow key. */
  onResize(size: number): void;
  /** Once the Author lets go, with the size to remember. */
  onResized(size: number): void;
};

/** A pane's size, and what to call as the Author resizes it. */
export type PaneSize = Pick<Props, 'size' | 'onResize' | 'onResized'>;

const KEY_STEP = 16;

/**
 * A handle on the edge of a panel, the edge facing the rest of the window:
 * drag it, or use the arrow keys, ←/→ beside a panel and ↑/↓ above or below
 * one.
 */
export function PanelResizer({
  label,
  size,
  panel = 'left',
  min,
  max,
  onResize,
  onResized,
}: Props) {
  const clamp = (value: number) =>
    Math.round(Math.min(max, Math.max(min, value)));
  const across = panel === 'above' || panel === 'below';
  /** A panel on the right or below grows as the handle moves towards it. */
  const sign = panel === 'left' || panel === 'above' ? 1 : -1;
  const at = (event: { clientX: number; clientY: number }) =>
    across ? event.clientY : event.clientX;

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const handle = event.currentTarget;
    const start = at(event);
    let current = size;
    handle.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) => {
      current = clamp(size + sign * (at(e) - start));
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
    const steps: Record<string, number> = across
      ? { ArrowUp: -KEY_STEP, ArrowDown: KEY_STEP }
      : { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    const next = clamp(size + sign * step);
    onResize(next);
    onResized(next);
  }

  return (
    <div
      className={`panel-resizer${across ? ' panel-resizer-across' : ''}`}
      role="separator"
      aria-orientation={across ? 'horizontal' : 'vertical'}
      aria-label={label}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={startDrag}
      onKeyDown={nudge}
    />
  );
}
