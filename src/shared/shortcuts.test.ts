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
