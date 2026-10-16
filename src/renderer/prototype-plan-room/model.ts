// PROTOTYPE (throwaway): the in-memory plan behind the Plan Room prototype
// (#300). A demo Book, a slice of the structure catalogue, the scripted Plan
// Conversation and the Proposal rules decided in #295, #296 and #297:
// "needs", Accept all in dependency order, staleness, edit before accepting,
// undo. Nothing is saved; nothing calls a Model. Never merge to main.

export type Kind = 'part' | 'chapter' | 'scene';

export type Unit = {
  id: string;
  kind: Kind;
  title: string;
  outline: string;
  notes: string;
  wordTarget?: number;
  /** Holds Prose: Plan sees the flag, never the words. */
  prose?: boolean;
  /** Beat ids, as a Unit detail of a Scene. */
  beats?: string[];
};

export type BookDetails = {
  /** A Structure id, 'none' for No set Structure, or null when not chosen yet. */
  structure: string | null;
  conventions: string[];
  genres: string[];
  format: string | null;
  wordTarget: number;
};

export type PlanState = {
  units: Record<string, Unit>;
  /** 'book' holds the Parts, a Part its Chapters, a Chapter its Scenes. */
  children: Record<string, string[]>;
  trash: Record<string, Place>;
  book: BookDetails;
};

export type Place = { parent: string; after: string | null };

// ---------------------------------------------------------------- catalogue
// Paraphrased from docs/research/story-structures.md on research/story-structures.

export type Beat = {
  id: string;
  name: string;
  purpose: string;
  /** Where it should fall, in % of the Book; null when only its order counts. */
  at: [number, number] | null;
  /** Takes a run of Scenes rather than one. */
  run?: boolean;
  /** Opens a Part (an Act), for act-based Structures. */
  opensPart?: boolean;
};

export type Fits = {
  genres: string[];
  formats: string[];
  /** Whether it works per Book or across a Series too. */
  span: 'Book' | 'Book or Series';
};

export type Structure = {
  id: string;
  name: string;
  credit: string;
  description: string;
  fits: Fits;
  beats: Beat[];
};

export type Convention = {
  id: string;
  name: string;
  genre: string;
  credit: string;
  description: string;
  /** Required Scenes, marked on Scenes as Beats. */
  beats: Beat[];
  /** Order and position rules, checked but never marked. */
  rules: string[];
};

const ALL_GENRES = [
  'Mystery',
  'Crime',
  'Thriller',
  'Horror',
  'Fantasy',
  'Science fiction',
  'Romance',
  'Literary',
  'Other',
];

