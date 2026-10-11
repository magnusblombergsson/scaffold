import { describe, expect, it } from 'vitest';
import { composerBounds } from './composer-height';

const threeRows = 70;
const pane = 1000;

describe('composerBounds', () => {
  it('grows from 3 rows to 40% of the pane, never dragged', () => {
    expect(composerBounds({ dragged: null, threeRows, pane })).toEqual({
      min: 70,
      max: 400,
      dragMax: 700,
    });
  });

  it('keeps a dragged height as the least, still growing to 40%', () => {
    expect(composerBounds({ dragged: 200, threeRows, pane })).toMatchObject({
      min: 200,
      max: 400,
    });
  });

  it('grows no further than a dragged height above 40%', () => {
    expect(composerBounds({ dragged: 600, threeRows, pane })).toMatchObject({
      min: 600,
      max: 600,
    });
  });

  it('holds a dragged height within 3 rows and 70% of the pane', () => {
    expect(composerBounds({ dragged: 900, threeRows, pane })).toMatchObject({
      min: 700,
      max: 700,
    });
    expect(composerBounds({ dragged: 20, threeRows, pane })).toMatchObject({
      min: 70,
      max: 400,
    });
  });

  it('is never less than 3 rows in a short pane', () => {
    expect(composerBounds({ dragged: 300, threeRows, pane: 50 })).toEqual({
      min: 70,
      max: 70,
      dragMax: 70,
    });
  });
});
