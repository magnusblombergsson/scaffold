import { describe, expect, it } from 'vitest';
import { encodeIcns, encodeIco } from './containers';

const bytes = (...values: number[]) => Buffer.from(values);

describe('the Windows .ico', () => {
  it('lists each PNG in the directory and stores it after', () => {
    const ico = encodeIco([
      { size: 16, png: bytes(0xa1, 0xa2) },
      { size: 256, png: bytes(0xb1, 0xb2, 0xb3) },
    ]);
    expect([...ico]).toEqual([
      // Header: reserved, type 1 (icon), 2 images.
      0, 0, 1, 0, 2, 0,
      // 16 px: width, height, no palette, reserved, 1 plane, 32 bpp,
      // 2 bytes at offset 38.
      16, 16, 0, 0, 1, 0, 32, 0, 2, 0, 0, 0, 38, 0, 0, 0,
      // 256 px is written as 0; 3 bytes at offset 40.
      0, 0, 0, 0, 1, 0, 32, 0, 3, 0, 0, 0, 40, 0, 0, 0, 0xa1, 0xa2, 0xb1, 0xb2,
      0xb3,
    ]);
  });
});

describe('the macOS .icns', () => {
  it('stores each PNG under every type of that pixel size', () => {
    const icns = encodeIcns([
      { size: 16, png: bytes(0xa1) },
      { size: 32, png: bytes(0xb1, 0xb2) },
    ]);
    const ascii = (text: string) => [...Buffer.from(text, 'ascii')];
    expect([...icns]).toEqual([
      // 'icns' and the file length, big-endian.
      ...ascii('icns'),
      0,
      0,
      0,
      37,
      // 16 px: icp4. Each entry's length counts its 8-byte header.
      ...ascii('icp4'),
      0,
      0,
      0,
      9,
      0xa1,
      // 32 px is both 32 (icp5) and 16@2x (ic11).
      ...ascii('icp5'),
      0,
      0,
      0,
      10,
      0xb1,
      0xb2,
      ...ascii('ic11'),
      0,
      0,
      0,
      10,
      0xb1,
      0xb2,
    ]);
  });

  it('refuses a size macOS has no type for', () => {
    expect(() => encodeIcns([{ size: 48, png: bytes(0) }])).toThrow(/48/);
  });
});
