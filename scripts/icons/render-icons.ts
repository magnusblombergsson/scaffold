import { Resvg } from '@resvg/resvg-js';
import { encodeIcns, encodeIco, type SizedPng } from './containers.ts';

/** Below 32 px the full drawing blurs; the small one is pixel-aligned. */
const SMALL_UP_TO = 24;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];
const LINUX_SIZE = 512;

/** The full drawing's tile, as a share of its canvas: 448 of 512. */
const FULL_TILE = 448 / 512;
/** Apple's grid puts the tile at about 824 of 1024, leaving room for a shadow. */
const APPLE_TILE = 824 / 1024;

/**
 * Renders the Windows .ico, macOS .icns and Linux .png from the two SVG
 * drawings: `full` (512 viewBox) and `small` (16 viewBox, for 16 and 24 px).
 */
export function renderIcons(drawings: { full: string; small: string }): {
  ico: Buffer;
  icns: Buffer;
  png: Buffer;
} {
  const appleGrid = shrinkCanvas(drawings.full, FULL_TILE / APPLE_TILE);
  return {
    ico: encodeIco(
      ICO_SIZES.map((size) =>
        render(size <= SMALL_UP_TO ? drawings.small : drawings.full, size),
      ),
    ),
    icns: encodeIcns(ICNS_SIZES.map((size) => render(appleGrid, size))),
    png: render(drawings.full, LINUX_SIZE).png,
  };
}

function render(svg: string, size: number): SizedPng {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
    .render()
    .asPng();
  return { size, png };
}

/** Widens the viewBox around its centre, so the drawing shrinks by `factor`. */
function shrinkCanvas(svg: string, factor: number): string {
  const match = /viewBox="0 0 (\d+) \1"/.exec(svg);
  if (!match) throw new Error('Expected a square viewBox from 0 0');
  const side = Number(match[1]);
  const wider = side * factor;
  const origin = (side - wider) / 2;
  return svg.replace(
    match[0],
    `viewBox="${origin} ${origin} ${wider} ${wider}"`,
  );
}
