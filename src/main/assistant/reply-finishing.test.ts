import { describe, expect, it } from 'vitest';
import { streamingText } from '../../shared/proposal';
import { finishReply } from './reply-finishing';

const block = (json: object) =>
  `\`\`\`proposal\n${JSON.stringify(json)}\n\`\`\``;

const complete = (text: string) =>
  finishReply({ text, finish: 'complete', failed: false });

describe('thinking', () => {
  it('strips <think>…</think> from the reply before it is shown', () => {
    expect(
      complete('<think>She is older, I think.</think>\n\nIs Anna older?'),
    ).toMatchObject({ text: 'Is Anna older?', ending: 'complete' });
  });

  it('ignores Proposal blocks inside thinking', () => {
    const proposal = block({
      entry: 'anna',
      field: 'description',
      value: 'Older.',
    });
    const finished = complete(
      `<think>Maybe:\n${proposal}\nNo.</think>Is Anna older?`,
    );
    expect(finished.text).toBe('Is Anna older?');
    expect(finished.proposals).toEqual([]);
    expect(finished.unreadable).toBe(0);
  });

  it('hides an open <think> while streaming, as the pieces come', () => {
    const pieces = ['<thi', 'nk>Hm, ', 'older?</th', 'ink>Is ', 'Anna older?'];
    const shown = pieces.map((_, i) =>
      streamingText(pieces.slice(0, i + 1).join('')),
    );
    expect(shown).toEqual(['', '', '', 'Is', 'Is Anna older?']);
  });

  it('keeps what only looks like the start of a <think> once the reply is finished', () => {
    expect(complete('Is 3 < 4? Or 4 <').text).toBe('Is 3 < 4? Or 4 <');
  });

  it('strips thinking split across pieces in the finished reply', () => {
    expect(complete(['<thi', 'nk>Hm.</th', 'ink>Why?'].join('')).text).toBe(
      'Why?',
    );
  });
});

describe('how a reply ended', () => {
  it('a reply stopped at the length limit is cut short: it keeps its text and makes no Proposals', () => {
    const finished = finishReply({
      text: `Anna is older.\n${block({ entry: 'anna', field: 'description', value: 'Older.' })}\nAnd`,
      finish: 'length',
      failed: false,
    });
    expect(finished).toMatchObject({
      text: 'Anna is older.\n\nAnd',
      ending: 'cut-short',
      proposals: [],
      unreadable: 0,
    });
  });

  it('a failed reply is interrupted, keeps its text and makes no Proposals', () => {
    const finished = finishReply({
      text: `Anna.\n${block({ entry: 'anna', field: 'description', value: 'Older.' })}`,
      finish: null,
      failed: true,
    });
    expect(finished).toMatchObject({
      text: 'Anna.',
      ending: 'interrupted',
      proposals: [],
    });
  });

  it('a reply with no text, or none left after thinking, is empty', () => {
    expect(complete('').ending).toBe('empty');
    expect(
      finishReply({
        text: '<think>Long thoughts',
        finish: 'length',
        failed: false,
      }),
    ).toMatchObject({ text: '', ending: 'empty', proposals: [] });
    expect(complete('<think>Hm.</think>\n\n').ending).toBe('empty');
  });

  it('a reply holding only a Proposal is not empty', () => {
    const proposal = { entry: 'anna', field: 'description', value: 'Older.' };
    expect(complete(block(proposal))).toMatchObject({
      text: '',
      ending: 'complete',
      proposals: [proposal],
    });
  });

  it('a finished reply makes its Proposals and Findings', () => {
    const finding = { type: 'voice', comment: 'Not Mira.' };
    const finished = complete(
      `Two.\n\`\`\`finding\n${JSON.stringify(finding)}\n\`\`\``,
    );
    expect(finished).toMatchObject({ ending: 'complete', findings: [finding] });
  });
});

describe('unreadable Proposal blocks', () => {
  it('counts Proposal blocks that are not JSON in a finished reply', () => {
    const finished = complete(
      `Hm.\n\`\`\`proposal\n{oops\n\`\`\`\n\`\`\`proposal\n{"entry": \n\`\`\`\n${block({ entry: 'anna', field: 'aliases', add: 'Nan' })}`,
    );
    expect(finished).toMatchObject({
      text: 'Hm.',
      proposals: [{ entry: 'anna', field: 'aliases', add: 'Nan' }],
      unreadable: 2,
    });
  });

  it('counts a Proposal block never closed at the end of a finished reply', () => {
    expect(complete('Hm.\n```proposal\n{"entry": "anna"').unreadable).toBe(1);
  });

  it('counts none in a reply that makes no Proposals', () => {
    const finished = finishReply({
      text: 'Hm.\n```proposal\n{oops\n```',
      finish: 'length',
      failed: false,
    });
    expect(finished.unreadable).toBe(0);
  });
});
