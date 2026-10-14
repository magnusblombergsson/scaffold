import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OPEN_FOCUS as OPEN,
  type ConversationMessage,
} from '../../shared/conversation';
import { findingBlock } from '../../shared/finding';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem } from '../project-store/file-system';
import { createProject, openProject } from '../project-store/project-store';
import {
  mvpReadManifest,
  mvpWriteManifest,
} from '../project-store/mvp-manifest-file';
import {
  buildContext,
  type Command,
  type ContextRequest,
  type InterviewFocus,
} from './context-builder';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

/** In every private note, so that a leak shows. */
const SENTINEL = 'PRIVATE-SENTINEL-7f3a';

/**
 * A small Project: Chapter “Arrival” with Scenes “Harbour” and “Letter”,
 * Chapter “Storm” with Scene “Wreck”, each with Prose, an Outline and Notes,
 * and a Story Bible with an Entry of each visibility.
 */
async function fixture() {
  const store = await createProject(path.join(dir, 'My Novel'), {
    fs: nodeFileSystem,
    clock: instantClock(),
  });
  const [first] = store.manuscript().chapters;
  const arrival = first.id;
  await store.renameChapter(arrival, 'Arrival');
  const harbour = first.scenes[0].id;
  await store.renameScene(harbour, 'Harbour');
  const { id: letter } = await store.createScene(arrival, 1, 'Letter');
  const { id: storm } = await store.createChapter(1, 'Storm');
  const { id: wreck } = await store.createScene(storm, 0, 'Wreck');

  const prose = {
    [harbour]: 'Annie waited on the quay.',
    [letter]: 'The letter came on Tuesday.',
    [wreck]: 'Nothing was left of the boat.',
  };
  for (const [id, markdown] of Object.entries(prose)) {
    await store.write({ kind: 'scene', id }, { id, markdown });
  }
  const outlines = {
    [PROJECT_OUTLINE]: '- A woman leaves an island',
    [arrival]: '- She arrives',
    [harbour]: '- She waits for the ferry',
    [letter]: '- The letter',
    [storm]: '- The storm breaks',
    [wreck]: '- The boat is lost',
  };
  for (const [id, body] of Object.entries(outlines)) {
    await store.write({ kind: 'outline', id }, { id, body, meta: {} });
  }
  const notes = {
    [arrival]: 'Keep it short.',
    [harbour]: 'Cold morning.',
    [letter]: 'Who sent it?',
    [storm]: 'Night.',
    [wreck]: 'The kistan floats.',
  };
  for (const [id, body] of Object.entries(notes)) {
    await store.write({ kind: 'notes', id }, { id, body });
  }

  const entries = {
    anna: await entryOf(
      'character',
      'Anna',
      'mentioned',
      'Leaves the island. Knows the Harbour master.',
      ['Annie'],
    ),
    mira: await entryOf('character', 'Mira', 'always', 'Her sister.'),
    pact: await entryOf('plot-thread', 'The Pact', 'never', 'A secret.'),
    master: await entryOf('character', 'Harbour master', 'mentioned', 'Old.'),
    kista: await entryOf('item', 'kista', 'mentioned', 'A sea chest.'),
    ferry: await entryOf('item', 'Ferry', 'mentioned', 'The morning boat.'),
  };

  async function entryOf(
    type: 'character' | 'plot-thread' | 'item',
    name: string,
    visibility: 'always' | 'mentioned' | 'never',
    description: string,
    aliases: string[] = [],
  ): Promise<string> {
    const { id } = await store.createEntry(type, name);
    const value = await store.read({ kind: 'entry', id });
    await store.write(
      { kind: 'entry', id },
      { ...value, aliases, visibility, description },
    );
    await store.write({ kind: 'private', id }, { id, body: SENTINEL });
    return id;
  }

  return {
    store,
    view: store.assistantView(),
    chapters: { arrival, storm },
    scenes: { harbour, letter, wreck },
    entries,
  };
}

function message(
  role: 'author' | 'assistant',
  text: string,
): ConversationMessage {
  return { role, text, focus: [], at: 0 };
}

/** Everything a context sends, as one text. */
function sent(context: Awaited<ReturnType<typeof buildContext>>): string {
  return [
    ...context.system.map((b) => b.text),
    ...context.messages.map((m) => m.content),
  ].join('\n');
}

describe('Brainstorm', () => {
  it('sends the prompt, the visible Story Bible and the Outline skeleton, but no Prose', async () => {
    const { view, entries } = await fixture();
    const request: ContextRequest = {
      mode: 'brainstorm',
      messages: [message('author', 'What if it rains?')],
    };

    const context = await buildContext(view, request);

    expect(context.system[0].text).toMatch(/You never write Prose/);
    // The Ferry is in the Outline of “Harbour”.
    expect(context.saw.entries).toEqual([entries.mira, entries.ferry]);
    expect(context.saw.units).toEqual([]);
    const text = sent(context);
    expect(text).toContain('Her sister.');
    expect(text).not.toContain('A secret.');
    for (const outline of [
      'A woman leaves an island',
      'She arrives',
      'She waits for the ferry',
      'The boat is lost',
    ]) {
      expect(text).toContain(outline);
    }
    for (const prose of [
      'Annie waited',
      'The letter came',
      'Nothing was left',
    ]) {
      expect(text).not.toContain(prose);
    }
    expect(context.messages).toEqual([
      { role: 'user', content: 'What if it rains?' },
    ]);
  });
});

describe('the Story Bible', () => {
  it('in an Interview, sends the Entry or Entry type in focus, unless seen never', async () => {
    const { view, entries } = await fixture();
    const ask = (focus: InterviewFocus) =>
      buildContext(view, {
        mode: 'interview',
        focus,
        messages: [message('author', 'Go on.')],
      });

    expect(
      (await ask({ kind: 'entry', id: entries.master })).saw.entries,
    ).toEqual([entries.master, entries.mira, entries.ferry]);
    expect(
      (await ask({ kind: 'entry-type', type: 'character' })).saw.entries,
    ).toEqual([entries.anna, entries.master, entries.mira, entries.ferry]);
    expect(
      (await ask({ kind: 'entry', id: entries.pact })).saw.entries,
    ).toEqual([entries.mira, entries.ferry]);
  });

  it('sends an Entry seen when mentioned on a hit in the Conversation’s messages, by alias too', async () => {
    const { view, entries } = await fixture();

    const context = await buildContext(view, {
      mode: 'brainstorm',
      messages: [
        message('author', 'Does Annie swim?'),
        message('assistant', 'Can she?'),
        message('author', 'Yes.'),
      ],
    });

    expect(context.saw.entries).toEqual([
      entries.anna,
      entries.mira,
      entries.ferry,
    ]);
    expect(sent(context)).toContain('Leaves the island.');
  });

  it('doesn’t count a mention inside another Entry', async () => {
    const { view, entries } = await fixture();

    const context = await buildContext(view, {
      mode: 'brainstorm',
      messages: [message('author', 'Tell me about Anna.')],
    });

    // Anna's description names the Harbour master.
    expect(context.saw.entries).not.toContain(entries.master);
    expect(context.saw.entries).toContain(entries.anna);
  });

  it('matches a common noun in its Swedish definite form, in Notes', async () => {
    const { view, scenes, entries } = await fixture();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.wreck,
      messages: [message('author', 'Is it too sad?')],
    });

    // The Notes on “Wreck” say “kistan”.
    expect(context.saw.entries).toContain(entries.kista);
  });

  it('never sends an Entry seen never, even when mentioned', async () => {
    const { view, entries } = await fixture();

    const context = await buildContext(view, {
      mode: 'brainstorm',
      messages: [message('author', 'What is The Pact?')],
    });

    expect(context.saw.entries).not.toContain(entries.pact);
    expect(sent(context)).not.toContain('A secret.');
  });

  it('sends an Entry’s aliases, type-specific fields and Voice', async () => {
    const { store, view, entries } = await fixture();
    const anna = await store.read({ kind: 'entry', id: entries.anna });
    await store.write(
      { kind: 'entry', id: entries.anna },
      {
        ...anna,
        visibility: 'always',
        fields: {
          role: 'protagonist',
          voice: {
            traits: 'clipped, dry',
            says: ['nope'],
            neverSays: ['darling'],
            examples: ['Not today.'],
          },
        },
      },
    );

    const context = await buildContext(view, {
      mode: 'brainstorm',
      messages: [message('author', 'Hm.')],
    });

    const text = sent(context);
    for (const part of [
      'Also called: Annie',
      'Role: Protagonist',
      'clipped, dry',
      'nope',
      'darling',
      'Not today.',
    ]) {
      expect(text).toContain(part);
    }
  });
});

