import type { FloatingImage } from '../shared/api';
import { MARGIN, type Point, type Size } from './pinned-notes';

/** How wide the Floating image first floats, in CSS pixels. */
const FIRST_WIDTH = 280;
/** The narrowest the Author can make it. */
const LEAST_WIDTH = 120;
/** Where it first floats: this far in from the window's right, this far down. */
const FIRST_INSET = 24;
const FIRST_TOP = 80;

/** The Floating image moved, resized, folded or closed. */
export type ImageChange =
  | { type: 'move'; at: Point }
  | { type: 'resize'; width: number }
  | { type: 'fold'; folded: boolean }
  | { type: 'close' };

/**
 * The Floating image on: where it was left, as wide and as folded as it was,
 * or the first time near the window's top right, unfolded.
 */
export function floatImage(
  last: FloatingImage | undefined,
  room: Size,
): FloatingImage {
  return last
    ? { ...last, on: true }
    : {
        on: true,
        x: room.width - FIRST_WIDTH - FIRST_INSET,
        y: FIRST_TOP,
        width: FIRST_WIDTH,
        folded: false,
      };
}

/** The Floating image with `change` made. */
export function applyImageChange(
  image: FloatingImage,
  change: ImageChange,
): FloatingImage {
  switch (change.type) {
    case 'move':
      return { ...image, ...change.at };
    case 'resize':
      return { ...image, width: change.width };
    case 'fold':
      return { ...image, folded: change.folded };
    case 'close':
      return { ...image, on: false };
  }
}

/**
 * How wide the Floating image shows when the Author made it `width` wide:
 * never narrower than the least width, and narrow enough that the image, of
 * `ratio` width to height, and its header `chrome` high fit the window.
 * Without a ratio yet, only the window's width bounds it.
 */
export function fitWidth(
  width: number,
  ratio: number | null,
  room: Size,
  chrome: number,
): number {
  const wide = room.width - 2 * MARGIN;
  const high = ratio ? (room.height - 2 * MARGIN - chrome) * ratio : wide;
  return Math.max(LEAST_WIDTH, Math.min(width, wide, high));
}
