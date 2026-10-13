import { describe, expect, it } from 'vitest';
import { keyApplies, roomOf } from './rooms';

describe('roomOf', () => {
  it('opens an Entry in the Story Bible, by a Todo, a Proposal target or a Conflict', () => {
    expect(roomOf({ kind: 'entry', id: 'e1' })).toBe('storyBible');
    expect(roomOf({ kind: 'entry', entryId: 'e1' })).toBe('storyBible');
    expect(roomOf({ kind: 'private', id: 'e1' })).toBe('storyBible');
  });

  it('opens a Scene, Chapter, Part or Outline in Writing', () => {
    expect(roomOf({ kind: 'scene', id: 's1' })).toBe('writing');
    expect(roomOf({ kind: 'chapter', id: 'c1' })).toBe('writing');
    expect(roomOf({ kind: 'part', id: 'p1' })).toBe('writing');
    expect(roomOf({ kind: 'outline', outlineId: 's1' })).toBe('writing');
    expect(roomOf({ kind: 'outline', id: 's1' })).toBe('writing');
    expect(roomOf({ kind: 'notes', id: 's1' })).toBe('writing');
  });
});

describe('keyApplies', () => {
  it('switches Room from any Room', () => {
    for (const room of [
      'writing',
      'storyBible',
      'brainstorm',
      'interview',
    ] as const) {
      expect(keyApplies({ type: 'room', room: 'storyBible' }, room)).toBe(true);
    }
  });

  it('makes an Entry from any Room', () => {
    expect(keyApplies({ type: 'newEntry' }, 'brainstorm')).toBe(true);
    expect(keyApplies({ type: 'newEntry' }, 'interview')).toBe(true);
    expect(keyApplies({ type: 'newEntry' }, 'storyBible')).toBe(true);
  });

  it('starts a Todo in Writing and the Story Bible, which have the Todos dock', () => {
    expect(keyApplies({ type: 'newTodo' }, 'writing')).toBe(true);
    expect(keyApplies({ type: 'newTodo' }, 'storyBible')).toBe(true);
    expect(keyApplies({ type: 'newTodo' }, 'brainstorm')).toBe(false);
  });

  it('collapses the Assistant where it is, and the rest only in Writing', () => {
    const assistant = { type: 'togglePane', pane: 'assistant' } as const;
    expect(keyApplies(assistant, 'storyBible')).toBe(true);
    expect(keyApplies(assistant, 'brainstorm')).toBe(false);
    for (const command of [
      { type: 'togglePane', pane: 'left' },
      { type: 'zen' },
      { type: 'cycleWritingWidth' },
      { type: 'newScene', above: false },
      { type: 'newChapter', above: false },
      { type: 'splitScene', toNextChapter: false },
    ] as const) {
      expect(keyApplies(command, 'writing')).toBe(true);
      expect(keyApplies(command, 'storyBible')).toBe(false);
      expect(keyApplies(command, 'interview')).toBe(false);
    }
  });
});
