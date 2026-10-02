import { describe, expect, it } from 'vitest';
import { droppedMessage, versionLabel } from './conflict-labels';

const at = new Date(2026, 9, 2, 14, 5).getTime();

describe('versionLabel', () => {
  it('names the computer a version came from, and when', () => {
    expect(versionLabel({ host: 'ALPHA', savedAt: at })).toMatch(
      /^ALPHA · .*14[:.]05/,
    );
  });

  it('says another computer when it is not known', () => {
    expect(versionLabel({ savedAt: at })).toMatch(/^Another computer · /);
  });

  it('marks the version the app works with', () => {
    expect(versionLabel({ original: true, savedAt: at })).toMatch(
      /^Current version · /,
    );
    expect(versionLabel({ original: true, host: 'BETA', savedAt: at })).toMatch(
      /^BETA, current version · /,
    );
  });
});

describe('droppedMessage', () => {
  it('lists what was dropped, and from where', () => {
    expect(
      droppedMessage({
        host: 'ALPHA',
        chapters: ['Lost'],
        scenes: ['Arrival', 'Departure'],
      }),
    ).toBe(
      'The Manuscript was rearranged on two computers at once; the order from ALPHA was set aside. Dropped: Chapter “Lost”. Now Unplaced: “Arrival”, “Departure”.',
    );
  });

  it('says another computer when it is not known', () => {
    expect(droppedMessage({ chapters: [], scenes: ['Arrival'] })).toBe(
      'The Manuscript was rearranged on two computers at once; the order from another computer was set aside. Now Unplaced: “Arrival”.',
    );
  });
});
