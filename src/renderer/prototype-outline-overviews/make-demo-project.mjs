// PROTOTYPE (throwaway): writes a demo Project to try the outline overviews
// on (#67). Usage: node src/renderer/prototype-outline-overviews/make-demo-project.mjs <folder>
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
  write('scenes', id, frontmatter(id) + `${title}. Prose goes here.\n`);
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

writeFileSync(
  path.join(target, 'project.json'),
  JSON.stringify(
    { format: 1, id: randomUUID(), language: 'en-US', tree: { chapters } },
    null,
    2,
  ) + '\n',
);
console.log(`Demo Project written to ${target}`);
