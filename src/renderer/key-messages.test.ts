import { describe, expect, it } from 'vitest';
import type { KeyStatus } from '../shared/api';
import { keyResultMessage } from './key-messages';

const encrypted: KeyStatus = {
  masked: 'sk-ant-…abcd',
  kept: 'encrypted',
  canEncrypt: true,
};
const untilQuit: KeyStatus = {
  masked: 'sk-ant-…abcd',
  kept: 'untilQuit',
  canEncrypt: false,
};

describe('keyResultMessage', () => {
  it('says a good key is saved', () => {
    expect(keyResultMessage({ check: 'ok', status: encrypted })).toEqual({
      warning: false,
      text: 'Key saved.',
    });
  });

  it('says an invalid key is not saved', () => {
    expect(keyResultMessage({ check: 'invalid', status: encrypted })).toEqual({
      warning: true,
      text: "Invalid key: Anthropic doesn't accept it, so it wasn't saved.",
    });
  });

  it('warns that an account without credit is saved anyway', () => {
    expect(keyResultMessage({ check: 'no-credit', status: encrypted })).toEqual(
      {
        warning: true,
        text: 'Key saved, but the account has no credit. Add credit in Anthropic Console before using the Assistant.',
      },
    );
  });

  it('warns that a key that could not be checked is saved anyway', () => {
    expect(
      keyResultMessage({ check: 'unreachable', status: encrypted }),
    ).toEqual({
      warning: true,
      text: "Can't reach Anthropic, so the key wasn't checked. It's saved; if it doesn't work, the Assistant will say so.",
    });
  });

  it('says a key kept until the app quits is not saved', () => {
    expect(keyResultMessage({ check: 'ok', status: untilQuit }).text).toBe(
      'Key kept until Scaffold quits.',
    );
    expect(
      keyResultMessage({ check: 'unreachable', status: untilQuit }).text,
    ).toBe(
      "Can't reach Anthropic, so the key wasn't checked. It's kept until Scaffold quits; if it doesn't work, the Assistant will say so.",
    );
  });
});
