import { describe, expect, it } from 'vitest';
import type { KeyKeeping, ProvidersView } from '../shared/api';
import type { RequestSize } from '../shared/request-size';
import {
  addedMessage,
  failureMessage,
  statusLabel,
  tooBigMessage,
} from './provider-messages';

/** Every Provider added, its secret kept as `kept`. */
function view(
  kept: KeyKeeping | null,
  address: string | null = null,
): ProvidersView {
  const added = { added: true, masked: 'sk-…abcd', kept, address };
  return {
    providers: { anthropic: added, openrouter: added, lmstudio: added },
    canEncrypt: kept !== 'untilQuit',
  };
}

const encrypted = view('encrypted');
const untilQuit = view('untilQuit');

describe('addedMessage', () => {
  it('says a good key is saved', () => {
    expect(
      addedMessage('anthropic', { status: 'connected', view: encrypted }),
    ).toEqual({ warning: false, text: 'Key saved.' });
  });

  it('says a rejected key is not saved, naming its Provider', () => {
    expect(
      addedMessage('openrouter', { status: 'key-rejected', view: encrypted }),
    ).toEqual({
      warning: true,
      text: "Key rejected: OpenRouter doesn't accept it, so it wasn't saved.",
    });
  });

  it('warns that an account without credit is saved anyway', () => {
    expect(
      addedMessage('anthropic', { status: 'no-credit', view: encrypted }),
    ).toEqual({
      warning: true,
      text: 'Key saved, but the account has no credit. Add credit with Anthropic before using the Assistant.',
    });
  });

  it('warns that a key that could not be checked is saved anyway', () => {
    expect(
      addedMessage('anthropic', { status: 'unreachable', view: encrypted }),
    ).toEqual({
      warning: true,
      text: "Can't reach Anthropic, so the key wasn't checked. It's saved; if it doesn't work, the Assistant will say so.",
    });
  });

  it('says a key kept until the app quits is not saved', () => {
    expect(
      addedMessage('anthropic', { status: 'connected', view: untilQuit }).text,
    ).toBe('Key kept until Scaffold quits.');
    expect(
      addedMessage('openrouter', { status: 'unreachable', view: untilQuit })
        .text,
    ).toBe(
      "Can't reach OpenRouter, so the key wasn't checked. It's kept until Scaffold quits; if it doesn't work, the Assistant will say so.",
    );
  });

  describe('LM Studio', () => {
    const lmStudio = view(null, 'http://localhost:1234');

    it('says it is connected', () => {
      expect(
        addedMessage('lmstudio', { status: 'connected', view: lmStudio }),
      ).toEqual({ warning: false, text: 'LM Studio connected.' });
    });

    it('warns that it is kept though not running', () => {
      expect(
        addedMessage('lmstudio', { status: 'unreachable', view: lmStudio }),
      ).toEqual({
        warning: true,
        text: "LM Studio isn't running at localhost:1234. It's saved; start its server to use it.",
      });
    });

    it('says a rejected token is not saved', () => {
      expect(
        addedMessage('lmstudio', { status: 'key-rejected', view: lmStudio }),
      ).toEqual({
        warning: true,
        text: "LM Studio doesn't accept the token, so it wasn't saved.",
      });
    });
  });
});

describe('statusLabel', () => {
  it.each([
    ['anthropic', 'connected', 'Connected'],
    ['openrouter', 'key-rejected', 'Key rejected'],
    ['anthropic', 'no-credit', 'No credit'],
    ['openrouter', 'unreachable', 'Can’t be reached'],
    ['lmstudio', 'unreachable', 'Not running'],
    ['lmstudio', 'key-rejected', 'Token rejected'],
  ] as const)('labels %s %s as %s', (id, status, label) => {
    expect(statusLabel(id, status)).toBe(label);
  });
});

describe('failureMessage', () => {
  const local = view(null, 'http://localhost:1234');
  const lmStudio = { provider: 'lmstudio', id: 'qwen3-8b' } as const;
  const openRouter = { provider: 'openrouter', id: 'qwen/qwen3-235b' } as const;

  it('says LM Studio isn’t running at its address', () => {
    expect(failureMessage('offline', lmStudio, local)).toBe(
      "LM Studio isn't running at localhost:1234. Start its server, then retry, or choose another Model.",
    );
  });

  it('names the Provider that couldn’t be reached, or refused', () => {
    expect(failureMessage('offline', openRouter, encrypted)).toBe(
      "Can't reach OpenRouter. Check the connection, then retry, or choose another Model.",
    );
    expect(failureMessage('key', openRouter, encrypted)).toBe(
      "OpenRouter didn't accept the API key. Check it in Settings, then retry.",
    );
    expect(failureMessage('credit', openRouter, encrypted)).toBe(
      'The OpenRouter account is out of credit. Add credit there, then retry, or choose another Model.',
    );
  });

  it('says when the Model’s Provider isn’t added, whatever the call said', () => {
    const removed: ProvidersView = {
      ...encrypted,
      providers: {
        ...encrypted.providers,
        openrouter: { added: false, masked: null, kept: null, address: null },
      },
    };
    expect(failureMessage('key', openRouter, removed)).toBe(
      "OpenRouter isn't added. Add it in Settings, or choose another Model.",
    );
  });
});