describe('Entry Tags', () => {
  it('sends an Entry’s Tags after its aliases', async () => {
    const { store, view, entries } = await fixture();
    const anna = await store.read({ kind: 'entry', id: entries.anna });
    await store.write(
      { kind: 'entry', id: entries.anna },
      { ...anna, visibility: 'always' },
    );
    await store.setTags(entries.anna, ['Mara', 'the war']);

    const context = await buildContext(view, {
      mode: 'brainstorm',
      messages: [message('author', 'Hm.')],
    });

    expect(sent(context)).toContain(
      `Id: ${entries.anna}
Also called: Annie
Tags: Mara, the war`,
    );
  });

  it('never sends the Tags of an Entry seen never', async () => {
    const { store, view, entries } = await fixture();
    await store.setTags(entries.pact, ['oath-tag']);

    const context = await buildContext(view, {
      mode: 'brainstorm',
      messages: [message('author', 'What is The Pact?')],
    });

    expect(sent(context)).not.toContain('oath-tag');
  });
});

describe('Prose by Mode and command', () => {
  it('Writing · free question: the Scene in focus with its Outline and Notes, and its Chapter’s Outline', async () => {
    const { view, scenes, chapters, entries } = await fixture();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.harbour,
      messages: [message('author', 'Is the opening slow?')],
    });

    expect(context.saw.units).toEqual([
      { kind: 'outline', id: chapters.arrival },
      { kind: 'outline', id: scenes.harbour },
      { kind: 'notes', id: scenes.harbour },
      { kind: 'scene', id: scenes.harbour },
    ]);
    const text = sent(context);
    expect(text).toContain('Annie waited on the quay.');
    expect(text).toContain('Cold morning.');
    expect(text).not.toContain('The letter came');
    expect(text).not.toContain('Keep it short.');
    // “Annie” in the Prose.
    expect(context.saw.entries).toContain(entries.anna);
  });

  it('sends Prose with its block quote and alignment markers as stored', async () => {
    const { store, view, scenes } = await fixture();
    const markdown =
      'She read:\n\n> Come *home*.\n\n> {.right} Now.\n\n\\>sigh\n\n{.centre} The End';
    await store.write(
      { kind: 'scene', id: scenes.harbour },
      { id: scenes.harbour, markdown },
    );

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.harbour,
      messages: [message('author', 'Is the letter clear?')],
    });

    expect(sent(context)).toContain(markdown);
  });

  it('Writing · free question: other Scenes and Chapters only when @-mentioned', async () => {
    const { view, scenes, chapters } = await fixture();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.harbour,
      messages: [message('author', 'Does it echo @wreck, or @Arrival?')],
    });

    expect(context.saw.units).toEqual([
      { kind: 'outline', id: chapters.arrival },
      { kind: 'outline', id: scenes.harbour },
      { kind: 'notes', id: scenes.harbour },
      { kind: 'scene', id: scenes.harbour },
      { kind: 'outline', id: chapters.storm },
      { kind: 'outline', id: scenes.wreck },
      { kind: 'notes', id: scenes.wreck },
      { kind: 'scene', id: scenes.wreck },
      { kind: 'notes', id: chapters.arrival },
      { kind: 'outline', id: scenes.letter },
      { kind: 'scene', id: scenes.letter },
    ]);
  });

  it('Writing · free question with no Scene open: no Prose', async () => {
    const { view } = await fixture();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: null,
      messages: [message('author', 'Where do I start?')],
    });

    expect(context.saw.units).toEqual([]);
  });

  it('Writing · Review Scene: as a free question, without @-mentions', async () => {
    const { view, scenes, chapters } = await fixture();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'review-scene',
      sceneId: scenes.wreck,
      messages: [message('author', 'Review @Harbour')],
    });

    expect(context.saw.units).toEqual([
      { kind: 'outline', id: chapters.storm },
      { kind: 'outline', id: scenes.wreck },
      { kind: 'notes', id: scenes.wreck },
      { kind: 'scene', id: scenes.wreck },
    ]);
  });

  it('Writing · Review Chapter: each Scene’s Prose and Outline, and the Chapter’s Outline and Notes', async () => {
    const { view, scenes, chapters } = await fixture();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'review-chapter',
      sceneId: scenes.letter,
      messages: [message('author', 'Review the Chapter.')],
    });

    expect(context.saw.units).toEqual([
      { kind: 'outline', id: chapters.arrival },
      { kind: 'notes', id: chapters.arrival },
      { kind: 'outline', id: scenes.harbour },
      { kind: 'scene', id: scenes.harbour },
      { kind: 'outline', id: scenes.letter },
      { kind: 'scene', id: scenes.letter },
    ]);
    expect(sent(context)).not.toContain('Who sent it?');
  });

  it('Writing · Review: names each Scene’s Prose by its Id, so a Finding can say where its quote is', async () => {
    const { view, scenes } = await fixture();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'review-chapter',
      sceneId: scenes.letter,
      messages: [message('author', 'Review Chapter “Arrival”')],
    });

    const focus = context.system[3].text;
    expect(focus).toContain(`Id: ${scenes.harbour}\nAnnie waited on the quay.`);
    expect(focus).toContain(
      `Id: ${scenes.letter}\nThe letter came on Tuesday.`,
    );
  });

  it('Interview: the Prose of a Scene or Chapter in focus, and none otherwise', async () => {
    const { view, scenes, chapters, entries } = await fixture();
    const ask = (focus: InterviewFocus) =>
      buildContext(view, {
        mode: 'interview',
        focus,
        messages: [message('author', 'Go on.')],
      });

    expect(
      (await ask({ kind: 'scene', id: scenes.harbour })).saw.units,
    ).toEqual([{ kind: 'scene', id: scenes.harbour }]);
    expect(
      (await ask({ kind: 'chapter', id: chapters.arrival })).saw.units,
    ).toEqual([
      { kind: 'scene', id: scenes.harbour },
      { kind: 'scene', id: scenes.letter },
    ]);
    const others: InterviewFocus[] = [
      { kind: 'open' },
      { kind: 'entry', id: entries.anna },
      { kind: 'entry-type', type: 'character' },
    ];
    for (const focus of others) {
      expect((await ask(focus)).saw.units).toEqual([]);
    }
  });
});

