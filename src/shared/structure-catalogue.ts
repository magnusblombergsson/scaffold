import type { BookDetails } from './project-types';

// The built-in catalogue (spec: Outline planner §2): the Structures a Book
// may follow, the Genre conventions it may follow beside one, and the Genres
// and Formats it may have. Every entry keeps its commonly known name, credits
// its source and is described in the tool's own words: no text is copied from
// the books. Every id is a fixed slug, never reused or renamed (§11); a later
// revision that drops or merges one maps the old id in OLD_IDS.

export type GenreId =
  | 'mystery'
  | 'crime'
  | 'thriller'
  | 'horror'
  | 'fantasy'
  | 'science-fiction'
  | 'romance'
  | 'literary'
  | 'other';

export type FormatId =
  | 'flash-fiction'
  | 'short-story'
  | 'novelette'
  | 'novella'
  | 'novel';

export type Genre = { id: GenreId; name: string };

/** A length class, with its rough band of words: from `min`, up to `max`. */
export type Format = {
  id: FormatId;
  name: string;
  words: { min?: number; max?: number };
};

/**
 * One step of a Structure, or a Scene a Genre convention requires: what it
 * does, where it falls as a share of the Book in % (none when only its order
 * among the others counts), whether it takes one Scene or a run of them,
 * and, in a Structure built on acts, whether it opens a Part.
 */
export type Beat = {
  id: string;
  name: string;
  purpose: string;
  at?: { from: number; to: number };
  span: 'scene' | 'run';
  opensPart?: true;
};

/**
 * A named pattern of Beats. `fits` is information only: the Genres and
 * Formats it suits, and whether it is used per Book, across a Series, or
 * both.
 */
export type Structure = {
  id: string;
  name: string;
  credit: string;
  /** Two lines on what it is. */
  description: string;
  fits: {
    genres: readonly GenreId[];
    formats: readonly FormatId[];
    across: 'book' | 'series' | 'both';
  };
  beats: readonly Beat[];
};

/**
 * What a Genre's readers expect: Scenes that must exist (its Beats), and
 * rules of order and position, which are never marked on a Scene.
 */
export type GenreConvention = {
  id: string;
  name: string;
  credit: string;
  description: string;
  genre: GenreId;
  beats: readonly Beat[];
  rules: readonly string[];
};

/** The Structure value of a Book that chose No set Structure. */
export const NO_STRUCTURE = 'none';

export const GENRES: readonly Genre[] = [
  { id: 'mystery', name: 'Mystery' },
  { id: 'crime', name: 'Crime' },
  { id: 'thriller', name: 'Thriller' },
  { id: 'horror', name: 'Horror' },
  { id: 'fantasy', name: 'Fantasy' },
  { id: 'science-fiction', name: 'Science fiction' },
  { id: 'romance', name: 'Romance' },
  { id: 'literary', name: 'Literary' },
  { id: 'other', name: 'Other' },
];

// The bands of the SFWA's Nebula rules, with flash fiction below 1,000.
export const FORMATS: readonly Format[] = [
  { id: 'flash-fiction', name: 'Flash fiction', words: { max: 999 } },
  { id: 'short-story', name: 'Short story', words: { min: 1000, max: 7499 } },
  { id: 'novelette', name: 'Novelette', words: { min: 7500, max: 17499 } },
  { id: 'novella', name: 'Novella', words: { min: 17500, max: 39999 } },
  { id: 'novel', name: 'Novel', words: { min: 40000 } },
];

const GENRE_FICTION: readonly GenreId[] = [
  'mystery',
  'crime',
  'thriller',
  'horror',
  'fantasy',
  'science-fiction',
  'romance',
  'other',
];

const SHORT: readonly FormatId[] = [
  'flash-fiction',
  'short-story',
  'novelette',
  'novella',
];

const at = (from: number, to = from) => ({ from, to });

