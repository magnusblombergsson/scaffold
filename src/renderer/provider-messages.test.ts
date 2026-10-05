import { describe, expect, it } from 'vitest';
import type { KeyKeeping, ProvidersView } from '../shared/api';
import { addedMessage, statusLabel } from './provider-messages';

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
