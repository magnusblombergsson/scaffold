import { describe, expect, it } from 'vitest';
import { onlineOnlyIn } from './file-system';

describe('online-only placeholders', () => {
  it('lists the files whose attributes include O, the offline flag', () => {
    const output = [
      'A                    C:\\Users\\a\\OneDrive\\Novel\\project.json',
      'A          O         C:\\Users\\a\\OneDrive\\Novel\\scenes\\x.md',
      '   SH                C:\\Users\\a\\OneDrive\\Novel\\desktop.ini',
      'A  R       O         C:\\Users\\a\\OneDrive\\Novel\\notes\\Old notes.md',
      '',
    ].join('\r\n');

    expect(onlineOnlyIn(output)).toEqual([
      'C:\\Users\\a\\OneDrive\\Novel\\scenes\\x.md',
      'C:\\Users\\a\\OneDrive\\Novel\\notes\\Old notes.md',
    ]);
  });

  it('never reads a letter of the path as a flag', () => {
    expect(onlineOnlyIn('A                    O:\\Novel\\Odd.md')).toEqual([]);
    expect(
      onlineOnlyIn('A                    \\\\server\\Novel\\O.md'),
    ).toEqual([]);
  });

  it('ignores lines that name no file', () => {
    expect(onlineOnlyIn('File not found - C:\\Novel\\*\r\n')).toEqual([]);
  });
});