describe('Interview focus', () => {
  const ask = (
    view: Awaited<ReturnType<typeof fixture>>['view'],
    focus: InterviewFocus,
  ) =>
    buildContext(view, {
      mode: 'interview',
      focus,
      messages: [message('author', 'Go on.')],
    });
  const focusText = (context: Awaited<ReturnType<typeof buildContext>>) =>
    context.system.find((b) => b.text.startsWith('The Interview’s focus'))
      ?.text;

  it('tells the Assistant what the Interview is about, after the skeleton and before the Prose', async () => {
    const { view, scenes, chapters, entries } = await fixture();

    const entry = await ask(view, { kind: 'entry', id: entries.anna });
    expect(focusText(entry)).toContain(
      `the Entry “Anna” (Character), Id: ${entries.anna}`,
    );
    expect(entry.system[3].text).toBe(focusText(entry));

    expect(
      focusText(await ask(view, { kind: 'entry-type', type: 'character' })),
    ).toContain('every Character');
    expect(
      focusText(await ask(view, { kind: 'chapter', id: chapters.arrival })),
    ).toContain(`the Chapter “Arrival”, Id: ${chapters.arrival}`);
    const scene = await ask(view, { kind: 'scene', id: scenes.harbour });
    expect(focusText(scene)).toContain(
      `the Scene “Harbour”, Id: ${scenes.harbour}`,
    );
    expect(scene.system[3].text).toBe(focusText(scene));
    expect(scene.system[4].text).toContain('Annie waited on the quay.');
  });

  it('with open focus, asks the Assistant to say first which gap it chose and why', async () => {
    const { view } = await fixture();

    const text = focusText(await ask(view, { kind: 'open' }));

    expect(text).toMatch(/open/);
    expect(text).toMatch(/first say which gap you chose and why/i);
  });

  it('names a focus no longer in the Project as gone, without its contents', async () => {
    const { store, view, entries } = await fixture();
    await store.trashEntry(entries.pact);

    const text = focusText(
      await ask(view, { kind: 'entry', id: entries.pact }),
    );

    expect(text).toMatch(/no longer/);
    expect(text).not.toContain('The Pact');
  });

  it('never names an Entry in focus that the Assistant never sees', async () => {
    const { view, entries } = await fixture();

    const context = await ask(view, { kind: 'entry', id: entries.pact });

    expect(sent(context)).not.toContain('The Pact');
    expect(focusText(context)).toMatch(/kept from you/);
  });
});

describe('Interview Tag focus', () => {
  const ask = (
    view: Awaited<ReturnType<typeof fixture>>['view'],
    tag: string,
  ) =>
    buildContext(view, {
      mode: 'interview',
      focus: { kind: 'tag', tag },
      messages: [message('author', 'Go on.')],
    });

  it('sends the Entries with the Tag, matched ignoring case, but never one seen never', async () => {
    const { store, view, entries } = await fixture();
    await store.setTags(entries.anna, ['Mara']);
    await store.setTags(entries.kista, ['mara', 'sea']);
    await store.setTags(entries.pact, ['Mara']);
    await store.setTags(entries.master, ['sea']);

    const context = await ask(view, 'MARA');

    expect(context.saw.entries).toEqual(
      expect.arrayContaining([entries.anna, entries.kista]),
    );
    expect(context.saw.entries).not.toContain(entries.master);
    expect(context.saw.entries).not.toContain(entries.pact);
    expect(sent(context)).not.toContain('The Pact');
  });

  it('adds the Outlines of the Chapters and Scenes with the Tag, and never their Prose', async () => {
    const { store, view, chapters, scenes } = await fixture();
    await store.setTags(chapters.storm, ['Mara']);
    await store.setTags(scenes.harbour, ['mara']);

    const context = await ask(view, 'Mara');

    expect(context.saw.units).toEqual([
      { kind: 'outline', id: scenes.harbour },
      { kind: 'outline', id: chapters.storm },
    ]);
    const text = sent(context);
    expect(text).toContain('## Outline of Chapter “Storm”\n- The storm breaks');
    expect(text).toContain('## Outline of Scene “Harbour”\n- She waits');
    expect(text).not.toContain('Annie waited on the quay.');
    expect(text).not.toContain('Nothing was left of the boat.');
    expect(text).not.toContain('Cold morning.');
  });

  it('tells the Assistant the Tag, and to ask about what is missing among what has it', async () => {
    const { store, view, entries } = await fixture();
    await store.setTags(entries.anna, ['Mara']);

    const context = await ask(view, 'mara');

    const text = context.system.find((b) =>
      b.text.startsWith('The Interview’s focus'),
    )?.text;
    expect(text).toContain('tagged “Mara”');
    expect(text).toMatch(/missing/);
  });

  it('names a Tag nothing has any more as gone, nor an Entry seen never', async () => {
    const { store, view, entries } = await fixture();
    await store.setTags(entries.pact, ['Mara']);

    const context = await ask(view, 'Mara');

    const text = context.system.find((b) =>
      b.text.startsWith('The Interview’s focus'),
    )?.text;
    expect(text).toMatch(/no longer/);
    expect(context.saw.units).toEqual([]);
  });
});

