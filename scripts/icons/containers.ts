/** A rendered PNG and its pixel size (square). */
export interface SizedPng {
  size: number;
  png: Buffer;
}

/**
 * A Windows .ico holding each image as PNG, which Windows reads at every
 * size since Vista.
 */
export function encodeIco(images: SizedPng[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    // 256 doesn't fit in a byte; 0 stands for it.
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

/**
 * The .icns types for PNG data at each pixel size. Retina types reuse the
 * image twice the size: 32 px is also 16@2x.
 */
const ICNS_TYPES: Record<number, string[]> = {
  16: ['icp4'],
  32: ['icp5', 'ic11'],
  64: ['icp6', 'ic12'],
  128: ['ic07'],
  256: ['ic08', 'ic13'],
  512: ['ic09', 'ic14'],
  1024: ['ic10'],
};

/** A macOS .icns holding each image as PNG under every type that fits it. */
export function encodeIcns(images: SizedPng[]): Buffer {
  const elements = images.flatMap(({ size, png }) => {
    const types = ICNS_TYPES[size];
    if (!types) throw new Error(`.icns has no type for ${size} px`);
    return types.map((type) => icnsElement(type, png));
  });
  return icnsElement('icns', Buffer.concat(elements));
}

/** A type code and big-endian length (counting this header), then the data. */
function icnsElement(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(type, 0, 'ascii');
  header.writeUInt32BE(header.length + data.length, 4);
  return Buffer.concat([header, data]);
}
