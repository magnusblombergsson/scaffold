import { describe, expect, it } from 'vitest';
import type { Model } from '../../shared/models';
import { streamingText } from '../../shared/proposal';
import { fakeProvider, type FakeReply } from './fake-provider';
import { ProviderError } from './provider';
import { finishedCall } from './reply-finishing';

const OPUS: Model = { provider: 'anthropic', id: 'claude-opus-5-5' };
const request = {
  model: OPUS,
  system: [{ text: 'Help.' }],
  messages: [{ role: 'user' as const, content: 'Why?' }],
};
const usage = { input: 2_000, cached: 0, written: 0, output: 900 };

const block = (json: object) =>
  `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;

/** What a call that streams `reply` comes to. */
const call = (reply: FakeReply) =>
  finishedCall(
    fakeProvider(() => reply),
    request,
  );

/** What a complete reply of `text` comes to. */
const complete = (text: string) => call([text]);

describe('thinking', () => {
  it('strips <think>…</think> from the reply before it is shown', async () => {
    expect(
      await complete('<think>She is older, I think.</think>\n\nIs Anna older?'),
    ).toMatchObject({
      kind: 'reply',
      text: 'Is Anna older?',
      ending: 'complete',
    });
  });

  it('ignores Proposal blocks inside thinking', async () => {
    const proposal = block({
      entry: 'anna',
      field: 'description',
      value: 'Older.',
    });
    expect(
      await complete(`<think>Maybe:\n${proposal}\nNo.</think>Is Anna older?`),
    ).toMatchObject({ text: 'Is Anna older?', proposals: [], unreadable: 0 });
  });

  it('hides an open <think> while streaming, as the pieces come', () => {
    const pieces = ['<thi', 'nk>Hm, ', 'older?</th', 'ink>Is ', 'Anna older?'];
    const shown = pieces.map((_, i) =>
      streamingText(pieces.slice(0, i + 1).join('')),
    );
    expect(shown).toEqual(['', '', '', 'Is', 'Is Anna older?']);
  });

  it('keeps what only looks like the start of a <think> once the reply is finished', async () => {
    expect(await complete('Is 3 < 4? Or 4 <')).toMatchObject({
      text: 'Is 3 < 4? Or 4 <',
    });
  });

  it('strips thinking split across pieces in the finished reply', async () => {
    expect(await call(['<thi', 'nk>Hm.</th', 'ink>Why?'])).toMatchObject({
      text: 'Why?',
    });
  });

  it('streams each piece as it comes, thinking and all', async () => {
    const pieces: string[] = [];
    await finishedCall(
      fakeProvider(() => ['<think>Hm.</think>', 'Why?']),
      request,
      (text) => pieces.push(text),
    );
    expect(pieces).toEqual(['<think>Hm.</think>', 'Why?']);
  });
});

describe('how a reply ended', () => {
  it('a complete reply makes its Proposals and Findings, with what it used and cost', async () => {
    const finding = { type: 'voice', comment: 'Not Mira.' };
    const proposal = { entry: 'anna', field: 'description', value: 'Older.' };
    expect(
      await call({
        text: [
          `Two.\n\`\`\`finding\n${JSON.stringify(finding)}\n\`\`\`\n`,
          block(proposal),
        ],
        usage,
        cost: 0.01,
      }),
    ).toEqual({
      kind: 'reply',
      text: 'Two.',
      ending: 'complete',
      proposals: [proposal],
      findings: [finding],
      unreadable: 0,
      metered: { usage, cost: 0.01 },
      failure: null,
    });
  });

  it('a reply stopped at the length limit is cut short: it keeps its text and makes no Proposals', async () => {
    expect(
      await call({
        text: [
          `Anna is older.\n${block({ entry: 'anna', field: 'description', value: 'Older.' })}\nAnd`,
        ],
        finish: 'length',
      }),
    ).toMatchObject({
      kind: 'reply',
      text: 'Anna is older.\n\nAnd',
      ending: 'cut-short',
      proposals: [],
      unreadable: 0,
      failure: null,
    });
  });

  it('a failed reply is interrupted, keeps its text, what it used and cost, and why it failed, and makes no Proposals', async () => {
    expect(
      await call({
        text: [
          `Anna.\n${block({ entry: 'anna', field: 'description', value: 'Older.' })}`,
        ],
        usage,
        cost: 0.01,
        fail: 'offline',
      }),
    ).toMatchObject({
      kind: 'reply',
      text: 'Anna.',
      ending: 'interrupted',
      proposals: [],
      metered: { usage, cost: 0.01 },
      failure: { kind: 'offline', error: 'The call failed: offline' },
    });
  });

  it('a reply that stops with no finish is interrupted, whatever the Provider', async () => {
    expect(
      await call({ text: ['Anna is'], usage, finish: null }),
    ).toMatchObject({
      kind: 'reply',
      text: 'Anna is',
      ending: 'interrupted',
      metered: { usage },
      failure: { kind: 'other' },
    });
  });

  it('a reply holding only a Proposal is not empty', async () => {
    const proposal = { entry: 'anna', field: 'description', value: 'Older.' };
    expect(await complete(block(proposal))).toMatchObject({
      kind: 'reply',
      text: '',
      ending: 'complete',
      proposals: [proposal],
    });
  });
});