export const STRUCTURES: Structure[] = [
  {
    id: 'three-act',
    name: 'Three-act',
    credit: 'common usage, after Aristotle and Syd Field',
    description:
      'Setup, confrontation and resolution, turned at about a quarter and three quarters, with a reversal in the middle. The common denominator the other Structures refine.',
    fits: {
      genres: ALL_GENRES,
      formats: ['Novelette', 'Novella', 'Novel'],
      span: 'Book',
    },
    beats: [
      {
        id: 'three-act-setup',
        name: 'Setup',
        purpose: 'The lead, their world and what they want.',
        at: [0, 23],
        run: true,
        opensPart: true,
      },
      {
        id: 'three-act-turn1',
        name: 'First turning point',
        purpose: 'Something commits the lead to the story.',
        at: [22, 27],
      },
      {
        id: 'three-act-midpoint',
        name: 'Midpoint',
        purpose: 'A reversal that changes what the struggle is about.',
        at: [47, 53],
      },
      {
        id: 'three-act-turn2',
        name: 'Second turning point',
        purpose: 'The low point that forces the final push.',
        at: [72, 78],
        opensPart: true,
      },
      {
        id: 'three-act-climax',
        name: 'Climax',
        purpose: 'The struggle is decided.',
        at: [85, 95],
        run: true,
      },
      {
        id: 'three-act-resolution',
        name: 'Resolution',
        purpose: 'What the ending leaves behind.',
        at: [95, 100],
      },
    ],
  },
  {
    id: 'four-part',
    name: 'Four-part',
    credit: 'after K. M. Weiland and Larry Brooks',
    description:
      'Four quarters: setup, response, attack, resolution. The lead reacts in the second quarter and takes charge in the third; pinch points show the opposition’s strength.',
    fits: {
      genres: [
        'Mystery',
        'Crime',
        'Thriller',
        'Horror',
        'Fantasy',
        'Science fiction',
        'Romance',
      ],
      formats: ['Novella', 'Novel'],
      span: 'Book or Series',
    },
    beats: [
      {
        id: 'hook',
        name: 'Hook',
        purpose: 'A question the reader wants answered.',
        at: [0, 3],
        opensPart: true,
      },
      {
        id: 'inciting',
        name: 'Inciting event',
        purpose: 'The world tilts; the lead notices.',
        at: [8, 15],
      },
      {
        id: 'pp1',
        name: 'First plot point',
        purpose: 'The lead commits; no way back.',
        at: [20, 27],
        opensPart: true,
      },
      {
        id: 'pinch1',
        name: 'First pinch point',
        purpose: 'The opposition shows its strength.',
        at: [33, 40],
      },
      {
        id: 'midpoint',
        name: 'Midpoint',
        purpose: 'From reacting to acting; the truth glimpsed.',
        at: [47, 53],
        opensPart: true,
      },
      {
        id: 'pinch2',
        name: 'Second pinch point',
        purpose: 'The opposition closes in.',
        at: [58, 65],
      },
      {
        id: 'pp3',
        name: 'Third plot point',
        purpose: 'All seems lost; the last piece arrives.',
        at: [72, 78],
        opensPart: true,
      },
      {
        id: 'climax',
        name: 'Climax',
        purpose: 'The confrontation decides it.',
        at: [85, 95],
        run: true,
      },
      {
        id: 'resolution',
        name: 'Resolution',
        purpose: 'The new normal.',
        at: [96, 100],
      },
    ],
  },
  {
    id: 'save-the-cat',
    name: 'Save the Cat',
    credit: 'after Blake Snyder and Jessica Brody',
    description:
      'Fifteen beats with tight positions, some a single Scene and some a run. The most precise of the Structures, so the easiest to check.',
    fits: {
      genres: [
        'Mystery',
        'Crime',
        'Thriller',
        'Horror',
        'Fantasy',
        'Science fiction',
        'Romance',
      ],
      formats: ['Novella', 'Novel'],
      span: 'Book',
    },
    beats: [
      {
        id: 'stc-opening',
        name: 'Opening image',
        purpose: 'A snapshot of the lead before the change.',
        at: [0, 1],
        opensPart: true,
      },
      {
        id: 'stc-theme',
        name: 'Theme stated',
        purpose: 'Someone hints at what the lead must learn.',
        at: [3, 7],
      },
      {
        id: 'stc-setup',
        name: 'Setup',
        purpose: 'The lead’s world and what is wrong with it.',
        at: [1, 10],
        run: true,
      },
      {
        id: 'stc-catalyst',
        name: 'Catalyst',
        purpose: 'The event that upends that world.',
        at: [9, 11],
      },
      {
        id: 'stc-debate',
        name: 'Debate',
        purpose: 'The lead hesitates.',
        at: [10, 20],
        run: true,
      },
      {
        id: 'stc-break2',
        name: 'Break into 2',
        purpose: 'The lead chooses to act.',
        at: [19, 21],
        opensPart: true,
      },
      {
        id: 'stc-bstory',
        name: 'B story',
        purpose: 'A second story, often a relationship, carrying the theme.',
        at: [21, 23],
      },
      {
        id: 'stc-fun',
        name: 'Fun and games',
        purpose: 'The premise delivered.',
        at: [20, 50],
        run: true,
      },
      {
        id: 'stc-midpoint',
        name: 'Midpoint',
        purpose: 'A false victory or false defeat; stakes rise.',
        at: [49, 51],
      },
      {
        id: 'stc-badguys',
        name: 'Bad guys close in',
        purpose: 'Pressure from outside and doubt from inside.',
        at: [50, 75],
        run: true,
      },
      {
        id: 'stc-lost',
        name: 'All is lost',
        purpose: 'The lowest point.',
        at: [74, 76],
      },
      {
        id: 'stc-dark',
        name: 'Dark night of the soul',
        purpose: 'The lead absorbs the loss.',
        at: [75, 80],
        run: true,
      },
      {
        id: 'stc-break3',
        name: 'Break into 3',
        purpose: 'The answer, often from the B story.',
        at: [79, 81],
        opensPart: true,
      },
      {
        id: 'stc-finale',
        name: 'Finale',
        purpose: 'The lead acts on what they learned.',
        at: [80, 99],
        run: true,
      },
      {
        id: 'stc-final',
        name: 'Final image',
        purpose: 'The opening image, changed.',
        at: [99, 100],
      },
    ],
  },
  {
    id: 'seven-point',
    name: 'Seven-point',
    credit: 'after Dan Wells',
    description:
      'Seven points in order, designed from the ends: settle the resolution, make the hook its opposite, then fill the middle. Works per plot line as well as for the whole Book.',
    fits: {
      genres: ['Fantasy', 'Science fiction', 'Thriller', 'Mystery'],
      formats: ['Novelette', 'Novella', 'Novel'],
      span: 'Book or Series',
    },
    beats: [
      {
        id: 'seven-hook',
        name: 'Hook',
        purpose: 'The opposite of where the story ends.',
        at: null,
      },
      {
        id: 'seven-turn1',
        name: 'Plot turn 1',
        purpose: 'What sets the story moving.',
        at: null,
      },
      {
        id: 'seven-pinch1',
        name: 'Pinch 1',
        purpose: 'Pressure that forces the lead to act.',
        at: null,
      },
      {
        id: 'seven-midpoint',
        name: 'Midpoint',
        purpose: 'From reacting to acting.',
        at: null,
      },
      {
        id: 'seven-pinch2',
        name: 'Pinch 2',
        purpose: 'Things get worse; the plan fails.',
        at: null,
      },
      {
        id: 'seven-turn2',
        name: 'Plot turn 2',
        purpose: 'The last piece the lead needs.',
        at: null,
      },
      {
        id: 'seven-resolution',
        name: 'Resolution',
        purpose: 'The end the story was designed from.',
        at: null,
      },
    ],
  },
  {
    id: 'heros-journey',
    name: 'Hero’s Journey',
    credit: 'after Joseph Campbell and Christopher Vogler',
    description:
      'Twelve stages of a journey out of the ordinary world and back, laid over three acts. Stages may be reordered, merged or skipped.',
    fits: {
      genres: ['Fantasy', 'Science fiction'],
      formats: ['Novel'],
      span: 'Book or Series',
    },
    beats: [
      {
        id: 'hj-ordinary',
        name: 'Ordinary world',
        purpose: 'Where the hero starts.',
        at: null,
        opensPart: true,
      },
      {
        id: 'hj-call',
        name: 'Call to adventure',
        purpose: 'The challenge arrives.',
        at: null,
      },
      {
        id: 'hj-refusal',
        name: 'Refusal of the call',
        purpose: 'The hero holds back.',
        at: null,
      },
      {
        id: 'hj-mentor',
        name: 'Meeting the mentor',
        purpose: 'Help, advice or a gift.',
        at: null,
      },
      {
        id: 'hj-threshold',
        name: 'Crossing the threshold',
        purpose: 'The hero commits and leaves.',
        at: null,
        opensPart: true,
      },
      {
        id: 'hj-tests',
        name: 'Tests, allies, enemies',
        purpose: 'Learning the rules of the new world.',
        at: null,
        run: true,
      },
      {
        id: 'hj-approach',
        name: 'Approach',
        purpose: 'Preparing for the central ordeal.',
        at: null,
      },
      {
        id: 'hj-ordeal',
        name: 'Ordeal',
        purpose: 'A brush with death, near the middle.',
        at: null,
      },
      {
        id: 'hj-reward',
        name: 'Reward',
        purpose: 'What surviving the ordeal brings.',
        at: null,
      },
      {
        id: 'hj-road',
        name: 'The road back',
        purpose: 'Consequences chase the hero home.',
        at: null,
        opensPart: true,
      },
      {
        id: 'hj-resurrection',
        name: 'Resurrection',
        purpose: 'A final test that proves the change.',
        at: null,
      },
      {
        id: 'hj-return',
        name: 'Return with the elixir',
        purpose: 'What the hero brings back.',
        at: null,
      },
    ],
  },
  {
    id: 'freytag',
    name: 'Freytag’s pyramid',
    credit: 'after Gustav Freytag',
    description:
      'Five parts, symmetrical, with the climax in the middle and the second half following its consequences. Suits stories whose turn is central; fits most genre novels poorly.',
    fits: {
      genres: ['Literary', 'Horror', 'Other'],
      formats: ['Short story', 'Novelette', 'Novella'],
      span: 'Book',
    },
    beats: [
      {
        id: 'freytag-intro',
        name: 'Introduction',
        purpose: 'The situation and its people.',
        at: [0, 20],
        run: true,
      },
      {
        id: 'freytag-rising',
        name: 'Rising action',
        purpose: 'Complications build.',
        at: [20, 45],
        run: true,
      },
      {
        id: 'freytag-climax',
        name: 'Climax',
        purpose: 'The turn, at the centre.',
        at: [45, 55],
      },
      {
        id: 'freytag-falling',
        name: 'Falling action',
        purpose: 'The consequences unfold.',
        at: [55, 85],
        run: true,
      },
      {
        id: 'freytag-end',
        name: 'Catastrophe or resolution',
        purpose: 'Where it all lands.',
        at: [85, 100],
      },
    ],
  },
  {
    id: 'fichtean',
    name: 'Fichtean curve',
    credit: 'after John Gardner',
    description:
      'No long setup: it opens in a crisis and climbs through worse ones to the climax, with backstory fed in along the way and a short ending.',
    fits: {
      genres: ['Thriller', 'Horror', 'Crime', 'Other'],
      formats: [
        'Flash fiction',
        'Short story',
        'Novelette',
        'Novella',
        'Novel',
      ],
      span: 'Book',
    },
    beats: [
      {
        id: 'fichtean-open',
        name: 'Opening crisis',
        purpose: 'Start in trouble.',
        at: [0, 5],
      },
      {
        id: 'fichtean-crises',
        name: 'Rising crises',
        purpose: 'Each worse than the last.',
        at: [5, 85],
        run: true,
      },
      {
        id: 'fichtean-climax',
        name: 'Climax',
        purpose: 'The worst crisis, decided.',
        at: [85, 95],
      },
      {
        id: 'fichtean-falling',
        name: 'Falling action',
        purpose: 'A short ending.',
        at: [95, 100],
      },
    ],
  },
  {
    id: 'kishotenketsu',
    name: 'Kishōtenketsu',
    credit: 'East Asian tradition',
    description:
      'Four parts that need no conflict: introduce, develop, a twist whose link is not yet clear, then the reconciliation that shows how it fits.',
    fits: {
      genres: ['Literary', 'Fantasy', 'Other'],
      formats: ['Flash fiction', 'Short story', 'Novelette', 'Novella'],
      span: 'Book',
    },
    beats: [
      {
        id: 'kish-ki',
        name: 'Ki',
        purpose: 'Introduction.',
        at: [0, 25],
        run: true,
      },
      {
        id: 'kish-sho',
        name: 'Shō',
        purpose: 'Development.',
        at: [25, 50],
        run: true,
      },
      {
        id: 'kish-ten',
        name: 'Ten',
        purpose: 'A twist, seemingly unrelated.',
        at: [50, 75],
        run: true,
      },
      {
        id: 'kish-ketsu',
        name: 'Ketsu',
        purpose: 'Reconciliation: how the twist belongs.',
        at: [75, 100],
        run: true,
      },
    ],
  },
];

