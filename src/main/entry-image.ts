import type { EntryImage, ImageExtension } from '../shared/project-types';

/** The longest side, in pixels, an imported Entry image is scaled down to. */
export const IMAGE_SIZE = 1024;

/** The JPEG quality an imported Entry image is stored at. */
const JPEG_QUALITY = 85;

/** What importing needs of an image; Electron's `NativeImage` has it. */
export interface Picture {
  isEmpty(): boolean;
  getSize(): { width: number; height: number };
  resize(size: { width: number; height: number; quality: 'best' }): Picture;
  /** Four bytes a pixel, alpha last. */
  toBitmap(): Buffer;
  toJPEG(quality: number): Buffer;
  toPNG(): Buffer;
}

/**
 * An image as an Entry stores it: no larger than `IMAGE_SIZE` on its longest
 * side, and a JPEG, or a PNG when it has transparency.
 */
export function entryImageOf(picture: Picture): EntryImage {
  if (picture.isEmpty()) {
    throw new Error("Scaffold can't read this image. Choose a JPEG or PNG.");
  }
  const { width, height } = picture.getSize();
  const scale = Math.min(1, IMAGE_SIZE / Math.max(width, height));
  const scaled =
    scale < 1
      ? picture.resize({
          width: Math.round(width * scale),
          height: Math.round(height * scale),
          quality: 'best',
        })
      : picture;
  return hasTransparency(scaled.toBitmap())
    ? { data: new Uint8Array(scaled.toPNG()), extension: 'png' }
    : { data: new Uint8Array(scaled.toJPEG(JPEG_QUALITY)), extension: 'jpg' };
}

function hasTransparency(bitmap: Buffer): boolean {
  for (let i = 3; i < bitmap.length; i += 4) {
    if (bitmap[i] < 255) return true;
  }
  return false;
}

/** Each stored image's media type. */
export const MEDIA_TYPES: Record<ImageExtension, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
};

/** The image as a `data:` URL, as the renderer shows it. */
export function imageDataUrl({ data, extension }: EntryImage): string {
  const base64 = Buffer.from(data).toString('base64');
  return `data:${MEDIA_TYPES[extension]};base64,${base64}`;
}

/** PNG's signature, then its header chunk's length and type. */
const PNG_START = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

/**
 * A stored image's size in pixels, from its header; null when it says
 * nothing readable.
 */
export function imageSize({
  data,
  extension,
}: EntryImage): { width: number; height: number } | null {
  const bytes = Buffer.from(data);
  if (extension === 'png') {
    if (bytes.length < 24 || !bytes.subarray(0, 16).equals(PNG_START)) {
      return null;
    }
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  // A JPEG's segments each start with 0xFF, a marker and their length; a
  // frame header (SOF0 to SOF15, but for DHT, JPG and DAC) holds the size.
  let at = 2;
  while (at + 9 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        width: bytes.readUInt16BE(at + 7),
        height: bytes.readUInt16BE(at + 5),
      };
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return null;
}
