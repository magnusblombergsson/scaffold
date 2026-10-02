import type { KeyboardEvent, PointerEvent } from 'react';

type Props = {
  label: string;
  /** The width of the panel to the left, in CSS pixels. */
  width: number;
  min: number;
  max: number;
  /** While dragging, and on each arrow key. */
  onResize(width: number): void;
  /** Once the Author lets go, with the width to remember. */
  onResized(width: number): void;
};

const KEY_STEP = 16;

/** A handle on the right edge of a panel; drag it, or use the arrow keys. */
export function PanelResizer({
  label,
  width,
  min,
  max,
  onResize,
  onResized,
}: Props) {
  const clamp = (value: number) =>
    Math.round(Math.min(max, Math.max(min, value)));

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const handle = event.currentTarget;
    const startX = event.clientX;
    let current = width;
    handle.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) => {
      current = clamp(width + e.clientX - startX);
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
    const next = clamp(width + step);
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