export const CONVENTIONS: Convention[] = [
  {
    id: 'mystery',
    name: 'Mystery (fair play)',
    genre: 'Mystery',
    credit: 'after S. S. Van Dine, Ronald Knox and the Detection Club',
    description:
      'The reader could solve it: everything the solution uses is shown first.',
    beats: [
      {
        id: 'mystery.crime',
        name: 'The crime',
        purpose: 'The puzzle is set.',
        at: [0, 15],
      },
      {
        id: 'mystery.clue',
        name: 'Fair clue',
        purpose: 'A clue the reader could use.',
        at: null,
      },
      {
        id: 'mystery.reveal',
        name: 'The reveal',
        purpose: 'The solution, from clues shown.',
        at: [85, 98],
      },
    ],
    rules: [
      'Every clue the reveal uses is shown before it.',
      'The culprit appears early and plays a real part.',
      'No solution by coincidence, sudden confession or the supernatural.',
      'The detective is not the culprit.',
    ],
  },
  {
    id: 'crime',
    name: 'Crime',
    genre: 'Crime',
    credit: 'after Shawn Coyne',
    description: 'A crime, someone who pursues it, and its exposure.',
    beats: [
      {
        id: 'crime.crime',
        name: 'The crime',
        purpose: 'What starts it.',
        at: [0, 15],
      },
      {
        id: 'crime.exposure',
        name: 'The exposure',
        purpose: 'The criminal is revealed or caught.',
        at: [85, 98],
      },
    ],
    rules: [
      'An investigator drives the story.',
      'In an inverted story, the slip that convicts is shown.',
    ],
  },
  {
    id: 'thriller',
    name: 'Thriller',
    genre: 'Thriller',
    credit: 'after Shawn Coyne',
    description:
      'A threat larger than a crime, aimed at the hero, against a clock.',
    beats: [
      {
        id: 'thriller.inciting',
        name: 'Inciting crime',
        purpose: 'A sign of a larger threat.',
        at: [0, 12],
      },
      {
        id: 'thriller.villain',
        name: 'The villain’s power shown',
        purpose: 'Why the hero should fear them.',
        at: null,
      },
      {
        id: 'thriller.mercy',
        name: 'Hero at the villain’s mercy',
        purpose: 'The scene it all builds to.',
        at: [72, 85],
      },
      {
        id: 'thriller.false',
        name: 'False ending',
        purpose: 'It seems over; it isn’t.',
        at: [90, 98],
      },
    ],
    rules: [
      'The hero, or someone dear, becomes the target.',
      'A clock is ticking.',
    ],
  },
  {
    id: 'horror',
    name: 'Horror',
    genre: 'Horror',
    credit: 'after Noël Carroll and Shawn Coyne',
    description:
      'A monster found, disbelieved and confronted. Stages may double or merge.',
    beats: [
      {
        id: 'horror.onset',
        name: 'Onset',
        purpose: 'The monster’s presence shown.',
        at: [0, 15],
      },
      {
        id: 'horror.discovery',
        name: 'Discovery',
        purpose: 'The characters learn of it.',
        at: null,
      },
      {
        id: 'horror.confirmation',
        name: 'Confirmation',
        purpose: 'Others must be convinced, and aren’t.',
        at: null,
      },
      {
        id: 'horror.mercy',
        name: 'Victim at the monster’s mercy',
        purpose: 'The scene it all builds to.',
        at: [72, 88],
      },
      {
        id: 'horror.false',
        name: 'False ending',
        purpose: 'The monster returns.',
        at: [90, 100],
      },
    ],
    rules: [
      'Discovery comes before confirmation, confirmation before the confrontation.',
    ],
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    genre: 'Fantasy',
    credit: 'after Brandon Sanderson',
    description: 'Promises set up before payoff, magic included.',
    beats: [
      {
        id: 'fantasy.promise',
        name: 'The promise',
        purpose: 'What kind of story this will be.',
        at: [0, 10],
      },
      {
        id: 'fantasy.payoff',
        name: 'The payoff',
        purpose: 'The promise kept.',
        at: [85, 100],
      },
    ],
    rules: [
      'The middle shows visible progress on the promises.',
      'Magic that solves the climax is set up earlier.',
    ],
  },
  {
    id: 'romance',
    name: 'Romance',
    genre: 'Romance',
    credit: 'after Romance Writers of America and Gwen Hayes',
    description: 'A central love story with an optimistic ending.',
    beats: [
      {
        id: 'romance.meet',
        name: 'The leads meet',
        purpose: 'Where it starts.',
        at: [0, 25],
      },
      {
        id: 'romance.midpoint',
        name: 'Midpoint of love',
        purpose: 'A first real intimacy or acknowledgement.',
        at: [45, 55],
      },
      {
        id: 'romance.breakup',
        name: 'The break-up',
        purpose: 'The low point.',
        at: [70, 80],
      },
      {
        id: 'romance.gesture',
        name: 'Grand gesture',
        purpose: 'One of them fights for it.',
        at: [85, 95],
      },
      {
        id: 'romance.ending',
        name: 'Happy ending',
        purpose: 'Happy ever after, or happy for now.',
        at: [95, 100],
      },
    ],
    rules: [
      'The love story is the main plot, not a subplot.',
      'The ending is happy ever after or happy for now.',
    ],
  },
];