export const STRUCTURES: readonly Structure[] = [
  {
    id: 'three-act',
    name: 'Three-act',
    credit:
      'After Aristotle’s beginning, middle and end; the usual positions come from Syd Field’s screenwriting books.',
    description:
      'A setup, a long middle of rising trouble turning at its centre, and an ending.\nTwo turning points, at about a quarter and three quarters, divide the acts.',
    fits: {
      genres: GENRE_FICTION,
      formats: ['novelette', 'novella', 'novel'],
      across: 'book',
    },
    beats: [
      {
        id: 'setup',
        name: 'Setup',
        purpose:
          'Show the protagonist’s everyday life and what they want or lack.',
        at: at(0, 10),
        span: 'run',
        opensPart: true,
      },
      {
        id: 'inciting-incident',
        name: 'Inciting incident',
        purpose:
          'Something disturbs that life and raises the story’s question.',
        at: at(10, 12),
        span: 'scene',
      },
      {
        id: 'first-turning-point',
        name: 'First turning point',
        purpose:
          'The protagonist commits to the problem; there is no way back.',
        at: at(23, 27),
        span: 'scene',
      },
      {
        id: 'rising-action',
        name: 'Rising action',
        purpose: 'Attempts and obstacles, each raising what is at stake.',
        at: at(25, 50),
        span: 'run',
        opensPart: true,
      },
      {
        id: 'midpoint',
        name: 'Midpoint',
        purpose:
          'A reversal or discovery that changes how the problem is seen.',
        at: at(48, 52),
        span: 'scene',
      },
      {
        id: 'complications',
        name: 'Complications',
        purpose: 'Pressure mounts and the cost of failing grows.',
        at: at(50, 75),
        span: 'run',
      },
      {
        id: 'second-turning-point',
        name: 'Second turning point',
        purpose:
          'A low point or revelation that sends the story toward its end.',
        at: at(73, 77),
        span: 'scene',
      },
      {
        id: 'final-act',
        name: 'Final act',
        purpose: 'The protagonist acts on what the turn taught them.',
        at: at(75, 90),
        span: 'run',
        opensPart: true,
      },
      {
        id: 'climax',
        name: 'Climax',
        purpose: 'The decisive confrontation answers the story’s question.',
        at: at(88, 97),
        span: 'scene',
      },
      {
        id: 'resolution',
        name: 'Resolution',
        purpose: 'What has changed, shown briefly.',
        at: at(97, 100),
        span: 'run',
      },
    ],
  },
  {
    id: 'four-part',
    name: 'Four-part (nine points)',
    credit:
      'After K.M. Weiland, Structuring Your Novel (2013), and Larry Brooks, Story Engineering (2011).',
    description:
      'Four quarters: setup, response, attack and resolution, each opened by a turn.\nPinch points between them show the opposition’s strength.',
    fits: {
      genres: GENRE_FICTION,
      formats: ['novella', 'novel'],
      across: 'both',
    },
    beats: [
      {
        id: 'hook',
        name: 'Hook',
        purpose: 'An opening that gives the reader a question to carry.',
        at: at(0, 3),
        span: 'scene',
        opensPart: true,
      },
      {
        id: 'inciting-event',
        name: 'Inciting event',
        purpose: 'The protagonist first meets the story’s conflict.',
        at: at(10, 15),
        span: 'scene',
      },
      {
        id: 'first-plot-point',
        name: 'First plot point',
        purpose:
          'The protagonist is pulled into the conflict and starts to react.',
        at: at(20, 27),
        span: 'scene',
        opensPart: true,
      },
      {
        id: 'first-pinch-point',
        name: 'First pinch point',
        purpose: 'The opposing force shows what it can do.',
        at: at(35, 40),
        span: 'scene',
      },
      {
        id: 'midpoint',
        name: 'Midpoint',
        purpose:
          'A truth is grasped and the protagonist turns from reacting to acting.',
        at: at(48, 52),
        span: 'scene',
        opensPart: true,
      },
      {
        id: 'second-pinch-point',
        name: 'Second pinch point',
        purpose: 'The opposition hits back harder, raising the stakes.',
        at: at(60, 65),
        span: 'scene',
      },
      {
        id: 'third-plot-point',
        name: 'Third plot point',
        purpose: 'A low point that forces the final choice.',
        at: at(73, 77),
        span: 'scene',
        opensPart: true,
      },
      {
        id: 'climax',
        name: 'Climax',
        purpose:
          'The protagonist confronts the opposition and settles the conflict.',
        at: at(88, 98),
        span: 'run',
      },
      {
        id: 'resolution',
        name: 'Resolution',
        purpose: 'The new state of things, briefly.',
        at: at(98, 100),
        span: 'run',
      },
    ],
  },
  {
    id: 'save-the-cat',
    name: 'Save the Cat (15 Beats)',
    credit:
      'After Blake Snyder, Save the Cat! (2005), and for novels Jessica Brody, Save the Cat! Writes a Novel (2018). “Save the Cat!” is a trademark of its owner.',
    description:
      'Fifteen Beats with precise positions, some a single Scene, some a run.\nThree acts, broken into at a fifth and four fifths of the way.',
    fits: {
      genres: GENRE_FICTION,
      formats: ['novella', 'novel'],
      across: 'book',
    },
    beats: [
      {
        id: 'opening-image',
        name: 'Opening Image',
        purpose: 'A snapshot of the protagonist before the story changes them.',
        at: at(0, 1),
        span: 'scene',
        opensPart: true,
      },
      {
        id: 'setup',
        name: 'Setup',
        purpose: 'The protagonist’s world, their flaw and what is missing.',
        at: at(1, 10),
        span: 'run',
      },
      {
        id: 'theme-stated',
        name: 'Theme Stated',
        purpose: 'Someone hints at the lesson the protagonist must learn.',
        at: at(3, 7),
        span: 'scene',
      },
      {
        id: 'catalyst',
        name: 'Catalyst',
        purpose: 'An event that upends the status quo.',
        at: at(10, 12),
        span: 'scene',
      },
      {
        id: 'debate',
        name: 'Debate',
        purpose: 'The protagonist hesitates over what to do.',
        at: at(10, 20),
        span: 'run',
      },
      {
        id: 'break-into-two',
        name: 'Break Into 2',
        purpose: 'The protagonist chooses to enter a new situation.',
        at: at(20, 22),
        span: 'scene',
        opensPart: true,
      },
      {
        id: 'fun-and-games',
        name: 'Fun and Games',
        purpose: 'The promise of the premise: the new world explored.',
        at: at(20, 50),
        span: 'run',
      },
      {
        id: 'b-story',
        name: 'B Story',
        purpose: 'A second line, often a relationship, that carries the theme.',
        at: at(20, 25),
        span: 'scene',
      },
      {
        id: 'midpoint',
        name: 'Midpoint',
        purpose: 'A false victory or false defeat that raises the stakes.',
        at: at(48, 52),
        span: 'scene',
      },
      {
        id: 'bad-guys-close-in',
        name: 'Bad Guys Close In',
        purpose: 'Pressure from outside and doubt from within build.',
        at: at(50, 75),
        span: 'run',
      },
      {
        id: 'all-is-lost',
        name: 'All Is Lost',
        purpose: 'The lowest point; something or someone is lost.',
        at: at(73, 77),
        span: 'scene',
      },
      {
        id: 'dark-night-of-the-soul',
        name: 'Dark Night of the Soul',
        purpose: 'The protagonist absorbs the loss and reckons with it.',
        at: at(75, 80),
        span: 'run',
      },
      {
        id: 'break-into-three',
        name: 'Break Into 3',
        purpose: 'A realisation shows the way forward.',
        at: at(80, 82),
        span: 'scene',
        opensPart: true,
      },
      {
        id: 'finale',
        name: 'Finale',
        purpose: 'The protagonist acts on the lesson and faces the problem.',
        at: at(80, 99),
        span: 'run',
      },
      {
        id: 'final-image',
        name: 'Final Image',
        purpose: 'A mirror of the opening, showing the change.',
        at: at(99, 100),
        span: 'scene',
      },
    ],
  },
  {
    id: 'seven-point',
    name: 'Seven-point',
    credit:
      'After Dan Wells’s 2010 lectures on story structure, and Writing Excuses episode 7.41.',
    description:
      'Seven points in a fixed order, planned from the ends: the resolution first, then a hook that is its opposite.\nIt can be applied to each plot line on its own.',
    fits: {
      genres: ['mystery', 'thriller', 'fantasy', 'science-fiction', 'other'],
      formats: ['novelette', 'novella', 'novel'],
      across: 'book',
    },
    beats: [
      {
        id: 'hook',
        name: 'Hook',
        purpose: 'The starting state, the opposite of where the story ends.',
        span: 'scene',
      },
      {
        id: 'plot-turn-1',
        name: 'Plot turn 1',
        purpose: 'Something new sets the protagonist moving.',
        span: 'scene',
      },
      {
        id: 'pinch-1',
        name: 'Pinch 1',
        purpose: 'Trouble forces the protagonist to act.',
        span: 'scene',
      },
      {
        id: 'midpoint',
        name: 'Midpoint',
        purpose: 'The protagonist moves from reacting to acting.',
        span: 'scene',
      },
      {
        id: 'pinch-2',
        name: 'Pinch 2',
        purpose:
          'Things go as badly as they can; the protagonist stands alone.',
        span: 'scene',
      },
      {
        id: 'plot-turn-2',
        name: 'Plot turn 2',
        purpose: 'The protagonist gains the last thing needed to win.',
        span: 'scene',
      },
      {
        id: 'resolution',
        name: 'Resolution',
        purpose: 'The ending state, the opposite of the hook.',
        span: 'scene',
      },
    ],
  },
  {
    id: 'heros-journey',
    name: 'Hero’s Journey',
    credit:
      'After Joseph Campbell, The Hero with a Thousand Faces (1949), in the twelve stages of Christopher Vogler, The Writer’s Journey (1992).',
    description:
      'A departure from the ordinary world, an ordeal in an unfamiliar one, and a return changed.\nIts stages may be reordered, merged or skipped.',
    fits: {
      genres: ['fantasy', 'science-fiction', 'other'],
      formats: ['novella', 'novel'],
      across: 'both',
    },
    beats: [
      {
        id: 'ordinary-world',
        name: 'Ordinary world',
        purpose: 'The hero at home, before the adventure.',
        at: at(0, 10),
        span: 'run',
        opensPart: true,
      },
      {
        id: 'call-to-adventure',
        name: 'Call to adventure',
        purpose: 'A problem or challenge invites the hero away.',
        at: at(8, 12),
        span: 'scene',
      },
      {
        id: 'refusal-of-the-call',
        name: 'Refusal of the call',
        purpose: 'Fear or duty holds the hero back.',
        at: at(10, 15),
        span: 'scene',
      },
      {
        id: 'meeting-the-mentor',
        name: 'Meeting the mentor',
        purpose: 'Someone gives the hero advice, a gift or courage.',
        at: at(12, 20),
        span: 'scene',
      },
      {
        id: 'crossing-the-threshold',
        name: 'Crossing the threshold',
        purpose: 'The hero commits and enters the unfamiliar world.',
        at: at(20, 25),
        span: 'scene',
        opensPart: true,
      },
      {
        id: 'tests-allies-enemies',
        name: 'Tests, allies, enemies',
        purpose: 'The hero learns the new world’s rules and who stands where.',
        at: at(25, 40),
        span: 'run',
      },
      {
        id: 'approach',
        name: 'Approach',
        purpose: 'Preparing for the central danger.',
        at: at(40, 50),
        span: 'run',
      },
      {
        id: 'ordeal',
        name: 'Ordeal',
        purpose: 'The hero faces their greatest fear and seems to die or fail.',
        at: at(45, 55),
        span: 'scene',
      },
      {
        id: 'reward',
        name: 'Reward',
        purpose: 'Having survived, the hero takes what they came for.',
        at: at(55, 65),
        span: 'run',
      },
      {
        id: 'road-back',
        name: 'The road back',
        purpose: 'The hero turns for home, and the danger follows.',
        at: at(70, 80),
        span: 'scene',
        opensPart: true,
      },
      {
        id: 'resurrection',
        name: 'Resurrection',
        purpose: 'A last, hardest test that proves the hero changed.',
        at: at(85, 95),
        span: 'scene',
      },
      {
        id: 'return-with-the-elixir',
        name: 'Return with the elixir',
        purpose: 'Home again, with something that changes it.',
        at: at(95, 100),
        span: 'run',
      },
    ],
  },
  {
    id: 'freytag',
    name: 'Freytag’s pyramid',
    credit: 'After Gustav Freytag, Die Technik des Dramas (1863).',
    description:
      'Five parts, symmetrical, with the climax in the middle and its consequences after.\nWritten about tragedy, still used where the turn falls at the centre.',
    fits: {
      genres: ['literary', 'horror', 'other'],
      formats: SHORT,
      across: 'book',
    },
    beats: [
      {
        id: 'introduction',
        name: 'Introduction',
        purpose: 'The situation and the people in it.',
        at: at(0, 15),
        span: 'run',
        opensPart: true,
      },
      {
        id: 'exciting-force',
        name: 'Exciting force',
        purpose: 'The event that sets the action going.',
        at: at(12, 18),
        span: 'scene',
      },
      {
        id: 'rising-action',
        name: 'Rising action',
        purpose: 'Complications build toward the high point.',
        at: at(15, 45),
        span: 'run',
        opensPart: true,
      },
      {
        id: 'climax',
        name: 'Climax',
        purpose: 'The turn at the centre, after which fortune reverses.',
        at: at(45, 55),
        span: 'scene',
        opensPart: true,
      },
      {
        id: 'falling-action',
        name: 'Falling action',
        purpose: 'The consequences of the turn unfold.',
        at: at(55, 85),
        span: 'run',
        opensPart: true,
      },
      {
        id: 'final-suspense',
        name: 'Final suspense',
        purpose: 'A last moment of doubt about how it will end.',
        at: at(80, 90),
        span: 'scene',
      },
      {
        id: 'catastrophe',
        name: 'Catastrophe',
        purpose: 'The ending the action has been heading for.',
        at: at(85, 100),
        span: 'run',
        opensPart: true,
      },
    ],
  },
  {
    id: 'fichtean',
    name: 'Fichtean curve',
    credit:
      'After John Gardner, The Art of Fiction (1983), named for the philosopher Fichte.',
    description:
      'No long setup: it opens in or near a crisis and climbs through worse ones to the climax.\nBackstory comes in during the crises; the ending is short.',
    fits: {
      genres: ['thriller', 'horror', 'crime', 'literary'],
      formats: SHORT,
      across: 'book',
    },
    beats: [
      {
        id: 'opening-crisis',
        name: 'Opening crisis',
        purpose: 'The story starts in trouble, with little explanation.',
        span: 'scene',
      },
      {
        id: 'rising-crises',
        name: 'Rising crises',
        purpose:
          'Each crisis is worse than the last; the past is told in between.',
        span: 'run',
      },
      {
        id: 'climax',
        name: 'Climax',
        purpose: 'The highest crisis, which decides the outcome.',
        span: 'scene',
      },
      {
        id: 'falling-action',
        name: 'Falling action',
        purpose: 'A short close after the climax.',
        span: 'run',
      },
    ],
  },
  {
    id: 'kishotenketsu',
    name: 'Kishōtenketsu',
    credit:
      'From the four-part composition of Chinese verse, carried into Japanese and Korean writing; its origins are disputed.',
    description:
      'Four parts that need no conflict: an introduction, its development, a twist, and a reconciliation.\nThe twist brings in something whose link to the rest shows only at the end.',
    fits: {
      genres: ['literary', 'fantasy', 'other'],
      formats: SHORT,
      across: 'book',
    },
    beats: [
      {
        id: 'ki',
        name: 'Ki',
        purpose: 'The introduction: the people and the place.',
        at: at(0, 25),
        span: 'run',
        opensPart: true,
      },
      {
        id: 'sho',
        name: 'Shō',
        purpose: 'The development: what was introduced, followed further.',
        at: at(25, 50),
        span: 'run',
        opensPart: true,
      },
      {
        id: 'ten',
        name: 'Ten',
        purpose: 'The twist: something seemingly unrelated enters.',
        at: at(50, 75),
        span: 'run',
        opensPart: true,
      },
      {
        id: 'ketsu',
        name: 'Ketsu',
        purpose: 'The reconciliation: how the twist belongs with the rest.',
        at: at(75, 100),
        span: 'run',
        opensPart: true,
      },
    ],
  },
];