describe('empty replies', () => {
  it('a reply with no text, or none left after thinking, is empty, with how it finished', async () => {
    expect(await call([])).toEqual({
      kind: 'empty',
      reason: 'complete',
      metered: {},
      failure: null,
    });
    expect(await complete('<think>Hm.</think>\n\n')).toMatchObject({
      kind: 'empty',
      reason: 'complete',
    });
    expect(
      await call({ text: ['<think>Long thoughts'], usage, finish: 'length' }),
    ).toEqual({
      kind: 'empty',
      reason: 'length',
      metered: { usage },
      failure: null,
    });
  });

  it('a call that failed after only thinking is empty and failed, and keeps what it used and cost', async () => {
    expect(
      await call({
        text: ['<think>Hm, the quay'],
        usage,
        cost: 0.01,
        fail: 'rate-limit',
      }),
    ).toMatchObject({
      kind: 'empty',
      reason: 'failed',
      metered: { usage, cost: 0.01 },
      failure: { kind: 'rate-limit' },
    });
  });

  it('a call with only thinking and no finish is empty and failed', async () => {
    expect(
      await call({ text: ['<think>Hm'], usage, finish: null }),
    ).toMatchObject({
      kind: 'empty',
      reason: 'failed',
      failure: { kind: 'other' },
    });
  });
});

describe('a call that came to nothing', () => {
  it('failed with no text and said nothing of what it used', async () => {
    expect(await call({ text: ['<think>Hm'], fail: 'offline' })).toEqual({
      kind: 'nothing',
      metered: {},
      failure: { kind: 'offline', error: 'The call failed: offline' },
    });
  });

  it('keeps what the Provider said of the failure: its detail and how long to wait', async () => {
    const provider = {
      // oxlint-disable-next-line require-yield
      async *stream() {
        throw new ProviderError('rate-limit', 'Slow down', {
          detail: 'Too many requests',
          retryAfter: 30,
        });
      },
    };
    expect(await finishedCall(provider, request)).toEqual({
      kind: 'nothing',
      metered: {},
      failure: {
        kind: 'rate-limit',
        error: 'Slow down',
        detail: 'Too many requests',
        retryAfter: 30,
      },
    });
  });
});

describe('unreadable Proposal blocks', () => {
  it('counts Proposal blocks that are not JSON in a finished reply', async () => {
    expect(
      await complete(
        `Hm.\n\`\`\`proposal\n{oops\n\`\`\`\n\`\`\`proposal\n{"entry": \n\`\`\`\n${block({ entry: 'anna', field: 'aliases', add: 'Nan' })}`,
      ),
    ).toMatchObject({
      text: 'Hm.',
      proposals: [{ entry: 'anna', field: 'aliases', add: 'Nan' }],
      unreadable: 2,
    });
  });

  it('counts a Proposal block never closed at the end of a finished reply', async () => {
    expect(await complete('Hm.\n```proposal\n{"entry": "anna"')).toMatchObject({
      unreadable: 1,
    });
  });

  it('counts none in a reply that makes no Proposals', async () => {
    expect(
      await call({ text: ['Hm.\n```proposal\n{oops\n```'], finish: 'length' }),
    ).toMatchObject({ unreadable: 0 });
  });
});