describe('order and caching', () => {
  it('sends prompt, Story Bible, skeleton and Prose in focus, then the earlier messages and the new one, with breakpoints after the skeleton and the earlier messages', async () => {
    const { view, scenes } = await fixture();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.harbour,
      messages: [
        message('author', 'First?'),
        { ...message('assistant', 'Cut sh'), interrupted: true },
        message('assistant', 'An answer.'),
        message('author', 'Second?'),
      ],
    });

    expect(context.system.map((b) => [b.text.split('\n')[0], b.cache])).toEqual(
      [
        [expect.stringMatching(/^You are the Assistant/), undefined],
        [expect.stringMatching(/^The Story Bible/), undefined],
        [expect.stringMatching(/^The Outline skeleton/), true],
        [expect.stringMatching(/^In focus/), undefined],
      ],
    );
    expect(context.messages).toEqual([
      { role: 'user', content: 'First?' },
      { role: 'assistant', content: 'An answer.', cache: true },
      { role: 'user', content: 'Second?' },
    ]);
    expect(context.saw.messages).toBe(2);
  });

  it('sends a Review the Author asked for as what to do, and the Findings of a reply back as the blocks they came in', async () => {
    const { view, scenes } = await fixture();
    const finding = {
      type: 'missing' as const,
      sceneId: scenes.harbour,
      quote: 'Annie waited on the quay.',
      comment: 'No ferry.',
      question: 'Does it come?',
    };

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.harbour,
      messages: [
        {
          ...message('author', 'Review Scene “Harbour”'),
          command: 'review-scene',
        },
        { ...message('assistant', 'One thing.'), findings: [finding] },
        {
          ...message('author', 'Review Chapter “Arrival”'),
          command: 'review-chapter',
        },
      ],
    });

    const [asked, answered, again] = context.messages.map((m) => m.content);
    expect(asked).toMatch(
      /^Review Scene “Harbour”\n\nReview the Scene in focus/,
    );
    expect(answered).toBe(`One thing.\n\n${findingBlock(finding)}`);
    expect(again).toMatch(
      /^Review Chapter “Arrival”\n\nReview the Chapter in focus/,
    );
  });

  it('starts each Review fresh: no earlier Findings are sent with it', async () => {
    const { view, scenes } = await fixture();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'review-scene',
      sceneId: scenes.harbour,
      messages: [
        {
          ...message('author', 'Review Scene “Harbour”'),
          command: 'review-scene',
        },
        {
          ...message('assistant', 'One thing.'),
          findings: [{ type: 'missing', comment: 'No ferry.' }],
        },
        {
          ...message('author', 'Review Scene “Harbour”'),
          command: 'review-scene',
        },
      ],
    });

    expect(context.messages[1].content).toBe('One thing.');
    expect(sent(context)).not.toContain('No ferry.');
  });

  it('answers a question that follows a Chapter Review, as for the rest of its Findings, with that Chapter', async () => {
    const { view, scenes, chapters } = await fixture();
    const review = {
      ...message('author', 'Review Chapter “Arrival”'),
      command: 'review-chapter' as const,
      focus: [scenes.letter],
    };

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.letter,
      messages: [
        review,
        message('assistant', 'Two of nine.'),
        message('author', 'And the rest?'),
      ],
    });

    expect(context.saw.units).toEqual(
      expect.arrayContaining([
        { kind: 'notes', id: chapters.arrival },
        { kind: 'scene', id: scenes.harbour },
        { kind: 'scene', id: scenes.letter },
      ]),
    );
    expect(context.messages[1].content).toBe('Two of nine.');
    const later = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.letter,
      messages: [
        review,
        message('assistant', 'Two of nine.'),
        message('author', 'And the rest?'),
        message('assistant', 'Seven more.'),
        message('author', 'Why the letter?'),
      ],
    });
    expect(later.saw.units).not.toContainEqual({
      kind: 'scene',
      id: scenes.harbour,
    });
  });

  it('puts the skeleton in Manuscript order, the story’s Outline first', async () => {
    const { view } = await fixture();

    const context = await buildContext(view, {
      mode: 'brainstorm',
      messages: [message('author', 'Hm.')],
    });

    const skeleton = context.system[2].text;
    const order = [
      'A woman leaves an island',
      'Chapter “Arrival”',
      'She arrives',
      'Scene “Harbour”',
      'She waits for the ferry',
      'Scene “Letter”',
      'Chapter “Storm”',
      'Scene “Wreck”',
      'The boat is lost',
    ].map((part) => skeleton.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('gives each Chapter and Scene its Status in the skeleton, by name, but none not in the list', async () => {
    const { store, chapters, scenes } = await fixture();
    await store.setStatus(chapters.arrival, 'outlined');
    await store.setStatus(scenes.harbour, 'drafted');
    await store.setStatus(scenes.letter, 'done');
    await store.close();
    const outline = path.join(
      dir,
      'My Novel',
      'outlines',
      `${scenes.letter}.md`,
    );
    await writeFile(
      outline,
      (await readFile(outline, 'utf8')).replace('done', 'polished'),
    );
    const reopened = await openProject(path.join(dir, 'My Novel'), {
      fs: nodeFileSystem,
      clock: instantClock(),
    });

    const context = await buildContext(reopened.assistantView(), {
      mode: 'brainstorm',
      messages: [message('author', 'Hm.')],
    });
    await reopened.close();

    const skeleton = context.system[2].text;
    expect(skeleton).toContain(
      `## Chapter “Arrival”\nId: ${chapters.arrival}\nStatus: Outlined\n- She arrives`,
    );
    expect(skeleton).toContain(
      `### Scene “Harbour”\nId: ${scenes.harbour}\nStatus: Drafted\n- She waits`,
    );
    expect(skeleton).toContain(
      `### Scene “Letter”\nId: ${scenes.letter}\n- The letter`,
    );
    expect(skeleton).toContain(
      `## Chapter “Storm”\nId: ${chapters.storm}\n- The storm`,
    );
    expect(sent(context)).not.toContain('polished');
  });

  it('gives each Chapter and Scene its Tags in the skeleton, after its Status', async () => {
    const { store, chapters, scenes } = await fixture();
    await store.setTags(chapters.arrival, ['Mara', 'the war']);
    await store.setStatus(scenes.harbour, 'drafted');
    await store.setTags(scenes.harbour, ['flashback']);

    const context = await buildContext(store.assistantView(), {
      mode: 'brainstorm',
      messages: [message('author', 'Hm.')],
    });

    const skeleton = context.system[2].text;
    expect(skeleton).toContain(
      `## Chapter “Arrival”
Id: ${chapters.arrival}
Tags: Mara, the war
- She arrives`,
    );
    expect(skeleton).toContain(
      `### Scene “Harbour”
Id: ${scenes.harbour}
Status: Drafted
Tags: flashback
- She waits`,
    );
    expect(skeleton).toContain(
      `### Scene “Letter”
Id: ${scenes.letter}
- The letter`,
    );
  });

  it('on a first message, puts the second breakpoint on the last block before it', async () => {
    const { view, scenes } = await fixture();

    const writing = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.harbour,
      messages: [message('author', 'First?')],
    });
    const brainstorm = await buildContext(view, {
      mode: 'brainstorm',
      messages: [message('author', 'First?')],
    });

    expect(writing.system.map((b) => b.cache)).toEqual([
      undefined,
      undefined,
      true,
      true,
    ]);
    expect(brainstorm.system.map((b) => b.cache)).toEqual([
      undefined,
      undefined,
      true,
    ]);
    expect(writing.messages[0].cache).toBeUndefined();
  });
});

/**
 * A request in each Mode: Brainstorm, Interview in each kind of focus, and
 * each Writing command on each Scene and on none, naming every Entry.
 */
function everyRequest({
  scenes,
  chapters,
  entries,
}: Awaited<ReturnType<typeof fixture>>): ContextRequest[] {
  const messages = [
    message(
      'author',
      'Anna, Annie, Mira, The Pact, Harbour master, kista, Ferry, @Harbour @Storm',
    ),
  ];
  const foci: InterviewFocus[] = [
    { kind: 'open' },
    { kind: 'entry', id: entries.anna },
    { kind: 'entry-type', type: 'character' },
    { kind: 'chapter', id: chapters.arrival },
    { kind: 'scene', id: scenes.wreck },
    { kind: 'tag', tag: 'Mara' },
  ];
  const commands: Command[] = ['question', 'review-scene', 'review-chapter'];
  return [
    { mode: 'brainstorm', messages },
    ...foci.map(
      (focus): ContextRequest => ({ mode: 'interview', focus, messages }),
    ),
    ...commands.flatMap((command) =>
      [scenes.harbour, scenes.letter, scenes.wreck, null].map(
        (sceneId): ContextRequest => ({
          mode: 'writing',
          command,
          sceneId,
          messages,
        }),
      ),
    ),
  ];
}

describe('private notes', () => {
  it('never reach the context, in any Mode and focus', async () => {
    const project = await fixture();

    for (const request of everyRequest(project)) {
      const text = sent(await buildContext(project.view, request));
      expect(text).toContain('Her sister.');
      expect(text).not.toContain(SENTINEL);
    }
  });
});

describe('Entry images', () => {
  it('never reach the context, in any Mode and focus', async () => {
    const project = await fixture();
    const { store, view, entries } = project;
    for (const id of Object.values(entries)) {
      await store.setImage(
        { kind: 'entry', id },
        {
          data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          extension: 'png',
        },
      );
    }

    expect(view.listEntries().some((e) => 'image' in e)).toBe(false);
    expect(
      await view.read({ kind: 'entry', id: entries.mira }),
    ).not.toHaveProperty('image');
    for (const request of everyRequest(project)) {
      const text = sent(await buildContext(view, request));
      expect(text).toContain('Her sister.');
      expect(text).not.toMatch(/\.png|images\/|PNG/);
    }
  });
});

describe('Word targets', () => {
  it('never reach the context, in any Mode and focus', async () => {
    const project = await fixture();
    const { store, scenes, chapters } = project;
    await store.setWordTarget(scenes.harbour, 73519);
    await store.setWordTarget(chapters.storm, 73519);
    await store.setWordTarget('project', 73519);

    for (const request of everyRequest(project)) {
      const text = sent(await buildContext(project.view, request));
      expect(text).toContain('Her sister.');
      expect(text).not.toMatch(/73,?519|target/i);
    }
  });
});

