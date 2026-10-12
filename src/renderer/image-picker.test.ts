import { describe, expect, it } from 'vitest';
import type { ImageHolder, ProjectImage } from '../shared/project-types';
import { holdersLabel, imagesMatching, offersImage } from './image-picker';

const scene = (id: string, title: string): ImageHolder => ({
  kind: 'scene',
  id,
  title,
});
const image = (...holders: ImageHolder[]): ProjectImage => ({ holders });

const tankard: ImageHolder = {
  kind: 'entry',
  id: 'tankard',
  title: 'The Gilded Tankard',
};

describe('holdersLabel', () => {
  it('names the one unit holding it', () => {
    expect(holdersLabel([tankard])).toBe('The Gilded Tankard');
  });

  it('names the first, then up to two more, then how many others', () => {
    expect(
      holdersLabel([tankard, scene('a', 'Scene 3'), scene('b', 'Scene 7')]),
    ).toBe('The Gilded Tankard · Scene 3, Scene 7');
    expect(
      holdersLabel([
        tankard,
        scene('a', 'Scene 3'),
        scene('b', 'Scene 7'),
        ...Array.from({ length: 8 }, (_, i) => scene(`${i}`, `Scene ${i}`)),
      ]),
    ).toBe('The Gilded Tankard · Scene 3, Scene 7 +8 more');
  });
});

describe('imagesMatching', () => {
  const images = [
    image(tankard, scene('a', 'Harbour')),
    image(scene('b', 'The Storm')),
  ];

  it('keeps every image with no text typed', () => {
    expect(imagesMatching(images, '  ')).toEqual(images);
  });

  it('keeps those a holding unit’s name has the text in, ignoring case', () => {
    expect(imagesMatching(images, 'harb')).toEqual([images[0]]);
    expect(imagesMatching(images, 'THE')).toEqual(images);
    expect(imagesMatching(images, 'ship')).toEqual([]);
  });
});

describe('offersImage', () => {
  it('is whether any image is held by other units only', () => {
    const images = [image(scene('a', 'One'), scene('b', 'Two'))];
    expect(offersImage(images, { kind: 'scene', id: 'c' })).toBe(true);
    expect(offersImage(images, { kind: 'scene', id: 'a' })).toBe(false);
    expect(offersImage([], { kind: 'scene', id: 'c' })).toBe(false);
  });
});