export const CONVENTIONS: readonly GenreConvention[] = [
  {
    id: 'mystery',
    name: 'Mystery (fair play)',
    credit:
      'After S.S. Van Dine’s twenty rules (1928), Ronald Knox’s decalogue (1929) and the Detection Club oath (1930).',
    description:
      'A crime, an investigation and a solution the reader could have reached.\nEverything the solution rests on is shown before it is revealed.',
    genre: 'mystery',
    beats: [
      {
        id: 'crime',
        name: 'The crime',
        purpose: 'The crime is discovered, at or before the first big turn.',
        at: at(0, 25),
        span: 'scene',
      },
      {
        id: 'reveal',
        name: 'The reveal',
        purpose:
          'The solution is laid out, with the reasoning that leads to it.',
        at: at(85, 98),
        span: 'scene',
      },
    ],
    rules: [
      'Every clue the solution relies on appears before the reveal.',
      'The culprit appears early, in the first quarter, and plays a real part.',
      'Nothing is solved by chance, intuition, an unprompted confession or the supernatural.',
      'The detective is not the culprit.',
    ],
  },
  {
    id: 'crime',
    name: 'Crime',
    credit: 'After genre practice and Shawn Coyne, The Story Grid (2015).',
    description:
      'A crime early, someone who pursues it, and the criminal exposed at the end.\nIt covers the procedural, the caper and the story told from the criminal’s side.',
    genre: 'crime',
    beats: [
      {
        id: 'inciting-crime',
        name: 'The inciting crime',
        purpose: 'A crime sets the story going.',
        at: at(0, 15),
        span: 'scene',
      },
      {
        id: 'exposure',
        name: 'The exposure',
        purpose: 'The criminal is exposed, or caught.',
        at: at(85, 98),
        span: 'scene',
      },
    ],
    rules: [
      'An investigator, or the pursuit of the crime, drives the story.',
      'Clues and false leads are planted along the way.',
      'When the criminal is known from the start, the slip that catches them is shown before it is used.',
    ],
  },
  {
    id: 'thriller',
    name: 'Thriller',
    credit: 'After Shawn Coyne, The Story Grid (2015).',
    description:
      'A threat bigger than one crime, a hero who becomes its target, and a race against time.\nThe hero ends at the antagonist’s mercy and turns it around.',
    genre: 'thriller',
    beats: [
      {
        id: 'inciting-crime',
        name: 'The inciting crime',
        purpose: 'A crime that hints at a larger threat.',
        at: at(0, 12),
        span: 'scene',
      },
      {
        id: 'hero-at-mercy',
        name: 'The hero at the antagonist’s mercy',
        purpose:
          'The hero is cornered and turns it around through their own gift.',
        at: at(70, 80),
        span: 'scene',
      },
      {
        id: 'false-ending',
        name: 'The false ending',
        purpose: 'The danger seems over, and isn’t.',
        at: at(90, 98),
        span: 'scene',
      },
    ],
    rules: [
      'The hero, or someone dear to them, becomes the target.',
      'The antagonist’s power is shown before the hero faces it.',
      'A deadline or a clock limits the time.',
      'The hero wins by their own skill, not by luck.',
    ],
  },
  {
    id: 'horror',
    name: 'Horror',
    credit:
      'After Noël Carroll, The Philosophy of Horror (1990), and Shawn Coyne, The Story Grid (2015).',
    description:
      'A monster arrives, is discovered, is disbelieved, and is fought.\nStages may be dropped, doubled or combined.',
    genre: 'horror',
    beats: [
      {
        id: 'onset',
        name: 'The onset',
        purpose: 'The monster’s presence is shown, to the reader at least.',
        at: at(0, 15),
        span: 'scene',
      },
      {
        id: 'discovery',
        name: 'The discovery',
        purpose: 'The characters learn of the monster.',
        at: at(10, 30),
        span: 'scene',
      },
      {
        id: 'victim-at-mercy',
        name: 'The victim at the monster’s mercy',
        purpose: 'The core event: the protagonist at the monster’s mercy.',
        at: at(70, 85),
        span: 'scene',
      },
      {
        id: 'false-ending',
        name: 'The false ending',
        purpose: 'The monster seems beaten, and returns.',
        at: at(90, 99),
        span: 'scene',
      },
    ],
    rules: [
      'Those who know must convince others who refuse to believe before the confrontation.',
      'The confrontation comes in more than one round.',
    ],
  },
  {
    id: 'fantasy',
    name: 'Fantasy (promises before payoff)',
    credit:
      'After Brandon Sanderson’s lectures on promises, progress and payoff.',
    description:
      'The opening promises what kind of story this is and what will be settled; the ending pays it.\nMagic solves a problem only as far as the reader understands it.',
    genre: 'fantasy',
    beats: [
      {
        id: 'promise',
        name: 'The promise',
        purpose: 'The opening sets out what the story will deliver.',
        at: at(0, 15),
        span: 'run',
      },
      {
        id: 'payoff',
        name: 'The payoff',
        purpose: 'The ending delivers what the opening promised.',
        at: at(85, 100),
        span: 'run',
      },
    ],
    rules: [
      'The middle shows visible progress on the opening’s promises.',
      'A problem solved by magic or a rule of the world is set up in an earlier Scene.',
    ],
  },
  {
    id: 'romance',
    name: 'Romance',
    credit:
      'After the Romance Writers of America’s definition of the genre, and Gwen Hayes, Romancing the Beat (2016).',
    description:
      'A central love story whose conflict and climax concern the relationship.\nIt ends happily ever after, or happy for now.',
    genre: 'romance',
    beats: [
      {
        id: 'meeting',
        name: 'The meeting',
        purpose: 'The leads meet.',
        at: at(0, 25),
        span: 'scene',
      },
      {
        id: 'break-up',
        name: 'The break-up',
        purpose: 'The relationship falls apart: the low point.',
        at: at(70, 80),
        span: 'scene',
      },
      {
        id: 'grand-gesture',
        name: 'The grand gesture',
        purpose: 'One lead risks something to win the other back.',
        at: at(85, 95),
        span: 'scene',
      },
      {
        id: 'ending',
        name: 'The happy ending',
        purpose: 'Together: happily ever after, or happy for now.',
        at: at(95, 100),
        span: 'scene',
      },
    ],
    rules: [
      'The love story is the central conflict, not a subplot.',
      'The ending is happily ever after or happy for now.',
    ],
  },
];