describe('the explanation of a Plan’s request too big for its Model', () => {
  const haiku = { provider: 'anthropic', id: 'claude-haiku-4-5' } as const;
  const lmStudio = { provider: 'lmstudio', id: 'qwen3-8b' } as const;
  const size: RequestSize = {
    request: 230_000,
    parts: [
      { label: 'The plan', size: 40_000 },
      { label: 'The Story Bible', size: 25_000 },
    ],
    broughtIn: [
      { id: 'b1', title: 'Heist ideas', size: 120_000 },
      { id: 'b2', title: 'Names', size: 900 },
    ],
    ways: ['remove-brought-in', 'narrow-plan-focus'],
    window: 200_000,
    reply: 32_000,
  };

  it('says nothing was sent, lists what is biggest first, and the ways out', () => {
    expect(tooBigMessage(size, haiku, 'Haiku 4.5')).toEqual({
      lead: 'This request is too big for Haiku 4.5, so nothing was sent: ≈ 262k tokens with room for the reply, and its window holds ≈ 200k tokens.',
      parts: [
        'Brought in: “Heist ideas”, ≈ 120k tokens',
        'The plan, ≈ 40k tokens',
        'The Story Bible, ≈ 25k tokens',
        'Brought in: “Names”, ≈ 900 tokens',
      ],
      after: [
        'To make room, remove a brought-in Brainstorm, narrow the focus to a Part or Chapter, or choose another Model, then retry.',
      ],
    });
  });

  it('gives a Provider’s refusal the same explanation, and with nothing brought in, offers no Brainstorm to remove', () => {
    const refused: RequestSize = {
      ...size,
      broughtIn: [],
      ways: ['narrow-plan-focus'],
      window: null,
      reply: 0,
    };

    expect(tooBigMessage(refused, haiku, 'Haiku 4.5')).toEqual({
      lead: 'Haiku 4.5 refused this request as too big for its window: ≈ 230k tokens.',
      parts: ['The plan, ≈ 40k tokens', 'The Story Bible, ≈ 25k tokens'],
      after: [
        'To make room, narrow the focus to a Part or Chapter, or choose another Model, then retry.',
      ],
    });
  });

  it('adds for LM Studio that the loaded Model’s window may be smaller than it reports', () => {
    const refused = { ...size, window: null, reply: 0 };

    expect(tooBigMessage(refused, lmStudio, 'Qwen3 8B').after).toEqual([
      'To make room, remove a brought-in Brainstorm, narrow the focus to a Part or Chapter, or choose another Model, then retry.',
      'The Model loaded in LM Studio may have a smaller window than it reports: raise its context length in LM Studio.',
    ]);
  });

  it('without the sizes, still tells a refusal as too big, never as any other failure', () => {
    expect(failureMessage('context', haiku, encrypted)).toBe(
      'Anthropic refused this request as too big for its window. Choose another Model.',
    );
  });
});

describe('the explanation of another Mode’s request too big for its Model', () => {
  const sonnet = { provider: 'anthropic', id: 'claude-sonnet-4-5' } as const;
  const lmStudio = { provider: 'lmstudio', id: 'qwen3-8b' } as const;
  const review: RequestSize = {
    request: 90_000,
    parts: [
      { label: 'The Story Bible', size: 12_000 },
      { label: 'The Outline skeleton', size: 3_000 },
      { label: 'The Conversation', size: 8_000 },
      { label: 'This Chapter’s Prose', size: 60_000 },
      { label: '@-mentioned: “The Harbour”', size: 7_000 },
    ],
    broughtIn: [],
    ways: ['remove-mention', 'review-scene'],
    window: 64_000,
    reply: 16_000,
  };

  it('lists a Chapter Review’s parts biggest first, with the ways out that fit it', () => {
    expect(tooBigMessage(review, sonnet, 'Sonnet 4.5')).toEqual({
      lead: 'This request is too big for Sonnet 4.5, so nothing was sent: ≈ 106k tokens with room for the reply, and its window holds ≈ 64k tokens.',
      parts: [
        'This Chapter’s Prose, ≈ 60k tokens',
        'The Story Bible, ≈ 12k tokens',
        'The Conversation, ≈ 8k tokens',
        '@-mentioned: “The Harbour”, ≈ 7k tokens',
        'The Outline skeleton, ≈ 3k tokens',
      ],
      after: [
        'To make room, remove an @-mention, review a Scene instead of the whole Chapter, or choose another Model, then retry.',
      ],
    });
  });

  it('offers to narrow an Interview’s focus, or start a new Conversation, when those apply', () => {
    const interview: RequestSize = {
      ...review,
      parts: [
        { label: 'The Interview focus', size: 30_000 },
        { label: 'The Conversation', size: 50_000 },
      ],
      ways: ['narrow-interview-focus', 'new-conversation'],
    };

    expect(tooBigMessage(interview, sonnet, 'Sonnet 4.5').after).toEqual([
      'To make room, narrow the Interview focus, start a new Conversation, or choose another Model, then retry.',
    ]);
  });

  it('gives a Provider’s refusal on LM Studio the same explanation, with its line', () => {
    const refused: RequestSize = {
      ...review,
      ways: [],
      window: null,
      reply: 0,
    };

    expect(tooBigMessage(refused, lmStudio, 'Qwen3 8B')).toMatchObject({
      lead: 'Qwen3 8B refused this request as too big for its window: ≈ 90k tokens.',
      after: [
        'To make room, choose another Model, then retry.',
        'The Model loaded in LM Studio may have a smaller window than it reports: raise its context length in LM Studio.',
      ],
    });
  });
});
