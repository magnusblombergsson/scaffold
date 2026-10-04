import type { Mode } from './conversation';
import type { EntryType } from './project-types';

/**
 * What the Author asked for from the menu bar or a shortcut, sent to the
 * window in front. `byKey` is set when a menu's shortcut sent it rather than
 * a click: shortcuts other than Ctrl+1/2/3 do nothing outside Writing.
 */
export type Command = (
  | { type: 'newProject' }
  | { type: 'openProject' }
  | { type: 'openRecent'; path: string }
  | { type: 'import' }
  | { type: 'settings' }
  | { type: 'mode'; mode: Mode }
  /** Below, or `above`, the current Scene; or at the end, or start, of the current Chapter. */
  | { type: 'newScene'; above: boolean }
  /** Below, or `above`, the current Chapter, starting in rename. */
  | { type: 'newChapter'; above: boolean }
  /** An Entry of `entryType`, or without one, the menu of types to pick from. */
  | { type: 'newEntry'; entryType?: EntryType }
) & { byKey?: true };

/**
 * The keys of each shortcut, as Electron writes accelerators. Keys are fixed.
 * Ctrl+Alt with a letter or digit is never used: on Windows it is AltGr, which
 * types characters on Swedish and other layouts.
 */
export const SHORTCUTS = {
  newProject: 'CmdOrCtrl+Shift+N',
  openProject: 'CmdOrCtrl+O',
  settings: 'CmdOrCtrl+,',
  writing: 'CmdOrCtrl+1',
  brainstorm: 'CmdOrCtrl+2',
  interview: 'CmdOrCtrl+3',
  newScene: 'CmdOrCtrl+Enter',
  newSceneAbove: 'CmdOrCtrl+Alt+Enter',
  newChapter: 'CmdOrCtrl+Shift+Enter',
  newChapterAbove: 'CmdOrCtrl+Shift+Alt+Enter',
  newEntry: 'CmdOrCtrl+E',
  shortcuts: 'CmdOrCtrl+/',
} as const satisfies Record<string, string>;

/** The digit after Ctrl that switches to each Mode, as in `SHORTCUTS`. */
const MODE_DIGITS: Record<string, Mode> = {
  '1': 'writing',
  '2': 'brainstorm',
  '3': 'interview',
};

type KeyPress = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/**
 * The command a key press in a window showing a Project asks for, if any:
 * the create chords, Ctrl+E and Ctrl+1/2/3. Ctrl is ⌘ on macOS. The menus
 * take the others.
 */
export function commandForKey(press: KeyPress, mac: boolean): Command | null {
  const mod = mac ? press.metaKey : press.ctrlKey;
  const other = mac ? press.ctrlKey : press.metaKey;
  if (!mod || other) return null;
  const { key, shiftKey: shift, altKey: alt } = press;
  if (key === 'Enter') {
    return shift
      ? { type: 'newChapter', above: alt }
      : { type: 'newScene', above: alt };
  }
  if (shift || alt) return null;
  if (key.toLowerCase() === 'e') return { type: 'newEntry' };
  const mode = MODE_DIGITS[key];
  return mode ? { type: 'mode', mode } : null;
}

/** An accelerator as the Author reads it: Ctrl, or ⌘ and Option on macOS. */
export function shortcutText(accelerator: string, mac: boolean): string {
  return accelerator
    .replace('CmdOrCtrl', mac ? '⌘' : 'Ctrl')
    .replace('Alt', mac ? 'Option' : 'Alt');
}

/** A button's tooltip: its label with its shortcut, as "New Chapter (Ctrl+Shift+Enter)". */
export function withShortcut(
  label: string,
  accelerator: string,
  mac: boolean,
): string {
  return `${label} (${shortcutText(accelerator, mac)})`;
}