/**
 * Ids replaced by a later revision of the catalogue, old to new, applied
 * when a Project is read, like the migration chain. None yet.
 */
export const OLD_IDS: Readonly<Record<string, string>> = {};

/** `id` as this catalogue calls it: an old id's replacement, or itself. */
export function currentId(
  id: string,
  old: Readonly<Record<string, string>> = OLD_IDS,
): string {
  return Object.hasOwn(old, id) ? old[id] : id;
}

/**
 * A Beat qualified by its Structure or Genre convention, as in
 * `save-the-cat/midpoint`: the form a Scene's marks hold it in.
 */
export function qualifiedBeatId(
  source: { id: string },
  beat: { id: string },
): string {
  return `${source.id}/${beat.id}`;
}

/**
 * A Beat as a Scene's marks hold it: qualified by its Structure or Genre
 * convention, as in `save-the-cat/midpoint` (spec: Outline planner §11).
 */
const BEAT_ID = /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;

/** Whether `raw` is of a qualified Beat's form, known to this catalogue or not. */
export function isBeatId(raw: unknown): raw is string {
  return typeof raw === 'string' && BEAT_ID.test(raw);
}

/**
 * The name of a qualified Beat, as in “Midpoint”; one this catalogue
 * doesn't know is one this version doesn't know.
 */