describe('Todos', () => {
  it('never reach the context, in any Mode and focus', async () => {
    const project = await fixture();
    const { store, scenes, chapters, entries } = project;
    await store.addTodo('TODO-SENTINEL scene', {
      kind: 'scene',
      id: scenes.harbour,
    });
    await store.addTodo('TODO-SENTINEL chapter', {
      kind: 'chapter',
      id: chapters.storm,
    });
    await store.addTodo('TODO-SENTINEL entry', {
      kind: 'entry',
      id: entries.anna,
    });
    await store.addTodo('TODO-SENTINEL unlinked', null);

    for (const request of everyRequest(project)) {
      const text = sent(await buildContext(project.view, request));
      expect(text).toContain('Her sister.');
      expect(text).not.toContain('TODO-SENTINEL');
    }
  });
});

describe('Snapshots', () => {
  it('never reach the context, in any Mode and focus', async () => {
    const project = await fixture();
    const { store, scenes } = project;
    for (const id of Object.values(scenes)) {
      const now = await store.read({ kind: 'scene', id });
      await store.write(
        { kind: 'scene', id },
        { id, markdown: 'SNAPSHOT-SENTINEL prose' },
      );
      await store.takeSnapshot(id, 'SNAPSHOT-SENTINEL name');
      await store.write({ kind: 'scene', id }, now);
    }

    for (const request of everyRequest(project)) {
      const text = sent(await buildContext(project.view, request));
      expect(text).toContain('Her sister.');
      expect(text).not.toContain('SNAPSHOT-SENTINEL');
    }
    const writing = sent(
      await buildContext(project.view, {
        mode: 'writing',
        command: 'question',
        sceneId: scenes.harbour,
        messages: [message('author', 'Hi')],
      }),
    );
    expect(writing).toContain('Annie waited on the quay.');
  });
});

describe('Role note and Appearance', () => {
  it('reach the context with the Entry, in every Mode and focus', async () => {
    const project = await fixture();
    const { store, entries } = project;
    const mira = await store.read({ kind: 'entry', id: entries.mira });
    await store.write(
      { kind: 'entry', id: entries.mira },
      {
        ...mira,
        fields: {
          ...mira.fields,
          role: 'supporting',
          roleNote: 'the one who stayed',
          appearance: 'Freckled, always in oilskins.',
        },
      },
    );

    for (const request of everyRequest(project)) {
      const text = sent(await buildContext(project.view, request));
      expect(text).toContain('Role: Supporting · the one who stayed');
      expect(text).toContain('Appearance: Freckled, always in oilskins.');
    }
  });

  it('may be proposed in every Mode, and are on the Interview’s Character checklist', async () => {
    const project = await fixture();

    for (const request of everyRequest(project)) {
      const { system } = await buildContext(project.view, request);
      const prompt = system.map((b) => b.text).join('\n');
      expect(prompt).toContain('- "roleNote" (Characters)');
      expect(prompt).toContain('- "appearance" (Characters)');
      const checklist = /^- Character: .*$/m.exec(prompt)?.[0];
      if (request.mode === 'interview') {
        expect(checklist).toContain('Role note');
        expect(checklist).toContain('Appearance');
      } else {
        expect(checklist).toBeUndefined();
      }
    }
  });

  it('sends a Role note without a Role on its own', async () => {
    const { store, view, entries } = await fixture();
    const mira = await store.read({ kind: 'entry', id: entries.mira });
    await store.write(
      { kind: 'entry', id: entries.mira },
      { ...mira, fields: { ...mira.fields, roleNote: 'the one who stayed' } },
    );

    const text = sent(
      await buildContext(view, {
        mode: 'brainstorm',
        messages: [message('author', 'Hm.')],
      }),
    );

    expect(text).toContain('\nRole: the one who stayed\n');
  });
});

