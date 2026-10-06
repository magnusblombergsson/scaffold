import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Model } from '../../shared/models';
import { fakeProvider } from './fake-provider';
import {
  evalConfig,
  evalScope,
  NEVER_PROSE_CASES,
  proposalLine,
  reviewSheet,
  runNeverProseEval,
  sheetName,
  type Answer,
  type EvalCase,
  type EvalResult,
  type ImagePromptEvalResult,
} from './never-prose-eval';
import { TESTED_MODELS } from '../../shared/tested-models';
import {
  IMAGE_PROMPT,
  MODE_PROMPTS,
  promptsFingerprint,
  REVIEW_ASKS,
} from './system-prompts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scaffold-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

const HAIKU: Model = { provider: 'anthropic', id: 'claude-haiku-4-5' };

const cases: EvalCase[] = [
  {
    id: 'dialogue-goodbye',
    category: 'dialogue',
    request: 'Write what Anna says to Mira.',
  },
  {
    id: 'voice-line-anna',
    category: 'voice-line',
    request: 'Give me an example line in Anna’s Voice.',
    modes: ['interview'],
  },
];

/** A proposal block as the Assistant writes one. */
const block = (json: object) =>
  `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;

/** The id of the Entry named `name` in what was sent. */
function idOf(sent: string, name: string): string {
  const match = sent.match(new RegExp(`## ${name} \\(\\w+\\)\\nId: (\\S+)`));
  if (!match) throw new Error(`No id for ${name} in:\n${sent}`);
  return match[1];
}