export function beatName(id: string): string {
  const [source, beat] = id.split('/');
  const entry = structureOf(source) ?? conventionOf(source);
  return (
    entry?.beats.find((b) => b.id === beat)?.name ??
    'a Beat this version doesn’t know'
  );
}

/**
 * A qualified Beat as this catalogue calls it: replaced whole when the map
 * names it, otherwise with its Structure or convention as now called.
 */
export function currentBeatId(
  id: string,
  old: Readonly<Record<string, string>> = OLD_IDS,
): string {
  if (Object.hasOwn(old, id)) return old[id];
  const [source, beat] = id.split('/');
  return qualifiedBeatId({ id: currentId(source, old) }, { id: beat });
}

/** Those of `ids` that `known` lists, in their order; any other is kept, but not shown. */
export function shownIds(
  ids: readonly string[] | undefined,
  known: readonly { id: string }[],
): string[] {
  return (ids ?? []).filter((id) => known.some((k) => k.id === id));
}

export function structureOf(id: string | undefined): Structure | undefined {
  return STRUCTURES.find((s) => s.id === id);
}

export function conventionOf(id: string): GenreConvention | undefined {
  return CONVENTIONS.find((c) => c.id === id);
}

/** The Genres, Format and Structure a Book has, as its header holds them. */
type Fitted = Pick<BookDetails, 'genres' | 'bookFormat' | 'structure'>;