/** Whether a Structure fits the Book: what the app shortlists before any Model sees the catalogue. */
export function fitsBook(s: Structure, book: BookDetails) {
  return (
    (!book.format || s.fits.formats.includes(book.format)) &&
    (book.genres.length === 0 ||
      book.genres.some((g) => s.fits.genres.includes(g)))
  );
}

export const GENRES = [
  'Mystery',
  'Crime',
  'Thriller',
  'Horror',
  'Fantasy',
  'Science fiction',
  'Romance',
  'Literary',
  'Other',
];
export const FORMATS = [
  'Flash fiction',
  'Short story',
  'Novelette',
  'Novella',
  'Novel',
];

/** The Beats the Book follows now: its Structure's, then its conventions'. */
export function activeBeats(book: BookDetails): (Beat & { from: string })[] {
  const structure = STRUCTURES.find((s) => s.id === book.structure);
  return [
    ...(structure?.beats ?? []).map((b) => ({ ...b, from: structure!.name })),
    ...CONVENTIONS.filter((c) => book.conventions.includes(c.id)).flatMap((c) =>
      c.beats.map((b) => ({ ...b, from: c.name })),
    ),
  ];
}

export function beatName(id: string): string {
  for (const s of STRUCTURES)
    for (const b of s.beats) if (b.id === id) return b.name;
  for (const c of CONVENTIONS)
    for (const b of c.beats) if (b.id === id) return b.name;
  return id;
}

export function structureName(id: string | null): string {
  if (id === null) return 'Not chosen yet';
  if (id === 'none') return 'No set Structure';
  return STRUCTURES.find((s) => s.id === id)?.name ?? id;
}

// ---------------------------------------------------------------- demo Book

function u(
  id: string,
  kind: Kind,
  title: string,
  outline: string,
  extra: Partial<Unit> = {},
): Unit {
  return { id, kind, title, outline, notes: '', ...extra };
}

