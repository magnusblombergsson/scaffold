import { describe, expect, it } from 'vitest';
import {
  findingBlock,
  findingOf,
  inOrder,
  isFinding,
  quotedIn,
  reviewedUnit,
  type Finding,
} from './finding';
import type { ConversationMessage } from './conversation';
import type { Manuscript } from './project-types';

describe('findingOf', () => {
  it('takes a Finding the Assistant wrote: its type, comment, quote, question and Scene', () => {
    expect(
      findingOf({
        type: 'contradiction',
        scene: 's1',
        quote: ' Her eyes were  brown. ',
        comment: 'The Story Bible has them blue.',
        question: 'Which holds?',
      }),
    ).toEqual({
      type: 'contradiction',
      sceneId: 's1',
      quote: 'Her eyes were brown.',
      comment: 'The Story Bible has them blue.',
      question: 'Which holds?',
    });
  });

  it('leaves out a quote, question or Scene not given', () => {
    expect(
      findingOf({ type: 'not-yet-covered', comment: 'Mira never arrives.' }),
    ).toEqual({ type: 'not-yet-covered', comment: 'Mira never arrives.' });
  });

  it('takes nothing of an unknown type or without a comment', () => {
    expect(findingOf({ type: 'typo', comment: 'Hm.' })).toBeNull();
    expect(findingOf({ type: 'voice', comment: ' ' })).toBeNull();
    expect(findingOf('voice')).toBeNull();
    expect(findingOf(null)).toBeNull();
  });
});

describe('inOrder', () => {
  it('orders contradiction → missing → too much → Voice → not yet covered, keeping the order within a type', () => {
    const finding = (type: Finding['type'], comment: string): Finding => ({
      type,
      comment,
    });
    expect(
      inOrder([
        finding('not-yet-covered', 'a'),
        finding('voice', 'b'),
        finding('too-much', 'c'),
        finding('missing', 'd'),
        finding('contradiction', 'e'),
        finding('too-much', 'f'),
      ]).map((f) => f.comment),
    ).toEqual(['e', 'd', 'c', 'f', 'b', 'a']);
  });
});

describe('findingBlock', () => {
  it('writes a Finding as the Assistant would, so findingOf reads it back', () => {
    const finding: Finding = {
      type: 'voice',
      sceneId: 's1',
      quote: '“Indeed,” said Mira.',
      comment: 'Mira never says indeed.',
      question: 'Is she putting it on?',
    };
    const block = findingBlock(finding);

    expect(block).toMatch(/^```finding\n.*\n```$/);
    expect(findingOf(JSON.parse(block.split('\n')[1]))).toEqual(finding);
  });
});

describe('isFinding', () => {
  it('tells a Finding as logged from something else', () => {
    expect(isFinding({ type: 'missing', comment: 'No ferry.' })).toBe(true);
    expect(isFinding({ type: 'missing', comment: 'No ferry.', quote: 3 })).toBe(
      false,
    );
    expect(isFinding({ type: 'oops', comment: 'No ferry.' })).toBe(false);
  });
});

describe('quotedIn', () => {
  it('finds a quote in the Prose whatever its quotes, dashes, spaces, case or italics', () => {
    const prose =
      'Anna waited on the *quay*.\n\n"Indeed," said Mira -- and left.';
    expect(quotedIn(prose, 'waited on the quay')).toBe(true);
    expect(quotedIn(prose, '“Indeed,”  said Mira')).toBe(true);
    expect(quotedIn(prose, 'INDEED')).toBe(true);
    expect(quotedIn(prose, 'said Mira – and')).toBe(false);
    expect(quotedIn(prose, 'the ferry')).toBe(false);
    expect(quotedIn(prose, ' ')).toBe(false);
  });
});

describe('reviewedUnit', () => {
  const manuscript: Manuscript = {
    chapters: [
      {
        id: 'ch1',
        title: 'One',
        scenes: [{ id: 's1', title: 'Ferry' }],
      },
    ],
    unplaced: [{ id: 's2', title: 'Loose' }],
  };
  const asked = (
    command: ConversationMessage['command'],
    focus: string[],
  ): ConversationMessage => ({
    role: 'author',
    text: 'Review',
    ...(command && { command }),
    focus,
    at: 0,
  });
  const reply: ConversationMessage = {
    role: 'assistant',
    text: '',
    focus: [],
    at: 1,
    findings: [{ type: 'voice', comment: 'Flat.' }],
  };

  it('is the Scene a Scene Review was of', () => {
    expect(
      reviewedUnit([asked('review-scene', ['s1']), reply], 1, manuscript),
    ).toEqual({ kind: 'scene', id: 's1' });
  });

  it('is the Chapter of the Scene in focus for a Chapter Review', () => {
    expect(
      reviewedUnit([asked('review-chapter', ['s1']), reply], 1, manuscript),
    ).toEqual({ kind: 'chapter', id: 'ch1' });
  });

  it('is the Review asked for last before the reply', () => {
    const messages = [
      asked('review-chapter', ['s1']),
      reply,
      asked('review-scene', ['s2']),
      reply,
    ];
    expect(reviewedUnit(messages, 1, manuscript)).toEqual({
      kind: 'chapter',
      id: 'ch1',
    });
    expect(reviewedUnit(messages, 3, manuscript)).toEqual({
      kind: 'scene',
      id: 's2',
    });
  });

  it('is nothing for a reply to a question, or a Chapter no longer there', () => {
    expect(
      reviewedUnit([asked(undefined, ['s1']), reply], 1, manuscript),
    ).toBeNull();
    expect(
      reviewedUnit([asked('review-chapter', ['s2']), reply], 1, manuscript),
    ).toBeNull();
    expect(reviewedUnit([reply], 0, manuscript)).toBeNull();
  });
});