/**
 * Whether `structure` fits a Book of `genres` and `format`: on any of its
 * Genres, and on its Format; a Genre or Format the catalogue doesn't know
 * counts as none.
 */
export function fitsBook(
  structure: Structure,
  { genres, bookFormat }: Fitted,
): boolean {
  const known = shownIds(genres, GENRES) as GenreId[];
  const genreFits =
    known.length === 0 || known.some((g) => structure.fits.genres.includes(g));
  const formatFits =
    !FORMATS.some((f) => f.id === bookFormat) ||
    structure.fits.formats.includes(bookFormat as FormatId);
  return genreFits && formatFits;
}

/**
 * The Structures the structure guide lists folded, all but the one the
 * Book follows: those fitting it first, then the less usual for it, each in
 * catalogue order.
 */
export function guideStructures(book: Fitted): {
  fitting: Structure[];
  lessUsual: Structure[];
} {
  const others = STRUCTURES.filter((s) => s.id !== book.structure);
  return {
    fitting: others.filter((s) => fitsBook(s, book)),
    lessUsual: others.filter((s) => !fitsBook(s, book)),
  };
}

/** Entries of the catalogue as Plan is sent them: in full, or by name only. */
export type Shortlisted<E> = { full: E[]; byName: E[] };

/**
 * The catalogue as the app shortlists it for Plan (spec: Outline planner
 * §2), before any Model sees it. In full: the Structures fitting the Book's
 * Genres and Format, as `fitsBook` judges, whether they work per Book or
 * across a Series playing no part; the Genre conventions of its Genres;
 * what the Book follows; and any entry the Author named in `asked`, their
 * messages. The rest by name only. Each in catalogue order.
 */