export function demoState(): PlanState {
  const list: Unit[] = [
    u('p1', 'part', 'The Logbook', 'Maren finds what her father hid.'),
    u('c1', 'chapter', 'Fog at Dawn', 'The lamp fails; the logbook surfaces.', {
      notes: 'Keep the father offstage the whole chapter.',
    }),
    u(
      's1',
      'scene',
      'The tampered lamp',
      'Maren climbs the tower; the lamp has been tampered with.',
      { wordTarget: 3000, prose: true },
    ),
    u(
      's2',
      'scene',
      'The loose board',
      'She finds the logbook under the floor; the last entry is torn out.',
      { wordTarget: 3000, prose: true },
    ),
    u(
      's3',
      'scene',
      'Supper with Aunt Liv',
      'Liv deflects every question about 1962.',
      {
        wordTarget: 2500,
        prose: true,
        notes: 'Liv is kind, not sinister. Yet.',
      },
    ),
    u('c2', 'chapter', 'The Last Entry', 'What the torn page said.'),
    u(
      's4',
      'scene',
      'Night reading',
      'Maren reads the logbook through the night.',
      { wordTarget: 2500, prose: true },
    ),
    u(
      's5',
      'scene',
      'The harbourmaster',
      'Maren decides to find out what happened to the Sólveig.',
      { wordTarget: 3000, prose: true },
    ),
    u(
      'c3',
      'chapter',
      'Who Remembers 1962',
      'Records and the one man who will talk.',
    ),
    u(
      's6',
      'scene',
      'The church records',
      'The crew list has a name scratched out.',
      { wordTarget: 3500 },
    ),
    u(
      's7',
      'scene',
      'Old Teodor',
      'Teodor says the light was out that night, on purpose.',
      { wordTarget: 3000 },
    ),
    u('p2', 'part', 'The Village', 'Everyone remembers a different wreck.'),
    u('c4', 'chapter', 'Every Wreck Different', 'Three versions of the night.'),
    u(
      's8',
      'scene',
      'Market day',
      'Maren asks around; three stories that cannot all be true.',
      { wordTarget: 3000 },
    ),
    u(
      's9',
      'scene',
      'The second logbook',
      'The harbour office has its own log, with a different hour.',
      { wordTarget: 3500 },
    ),
    u('s10', 'scene', 'Liv lies', 'Liv says she was on the quay that night.', {
      wordTarget: 3000,
    }),
    u('c5', 'chapter', 'Storm Warnings', 'The village closes ranks.'),
    u(
      's11',
      'scene',
      'The radio room',
      'Someone wiped the radio log; Maren is warned off.',
      { wordTarget: 3500 },
    ),
    u(
      's12',
      'scene',
      'Teodor drowns',
      'Teodor is found under the pier; Maren stops asking and starts hunting.',
      { wordTarget: 4000 },
    ),
    u(
      's13',
      'scene',
      'Maren alone',
      'Cut off from everyone, she rereads the logbook.',
      { wordTarget: 2500 },
    ),
    u('c6', 'chapter', 'Loose ends', ''),
    u(
      'c7',
      'chapter',
      'The Lamp Relit',
      'The truth, on the gallery of the tower.',
    ),
    u(
      's14',
      'scene',
      'The confrontation',
      'Maren relights the lamp and names who put it out in 1962.',
      { wordTarget: 4000 },
    ),
    u('s15', 'scene', 'Morning', 'The village wakes to a lit tower.', {
      wordTarget: 2000,
    }),
  ];
  return {
    units: Object.fromEntries(list.map((x) => [x.id, x])),
    children: {
      book: ['p1', 'p2'],
      p1: ['c1', 'c2', 'c3'],
      p2: ['c4', 'c5', 'c6', 'c7'],
      c1: ['s1', 's2', 's3'],
      c2: ['s4', 's5'],
      c3: ['s6', 's7'],
      c4: ['s8', 's9', 's10'],
      c5: ['s11', 's12', 's13'],
      c6: [],
      c7: ['s14', 's15'],
    },
    trash: {},
    book: {
      structure: null,
      conventions: [],
      genres: ['Mystery'],
      format: 'Novel',
      wordTarget: 80000,
    },
  };
}

export const BOOK_TITLE = 'The Lantern Keeper';

// ---------------------------------------------------------------- tree helpers

export function placeOf(state: PlanState, id: string): Place | null {
  for (const [parent, ids] of Object.entries(state.children)) {
    const i = ids.indexOf(id);
    if (i >= 0) return { parent, after: i === 0 ? null : ids[i - 1] };
  }
  return null;
}

export function exists(state: PlanState, id: string) {
  return id === 'book' || placeOf(state, id) !== null;
}

function insert(state: PlanState, id: string, { parent, after }: Place) {
  const ids = (state.children[parent] ??= []);
  const i = after === null ? 0 : ids.indexOf(after) + 1;
  // An anchor gone lands it at the end.
  if (after !== null && i === 0) ids.push(id);
  else ids.splice(i, 0, id);
}

function detach(state: PlanState, id: string) {
  for (const ids of Object.values(state.children)) {
    const i = ids.indexOf(id);
    if (i >= 0) ids.splice(i, 1);
  }
}

/** Whether the unit holds Prose, or contains a unit that does. */
export function holdsProse(state: PlanState, id: string): boolean {
  if (state.units[id]?.prose) return true;
  return (state.children[id] ?? []).some((c) => holdsProse(state, c));
}

/** The Scenes in reading order, with where each falls in % of the Book. */
export function scenePositions(state: PlanState) {
  const scenes: string[] = [];
  const walk = (id: string) => {
    for (const c of state.children[id] ?? []) {
      if (state.units[c].kind === 'scene') scenes.push(c);
      else walk(c);
    }
  };
  walk('book');
  const byWords =
    scenes.length > 0 && scenes.every((s) => state.units[s].wordTarget);
  const total = byWords
    ? scenes.reduce((n, s) => n + state.units[s].wordTarget!, 0)
    : scenes.length;
  let at = 0;
  const out = scenes.map((id) => {
    const size = byWords ? state.units[id].wordTarget! : 1;
    const row = {
      id,
      start: (at / total) * 100,
      end: ((at + size) / total) * 100,
    };
    at += size;
    return row;
  });
  return {
    scenes: out,
    measure: byWords ? 'planned words' : 'Scene order',
    total,
  };
}

