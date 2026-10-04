import { describe, expect, it } from 'vitest';
import { PROJECT_OUTLINE, type Manuscript } from '../shared/project-types';
import {
  defaultScope,
  expandable,
  firstLine,
  startListed,
  UNPLACED,
} from './overview';

const manuscript: Manuscript = {
  chapters: [
    {
      id: 'c1',
      title: 'Chapter 1',
      scenes: [
        { id: 's1', title: 'Arrival' },
        { id: 's2', title: 'Storm' },
      ],
    },
    {
      id: 'c2',
      title: 'Chapter 2',
      scenes: [
        { id: 's3', title: 'Morning' },
        { id: 's4', title: 'Not synced', missing: true },
      ],
    },
  ],
  unplaced: [{ id: 'u1', title: 'Lighthouse' }],
};

const inChapter1 = { sceneId: 's1', chapterId: 'c1' };
const unplaced = { sceneId: 'u1', chapterId: null };

describe('defaultScope', () => {
  it('is the Chapter being written, or the Project for an Unplaced Scene', () => {
    expect(defaultScope(inChapter1)).toBe('chapter');
    expect(defaultScope(unplaced)).toBe('project');
  });
});

describe('startListed', () => {
  it('lists nothing more in Chapter scope: its Scenes are listed anyway', () => {
    expect([...startListed('chapter', inChapter1)]).toEqual([]);
  });

  it('lists only the Scenes of the Chapter being written in Project scope', () => {
    expect([...startListed('project', inChapter1)]).toEqual(['c1']);
  });

  it('lists the Unplaced Scenes when the Scene being written is one', () => {
    expect([...startListed('project', unplaced)]).toEqual([UNPLACED]);
  });
});

describe('expandable', () => {
  it("in Chapter scope, is that Chapter's rows but the Scene being written", () => {
    expect(expandable(manuscript, 'chapter', inChapter1)).toEqual(['c1', 's2']);
  });

  it('in Project scope, is every row, Chapters and the Unplaced Scenes too', () => {
    expect(expandable(manuscript, 'project', inChapter1)).toEqual([
      PROJECT_OUTLINE,
      'c1',
      's2',
      'c2',
      's3',
      UNPLACED,
      'u1',
    ]);
  });

  it('leaves out a missing Scene, which has no Outline to open', () => {
    expect(
      expandable(manuscript, 'chapter', { sceneId: 's3', chapterId: 'c2' }),
    ).toEqual(['c2']);
  });

  it('has no Unplaced Scenes row when there are none', () => {
    const placed = { ...manuscript, unplaced: [] };
    expect(expandable(placed, 'project', inChapter1)).not.toContain(UNPLACED);
  });
});

describe('firstLine', () => {
  it("is an Outline's first line with text, without its bullet", () => {
    expect(firstLine('\n  \n- Anna finds the letter\n- She burns it')).toBe(
      'Anna finds the letter',
    );
    expect(firstLine('• Dawn')).toBe('Dawn');
    expect(firstLine('* Dusk')).toBe('Dusk');
    expect(firstLine('Plain text')).toBe('Plain text');
  });

  it('is empty for an empty Outline', () => {
    expect(firstLine('')).toBe('');
    expect(firstLine('-\n  ')).toBe('');
  });
});