export function shortlist(
  book: BookDetails,
  asked: readonly string[],
): {
  structures: Shortlisted<Structure>;
  conventions: Shortlisted<GenreConvention>;
} {
  const words = asked.map(matchable);
  const named = (entry: Structure | GenreConvention) =>
    namesOf(entry).some((name) => words.some((w) => w.includes(` ${name} `)));
  const split = <E extends Structure | GenreConvention>(
    entries: readonly E[],
    inFull: (entry: E) => boolean,
  ): Shortlisted<E> => {
    const full = entries.filter((e) => inFull(e) || named(e));
    return { full, byName: entries.filter((e) => !full.includes(e)) };
  };
  return {
    structures: split(
      STRUCTURES,
      (s) => s.id === book.structure || fitsBook(s, book),
    ),
    conventions: split(
      CONVENTIONS,
      (c) =>
        !!book.genreConventions?.includes(c.id) ||
        !!book.genres?.includes(c.genre),
    ),
  };
}

/** What an entry may be called: its name without what follows in brackets, and its id. */
function namesOf(entry: Structure | GenreConvention): string[] {
  const name = entry.name.replace(/\s*\(.*\)$/, '');
  return [name, entry.id].map((n) => matchable(n).trim());
}

/**
 * `text` as names are looked for in it: lower case, without accents or
 * apostrophes, each word between single spaces, and one at each end.
 */
function matchable(text: string): string {
  const plain = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ` ${plain} `;
}