describe('Parts', () => {
  /**
   * The fixture with an Act “The Sea” holding Chapter “Storm”, with an
   * Outline and Notes; Chapter “Arrival” stays loose before it.
   */
  async function withPart() {
    const project = await fixture();
    const { store, chapters } = project;
    await store.setPartLabel('act');
    const { id: sea } = await store.createPart(1, 'The Sea');
    await store.moveChapter(chapters.storm, 0, sea);
    await store.write(
      { kind: 'outline', id: sea },
      { id: sea, body: '- The crossing', meta: {} },
    );
    await store.write({ kind: 'notes', id: sea }, { id: sea, body: 'Grey.' });
    return { ...project, sea };
  }
  const skeletonOf = async (
    view: Awaited<ReturnType<typeof fixture>>['view'],
  ) =>
    (
      await buildContext(view, {
        mode: 'brainstorm',
        messages: [message('author', 'Hm.')],
      })
    ).system[2].text;
  const focusText = (context: Awaited<ReturnType<typeof buildContext>>) =>
    context.system.find((b) => b.text.startsWith('The Interview’s focus'))
      ?.text;

  it('puts each Part in the skeleton by the Project’s label, its Chapters nested under it and Loose Chapters between', async () => {
    const { store, view, chapters, scenes, sea } = await withPart();
    await store.setStatus(sea, 'outlined');
    await store.setTags(sea, ['Mara']);

    const skeleton = await skeletonOf(view);

    expect(skeleton).toContain(
      `## Chapter “Arrival”\nId: ${chapters.arrival}\n- She arrives`,
    );
    expect(skeleton).toContain(
      `### Scene “Harbour”\nId: ${scenes.harbour}\n- She waits`,
    );
    expect(skeleton).toContain(
      `## Act “The Sea”\nId: ${sea}\nStatus: Outlined\nTags: Mara\n- The crossing`,
    );
    expect(skeleton).toContain(
      `### Chapter “Storm”\nId: ${chapters.storm}\n- The storm breaks`,
    );
    expect(skeleton).toContain(
      `#### Scene “Wreck”\nId: ${scenes.wreck}\n- The boat is lost`,
    );
    expect(skeleton.indexOf('Chapter “Arrival”')).toBeLessThan(
      skeleton.indexOf('Act “The Sea”'),
    );
    expect(skeleton.indexOf('Act “The Sea”')).toBeLessThan(
      skeleton.indexOf('Chapter “Storm”'),
    );
    expect(skeleton).toMatch(/each Act/);
    expect(skeleton).not.toContain('Grey.');
  });

  it('puts a Part holding no Chapters in the skeleton', async () => {
    const { store, view } = await withPart();
    const { id: empty } = await store.createPart(0, 'Prelude');

    const skeleton = await skeletonOf(view);

    expect(skeleton).toContain(`## Act “Prelude”\nId: ${empty}\n(No Outline.)`);
  });

  it('never sends a Part’s Word target or image', async () => {
    const { store, view, sea } = await withPart();
    await store.setWordTarget(sea, 73519);
    await store.setImage(
      { kind: 'part', id: sea },
      { data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), extension: 'png' },
    );

    const foci: InterviewFocus[] = [{ kind: 'part', id: sea }, OPEN];
    for (const focus of foci) {
      const text = sent(
        await buildContext(view, {
          mode: 'interview',
          focus,
          messages: [message('author', 'Hm.')],
        }),
      );
      expect(text).toContain('The crossing');
      expect(text).not.toMatch(/73,?519|target|\.png|images\/|PNG/i);
    }
  });

  it('Writing: a Scene in a Part comes with its Part’s Outline, before its Chapter’s', async () => {
    const { view, chapters, scenes, sea } = await withPart();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.wreck,
      messages: [message('author', 'Too fast?')],
    });

    expect(context.saw.units).toEqual([
      { kind: 'outline', id: sea },
      { kind: 'outline', id: chapters.storm },
      { kind: 'outline', id: scenes.wreck },
      { kind: 'notes', id: scenes.wreck },
      { kind: 'scene', id: scenes.wreck },
    ]);
    const text = sent(context);
    expect(text).toContain('## Outline of Act “The Sea”\n- The crossing');
    expect(text).not.toContain('Grey.');
  });

  it('Writing · Review Chapter: a Chapter in a Part comes with its Part’s Outline', async () => {
    const { view, chapters, scenes, sea } = await withPart();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'review-chapter',
      sceneId: scenes.wreck,
      messages: [message('author', '')],
    });

    expect(context.saw.units.slice(0, 3)).toEqual([
      { kind: 'outline', id: sea },
      { kind: 'outline', id: chapters.storm },
      { kind: 'notes', id: chapters.storm },
    ]);
  });

  it('Writing · free question: an @-mentioned Part brings its Outline and Notes and its Chapters’ Outlines, never their Prose', async () => {
    const { view, chapters, sea } = await withPart();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: null,
      messages: [message('author', 'Does @the sea hold together?')],
    });

    expect(context.saw.units).toEqual([
      { kind: 'outline', id: sea },
      { kind: 'notes', id: sea },
      { kind: 'outline', id: chapters.storm },
    ]);
    const text = sent(context);
    expect(text).toContain('## Notes on Act “The Sea”\nGrey.');
    expect(text).not.toContain('Nothing was left of the boat.');
  });

  it('Interview: a Part in focus brings its Outline and Notes and its Chapters’ Outlines, never their Prose', async () => {
    const { view, chapters, sea } = await withPart();

    const context = await buildContext(view, {
      mode: 'interview',
      focus: { kind: 'part', id: sea },
      messages: [message('author', 'Go on.')],
    });

    expect(context.saw.units).toEqual([
      { kind: 'outline', id: sea },
      { kind: 'notes', id: sea },
      { kind: 'outline', id: chapters.storm },
    ]);
    const focus = focusText(context);
    expect(focus).toContain(`the Act “The Sea”, Id: ${sea}`);
    expect(focus).toContain('Chapter “Storm”');
    expect(focus).toMatch(/Interview out its Outline/);
    const text = sent(context);
    expect(text).toContain('In focus: the Author’s own Outlines and Notes.');
    expect(text).not.toContain('Nothing was left of the boat.');
  });

  it('Interview: names a Part in focus no longer there as gone, by the Project’s label', async () => {
    const { store, view, sea } = await withPart();
    await store.trashPart(sea);

    const context = await buildContext(view, {
      mode: 'interview',
      focus: { kind: 'part', id: sea },
      messages: [message('author', 'Go on.')],
    });

    expect(focusText(context)).toContain(
      'an Act which is no longer in the Project',
    );
    expect(context.saw.units).toEqual([]);
  });

  it('Interview Tag focus: adds the Outline of a Part with the Tag', async () => {
    const { store, view, sea } = await withPart();
    await store.setTags(sea, ['Mara']);

    const context = await buildContext(view, {
      mode: 'interview',
      focus: { kind: 'tag', tag: 'mara' },
      messages: [message('author', 'Go on.')],
    });

    expect(context.saw.units).toEqual([{ kind: 'outline', id: sea }]);
    expect(sent(context)).toContain(
      '## Outline of Act “The Sea”\n- The crossing',
    );
  });
});

describe('Custom fields', () => {
  it('are sent in an Entry that has them, labelled after its own fields, and named for Proposals', async () => {
    const { store, view, entries } = await fixture();
    const allegiance = await store.addCustomField('character', 'Allegiance');
    const debt = await store.addCustomField('character', 'Debt');
    await store.addCustomField('item', 'Maker');
    const mira = await store.read({ kind: 'entry', id: entries.mira });
    await store.write(
      { kind: 'entry', id: entries.mira },
      {
        ...mira,
        fields: { ...mira.fields, appearance: 'Freckled.' },
        custom: { [debt]: 'Owes the harbour master.', [allegiance]: '' },
      },
    );

    const text = sent(
      await buildContext(view, {
        mode: 'brainstorm',
        messages: [message('author', 'What if it rains?')],
      }),
    );

    expect(text).toContain(
      'Her sister.\nAppearance: Freckled.\nDebt: Owes the harbour master.',
    );
    expect(text).not.toContain('Allegiance:');
    expect(text).toContain(
      `- Characters: Allegiance ("custom:${allegiance}"), Debt ("custom:${debt}")\n- Items: Maker (`,
    );
  });

  it('send nothing new for a Project without any', async () => {
    const { view } = await fixture();

    const text = sent(
      await buildContext(view, {
        mode: 'brainstorm',
        messages: [message('author', 'Go.')],
      }),
    );

    expect(text).not.toContain('Fields the Author added');
  });

  it('are asked about in an Interview on an Entry or type that has them', async () => {
    const { store, view, entries } = await fixture();
    await store.addCustomField('character', 'Allegiance');
    const focusOf = async (focus: InterviewFocus) =>
      (
        await buildContext(view, {
          mode: 'interview',
          focus,
          messages: [message('author', 'Go on.')],
        })
      ).system.find((b) => b.text.startsWith('The Interview’s focus'))?.text;

    expect(await focusOf({ kind: 'entry', id: entries.anna })).toContain(
      'The Author added a field to every Character: Allegiance; ask about it when empty too',
    );
    expect(await focusOf({ kind: 'entry-type', type: 'character' })).toContain(
      'Allegiance',
    );
    expect(await focusOf({ kind: 'entry', id: entries.kista })).not.toContain(
      'added',
    );
  });
});

