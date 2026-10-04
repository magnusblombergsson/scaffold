// PROTOTYPE (throwaway): writes a demo Project to try the Story Bible peek
// on (#68): Scenes whose Prose names the Story Bible's Entries.
// Usage: node src/renderer/prototype-story-bible-peek/make-demo-project.mjs <folder>
// The folder must not exist yet. Then File > Open Project… on it.

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || existsSync(target)) {
  console.error('Give a folder that does not exist yet.');
  process.exit(1);
}

const book = {
  outline: [
    'A lighthouse keeper’s daughter finds the logbook her father hid.',
    'She learns the wreck of 1962 was no accident, and has to choose between the village and the truth.',
  ],
  chapters: [
    {
      title: 'The Logbook',
      outline: [
        'Maren finds the logbook.',
        'First hint that the wreck was staged.',
      ],
      notes:
        'Keep the father offstage the whole chapter. Weather: grey, still.',
      scenes: [
        [
          'Fog at dawn',
          [
            'Maren climbs the tower to light the lamp.',
            'The lamp has been tampered with.',
          ],
          'Open on sound, not sight.',
        ],
        [
          'The loose board',
          [
            'She finds the logbook under the floor.',
            'The last entry is torn out.',
          ],
          '',
        ],
        [
          'Supper with Aunt Liv',
          ['Liv deflects every question about 1962.'],
          'Liv is kind, not sinister. Yet.',
        ],
        ['Night reading', [], 'Maybe merge with the loose board?'],
      ],
    },
    {
      title: 'The Village',
      outline: ['Maren asks around.', 'Everyone remembers a different wreck.'],
      notes: '',
      scenes: [
        [
          'The harbour master',
          ['He lies, badly.', 'He mentions a second boat.'],
          'Give him a tic: winding his watch.',
        ],
        [
          'The church records',
          ['Two names are missing from the list of the drowned.'],
          '',
        ],
        [
          'Storm warning',
          ['The radio says a storm is coming.', 'Liv asks her to stop.'],
          'Mirror of Fog at dawn.',
        ],
      ],
    },
    {
      title: 'The Second Boat',
      outline: [],
      notes: 'Not planned yet. Something on the island?',
      scenes: [],
    },
  ],
  unplaced: [
    [
      'A dream of the wreck',
      ['Maren dreams she is on the deck in 1962.'],
      'Probably cut.',
    ],
  ],
};

const PROSE = {
  'Fog at dawn': `The fog came in before the light did. Maren heard it first, the way the gulls went quiet, and then the foghorn from the harbour, two long and one short, the way Nils Berg had always sounded it.

She climbed the lighthouse in the dark. Ninety-one steps; her father had counted them aloud every morning of her childhood. At the top the lamp room smelled of paraffin and cold brass, and the logbook lay open on the desk where she had left it.

Aunt Liv had said not to come up here alone. Aunt Liv said a great many things.

The lamp would not light. Maren knelt and found the reason: someone had cut the wick, cleanly, with a knife. She sat back on her heels and listened to the fog, and for the first time she thought about the wreck of 1962 as something that had been done, not something that had happened.
`,
  'The loose board': `Under the desk, one board gave a little under her knee. Maren pried it up with the end of a spoon. The logbook she had been reading was not the only one. There was another, older, its spine cracked, its last page torn out.

She thought of Liv's kitchen, of the cardamom and the questions Liv never answered. She thought of the lighthouse as her father must have seen it, alone, with this under his feet.
`,
  'Supper with Aunt Liv': `Aunt Liv served the fish without looking up. "You were in the tower," she said.

"The wick was cut," Maren said.

Liv put the pan down. "Eat," she said. "It gets cold so fast in this house."
`,
  'The harbour master': `Nils Berg wound his watch twice before he answered. "The wreck? Terrible night. Everyone knows that story."

"Tell me anyway," Maren said.

He told her about one boat. Then, halfway through, he mentioned a second, and wound his watch again.
`,
};

const frontmatter = (id, extra = '') =>
  `---\nid: ${id}\nformat: 1\n${extra}---\n`;
const bullets = (lines) => lines.map((l) => `- ${l}`).join('\n');

for (const dir of [
  'scenes',
  'outlines',
  'notes',
  'bible',
  'private',
  'conversations',
  'trash',
]) {
  mkdirSync(path.join(target, dir), { recursive: true });
}
const write = (dir, id, body) =>
  writeFileSync(path.join(target, dir, `${id}.md`), body);

