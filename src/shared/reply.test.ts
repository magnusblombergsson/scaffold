import { describe, expect, it } from 'vitest';
import { replyText, splitReply } from './reply';

describe('splitReply', () => {
  it('takes proposal blocks out of the reply text, in order', () => {
    const reply = [
      'So Anna is older.',
      '',
      '```proposal',
      '{"entry": "anna", "field": "description", "append": "Older by two years."}',
      '```',
      '',
      'Does she know?',
      '```proposal',
      '{"entry": "anna", "field": "aliases", "add": "Nan"}',
      '```',
    ].join('\n');

    expect(splitReply(reply)).toEqual({
      text: 'So Anna is older.\n\nDoes she know?',
      proposals: [
        { entry: 'anna', field: 'description', append: 'Older by two years.' },
        { entry: 'anna', field: 'aliases', add: 'Nan' },
      ],
      findings: [],
      unreadable: 0,
    });
  });

  it('takes finding blocks out apart from proposal blocks', () => {
    const reply = [
      'Two things.',
      '```finding',
      '{"type": "missing", "comment": "No ferry."}',
      '```',
      '```proposal',
      '{"entry": "anna", "field": "aliases", "add": "Nan"}',
      '```',
      '```finding',
      '{"type": "voice", "comment": "Not Mira."}',
      '```',
      'There are more.',
    ].join('\n');

    expect(splitReply(reply)).toEqual({
      text: 'Two things.\n\nThere are more.',
      proposals: [{ entry: 'anna', field: 'aliases', add: 'Nan' }],
      findings: [
        { type: 'missing', comment: 'No ferry.' },
        { type: 'voice', comment: 'Not Mira.' },
      ],
      unreadable: 0,
    });
  });

  it('skips a block that is not JSON, counting it, and leaves other code blocks alone', () => {
    const reply = '```proposal\n{oops\n```\n```\nnot a proposal\n```';

    expect(splitReply(reply)).toEqual({
      text: '```\nnot a proposal\n```',
      proposals: [],
      findings: [],
      unreadable: 1,
    });
  });
});

describe('replyText', () => {
  it('hides a proposal block still streaming in', () => {
    expect(replyText('Older?\n```proposal\n{"entry": "an')).toBe('Older?');
  });

  it('hides a finding block still streaming in', () => {
    expect(replyText('Three.\n```finding\n{"type": "vo')).toBe('Three.');
  });
});
