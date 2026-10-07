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