describe('Series', () => {
  /**
   * The fixture as a Series: Book 1 holds Chapter “Arrival”, Book 2 holds
   * Chapter “Storm”, whose Scene “Wreck” alone mentions the Ferry. Each
   * Book has an Outline and Notes.
   */
  async function series() {
    const project = await fixture();
    const { store, chapters, scenes } = project;
    const { id: two } = await store.createBook();
    const one = store.manuscript().books![0].id;
    await store.moveChapter(chapters.storm, 0, undefined, two);
    await store.write(
      { kind: 'outline', id: scenes.wreck },
      { id: scenes.wreck, body: '- The Ferry sinks', meta: {} },
    );
    await store.write(
      { kind: 'outline', id: scenes.harbour },
      { id: scenes.harbour, body: '- She waits', meta: {} },
    );
    for (const [id, body] of [
      [one, '- She leaves'],
      [two, '- She returns'],
    ]) {
      await store.write({ kind: 'outline', id }, { id, body, meta: {} });
      await store.write({ kind: 'notes', id }, { id, body: `Notes ${body}` });
    }
    return { ...project, books: { one, two } };
  }
  const skeletonOf = (context: Awaited<ReturnType<typeof buildContext>>) =>
    context.system[2].text;

  it('sends the Series Outline, every Book’s Outline, and the Parts, Chapters and Scenes of the Conversation’s Book only', async () => {
    const { view, chapters, scenes, books } = await series();

    const skeleton = skeletonOf(
      await buildContext(view, {
        mode: 'brainstorm',
        book: books.one,
        messages: [message('author', 'Hm.')],
      }),
    );

    expect(skeleton).toContain(
      `## The Series\nId: ${PROJECT_OUTLINE}\n- A woman leaves an island`,
    );
    expect(skeleton).toContain(
      `## Book “Book 1”\nId: ${books.one}\n- She leaves`,
    );
    expect(skeleton).toContain(
      `## Book “Book 2”\nId: ${books.two}\n- She returns`,
    );
    expect(skeleton).toContain(
      `### Chapter “Arrival”\nId: ${chapters.arrival}\n- She arrives`,
    );
    expect(skeleton).toContain(
      `#### Scene “Harbour”\nId: ${scenes.harbour}\n- She waits`,
    );
    expect(skeleton).not.toContain('Storm');
    expect(skeleton).not.toContain('Wreck');
    expect(skeleton).not.toContain('The storm breaks');
    expect(skeleton).not.toContain('Notes');
    expect(skeleton.indexOf('Book “Book 1”')).toBeLessThan(
      skeleton.indexOf('Chapter “Arrival”'),
    );
    expect(skeleton.indexOf('Chapter “Arrival”')).toBeLessThan(
      skeleton.indexOf('Book “Book 2”'),
    );
  });

  it('nests a Part of the Book under it', async () => {
    const { store, view, chapters, books } = await series();
    const { id: sea } = await store.createPart(0, 'The Sea', books.two);
    await store.moveChapter(chapters.storm, 0, sea);

    const skeleton = skeletonOf(
      await buildContext(view, {
        mode: 'brainstorm',
        book: books.two,
        messages: [message('author', 'Hm.')],
      }),
    );

    expect(skeleton).toContain(`### Part “The Sea”\nId: ${sea}`);
    expect(skeleton).toContain(`#### Chapter “Storm”`);
    expect(skeleton).toContain(`##### Scene “Wreck”`);
    expect(skeleton).not.toContain('Arrival');
  });

  it('matches mentions only in what is sent, never in another Book’s skeleton', async () => {
    const { view, books, entries } = await series();
    const asked = (book: string) =>
      buildContext(view, {
        mode: 'brainstorm',
        book,
        messages: [message('author', 'Hm.')],
      });

    expect((await asked(books.one)).saw.entries).not.toContain(entries.ferry);
    expect((await asked(books.two)).saw.entries).toContain(entries.ferry);
  });

  it('is about the first Book when the Conversation names none, or one no longer a Book', async () => {
    const { view } = await series();

    for (const book of [undefined, 'gone']) {
      const skeleton = skeletonOf(
        await buildContext(view, {
          mode: 'interview',
          focus: OPEN,
          ...(book && { book }),
          messages: [message('author', 'Hm.')],
        }),
      );
      expect(skeleton).toContain('Chapter “Arrival”');
      expect(skeleton).not.toContain('Chapter “Storm”');
    }
  });

  it('Writing: is about the Book holding the Scene in focus', async () => {
    const { view, scenes } = await series();

    const context = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.wreck,
      messages: [message('author', 'Hm.')],
    });

    expect(skeletonOf(context)).toContain('Chapter “Storm”');
    expect(skeletonOf(context)).not.toContain('Arrival');
  });

  it('Writing: with no Scene of a Book in focus, sends no Book’s Parts, Chapters or Scenes', async () => {
    const { view, books } = await series();

    const skeleton = skeletonOf(
      await buildContext(view, {
        mode: 'writing',
        command: 'question',
        sceneId: null,
        messages: [message('author', 'Hm.')],
      }),
    );

    expect(skeleton).toContain(`## Book “Book 1”\nId: ${books.one}`);
    expect(skeleton).toContain(`## Book “Book 2”\nId: ${books.two}`);
    expect(skeleton).not.toContain('Arrival');
    expect(skeleton).not.toContain('Storm');
  });

  it('leaves out the Unplaced Chapters, which are in no Book', async () => {
    const { store, books } = await series();
    const projectPath = path.join(dir, 'My Novel');
    await store.close();
    // An older app adds a Chapter: it only knows `chapters`.
    const file = path.join(projectPath, 'project.json');
    const manifest = mvpReadManifest(await readFile(file, 'utf8'));
    const tree = {
      ...manifest.tree,
      chapters: [
        {
          id: '0e0e0e0e-0000-4000-8000-000000000000',
          title: 'Elsewhere',
          scenes: [],
        },
        ...manifest.tree.chapters,
      ],
    };
    await writeFile(file, mvpWriteManifest(manifest, tree));
    const reopened = await openProject(projectPath, {
      fs: nodeFileSystem,
      clock: instantClock(),
    });

    const skeleton = skeletonOf(
      await buildContext(reopened.assistantView(), {
        mode: 'brainstorm',
        book: books.one,
        messages: [message('author', 'Hm.')],
      }),
    );

    expect(skeleton).toContain('Arrival');
    expect(skeleton).not.toContain('Elsewhere');
  });

  it('Interview: a Book in focus brings its Outline and Notes and its Chapters’ Outlines, never their Prose', async () => {
    const { view, books } = await series();

    const context = await buildContext(view, {
      mode: 'interview',
      focus: { kind: 'book', id: books.two },
      book: books.one,
      messages: [message('author', 'Ask me.')],
    });

    const text = sent(context);
    expect(text).toContain('Notes - She returns');
    expect(text).toContain('Outline of Chapter “Storm”');
    expect(text).not.toContain('Nothing was left of the boat.');
    const focus = context.system.find((b) =>
      b.text.startsWith('The Interview’s focus'),
    )?.text;
    expect(focus).toContain(
      `the Book “Book 2”, Id: ${books.two}, which holds Chapter “Storm”.`,
    );
    expect(focus).toContain('Interview out its Outline');
  });

  it('Interview: names a Book in focus no longer there as gone', async () => {
    const { view } = await series();

    const context = await buildContext(view, {
      mode: 'interview',
      focus: { kind: 'book', id: 'gone' },
      messages: [message('author', 'Ask me.')],
    });

    expect(sent(context)).toContain('a Book which is no longer in the Project');
  });

  it('sends each Entry as of the Conversation’s Book: its own values with the Evolutions up to it', async () => {
    const { store, view, books, entries } = await series();
    const ref = { kind: 'entry', id: entries.mira } as const;
    const mira = await store.read(ref);
    await store.write(ref, {
      ...mira,
      evolutions: {
        [books.two]: { name: 'Queen Mira', description: 'She rules now.' },
      },
    });
    const asked = async (book: string) =>
      sent(
        await buildContext(view, {
          mode: 'brainstorm',
          book,
          messages: [message('author', 'Hm.')],
        }),
      );

    const one = await asked(books.one);
    expect(one).toContain('## Mira (Character)');
    expect(one).toContain('Her sister.');
    expect(one).not.toContain('She rules now.');
    const two = await asked(books.two);
    expect(two).toContain('## Queen Mira (Character)');
    expect(two).toContain('She rules now.');
    expect(two).not.toContain('Her sister.');
  });

  it('never sends an Entry that first appears in a later Book, however it is seen', async () => {
    const { store, view, books, entries } = await series();
    await store.setFirstAppears(entries.mira, books.two);
    await store.setFirstAppears(entries.anna, books.two);
    const asked = (book: string) =>
      buildContext(view, {
        mode: 'interview',
        focus: { kind: 'entry-type', type: 'character' },
        book,
        messages: [message('author', 'Annie?')],
      });

    const one = await asked(books.one);
    expect(one.saw.entries).not.toContain(entries.mira);
    expect(one.saw.entries).not.toContain(entries.anna);
    expect(sent(one)).not.toContain('Her sister.');
    const two = await asked(books.two);
    expect(two.saw.entries).toContain(entries.mira);
    expect(two.saw.entries).toContain(entries.anna);
  });

  it('Interview: names an Entry in focus as of the Book, and not at all before it first appears', async () => {
    const { store, view, books, entries } = await series();
    const ref = { kind: 'entry', id: entries.mira } as const;
    await store.write(ref, {
      ...(await store.read(ref)),
      evolutions: { [books.two]: { name: 'Queen Mira' } },
    });
    await store.setFirstAppears(entries.mira, books.two);
    const focusOf = async (book: string) =>
      (
        await buildContext(view, {
          mode: 'interview',
          focus: { kind: 'entry', id: entries.mira },
          book,
          messages: [message('author', 'Ask me.')],
        })
      ).system.find((b) => b.text.startsWith('The Interview’s focus'))?.text;

    expect(await focusOf(books.two)).toContain('the Entry “Queen Mira”');
    const one = await focusOf(books.one);
    expect(one).not.toContain('Mira');
    expect(one).toContain("Say you can't see it");
  });

  it('matches mentions by every name and alias an Entry has had up to the Book, never one it takes later', async () => {
    const { store, view, books, entries, scenes } = await series();
    const ref = { kind: 'entry', id: entries.master } as const;
    const master = await store.read(ref);
    await store.write(ref, {
      ...master,
      evolutions: {
        [books.two]: { name: 'Old Tom', aliases: ['Tom'] },
      },
    });
    const asked = (book: string, text: string) =>
      buildContext(view, {
        mode: 'brainstorm',
        book,
        messages: [message('author', text)],
      });

    expect(
      (await asked(books.one, 'What of Old Tom?')).saw.entries,
    ).not.toContain(entries.master);
    expect((await asked(books.two, 'What of Tom?')).saw.entries).toContain(
      entries.master,
    );
    expect(
      (await asked(books.two, 'And the Harbour master?')).saw.entries,
    ).toContain(entries.master);
    // Writing sees it as of the Book of the Scene in focus.
    const writing = await buildContext(view, {
      mode: 'writing',
      command: 'question',
      sceneId: scenes.wreck,
      messages: [message('author', 'Is Tom here?')],
    });
    expect(writing.saw.entries).toContain(entries.master);
    expect(sent(writing)).toContain('## Old Tom (Character)');
  });

  it('Writing · Review: judges against the Entries as of the Book of the Scene reviewed', async () => {
    const { store, view, books, entries, scenes } = await series();
    const ref = { kind: 'entry', id: entries.mira } as const;
    await store.write(ref, {
      ...(await store.read(ref)),
      evolutions: { [books.two]: { description: 'She rules now.' } },
    });
    await store.setFirstAppears(entries.anna, books.two);
    const review = (sceneId: string, command: Command) =>
      buildContext(view, {
        mode: 'writing',
        command,
        sceneId,
        messages: [message('author', 'Review Annie.')],
      });

    for (const command of ['review-scene', 'review-chapter'] as const) {
      const inOne = await review(scenes.harbour, command);
      expect(sent(inOne)).toContain('Her sister.');
      expect(sent(inOne)).not.toContain('She rules now.');
      expect(inOne.saw.entries).not.toContain(entries.anna);
      const inTwo = await review(scenes.wreck, command);
      expect(sent(inTwo)).toContain('She rules now.');
      expect(sent(inTwo)).not.toContain('Her sister.');
    }
  });

  it('sends a Relation only in a Book it holds in, never before its Book', async () => {
    const { store, view, books, entries } = await series();
    const id = await store.addRelation(entries.anna, entries.mira, {
      kind: 'label',
      label: 'sister of',
    });
    await store.addRelation(entries.anna, entries.master, { kind: 'same-as' });
    await store.setRelationBook(id, books.two);
    const group = store.listRelations().find((r) => r.kind === 'same-as')!;
    await store.setRelationBook(group.id, books.two);
    const asked = async (book: string) =>
      sent(
        await buildContext(view, {
          mode: 'brainstorm',
          book,
          messages: [message('author', 'Anna, Mira and the Harbour master.')],
        }),
      );

    const one = await asked(books.one);
    expect(one).not.toContain('sister of');
    expect(one).not.toContain('under different faces');
    const two = await asked(books.two);
    expect(two).toContain('“Anna” is sister of “Mira”.');
    expect(two).toContain('under different faces');
  });

  it('a Project of one Book ignores a Book it is given', async () => {
    const { view } = await fixture();
    const messages = [message('author', 'Hm.')];

    expect(
      await buildContext(view, { mode: 'brainstorm', book: 'any', messages }),
    ).toEqual(await buildContext(view, { mode: 'brainstorm', messages }));
  });
});