write('outlines', 'project', frontmatter('project') + bullets(book.outline));

function scene([title, outline, notes]) {
  const id = randomUUID();
  write(
    'scenes',
    id,
    frontmatter(id) + (PROSE[title] ?? `${title}. Maren waits.\n`),
  );
  write('outlines', id, frontmatter(id) + bullets(outline));
  write('notes', id, frontmatter(id) + notes);
  return { id, title };
}

const chapters = book.chapters.map((c) => {
  const id = randomUUID();
  write('outlines', id, frontmatter(id) + bullets(c.outline));
  write('notes', id, frontmatter(id) + c.notes);
  return { id, title: c.title, scenes: c.scenes.map(scene) };
});
// A Scene file the tree doesn't list is Unplaced.
book.unplaced.forEach(scene);

// The Story Bible. Role note, Appearance and the images are faked in the
// prototype (extras.ts), by name.
const ENTRIES = [
  {
    type: 'character',
    name: 'Maren Holm',
    aliases: ['Maren'],
    visibility: 'always',
    role: 'protagonist',
    voice: {
      traits:
        'Dry, short sentences. Asks questions instead of answering them. Goes quiet when she is angry, and gets very polite.',
      says: ['I suppose', 'Tell me anyway'],
      neverSays: ['I love you', 'sorry'],
      examples: ['“Tell me anyway.”', '“I suppose somebody has to light it.”'],
    },
    description: `The lighthouse keeper's daughter, back on the island after twelve years in Bergen. She came home for her father's funeral and stayed because nobody would tell her why the lamp went dark the night of the wreck.

She is careful, stubborn and patient in a way that frightens people who have something to hide. She loves the island and does not trust a single person on it, least of all herself when it comes to Liv.

Her arc: from wanting the truth for her father's sake to wanting it for the village's, and then having to decide whether the village can survive it.`,
  },
  {
    type: 'character',
    name: 'Aunt Liv',
    aliases: ['Liv'],
    visibility: 'mentioned',
    role: 'supporting',
    voice: {
      traits: 'Warm, fast, changes the subject with food.',
      says: ['Eat', 'It gets cold so fast in this house'],
      neverSays: ['1962'],
      examples: [],
    },
    description:
      'Maren’s father’s sister. Raised Maren after her mother left. Kind, not sinister. Knows exactly what happened in 1962 and has decided the knowing stops with her.',
  },
  {
    type: 'character',
    name: 'Nils Berg',
    aliases: ['harbour master'],
    visibility: 'mentioned',
    role: 'supporting',
    description:
      'The harbour master. Was nineteen and on the second boat the night of the wreck. Lies badly.',
  },
  {
    type: 'place',
    name: 'The lighthouse',
    aliases: ['lighthouse', 'the tower'],
    visibility: 'mentioned',
    senses: {
      atmosphere:
        'Lonely, ordered, slightly haunted: everything in its place except the one thing that matters.',
      sight:
        'Whitewashed tower with two red bands; brass lamp room; salt on every pane.',
      sound:
        'Wind in the gallery rail, the foghorn from the harbour, ninety-one steps counted aloud.',
      smells: 'Paraffin, cold brass, wet wool.',
      touch: 'The iron rail is always cold, even in July.',
    },
    description:
      'The lighthouse on the north point, kept by the Holm family for three generations. Automated in 1990; Maren’s father kept the lamp room as it was.',
  },
  {
    type: 'item',
    name: 'The logbook',
    aliases: ['logbook'],
    visibility: 'mentioned',
    description:
      'The keeper’s logbook for 1962. The last page, for the night of the wreck, has been torn out.',
  },
  {
    type: 'plot-thread',
    name: 'The wreck of 1962',
    aliases: ['the wreck', 'wreck of 1962'],
    visibility: 'always',
    status: 'open',
    description:
      'Two fishing boats went out in a storm; one came back. The village remembers it as an accident. The lamp was dark that night.',
  },
];

for (const e of ENTRIES) {
  const id = randomUUID();
  const { description, ...fields } = e;
  const yaml = Object.entries(fields)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  write(
    'bible',
    id,
    `---\nid: ${id}\nformat: 1\n${yaml}\n---\n${description}\n`,
  );
}

writeFileSync(
  path.join(target, 'project.json'),
  JSON.stringify(
    { format: 1, id: randomUUID(), language: 'en-US', tree: { chapters } },
    null,
    2,
  ) + '\n',
);
console.log(`Demo Project written to ${target}`);
