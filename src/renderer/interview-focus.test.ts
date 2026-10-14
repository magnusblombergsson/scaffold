import { describe, expect, it } from 'vitest';
import type { InterviewFocus } from '../shared/conversation';
import type { EntrySummary, Manuscript } from '../shared/project-types';
import {
  focusLabel,
  focusOfValue,
  focusOptions,
  valueOf,
} from './interview-focus';

const manuscript: Manuscript = {
  chapters: [
    {
      id: 'c1',
      title: 'Arrival',
      scenes: [{ id: 's1', title: 'Harbour', tags: ['flashback'] }],
      tags: ['Mara'],
    },
  ],
  unplaced: [{ id: 's2', title: 'Loose' }],
};
const entries: EntrySummary[] = [
  {
    id: 'anna',
    type: 'character',
    name: 'Anna',
    aliases: [],
    visibility: 'mentioned',
    tags: ['mara', 'the war'],
  },
  {
    id: 'isle',
    type: 'place',
    name: '',
    aliases: [],
    visibility: 'mentioned',
  },
];
const names = { manuscript, entries };

describe('focusLabel', () => {
  it('names each focus as the Project has it now', () => {
    const labels = (
      [
        { kind: 'open' },
        { kind: 'entry', id: 'anna' },
        { kind: 'entry-type', type: 'world-rule' },
        { kind: 'chapter', id: 'c1' },
        { kind: 'scene', id: 's1' },
        { kind: 'tag', tag: 'MARA' },
      ] satisfies InterviewFocus[]
    ).map((focus) => focusLabel(focus, names));

    expect(labels).toEqual([
      'Open',
      'Anna',
      'Every World Rule',
      'Chapter “Arrival”',
      'Scene “Harbour”',
      'Tag: Mara',
    ]);
  });

  it('names a focus no longer in the Project by its kind', () => {
    expect(focusLabel({ kind: 'entry', id: 'gone' }, names)).toBe(
      'An Entry no longer there',
    );
    expect(focusLabel({ kind: 'scene', id: 'gone' }, names)).toBe(
      'A Scene no longer there',
    );
    expect(focusLabel({ kind: 'tag', tag: 'Gone' }, names)).toBe(
      'Tag: Gone (nothing has it now)',
    );
  });
});

describe('picker values', () => {
  it('turn each focus into a value and back', () => {
    const foci: InterviewFocus[] = [
      { kind: 'open' },
      { kind: 'entry', id: 'anna' },
      { kind: 'entry-type', type: 'plot-thread' },
      { kind: 'chapter', id: 'c1' },
      { kind: 'scene', id: 's1' },
      { kind: 'tag', tag: 'the war: part 2' },
    ];
    for (const focus of foci) {
      expect(focusOfValue(valueOf(focus))).toEqual(focus);
    }
    expect(focusOfValue('entry-type:villain')).toEqual({ kind: 'open' });
    expect(focusOfValue('tag:')).toEqual({ kind: 'open' });
  });

  it('give a Tag focus the value of the Tag’s option, whatever its case', () => {
    const groups = focusOptions(names);
    const tags = groups.find((g) => g.label === 'Tags')!;

    expect(tags.options.map((o) => o.value)).toContain(
      valueOf({ kind: 'tag', tag: 'MARA' }, names),
    );
  });

  it('offers open, each Entry type, each Entry, and each Chapter and Scene in order', () => {
    const groups = focusOptions(names);

    expect(groups.map((g) => g.label)).toEqual([
      '',
      'Entry types',
      'Entries',
      'Tags',
      'Manuscript',
    ]);
    expect(groups[0].options).toEqual([{ value: 'open', label: 'Open' }]);
    expect(groups[1].options[0]).toEqual({
      value: 'entry-type:character',
      label: 'Every Character',
    });
    expect(groups[2].options).toEqual([
      { value: 'entry:anna', label: 'Anna' },
      { value: 'entry:isle', label: 'Untitled' },
    ]);
    expect(groups[3].options).toEqual([
      { value: 'tag:flashback', label: 'Tag: flashback' },
      { value: 'tag:Mara', label: 'Tag: Mara' },
      { value: 'tag:the war', label: 'Tag: the war' },
    ]);
    expect(groups[4].options).toEqual([
      { value: 'chapter:c1', label: 'Chapter “Arrival”' },
      { value: 'scene:s1', label: ' Scene “Harbour”' },
      { value: 'scene:s2', label: 'Scene “Loose”' },
    ]);
  });
});