export function parentOf(state: PlanState, id: string) {
  return placeOf(state, id)?.parent ?? null;
}

// ---------------------------------------------------------------- Proposals

export type Op =
  | {
      op: 'add';
      unit: string;
      kind: Kind;
      title: string;
      outline: string;
      at: Place;
      wordTarget?: number;
      beats?: string[];
    }
  | { op: 'move'; unit: string; to: Place; from: Place }
  | { op: 'retitle'; unit: string; from: string; title: string }
  | { op: 'trash'; unit: string; signature: string }
  | { op: 'notes'; unit: string; text: string }
  | { op: 'beats'; unit: string; from: string[]; beats: string[] }
  | { op: 'structure'; from: string | null; structure: string }
  | { op: 'conventions'; from: string[]; conventions: string[] }
  | { op: 'wordTarget'; unit: string; from?: number; value: number };

export type ProposalState = 'pending' | 'accepted' | 'rejected';

export type Proposal = Op & {
  id: string;
  /** The reply it came in. */
  reply: number;
  needs: string[];
  state: ProposalState;
  edited?: boolean;
  /** What undo needs, recorded on accepting. */
  placedAt?: Place;
};

function signature(state: PlanState, id: string) {
  const x = state.units[id];
  return JSON.stringify([x.title, x.outline, state.children[id] ?? []]);
}

export function title(
  state: PlanState,
  id: string,
  proposals: Proposal[] = [],
) {
  if (state.units[id]) return state.units[id].title;
  const add = proposals.find((p) => p.op === 'add' && p.unit === id);
  return add && add.op === 'add' ? add.title : id;
}

export function kindName(kind: Kind) {
  return kind === 'part' ? 'Part' : kind === 'chapter' ? 'Chapter' : 'Scene';
}

/** Where a Place is, in words: “after X in Y” or “first in Y”. */
export function placeText(
  state: PlanState,
  place: Place,
  proposals: Proposal[],
) {
  const where =
    place.parent === 'book'
      ? BOOK_TITLE
      : title(state, place.parent, proposals);
  return place.after
    ? `after “${title(state, place.after, proposals)}” in “${where}”`
    : `first in “${where}”`;
}

/** One line saying what the Proposal does. */
export function summary(
  state: PlanState,
  p: Proposal,
  proposals: Proposal[],
): string {
  const t = (id: string) => `“${title(state, id, proposals)}”`;
  switch (p.op) {
    case 'add':
      return `Add ${kindName(p.kind)} “${p.title}” ${placeText(state, p.at, proposals)}`;
    case 'move':
      return `Move ${t(p.unit)} ${placeText(state, p.to, proposals)}`;
    case 'retitle':
      return `Retitle “${p.from}” as “${p.title}”`;
    case 'trash':
      return `Put ${t(p.unit)} in Trash`;
    case 'notes':
      return `Add to the Notes of ${t(p.unit)}`;
    case 'beats':
      return p.beats.length
        ? `Mark ${t(p.unit)} as ${p.beats.map(beatName).join(', ')}`
        : `Clear the Beats of ${t(p.unit)}`;
    case 'structure':
      return `Follow ${structureName(p.structure)}`;
    case 'conventions':
      return `Follow the Genre conventions ${p.conventions
        .map((c) => CONVENTIONS.find((x) => x.id === c)?.name)
        .join(', ')}`;
    case 'wordTarget':
      return `Set the Word target of ${t(p.unit)} to ${p.value.toLocaleString('en')} words`;
  }
}

/** Why the Proposal is stale, if it is. */
export function staleness(state: PlanState, p: Proposal): string | null {
  if (p.state !== 'pending') return null;
  switch (p.op) {
    case 'move': {
      const now = placeOf(state, p.unit);
      if (!now) return 'The unit is gone.';
      // Judged by container only: by "after X", a Move accepted just before
      // in the same batch would make its siblings' Moves stale (#300).
      if (now.parent !== p.from.parent) return 'The unit has moved since.';
      if (p.to.after && !exists(state, p.to.after))
        return 'Its anchor is gone.';
      return null;
    }
    case 'retitle':
      return state.units[p.unit]?.title !== p.from
        ? 'The title has changed since.'
        : null;
    case 'trash':
      if (!exists(state, p.unit)) return 'The unit is gone.';
      return signature(state, p.unit) !== p.signature
        ? 'The unit has changed since.'
        : null;
    case 'beats':
      return JSON.stringify(state.units[p.unit]?.beats ?? []) !==
        JSON.stringify(p.from)
        ? 'Its Beats have changed since.'
        : null;
    case 'structure':
      return state.book.structure !== p.from
        ? 'The Structure has changed since.'
        : null;
    case 'conventions':
      return JSON.stringify(state.book.conventions) !== JSON.stringify(p.from)
        ? 'The Genre conventions have changed since.'
        : null;
    case 'wordTarget':
      return state.units[p.unit]?.wordTarget !== p.from
        ? 'The Word target has changed since.'
        : null;
    default:
      return null;
  }
}

/** A Proposal named shortly, as what another needs: “the new Chapter “X””. */
function needLabel(state: PlanState, p: Proposal, proposals: Proposal[]) {
  if (p.op === 'add') return `the new ${kindName(p.kind)} “${p.title}”`;
  if (p.op === 'move')
    return `the move of “${title(state, p.unit, proposals)}”`;
  return `“${summary(state, p, proposals)}”`;
}

/** Why the Proposal can't be accepted now, if it can't. */
export function blocked(
  state: PlanState,
  p: Proposal,
  proposals: Proposal[],
): string | null {
  const waiting = p.needs
    .map((id) => proposals.find((x) => x.id === id)!)
    .filter((x) => x.state !== 'accepted');
  if (waiting.length)
    return `Needs ${waiting.map((x) => needLabel(state, x, proposals)).join(' and ')} first`;
  if (p.op === 'trash' && holdsProse(state, p.unit))
    return 'It holds Prose now.';
  if (
    p.op === 'add' &&
    (!exists(state, p.at.parent) || state.trash[p.at.parent])
  )
    return 'Its container is gone.';
  return null;
}

