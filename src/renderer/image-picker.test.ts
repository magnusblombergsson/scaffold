import { describe, expect, it } from 'vitest';
import type { ImageHolder, ProjectImage } from '../shared/project-types';
import {
  holderLabel,
  holdersLabel,
  imagesMatching,
  offersImage,
  sharesImage,
  skipMessage,
} from './image-picker';

const scene = (id: string, title: string): ImageHolder => ({
  kind: 'scene',
  id,
  title,
});
const image = (...holders: ProjectImage['holders']): ProjectImage => ({
  holders,
});

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

describe('sharesImage', () => {
  const a = scene('a', 'A');
  const images = [
    image(a, scene('b', 'B'), { ...scene('c', 'C'), drawer: true as const }),
    image(scene('d', 'D'), { ...scene('e', 'E'), drawer: true as const }),
    image(scene('f', 'F')),
  ];

  it('is true when another live unit holds an identical image', () => {
    expect(sharesImage(images, { kind: 'scene', id: 'a' })).toBe(true);
    expect(sharesImage(images, { kind: 'scene', id: 'b' })).toBe(true);
  });

  it('is false when only units in the Drawer do, or none', () => {
    expect(sharesImage(images, { kind: 'scene', id: 'd' })).toBe(false);
    expect(sharesImage(images, { kind: 'scene', id: 'f' })).toBe(false);
    expect(sharesImage(images, { kind: 'scene', id: 'z' })).toBe(false);
  });

  it('is false for an Evolution’s image', () => {
    const entries = [image(tankard, scene('a', 'A'))];
    expect(sharesImage(entries, { kind: 'entry', id: 'tankard' })).toBe(true);
    expect(
      sharesImage(entries, { kind: 'entry', id: 'tankard', book: 'two' }),
    ).toBe(false);
  });
});

describe('holderLabel', () => {
  it('names a unit by its kind and title', () => {
    expect(holderLabel(scene('a', 'Scene 7'))).toBe('Scene: Scene 7');
    expect(holderLabel(tankard)).toBe('Entry: The Gilded Tankard');
  });

  it('names a Part by what the Project calls one', () => {
    const one: ImageHolder = { kind: 'part', id: 'p', title: 'One' };
    expect(holderLabel(one)).toBe('Part: One');
    expect(holderLabel(one, 'act')).toBe('Act: One');
  });
});

describe('skipMessage', () => {
  const seven = scene('a', 'Scene 7');

  it('says why a unit was not changed', () => {
    expect(skipMessage(seven, 'trashed')).toBe(
      "Scene 7 was not changed: it's in Trash",
    );
    expect(skipMessage(seven, 'drawered')).toBe(
      "Scene 7 was not changed: it's in the Drawer",
    );
    expect(skipMessage(seven, 'gone')).toBe(
      "Scene 7 was not changed: it's no longer in the Project",
    );
    expect(skipMessage(seven, 'unwritable')).toBe(
      "Scene 7 was not changed: it couldn't be saved",
    );
  });
});