describe('Relations', () => {
  /** A Brainstorm whose message is `text`, everything it sends as one text. */
  async function brainstorm(
    view: Awaited<ReturnType<typeof fixture>>['view'],
    text: string,
  ): Promise<string> {
    return sent(
      await buildContext(view, {
        mode: 'brainstorm',
        messages: [message('author', text)],
      }),
    );
  }

  it('are sent as sentences among the Entries the Assistant sees', async () => {
    const { store, view, entries } = await fixture();
    await store.addRelation(entries.kista, entries.ferry, { kind: 'part-of' });
    await store.addRelation(entries.anna, entries.mira, {
      kind: 'label',
      label: 'sister of',
    });

    const text = await brainstorm(view, 'Anna opens the kista.');

    expect(text).toContain('“kista” is part of “Ferry”.');
    expect(text).toContain('“Anna” is sister of “Mira”.');
  });

  it('name each Same as group’s faces, and tell the Assistant to keep each face’s facts to it', async () => {
    const { store, view, entries } = await fixture();
    await store.addRelation(entries.anna, entries.master, { kind: 'same-as' });
    await store.addRelation(entries.mira, entries.anna, { kind: 'same-as' });

    const text = await brainstorm(view, 'Anna meets the Harbour master.');

    expect(text).toContain(
      '“Anna”, “Harbour master” and “Mira” are one person or thing under different faces.',
    );
    expect(text).toMatch(/never let one face’s details leak into another’s/);
  });

  it('leave out an Entry the Assistant doesn’t see: in Trash, in the Drawer, or not sent', async () => {
    const { store, view, entries } = await fixture();
    await store.addRelation(entries.anna, entries.master, { kind: 'same-as' });
    await store.addRelation(entries.mira, entries.anna, { kind: 'same-as' });
    await store.addRelation(entries.mira, entries.master, {
      kind: 'label',
      label: 'afraid of',
    });
    await store.addRelation(entries.kista, entries.ferry, { kind: 'part-of' });
    await store.addRelation(entries.anna, entries.pact, {
      kind: 'label',
      label: 'bound by',
    });
    await store.trashEntry(entries.master);
    await store.moveToDrawer('entry', entries.ferry);

    let text = await brainstorm(view, 'Anna, the Harbour master, the kista.');

    expect(text).toContain(
      '“Anna” and “Mira” are one person or thing under different faces.',
    );
    for (const hidden of ['afraid of', 'part of “', 'bound by']) {
      expect(text).not.toContain(hidden);
    }

    // A group with one face seen is no group to the Assistant.
    await store.moveToDrawer('entry', entries.mira);
    text = await brainstorm(view, 'Anna, the Harbour master, the kista.');
    expect(text).not.toContain('under different faces');
    expect(text).not.toContain('How the Author has said');
  });

  it('send nothing new for a Project without any', async () => {
    const { view } = await fixture();

    const text = await brainstorm(view, 'Anna opens the kista.');

    expect(text).not.toContain('How the Author has said');
  });
});
