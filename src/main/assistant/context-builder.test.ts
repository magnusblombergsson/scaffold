import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConversationMessage } from '../../shared/conversation';
import { PROJECT_OUTLINE } from '../../shared/project-types';
import { instantClock } from '../project-store/clock';
import { nodeFileSystem } from '../project-store/file-system';
import { createProject } from '../project-store/project-store';
import {
  buildContext,
  type Command,
  type ContextRequest,
  type InterviewFocus,
} from './context-builder';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'writing-tools-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
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

describe('private notes', () => {
  it('never reach the context, in any Mode and focus', async () => {
    const { view, scenes, chapters, entries } = await fixture();
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
    ];
    const commands: Command[] = ['question', 'review-scene', 'review-chapter'];
    const requests: ContextRequest[] = [
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

    for (const request of requests) {
      const text = sent(await buildContext(view, request));
      expect(text).toContain('Her sister.');
      expect(text).not.toContain(SENTINEL);
    }
  });
});