/** The plan with the Proposal applied, and where an added or moved unit went. */
export function apply(
  state: PlanState,
  p: Proposal,
): { state: PlanState; placedAt?: Place } {
  const s: PlanState = structuredClone(state);
  switch (p.op) {
    case 'add': {
      s.units[p.unit] = {
        id: p.unit,
        kind: p.kind,
        title: p.title,
        outline: p.outline,
        notes: '',
        ...(p.wordTarget && { wordTarget: p.wordTarget }),
        ...(p.beats && { beats: p.beats }),
      };
      if (p.kind !== 'scene') s.children[p.unit] = [];
      insert(s, p.unit, p.at);
      return { state: s, placedAt: placeOf(s, p.unit)! };
    }
    case 'move': {
      detach(s, p.unit);
      insert(s, p.unit, p.to);
      return { state: s, placedAt: placeOf(s, p.unit)! };
    }
    case 'retitle':
      s.units[p.unit].title = p.title;
      return { state: s };
    case 'trash':
      s.trash[p.unit] = placeOf(s, p.unit)!;
      detach(s, p.unit);
      return { state: s };
    case 'notes': {
      const x = s.units[p.unit];
      x.notes = x.notes ? `${x.notes}\n${p.text}` : p.text;
      return { state: s };
    }
    case 'beats':
      s.units[p.unit].beats = p.beats;
      return { state: s };
    case 'structure':
      s.book.structure = p.structure;
      return { state: s };
    case 'conventions':
      s.book.conventions = p.conventions;
      return { state: s };
    case 'wordTarget':
      s.units[p.unit].wordTarget = p.value;
      return { state: s };
  }
}

/** Why an accepted Proposal can't be undone, if it can't. */
export function undoBlocked(
  state: PlanState,
  p: Proposal,
  proposals: Proposal[],
): string | null {
  const needing = proposals.filter(
    (x) => x.state === 'accepted' && x.needs.includes(p.id),
  );
  if (needing.length)
    return `${needLabel(state, needing[0], proposals).replace(/^./, (c) => c.toUpperCase())} needs it.`;
  switch (p.op) {
    case 'add':
      return holdsProse(state, p.unit) ? 'It holds Prose now.' : null;
    case 'move': {
      const now = placeOf(state, p.unit);
      return !now || JSON.stringify(now) !== JSON.stringify(p.placedAt)
        ? 'It has moved since.'
        : null;
    }
    case 'retitle':
      return state.units[p.unit]?.title !== p.title
        ? 'The title has changed since.'
        : null;
    case 'trash':
      return state.trash[p.unit] ? null : 'It is no longer in Trash.';
    case 'notes':
      return state.units[p.unit]?.notes.endsWith(p.text)
        ? null
        : 'The Notes have changed since.';
    case 'beats':
      return JSON.stringify(state.units[p.unit]?.beats ?? []) ===
        JSON.stringify(p.beats)
        ? null
        : 'Its Beats have changed since.';
    case 'structure':
      return state.book.structure === p.structure
        ? null
        : 'The Structure has changed since.';
    case 'conventions':
      return null;
    case 'wordTarget':
      return state.units[p.unit]?.wordTarget === p.value
        ? null
        : 'The Word target has changed since.';
  }
}

export function unapply(state: PlanState, p: Proposal): PlanState {
  const s: PlanState = structuredClone(state);
  switch (p.op) {
    case 'add':
      detach(s, p.unit);
      delete s.units[p.unit];
      break;
    case 'move':
      detach(s, p.unit);
      insert(s, p.unit, p.from);
      break;
    case 'retitle':
      s.units[p.unit].title = p.from;
      break;
    case 'trash':
      insert(s, p.unit, s.trash[p.unit]);
      delete s.trash[p.unit];
      break;
    case 'notes': {
      const x = s.units[p.unit];
      x.notes = x.notes
        .slice(0, x.notes.length - p.text.length)
        .replace(/\n$/, '');
      break;
    }
    case 'beats':
      s.units[p.unit].beats = p.from;
      break;
    case 'structure':
      s.book.structure = p.from;
      break;
    case 'conventions':
      s.book.conventions = p.from;
      break;
    case 'wordTarget':
      s.units[p.unit].wordTarget = p.from;
      break;
  }
  return s;
}

/**
 * The plan as it would be with every pending Proposal of `reply` (all
 * replies when absent) accepted in dependency order, leaving out stale ones
 * and those needing them. What Accept all does, and what a preview shows.
 */
export function acceptAll(
  state: PlanState,
  proposals: Proposal[],
  reply?: number,
): { state: PlanState; proposals: Proposal[] } {
  let s = state;
  let ps = proposals.map((p) => ({ ...p }));
  for (let progress = true; progress; ) {
    progress = false;
    for (const p of ps) {
      if (p.state !== 'pending' || (reply !== undefined && p.reply !== reply))
        continue;
      if (staleness(s, p) || blocked(s, p, ps)) continue;
      const done = apply(s, p);
      s = done.state;
      p.state = 'accepted';
      p.placedAt = done.placedAt;
      progress = true;
    }
  }
  return { state: s, proposals: ps };
}

// ---------------------------------------------------------------- the script

export type Finding = { text: string; units: string[]; question: string };

export type Message = {
  role: 'author' | 'assistant' | 'marker';
  text: string;
  findings?: Finding[];
  proposals?: string[];
  /** The replies the Author may send next, as buttons. */
  next?: string[];
};

/**
 * What the Assistant says to each prepared message. The Proposals it brings
 * are made against the plan at the time it replies, so staleness is real.
 */
