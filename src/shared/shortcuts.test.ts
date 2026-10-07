import { describe, expect, it } from 'vitest';
import {
  CHEAT_SHEET,
  commandForKey,
  SHORTCUTS,
  shortcutText,
} from './shortcuts';

const key = (
  key: string,
  modifiers: Partial<{
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }> = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

describe('commandForKey', () => {
  it('adds a Scene below with Ctrl+Enter, and above with Alt', () => {
    expect(commandForKey(key('Enter', { ctrlKey: true }), false)).toEqual({
      type: 'newScene',
      above: false,
    });
    expect(
      commandForKey(key('Enter', { ctrlKey: true, altKey: true }), false),
    ).toEqual({ type: 'newScene', above: true });
  });

  it('adds a Chapter with Shift', () => {
    expect(
      commandForKey(key('Enter', { ctrlKey: true, shiftKey: true }), false),
    ).toEqual({ type: 'newChapter', above: false });
    expect(
      commandForKey(
        key('Enter', { ctrlKey: true, shiftKey: true, altKey: true }),
        false,
      ),
    ).toEqual({ type: 'newChapter', above: true });
  });

  it('asks for a new Entry with Ctrl+E, either case', () => {
    expect(commandForKey(key('e', { ctrlKey: true }), false)).toEqual({
      type: 'newEntry',
    });
    expect(commandForKey(key('E', { ctrlKey: true }), false)).toEqual({
      type: 'newEntry',
    });
  });

  it('asks for a new Todo with Ctrl+T, either case', () => {
    expect(commandForKey(key('t', { ctrlKey: true }), false)).toEqual({
      type: 'newTodo',
    });
    expect(commandForKey(key('T', { ctrlKey: true }), false)).toEqual({
      type: 'newTodo',
    });
    expect(
      commandForKey(key('t', { ctrlKey: true, shiftKey: true }), false),
    ).toBeNull();
  });

  it('switches Mode with Ctrl+1/2/3', () => {
    expect(commandForKey(key('1', { ctrlKey: true }), false)).toEqual({
      type: 'mode',
      mode: 'writing',
    });
    expect(commandForKey(key('2', { ctrlKey: true }), false)).toEqual({
      type: 'mode',
      mode: 'brainstorm',
    });
    expect(commandForKey(key('3', { ctrlKey: true }), false)).toEqual({
      type: 'mode',
      mode: 'interview',
    });
  });

  it('opens the cheat sheet with Ctrl+/, also where / takes Shift, as Shift+7 on Swedish keyboards', () => {
    expect(commandForKey(key('/', { ctrlKey: true }), false)).toEqual({
      type: 'shortcuts',
    });
    expect(
      commandForKey(key('/', { ctrlKey: true, shiftKey: true }), false),
    ).toEqual({ type: 'shortcuts' });
    expect(
      commandForKey(key('/', { ctrlKey: true, altKey: true }), false),
    ).toBeNull();
  });

  it('collapses or docks the left pane with Ctrl+Shift+M, and the Assistant with Ctrl+Shift+A', () => {
    expect(
      commandForKey(key('M', { ctrlKey: true, shiftKey: true }), false),
    ).toEqual({ type: 'togglePane', pane: 'left' });
    expect(
      commandForKey(key('A', { ctrlKey: true, shiftKey: true }), false),
    ).toEqual({ type: 'togglePane', pane: 'assistant' });
    // Ctrl+A selects all.
    expect(commandForKey(key('a', { ctrlKey: true }), false)).toBeNull();
    expect(
      commandForKey(
        key('M', { ctrlKey: true, shiftKey: true, altKey: true }),
        false,
      ),
    ).toBeNull();
  });

  it('enters or leaves zen mode with Ctrl+Shift+F, but not Ctrl+F', () => {
    expect(
      commandForKey(key('F', { ctrlKey: true, shiftKey: true }), false),
    ).toEqual({ type: 'zen' });
    expect(
      commandForKey(key('F', { metaKey: true, shiftKey: true }), true),
    ).toEqual({ type: 'zen' });
    expect(commandForKey(key('f', { ctrlKey: true }), false)).toBeNull();
  });

  it('cycles the writing width with Ctrl+Shift+W, but not Ctrl+W', () => {
    expect(
      commandForKey(key('W', { ctrlKey: true, shiftKey: true }), false),
    ).toEqual({ type: 'cycleWritingWidth' });
    expect(SHORTCUTS.writingWidth).toBe('CmdOrCtrl+Shift+W');
    expect(commandForKey(key('w', { ctrlKey: true }), false)).toBeNull();
  });

  it('never takes Ctrl+Alt with a letter or digit, which is AltGr on Windows', () => {
    expect(
      commandForKey(key('e', { ctrlKey: true, altKey: true }), false),
    ).toBeNull();
    expect(
      commandForKey(key('2', { ctrlKey: true, altKey: true }), false),
    ).toBeNull();
  });

  it('takes nothing without Ctrl, or with other keys', () => {
    expect(commandForKey(key('Enter'), false)).toBeNull();
    expect(commandForKey(key('Enter', { shiftKey: true }), false)).toBeNull();
    expect(commandForKey(key('b', { ctrlKey: true }), false)).toBeNull();
    // Block Quote and the alignments, which the Prose takes.
    for (const letter of ['B', 'L', 'E', 'R']) {
      expect(
        commandForKey(key(letter, { ctrlKey: true, shiftKey: true }), false),
      ).toBeNull();
    }
    expect(
      commandForKey(key('1', { ctrlKey: true, shiftKey: true }), false),
    ).toBeNull();
    expect(commandForKey(key('4', { ctrlKey: true }), false)).toBeNull();
  });

  it('uses ⌘ on macOS, where Ctrl is a different key', () => {
    expect(commandForKey(key('Enter', { metaKey: true }), true)).toEqual({
      type: 'newScene',
      above: false,
    });
    expect(commandForKey(key('Enter', { ctrlKey: true }), true)).toBeNull();
    expect(commandForKey(key('Enter', { metaKey: true }), false)).toBeNull();
  });
});

describe('shortcutText', () => {
  it('writes keys as Ctrl, or ⌘ on macOS', () => {
    expect(shortcutText('CmdOrCtrl+Shift+Enter', false)).toBe(
      'Ctrl+Shift+Enter',
    );
    expect(shortcutText('CmdOrCtrl+Shift+Enter', true)).toBe('⌘+Shift+Enter');
    expect(shortcutText('CmdOrCtrl+Alt+Enter', true)).toBe('⌘+Option+Enter');
  });
});

describe('CHEAT_SHEET', () => {
  const listed = CHEAT_SHEET.flatMap((group) =>
    group.shortcuts.flatMap((s) => s.keys),
  );

  it('lists every shortcut the menus and the window take', () => {
    for (const accelerator of Object.values(SHORTCUTS)) {
      expect(listed).toContain(accelerator);
    }
  });

  it('lists zen mode, Escape leaving it, the pane keys and the width key in a View group', () => {
    const view = CHEAT_SHEET.find((group) => group.title === 'View');
    expect(view?.shortcuts.flatMap((s) => s.keys)).toEqual([
      'CmdOrCtrl+Shift+F',
      'Escape',
      'CmdOrCtrl+Shift+M',
      'CmdOrCtrl+Shift+A',
      'CmdOrCtrl+Shift+W',
    ]);
  });

  it('lists bold, italic, the alignments and block quote in a Formatting group', () => {
    const formatting = CHEAT_SHEET.find(
      (group) => group.title === 'Formatting, in the Prose',
    );
    expect(formatting?.shortcuts.flatMap((s) => s.keys)).toEqual([
      'CmdOrCtrl+B',
      'CmdOrCtrl+I',
      'CmdOrCtrl+Shift+L',
      'CmdOrCtrl+Shift+E',
      'CmdOrCtrl+Shift+R',
      'CmdOrCtrl+Shift+B',
    ]);
  });

  it('lists New Todo with the creates, in Writing', () => {
    const create = CHEAT_SHEET.find(
      (group) => group.title === 'Create, in Writing',
    );
    expect(create?.shortcuts.flatMap((s) => s.keys)).toContain('CmdOrCtrl+T');
  });

  it('lists Ctrl+S, which saves at once', () => {
    expect(listed).toContain('CmdOrCtrl+S');
  });

  it('lists the keys of the Binder and Story Bible list, the item menus and the panes', () => {
    for (const keys of [
      'Up',
      'Down',
      'Enter',
      'Left',
      'Right',
      'Home',
      'End',
      'F2',
      'Alt+Up',
      'Alt+Down',
      'CmdOrCtrl+Z',
      'Shift+F10',
      'Menu',
      'Escape',
      'F6',
      'Shift+F6',
    ]) {
      expect(listed).toContain(keys);
    }
  });
});

describe('shortcutText for arrows', () => {
  it('writes arrow keys as arrows, and every Alt as Option on macOS', () => {
    expect(shortcutText('Alt+Up', false)).toBe('Alt+↑');
    expect(shortcutText('Alt+Down', true)).toBe('Option+↓');
    expect(shortcutText('CmdOrCtrl+Shift+Alt+Enter', true)).toBe(
      '⌘+Shift+Option+Enter',
    );
  });
});