describe('Parts', () => {
  const withParts: Manuscript = {
    chapters: [
      { id: 'c0', title: 'Prologue', scenes: [] },
      {
        id: 'c1',
        title: 'Arrival',
        scenes: [{ id: 's1', title: 'Harbour' }],
        part: 'p1',
      },
    ],
    parts: [{ id: 'p1', title: 'The Sea', chapters: ['c1'], tags: ['tide'] }],
    top: ['c0', 'p1'],
    unplaced: [],
    partLabel: 'act',
  };
  const partNames = { manuscript: withParts, entries: [] };

  it('names a Part focus by the Project’s label, and one no longer there by it too', () => {
    expect(focusLabel({ kind: 'part', id: 'p1' }, partNames)).toBe(
      'Act “The Sea”',
    );
    expect(focusLabel({ kind: 'part', id: 'gone' }, partNames)).toBe(
      'An Act no longer there',
    );
    expect(focusLabel({ kind: 'part', id: 'p1' }, names)).toBe(
      'A Part no longer there',
    );
  });

  it('turns a Part focus into a value and back', () => {
    const focus: InterviewFocus = { kind: 'part', id: 'p1' };

    expect(focusOfValue(valueOf(focus))).toEqual(focus);
  });

  it('offers each Part with its Chapters nested, and the Loose Chapters between, and a Part’s Tags', () => {
    const groups = focusOptions(partNames);

    expect(groups.find((g) => g.label === 'Manuscript')!.options).toEqual([
      { value: 'chapter:c0', label: 'Chapter “Prologue”' },
      { value: 'part:p1', label: 'Act “The Sea”' },
      { value: 'chapter:c1', label: '\u2003Chapter “Arrival”' },
      { value: 'scene:s1', label: '\u2003\u2003Scene “Harbour”' },
    ]);
    expect(groups.find((g) => g.label === 'Tags')!.options).toEqual([
      { value: 'tag:tide', label: 'Tag: tide' },
    ]);
  });
});

describe('Books', () => {
  const series: Manuscript = {
    chapters: [
      {
        id: 'c1',
        title: 'Arrival',
        scenes: [{ id: 's1', title: 'Harbour' }],
        part: 'p1',
        book: 'b1',
      },
      { id: 'c2', title: 'Storm', scenes: [], book: 'b2' },
      { id: 'c3', title: 'Elsewhere', scenes: [], unplaced: true },
    ],
    parts: [{ id: 'p1', title: 'The Sea', chapters: ['c1'], book: 'b1' }],
    top: ['p1', 'c2'],
    books: [
      { id: 'b1', title: 'The Island', top: ['p1'] },
      { id: 'b2', title: 'The Return', top: ['c2'] },
    ],
    unplaced: [],
  };
  const seriesNames = { manuscript: series, entries: [] };

  it('names a Book focus by its title, and one no longer there by its kind', () => {
    expect(focusLabel({ kind: 'book', id: 'b2' }, seriesNames)).toBe(
      'Book “The Return”',
    );
    expect(focusLabel({ kind: 'book', id: 'gone' }, seriesNames)).toBe(
      'A Book no longer there',
    );
  });

  it('turns a Book focus into a value and back', () => {
    const focus: InterviewFocus = { kind: 'book', id: 'b1' };

    expect(focusOfValue(valueOf(focus))).toEqual(focus);
  });

  it('offers each Book with what it holds nested, then the Unplaced Chapters', () => {
    const groups = focusOptions(seriesNames);

    expect(groups.find((g) => g.label === 'Manuscript')!.options).toEqual([
      { value: 'book:b1', label: 'Book “The Island”' },
      { value: 'part:p1', label: ' Part “The Sea”' },
      { value: 'chapter:c1', label: '  Chapter “Arrival”' },
      { value: 'scene:s1', label: '   Scene “Harbour”' },
      { value: 'book:b2', label: 'Book “The Return”' },
      { value: 'chapter:c2', label: ' Chapter “Storm”' },
      { value: 'chapter:c3', label: 'Chapter “Elsewhere”' },
    ]);
  });
});
