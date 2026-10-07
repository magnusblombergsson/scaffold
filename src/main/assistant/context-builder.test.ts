import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConversationMessage } from '../../shared/conversation';
import { findingBlock } from '../../shared/finding';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem } from '../project-store/file-system';
import { createProject, openProject } from '../project-store/project-store';
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
      await store.setEntryImage(id, {
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        extension: 'png',
      });
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
