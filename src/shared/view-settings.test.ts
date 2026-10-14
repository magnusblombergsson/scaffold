import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_SETTINGS,
  nextWritingWidth,
  parseViewSettings,
} from './view-settings';

describe('nextWritingWidth', () => {
  it('cycles Narrow, Wide, Full and back to Narrow', () => {
    expect(nextWritingWidth('narrow')).toBe('wide');
    expect(nextWritingWidth('wide')).toBe('full');
    expect(nextWritingWidth('full')).toBe('narrow');
  });
});

describe('DEFAULT_VIEW_SETTINGS', () => {
  it('is today’s look: Narrow, the system theme, spell check on, typewriter scrolling off', () => {
    expect(DEFAULT_VIEW_SETTINGS).toEqual({
      writingWidth: 'narrow',
      theme: 'system',
      spellCheck: true,
      typewriter: false,
    });
  });
});

describe('parseViewSettings', () => {
  it('keeps the valid settings of a change', () => {
    expect(
      parseViewSettings({
        writingWidth: 'full',
        theme: 'dark',
        spellCheck: false,
        typewriter: true,
      }),
    ).toEqual({
      writingWidth: 'full',
      theme: 'dark',
      spellCheck: false,
      typewriter: true,
    });
    expect(parseViewSettings({ typewriter: false })).toEqual({
      typewriter: false,
    });
  });

  it('drops invalid and unknown ones', () => {
    expect(
      parseViewSettings({
        writingWidth: 'huge',
        theme: 'light',
        spellCheck: 'no',
        typewriter: 1,
        zoom: 2,
      }),
    ).toEqual({ theme: 'light' });
    expect(parseViewSettings('dark')).toEqual({});
    expect(parseViewSettings(null)).toEqual({});
  });
});
