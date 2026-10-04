import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { renderIcons } from './render-icons';

// Stand-ins that fill the whole canvas, so the first pixel tells them apart.
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0000ff"/></svg>`;
const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <rect width="16" height="16" fill="#ff0000"/></svg>`;
const BLUE = [0, 0, 255, 255];
const RED = [255, 0, 0, 255];

const icons = renderIcons({ full, small });

describe('the rendered icons', () => {
  it('puts 16 to 256 in the .ico, with the small drawing at 16 and 24', () => {
    expect(
      icoImages(icons.ico).map((png) => [width(png), topLeft(png)]),
    ).toEqual([
      [16, RED],
      [24, RED],
      [32, BLUE],
      [48, BLUE],
      [64, BLUE],
      [128, BLUE],
      [256, BLUE],
    ]);
  });

  it('puts 16 to 1024 in the .icns, shrunk to Apple’s grid', () => {
    // Shrunk, the drawing leaves the corner at least partly clear (under a
    // pixel of margin at 16 px).
    const cornerClear = (png: Buffer) => topLeft(png)[3] < 255;
    expect(
      icnsImages(icons.icns).map(([type, png]) => [
        type,
        width(png),
        cornerClear(png),
      ]),
    ).toEqual([
      ['icp4', 16, true],
      ['icp5', 32, true],
      ['ic11', 32, true],
      ['icp6', 64, true],
      ['ic12', 64, true],
      ['ic07', 128, true],
      ['ic08', 256, true],
      ['ic13', 256, true],
      ['ic09', 512, true],
      ['ic14', 512, true],
      ['ic10', 1024, true],
    ]);
  });

  it('renders the Linux .png at 512 from the full drawing', () => {
    expect([width(icons.png), topLeft(icons.png)]).toEqual([512, BLUE]);
  });
});

function icoImages(ico: Buffer): Buffer[] {
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const entry = 6 + 16 * i;
    const offset = ico.readUInt32LE(entry + 12);
    return ico.subarray(offset, offset + ico.readUInt32LE(entry + 8));
  });
}

function icnsImages(icns: Buffer): [string, Buffer][] {
  const images: [string, Buffer][] = [];
  for (let at = 8; at < icns.length; at += icns.readUInt32BE(at + 4)) {
    const length = icns.readUInt32BE(at + 4);
    images.push([
      icns.toString('ascii', at, at + 4),
      icns.subarray(at + 8, at + length),
    ]);
  }
  return images;
}

function width(png: Buffer): number {
  return png.readUInt32BE(16);
}

/**
 * The first pixel as RGBA. Every PNG filter leaves it as stored, so it reads
 * straight after the first row's filter byte.
 */
function topLeft(png: Buffer): number[] {
  const data: Buffer[] = [];
  for (let at = 8; at < png.length; at += 12 + png.readUInt32BE(at)) {
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT') {
      data.push(png.subarray(at + 8, at + 8 + png.readUInt32BE(at)));
    }
  }
  return [...inflateSync(Buffer.concat(data)).subarray(1, 5)];
}
