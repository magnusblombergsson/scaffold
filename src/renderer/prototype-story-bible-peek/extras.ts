// PROTOTYPE (throwaway): the v2 Entry fields the app can't store yet (Role
// note, Appearance, an image), faked for the demo Project's Entries by name.

export type Extras = {
  roleNote?: string;
  appearance?: string;
  image?: { src: string; wide: boolean };
};

function portrait(hue: number, initials: string) {
  return svg(
    300,
    300,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 35% 70%)"/>
      <stop offset="1" stop-color="hsl(${hue} 30% 40%)"/></linearGradient></defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <circle cx="150" cy="120" r="55" fill="hsl(${hue} 20% 88%)"/>
    <path d="M40 300 C50 200 250 200 260 300 Z" fill="hsl(${hue} 20% 88%)"/>
    <text x="150" y="134" font-family="Georgia" font-size="42" text-anchor="middle"
      fill="hsl(${hue} 30% 35%)">${initials}</text>`,
  );
}

function landscape() {
  return svg(
    400,
    300,
    `<rect width="400" height="300" fill="#9fb3bf"/>
    <rect y="200" width="400" height="100" fill="#4d6470"/>
    <path d="M0 210 L120 170 L200 200 L400 160 L400 300 L0 300 Z" fill="#5d5a52"/>
    <rect x="250" y="70" width="34" height="110" fill="#f2efe6"/>
    <rect x="250" y="95" width="34" height="14" fill="#b54a3a"/>
    <rect x="250" y="130" width="34" height="14" fill="#b54a3a"/>
    <rect x="244" y="52" width="46" height="20" fill="#3a3a3a"/>
    <path d="M290 60 L400 30 L400 90 Z" fill="rgb(255 240 180 / 55%)"/>`,
  );
}

function svg(w: number, h: number, body: string) {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  )}`;
}

const EXTRAS: Record<string, Extras> = {
  'Maren Holm': {
    roleNote: 'lighthouse keeper’s daughter',
    appearance:
      'Twenty-six. Tall and a little stooped, as if apologising for it. Wind-red cheeks, chapped hands, a grey wool sweater that was her father’s. Hair the colour of wet sand, always tied back with whatever is to hand: string, a rubber band, once a bit of fishing line. Eyes that look past people, towards the water.',
    image: { src: portrait(200, 'MH'), wide: false },
  },
  'Aunt Liv': {
    roleNote: 'keeper of the secret',
    appearance:
      'Late sixties, small and round, quick on her feet. Reading glasses on a cord. Smells of cardamom and paraffin.',
    image: { src: portrait(20, 'L'), wide: false },
  },
  'Nils Berg': {
    roleNote: 'harbour master, lies badly',
    appearance:
      'Heavy, red-faced, a gold watch he winds whenever he is nervous.',
  },
  'The lighthouse': {
    image: { src: landscape(), wide: true },
  },
};

export function extrasOf(name: string): Extras {
  return EXTRAS[name] ?? {};
}
