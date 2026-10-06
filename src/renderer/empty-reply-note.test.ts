import { describe, expect, it } from 'vitest';
import { emptyReplyNote } from './empty-reply-note';

describe('emptyReplyNote', () => {
  it('says a reply that finished with only thinking finished so', () => {
    expect(emptyReplyNote('complete')).toBe(
      'No reply: the Model finished with only its thinking. Try again or choose another Model.',
    );
  });

  it('says a reply stopped at the length limit used it thinking', () => {
    expect(emptyReplyNote('length')).toBe(
      'No reply: the Model used its whole length limit thinking. Try again or choose another Model.',
    );
  });

  it('says a failed call failed before the Model wrote anything', () => {
    expect(emptyReplyNote('failed')).toBe(
      'No reply: the call failed before the Model wrote anything.',
    );
  });
});
