import { describe, expect, it } from 'vitest';
import { entryImageOf, imageDataUrl, type Picture } from './entry-image';

/** A picture of `width` × `height` whose pixels all have `alpha`. */
function picture(width: number, height: number, alpha = 255): Picture {
  return {
    isEmpty: () => width === 0 || height === 0,
    getSize: () => ({ width, height }),
    resize: (size) => picture(size.width, size.height, alpha),
    toBitmap: () => {
      const bitmap = Buffer.alloc(width * height * 4, 0x80);
      for (let i = 3; i < bitmap.length; i += 4) bitmap[i] = alpha;
      return bitmap;
    },
    toJPEG: () => Buffer.from(`jpeg ${width}x${height}`),
    toPNG: () => Buffer.from(`png ${width}x${height}`),
  };
}

const text = (data: Uint8Array) => Buffer.from(data).toString();

describe('an imported Entry image', () => {
  it('is scaled down to 1024 px on its longest side, keeping its shape', () => {
    expect(text(entryImageOf(picture(4000, 3000)).data)).toBe('jpeg 1024x768');
    expect(text(entryImageOf(picture(1500, 3000)).data)).toBe('jpeg 512x1024');
  });

  it('is never scaled up', () => {
    expect(text(entryImageOf(picture(300, 200)).data)).toBe('jpeg 300x200');
  });

  it('is a JPEG, or a PNG when it has transparency', () => {
    expect(entryImageOf(picture(10, 10)).extension).toBe('jpg');
    const clear = entryImageOf(picture(2048, 2048, 0));
    expect(clear.extension).toBe('png');
    expect(text(clear.data)).toBe('png 1024x1024');
  });

  it("refuses a file that isn't an image it can read", () => {
    expect(() => entryImageOf(picture(0, 0))).toThrow(/read/);
  });

  it('is shown as a data URL of its type', () => {
    const data = new Uint8Array([1, 2, 3]);
    expect(imageDataUrl({ data, extension: 'jpg' })).toBe(
      'data:image/jpeg;base64,AQID',
    );
    expect(imageDataUrl({ data, extension: 'png' })).toBe(
      'data:image/png;base64,AQID',
    );
  });
});