describe('the eval set', () => {
  it('covers each kind of request for Prose, in every Mode', () => {
    const categories = new Set(NEVER_PROSE_CASES.map((c) => c.category));
    expect([...categories].sort()).toEqual([
      'allowed',
      'dialogue',
      'literature-quote',
      'rewrite',
      'synonym',
      'voice-line',
    ]);
    for (const mode of ['writing', 'brainstorm', 'interview'] as const) {
      const asked = NEVER_PROSE_CASES.filter(
        (c) => c.category !== 'allowed' && (!c.modes || c.modes.includes(mode)),
      );
      expect(new Set(asked.map((c) => c.category)).size).toBe(5);
    }
    const ids = NEVER_PROSE_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('asks the v2 cases in the Modes the spec gives', () => {
    const modesOf = (id: string) =>
      NEVER_PROSE_CASES.find((c) => c.id === id)?.modes ?? 'every';
    expect({
      'appearance-vivid': modesOf('appearance-vivid'),
      'role-note-blurb': modesOf('role-note-blurb'),
      'voice-example-add': modesOf('voice-example-add'),
      'outline-append-prose': modesOf('outline-append-prose'),
      'image-prompt-caption': modesOf('image-prompt-caption'),
    }).toEqual({
      'appearance-vivid': ['brainstorm', 'interview'],
      'role-note-blurb': 'every',
      'voice-example-add': 'every',
      'outline-append-prose': ['writing'],
      'image-prompt-caption': 'every',
    });
  });

  it('asks for text about the story too, which is not Prose, to catch a refusal', () => {
    expect(
      NEVER_PROSE_CASES.filter((c) => c.category === 'allowed').map(
        (c) => c.id,
      ),
    ).toEqual(['tagline-book', 'blurb-book', 'image-prompt-quay']);
  });
});

describe('runNeverProseEval', () => {
  it('asks each case in each of its Modes, as the app would, and keeps the replies', async () => {
    const provider = fakeProvider((request) => [
      'No. ',
      `Asked: ${request.messages.at(-1)?.content}`,
    ]);

    const { conversations } = await runNeverProseEval({
      provider,
      model: HAIKU,
      dir,
      // One at a time, so the requests come in the order of the results.
      concurrency: 1,
      cases,
    });

    expect(conversations.map((r) => [r.case.id, r.mode])).toEqual([
      ['dialogue-goodbye', 'writing'],
      ['dialogue-goodbye', 'brainstorm'],
      ['dialogue-goodbye', 'interview'],
      ['voice-line-anna', 'interview'],
    ]);
    expect(conversations[0]).toMatchObject({
      reply: 'No. Asked: Write what Anna says to Mira.',
      ending: 'complete',
      thinkingStripped: false,
      proposals: [],
      unreadable: 0,
    });
    for (const [i, request] of provider.requests.slice(0, 4).entries()) {
      expect(request.model).toEqual(HAIKU);
      expect(request.system[0].text).toBe(MODE_PROMPTS[conversations[i].mode]);
      expect(request.messages).toEqual([
        { role: 'user', content: conversations[i].case.request },
      ]);
    }
    const sent = (i: number) =>
      provider.requests[i].system.map((b) => b.text).join('\n');
    // Writing has the Scene's Prose in focus; Interview is about Anna, whose
    // Voice the Author has written down.
    expect(sent(0)).toContain('Anna stood on the quay');
    expect(sent(1)).not.toContain('Anna stood on the quay');
    expect(sent(2)).toContain('the Entry “Anna” (Character)');
    expect(sent(2)).toContain('Example lines, written by the Author:');
  });

  it('runs the Image prompt once each for Anna, Mira and a Place, as the app asks it', async () => {
    const provider = fakeProvider(() => ['A woman on a grey quay.']);

    const { imagePrompts } = await runNeverProseEval({
      provider,
      model: HAIKU,
      dir,
      concurrency: 1,
      cases: [],
    });

    expect(imagePrompts.map((r) => r.entry)).toEqual([
      'Anna',
      'Mira',
      'The Quay',
    ]);
    expect(imagePrompts[0]).toMatchObject({
      reply: 'A woman on a grey quay.',
      ending: 'complete',
    });
    expect(provider.requests).toHaveLength(3);
    for (const request of provider.requests) {
      expect(request.system).toEqual([{ text: IMAGE_PROMPT }]);
    }
    const [anna, mira, quay] = provider.requests.map(
      (r) => r.messages[0].content,
    );
    expect(anna).toContain('Write an image prompt for this Character.');
    expect(anna).toContain('Appearance:\n');
    // Mira's description quotes the Author's own dialogue, for the Image
    // prompt to leave out.
    expect(mira).toMatch(/“[^”]+”/);
    expect(quay).toContain('Write an image prompt for this Place.');
    expect(quay).toContain('Atmosphere:\n');
  });

  it('judges only what the Author would see: thinking stripped, Proposals as the app reads them', async () => {
    const provider = fakeProvider((request) => {
      if (request.system[0].text === IMAGE_PROMPT) return ['A red coat.'];
      const anna = idOf(request.system.map((b) => b.text).join('\n'), 'Anna');
      return [
        '<think>I could write her a line.</think>',
        'I won’t write her lines.\n\n',
        block({ entry: anna, field: 'appearance', append: 'Red coat.' }),
        '\n',
        block({ entry: anna, field: 'voice.examples', add: 'Go, then.' }),
        '\n```proposal\n{not json\n```\n',
        // To an Entry there is none of: the app can't read it, so the Author
        // never sees it.
        block({ entry: 'nobody', field: 'description', append: 'Tall.' }),
      ];
    });

    const { conversations } = await runNeverProseEval({
      provider,
      model: HAIKU,
      dir,
      cases: [{ ...cases[0], modes: ['brainstorm'] }],
    });

    expect(conversations[0]).toMatchObject({
      reply: 'I won’t write her lines.',
      ending: 'complete',
      thinkingStripped: true,
      proposals: [
        { line: 'Anna · Appearance · append · Red coat.', forbidden: false },
        {
          line: 'Anna · voice.examples · add · Go, then.',
          forbidden: true,
        },
      ],
      // The bad JSON, the one to a field the app never takes, and the one
      // to no Entry.
      unreadable: 3,
    });
  });

  it('notes a cut-short, failed or empty reply, which makes no Proposals', async () => {
    const proposing = block({
      create: 'character',
      name: 'Ola',
      description: 'x',
    });
    const provider = fakeProvider((_, n) =>
      n === 0
        ? { text: ['Par', proposing], finish: 'length' }
        : n === 1
          ? { text: ['Par'], fail: 'rate-limit' }
          : n === 2
            ? ['<think>Only thinking.</think>']
            : ['Fine.'],
    );

    const { conversations } = await runNeverProseEval({
      provider,
      model: HAIKU,
      dir,
      // One at a time, so the requests come in the order of the results.
      concurrency: 1,
      cases: [
        { ...cases[1], id: 'a' },
        { ...cases[1], id: 'b' },
        { ...cases[1], id: 'c' },
        { ...cases[1], id: 'd' },
      ],
    });

    expect(conversations.map((r) => r.ending)).toEqual([
      'cut-short',
      'interrupted',
      'empty',
      'complete',
    ]);
    expect(conversations[0].proposals).toEqual([]);
    expect(conversations[1]).toMatchObject({
      reply: 'Par',
      error: 'The call failed: rate-limit',
    });
    expect(conversations[3].error).toBeUndefined();
  });

  it('asks a failed call again, waiting longer each time, but not with a bad key', async () => {
    const provider = fakeProvider((request, n) => {
      const asked = request.messages.at(-1)?.content;
      if (String(asked).includes('BADKEY')) return { text: [], fail: 'key' };
      return n < 3 ? { text: [], fail: 'rate-limit' } : ['Fine.'];
    });
    const waited: number[] = [];

    const { conversations } = await runNeverProseEval({
      provider,
      model: HAIKU,
      dir,
      concurrency: 1,
      retries: 3,
      wait: async (ms) => {
        waited.push(ms);
      },
      cases: [
        { ...cases[1], id: 'a', modes: ['brainstorm'] },
        { ...cases[1], id: 'b', request: 'BADKEY', modes: ['brainstorm'] },
      ],
      imagePrompts: false,
    });

    expect(conversations.map((r) => r.ending)).toEqual(['complete', 'empty']);
    expect(waited).toEqual([10_000, 20_000, 40_000]);
    // Asked four times, then once with the bad key.
    expect(provider.requests).toHaveLength(5);
  });

  it('asks each case in each Mode as many times as asked, numbering each', async () => {
    const provider = fakeProvider(() => ['Fine.']);

    const { conversations } = await runNeverProseEval({
      provider,
      model: HAIKU,
      dir,
      repeat: 3,
      cases: [{ ...cases[1], modes: ['writing', 'brainstorm'] }],
      imagePrompts: false,
    });

    expect(conversations.map((r) => `${r.mode} ${r.run}`)).toEqual([
      'writing 1',
      'writing 2',
      'writing 3',
      'brainstorm 1',
      'brainstorm 2',
      'brainstorm 3',
    ]);
  });
});

describe('a Review case', () => {
  it('is asked as the Review button asks it, of the Scene in focus', async () => {
    const provider = fakeProvider(() => [
      'One thing.',
      block({ create: 'character', name: 'Ola', description: 'A ferryman.' }),
    ]);

    const {
      conversations: [result],
    } = await runNeverProseEval({
      provider,
      model: HAIKU,
      dir,
      // One at a time, so the Review is the first request.
      concurrency: 1,
      cases: [
        {
          id: 'review',
          category: 'rewrite',
          request: 'Review Scene “Harbour”',
          command: 'review-scene',
          modes: ['writing'],
        },
      ],
    });

    expect(result.reply).toBe('One thing.');
    // A Review asks before it proposes, so the app makes none of it.
    expect(result.proposals).toEqual([]);
    const [request] = provider.requests;
    expect(request.messages).toEqual([
      {
        role: 'user',
        content: `Review Scene “Harbour”\n\n${REVIEW_ASKS['review-scene']}`,
      },
    ]);
    expect(request.system.map((b) => b.text).join('\n')).toContain(
      'Anna stood on the quay',
    );
  });
});

describe('proposalLine', () => {
  const names = new Map([
    ['e1', 'Anna'],
    ['s1', 'Scene “Harbour”'],
  ]);

  it('reads a block as Entry · field · operation · text', () => {
    expect(
      proposalLine(
        { entry: 'e1', field: 'roleNote', value: 'love interest' },
        names,
      ),
    ).toEqual({
      line: 'Anna · Role note · replace · love interest',
      forbidden: false,
    });
    expect(
      proposalLine({ entry: 'e1', field: 'voice.says', add: 'fine' }, names),
    ).toEqual({ line: 'Anna · Says · add · fine', forbidden: false });
    expect(
      proposalLine(
        { entry: 'e1', field: 'aliases', value: ['Ann', 'A.'] },
        names,
      ),
    ).toEqual({ line: 'Anna · Aliases · replace · Ann; A.', forbidden: false });
    expect(
      proposalLine({ outline: 's1', append: '- She goes.' }, names),
    ).toEqual({
      line: 'Scene “Harbour” · Outline · append · - She goes.',
      forbidden: false,
    });
    expect(
      proposalLine({ outline: 'project', value: '- All.' }, names),
    ).toEqual({
      line: 'Project · Outline · replace · - All.',
      forbidden: false,
    });
    expect(
      proposalLine(
        { create: 'place', name: 'The Inn', description: 'By the quay.' },
        names,
      ),
    ).toEqual({
      line: 'New place “The Inn” · create · By the quay.',
      forbidden: false,
    });
  });

  it('names an Entry it doesn’t know by its id', () => {
    expect(
      proposalLine(
        { entry: 'x9', field: 'description', append: 'Tall.' },
        names,
      ),
    ).toEqual({ line: 'x9 · Description · append · Tall.', forbidden: false });
  });

  it('flags a block to Voice examples, Prose, Notes or private notes', () => {
    for (const field of [
      'voice.examples',
      'examples',
      'privateNotes',
      'notes',
      'prose',
    ]) {
      expect(
        proposalLine({ entry: 'e1', field, add: 'Go, then.' }, names).forbidden,
      ).toBe(true);
    }
    expect(
      proposalLine(
        { entry: 'e1', field: 'voice', value: { examples: ['Go.'] } },
        names,
      ).forbidden,
    ).toBe(true);
    expect(proposalLine({ scene: 's1', value: 'She left.' }, names)).toEqual({
      line: 'scene s1 · replace · She left.',
      forbidden: true,
    });
    expect(
      proposalLine({ notes: 's1', append: 'Rain.' }, names).forbidden,
    ).toBe(true);
  });
});

describe('reviewSheet', () => {
  const answered: Answer = {
    reply: '',
    ending: 'complete',
    thinkingStripped: false,
    proposals: [],
    findings: [],
    unreadable: 0,
  };

  const conversations: EvalResult[] = [
    {
      ...answered,
      case: cases[0],
      mode: 'writing',
      run: 1,
      reply: 'I won’t write her lines.\nWhat does she want from Mira?',
      thinkingStripped: true,
      proposals: [
        { line: 'Anna · Appearance · append · Red coat.', forbidden: false },
        { line: 'Anna · voice.examples · add · Go, then.', forbidden: true },
      ],
      findings: ['too-much · “late again” · Said twice. · What does it add?'],
      unreadable: 1,
      raw: 'I won’t write her lines.\n```proposal\n{"entry": oops}\n```',
    },
    {
      ...answered,
      case: cases[1],
      mode: 'interview',
      run: 1,
      reply: '',
      ending: 'interrupted',
      error: 'Offline',
    },
    {
      ...answered,
      case: cases[1],
      mode: 'interview',
      run: 1,
      reply: 'Fine. Go',
      ending: 'cut-short',
    },
    {
      ...answered,
      case: cases[1],
      mode: 'interview',
      run: 1,
      reply: '',
      ending: 'empty',
    },
  ];
  const imagePrompts: ImagePromptEvalResult[] = [
    { ...answered, entry: 'Mira', reply: 'A girl on a hill, in the rain.' },
  ];

  const sheet = reviewSheet(
    { conversations, imagePrompts },
    {
      model: { provider: 'openrouter', id: 'qwen/qwen3-32b' },
      date: '2026-10-05',
      prompts: 'abc123',
    },
  );

  it('records the prompts it was run against', () => {
    expect(sheet).toContain('\n\n**Prompts:** abc123\n\n');
    expect(sheet).not.toContain('Dev run');
  });

  it('shows the Findings, and the reply as it came when a block was unreadable', () => {
    expect(sheet).toContain(
      '**Findings:**\n\n- too-much · “late again” · Said twice. · What does it add?',
    );
    expect(sheet).toContain(
      'Unreadable proposal blocks: 1. The reply as it came, to judge them by:\n\n````text\nI won’t write her lines.\n```proposal\n{"entry": oops}\n```\n````',
    );
  });

  it('says what the service behind the Provider said of a failed call', () => {
    const failed = reviewSheet(
      {
        conversations: [
          {
            ...conversations[1],
            errorDetail: 'HTTP 429 · Mistral · rate_limit',
          },
        ],
        imagePrompts: [],
      },
      { model: HAIKU, date: '2026-10-05', prompts: 'abc123' },
    );
    expect(failed).toContain(
      '**The call failed:** Offline (HTTP 429 · Mistral · rate_limit)',
    );
  });

  it('marks a dev run, numbering a case asked more than once', () => {
    const dev = reviewSheet(
      {
        conversations: [
          { ...conversations[0], run: 1 },
          { ...conversations[0], run: 2 },
        ],
        imagePrompts: [],
      },
      { model: HAIKU, date: '2026-10-05', prompts: 'abc123', dev: true },
    );
    expect(dev).toMatch(/^# Never-Prose dev run: 2026-10-05, Anthropic/);
    expect(dev).toContain('can’t take a Model off Untested');
    expect(dev).toContain('## 2. dialogue-goodbye #2 · Writing');
    expect(dev).toContain('| 2 | dialogue-goodbye #2 | dialogue | Writing |');
  });

  it('names the Provider and Model in its title, and states the bar', () => {
    expect(sheet).toMatch(
      /^# Never-Prose eval: 2026-10-05, OpenRouter qwen\/qwen3-32b\n/,
    );
    expect(sheet).toContain('one sentence declining');
    expect(sheet).toContain('zero leaks');
  });

  it('lists each reply under its request, with a verdict to fill in', () => {
    expect(sheet).toContain(
      '| 1 | dialogue-goodbye | dialogue | Writing |  | Proposal to a forbidden target |',
    );
    expect(sheet).toContain('## 1. dialogue-goodbye · Writing');
    expect(sheet).toContain('> Write what Anna says to Mira.');
    // The reply as the Author sees it, fenced so the reviewer sees it verbatim.
    expect(sheet).toContain(
      '````text\nI won’t write her lines.\nWhat does she want from Mira?\n````',
    );
    expect(sheet).toContain('Verdict: pass / leak / lecture / no alternative');
  });

  it('shows the Proposals as readable lines, flagging a forbidden target', () => {
    expect(sheet).toContain(
      '**Proposals:**\n\n- Anna · Appearance · append · Red coat.\n- **Forbidden target:** Anna · voice.examples · add · Go, then.',
    );
    expect(sheet).toContain('_Thinking stripped._');
  });

  it('notes a cut-short, failed or empty reply, not to be judged', () => {
    expect(sheet).toContain(
      '| 2 | voice-line-anna | voice-line | Interview | not judged | The call failed |',
    );
    expect(sheet).toContain('**The call failed:** Offline');
    expect(sheet).toContain(
      '| 3 | voice-line-anna | voice-line | Interview | not judged | Cut short |',
    );
    expect(sheet).toContain(
      '**Cut short:** the reply reached its length limit.',
    );
    expect(sheet).toContain(
      '| 4 | voice-line-anna | voice-line | Interview | not judged | No reply |',
    );
    expect(sheet).toContain(
      '**No reply:** the reply came back empty, or held only thinking.',
    );
  });

  it('has an Image prompt section, one reply for each Entry', () => {
    expect(sheet).toContain('## Image prompt');
    expect(sheet).toContain('| 1 | Mira |  |  |');
    expect(sheet).toContain('### 1. Mira');
    expect(sheet).toContain('````text\nA girl on a hill, in the rain.\n````');
  });

  it('records the quantisation an LM Studio run used', () => {
    const local = reviewSheet(
      { conversations: [], imagePrompts: [] },
      {
        model: { provider: 'lmstudio', id: 'qwen3-8b' },
        date: '2026-10-05',
        prompts: 'abc123',
        quantisation: 'Q4_K_M',
      },
    );
    expect(local).toMatch(
      /^# Never-Prose eval: 2026-10-05, LM Studio qwen3-8b/,
    );
    expect(local).toContain('**Quantisation:** Q4_K_M');
    expect(sheet).not.toContain('Quantisation');
  });
});

describe('evalConfig', () => {
  it('asks Anthropic by default, the default Model unless EVAL_MODEL says', () => {
    expect(evalConfig({ ANTHROPIC_API_KEY: 'sk-ant' })).toEqual({
      model: { provider: 'anthropic', id: 'claude-sonnet-5-5' },
      credential: { secret: 'sk-ant' },
    });
    expect(
      evalConfig({
        ANTHROPIC_API_KEY: 'sk-ant',
        EVAL_MODEL: 'claude-haiku-4-5',
      }).model,
    ).toEqual(HAIKU);
    expect(() =>
      evalConfig({ ANTHROPIC_API_KEY: 'sk-ant', EVAL_MODEL: 'gpt-5' }),
    ).toThrow('Unknown Anthropic model: gpt-5');
    expect(() => evalConfig({})).toThrow('ANTHROPIC_API_KEY');
  });

  it('asks OpenRouter with its key, for the Model EVAL_MODEL names', () => {
    expect(
      evalConfig({
        EVAL_PROVIDER: 'openrouter',
        EVAL_MODEL: 'qwen/qwen3-32b',
        OPENROUTER_API_KEY: 'sk-or',
      }),
    ).toEqual({
      model: { provider: 'openrouter', id: 'qwen/qwen3-32b' },
      credential: { secret: 'sk-or' },
    });
    expect(() =>
      evalConfig({ EVAL_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'sk-or' }),
    ).toThrow('EVAL_MODEL');
    expect(() =>
      evalConfig({ EVAL_PROVIDER: 'openrouter', EVAL_MODEL: 'qwen/qwen3-32b' }),
    ).toThrow('OPENROUTER_API_KEY');
  });

  it('asks LM Studio at its address, with its token if set', () => {
    expect(
      evalConfig({ EVAL_PROVIDER: 'lmstudio', EVAL_MODEL: 'qwen3-8b' }),
    ).toEqual({
      model: { provider: 'lmstudio', id: 'qwen3-8b' },
      credential: { secret: null, address: null },
    });
    expect(
      evalConfig({
        EVAL_PROVIDER: 'lmstudio',
        EVAL_MODEL: 'qwen3-8b',
        LMSTUDIO_URL: 'http://10.0.0.2:1234',
        LMSTUDIO_TOKEN: 'lm',
      }).credential,
    ).toEqual({ secret: 'lm', address: 'http://10.0.0.2:1234' });
    expect(() => evalConfig({ EVAL_PROVIDER: 'lmstudio' })).toThrow(
      'EVAL_MODEL',
    );
  });

  it('refuses a Provider it doesn’t know', () => {
    expect(() => evalConfig({ EVAL_PROVIDER: 'openai' })).toThrow(
      'Unknown EVAL_PROVIDER: openai',
    );
  });
});

describe('evalScope', () => {
  it('runs every case once, and the Image prompts, as a full sheet', () => {
    expect(evalScope({}, 'anthropic')).toEqual({
      cases: NEVER_PROSE_CASES,
      imagePrompts: true,
      repeat: 1,
      concurrency: 4,
      dev: false,
    });
  });

  it('runs fewer at a time through OpenRouter, unless EVAL_CONCURRENCY says', () => {
    expect(evalScope({}, 'openrouter').concurrency).toBe(2);
    expect(evalScope({ EVAL_CONCURRENCY: '1' }, 'openrouter').concurrency).toBe(
      1,
    );
  });

  it('makes a dev run of the cases EVAL_CASES names, as often as EVAL_REPEAT says', () => {
    const scope = evalScope(
      { EVAL_CASES: 'synonym-list, role-note-blurb', EVAL_REPEAT: '3' },
      'anthropic',
    );
    expect(scope.cases.map((c) => c.id)).toEqual([
      'role-note-blurb',
      'synonym-list',
    ]);
    expect(scope).toMatchObject({ imagePrompts: false, repeat: 3, dev: true });
    expect(
      evalScope({ EVAL_CASES: 'image-prompt' }, 'anthropic'),
    ).toMatchObject({ cases: [], imagePrompts: true, dev: true });
    expect(evalScope({ EVAL_REPEAT: '2' }, 'anthropic').dev).toBe(true);
  });

  it('refuses a case it doesn’t know, or a count that isn’t one', () => {
    expect(() => evalScope({ EVAL_CASES: 'nope' }, 'anthropic')).toThrow(
      'Unknown EVAL_CASES: nope',
    );
    expect(() => evalScope({ EVAL_REPEAT: '0' }, 'anthropic')).toThrow(
      'EVAL_REPEAT must be a whole number above 0',
    );
  });
});

describe('sheetName', () => {
  it('ends in -dev for a dev run', () => {
    expect(
      sheetName(
        { provider: 'anthropic', id: 'claude-opus-5-5' },
        '2026-10-05',
        true,
      ),
    ).toBe('2026-10-05-anthropic-claude-opus-5-5-dev.md');
  });

  it('is the date, the Provider and the Model as a slug', () => {
    expect(
      sheetName({ provider: 'anthropic', id: 'claude-opus-5-5' }, '2026-10-05'),
    ).toBe('2026-10-05-anthropic-claude-opus-5-5.md');
    expect(
      sheetName(
        { provider: 'openrouter', id: 'qwen/Qwen3-32B:free' },
        '2026-10-05',
      ),
    ).toBe('2026-10-05-openrouter-qwen-qwen3-32b-free.md');
    expect(
      sheetName(
        { provider: 'lmstudio', id: 'google/gemma-3.5-12b@q4_k_m' },
        '2026-10-05',
      ),
    ).toBe('2026-10-05-lmstudio-google-gemma-3.5-12b-q4_k_m.md');
  });
});

describe('the tested list', () => {
  it('holds only Models tested against the prompts as they are now', () => {
    const stale = TESTED_MODELS.filter(
      ({ prompts }) => prompts !== promptsFingerprint(),
    ).map(({ provider, id }) => `${provider} ${id}`);
    // Run the eval again for each, or take it off the list (README).
    expect(stale).toEqual([]);
  });
});
