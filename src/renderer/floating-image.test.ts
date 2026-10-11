import { describe, expect, it } from 'vitest';
import type { FloatingImage } from '../shared/api';
import { applyImageChange, fitWidth, floatImage } from './floating-image';

const left: FloatingImage = {
  on: false,
  x: 40,
  y: 50,
  width: 200,
  folded: true,
};
const room = { width: 1000, height: 800 };

describe('floatImage', () => {
  it('floats the image where it was left, the size and fold it had', () => {
    expect(floatImage(left, room)).toEqual({ ...left, on: true });
  });

  it('floats it near the window’s top right the first time, unfolded', () => {
    expect(floatImage(undefined, room)).toEqual({
      on: true,
      x: 1000 - 280 - 24,
      y: 80,
      width: 280,
      folded: false,
    });
  });
});

describe('applyImageChange', () => {
  const on = { ...left, on: true };

  it('moves, resizes, folds or closes it', () => {
    expect(applyImageChange(on, { type: 'move', at: { x: 1, y: 2 } })).toEqual({
      ...on,
      x: 1,
      y: 2,
    });
    expect(applyImageChange(on, { type: 'resize', width: 320 })).toEqual({
      ...on,
      width: 320,
    });
    expect(applyImageChange(on, { type: 'fold', folded: false })).toEqual({
      ...on,
      folded: false,
    });
  });

  it('closes it where it is, to float there again', () => {
    expect(applyImageChange(on, { type: 'close' })).toEqual(left);
  });
});

describe('fitWidth', () => {
  it('keeps the width chosen when the image fits the window', () => {
    expect(fitWidth(300, 1.5, room, 40)).toBe(300);
  });

  it('is never narrower than the least width', () => {
    expect(fitWidth(20, 1.5, room, 40)).toBe(120);
  });

  it('narrows a wide image to the window’s width', () => {
    expect(fitWidth(2000, 4, room, 40)).toBe(1000 - 16);
  });

  it('narrows a tall image so that it and its header fit the window’s height', () => {
    // 800 high less the margins and the header leaves 744 for the image.
    expect(fitWidth(900, 0.5, room, 40)).toBe(744 * 0.5);
  });

  it('keeps the width when the image’s shape is not known yet', () => {
    expect(fitWidth(300, null, room, 40)).toBe(300);
  });
});