export function reply(
  said: string,
  state: PlanState,
  replyNo: number,
): { message: Message; proposals: Proposal[] } {
  const base = {
    reply: replyNo,
    state: 'pending' as const,
    needs: [] as string[],
  };
  const id = (n: string) => `r${replyNo}-${n}`;
  if (said === 'Find a structure') {
    return {
      message: {
        role: 'assistant',
        text: 'For a Mystery Novel of about 80,000 words I recommend **Four-part**: its Midpoint suits a detective who stops reacting and starts hunting, and its pinch points give the village room to close ranks. Follow it with the **Mystery (fair play)** Genre convention, so every clue the reveal uses is shown first.\n\nAlternatives: **Three-act** if you want fewer fixed points, or **Save the Cat** for a tighter beat list.',
        next: ['Check my plan'],
      },
      proposals: [
        {
          ...base,
          id: id('structure'),
          op: 'structure',
          from: state.book.structure,
          structure: 'four-part',
        },
        {
          ...base,
          id: id('conventions'),
          op: 'conventions',
          from: state.book.conventions,
          conventions: ['mystery'],
        },
      ],
    };
  }
  if (said === 'Check my plan') {
    const words = scenePositions(state);
    const planned = words.scenes.length
      ? Object.values(state.units).reduce(
          (n, x) =>
            n +
            (x.kind === 'scene' && placeOf(state, x.id)
              ? (x.wordTarget ?? 0)
              : 0),
          0,
        )
      : 0;
    const marked = Object.values(state.units).some((x) => x.beats?.length);
    return {
      message: {
        role: 'assistant',
        text: `A Plan check of the Book, measured by ${words.measure}. ${marked ? '' : 'No Scene is marked with Beats yet, so I read from the Outlines where they seem to fall. '}Most consequential first:`,
        findings: [
          {
            text: 'No Midpoint. Nothing near the middle turns Maren from asking to hunting; “Teodor drowns” does, but falls at about 80%.',
            units: ['s12'],
            question: 'Should Teodor’s death move to the middle of the Book?',
          },
          {
            text: 'The tampered lamp is the clue the reveal rests on, and it is never seen again between “The tampered lamp” and “The confrontation”. Fair play wants it shown.',
            units: ['s1', 's14'],
            question:
              'Shall I add a Scene where Maren looks at the lamp again?',
          },
          {
            text: '“Loose ends” has no Scenes and no Outline.',
            units: ['c6'],
            question: 'Is it a placeholder, or can it go?',
          },
          {
            text: `The Book plans ${planned.toLocaleString('en')} words against a Word target of 80,000; Part Two is thin against the Beats it has to carry.`,
            units: ['p2'],
            question: 'Keep the target and grow Part Two, or lower the target?',
          },
          {
            text: '“The harbourmaster” reads as the First plot point (Maren commits) and sits where it should, at about 30%.',
            units: ['s5'],
            question: 'Mark it as the First plot point?',
          },
        ],
        next: ['Fix the Midpoint, the clue and the empty Chapter'],
      },
      proposals: [],
    };
  }
  // The batch.
  const ch = id('chapter');
  const lampScene = id('scene');
  const p = {
    move12: id('move-teodor'),
    addCh: id('add-chapter'),
    move10: id('move-liv'),
    addSc: id('add-scene'),
    retitle: id('retitle'),
    trash: id('trash'),
    beats12: id('beats-teodor'),
    beats5: id('beats-harbour'),
    notes: id('notes'),
    target: id('target'),
  };
  const proposals: Proposal[] = [
    {
      ...base,
      id: p.move12,
      op: 'move',
      unit: 's12',
      from: placeOf(state, 's12')!,
      to: { parent: 'c4', after: 's9' },
    },
    {
      ...base,
      id: p.addCh,
      op: 'add',
      unit: ch,
      kind: 'chapter',
      title: 'After the Drowning',
      outline: 'The village turns on Maren; Liv’s story starts to crack.',
      at: { parent: 'p2', after: 'c4' },
    },
    {
      ...base,
      id: p.move10,
      needs: [p.addCh],
      op: 'move',
      unit: 's10',
      from: placeOf(state, 's10')!,
      to: { parent: ch, after: null },
    },
    {
      ...base,
      id: p.addSc,
      needs: [p.addCh, p.move10],
      op: 'add',
      unit: lampScene,
      kind: 'scene',
      title: 'The lamp’s wiring',
      outline: 'Maren takes the lamp apart; the cut is too clean for a storm.',
      at: { parent: ch, after: 's10' },
      wordTarget: 3000,
      beats: ['mystery.clue'],
    },
    {
      ...base,
      id: p.retitle,
      op: 'retitle',
      unit: 'c4',
      from: state.units.c4.title,
      title: 'The Drowned Man',
    },
    {
      ...base,
      id: p.trash,
      op: 'trash',
      unit: 'c6',
      signature: signature(state, 'c6'),
    },
    {
      ...base,
      id: p.beats12,
      op: 'beats',
      unit: 's12',
      from: state.units.s12.beats ?? [],
      beats: ['midpoint'],
    },
    {
      ...base,
      id: p.beats5,
      op: 'beats',
      unit: 's5',
      from: state.units.s5.beats ?? [],
      beats: ['pp1'],
    },
    {
      ...base,
      id: p.notes,
      op: 'notes',
      unit: 'c5',
      text: 'Now builds to the Second pinch point, not to a death.',
    },
    {
      ...base,
      id: p.target,
      op: 'wordTarget',
      unit: 's14',
      from: state.units.s14.wordTarget,
      value: 6000,
    },
  ];
  return {
    message: {
      role: 'assistant',
      text: 'Here is a way to do it. Teodor’s death moves into “Every Wreck Different”, right after the second logbook, which puts it near the middle; a new Chapter after it takes Liv’s lie and a Scene where Maren finds the lamp was cut. “Loose ends” goes.\n\nI think “Supper with Aunt Liv” could go too, but it holds Prose, so that is yours to decide.',
    },
    proposals,
  };
}
