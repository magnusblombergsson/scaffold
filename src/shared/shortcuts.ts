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
  /** File › Export Manuscript…, which asks which Scenes and Chapters. */
  | { type: 'exportManuscript' }
  | { type: 'settings' }
  | { type: 'projectSettings' }
  /** The Keyboard Shortcuts cheat sheet. */
  | { type: 'shortcuts' }
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
  projectSettings: 'CmdOrCtrl+Shift+,',
  writing: 'CmdOrCtrl+1',
  brainstorm: 'CmdOrCtrl+2',
  interview: 'CmdOrCtrl+3',
  newScene: 'CmdOrCtrl+Enter',
  newSceneAbove: 'CmdOrCtrl+Alt+Enter',
  newChapter: 'CmdOrCtrl+Shift+Enter',
  newChapterAbove: 'CmdOrCtrl+Shift+Alt+Enter',
  newEntry: 'CmdOrCtrl+E',
  shortcuts: 'CmdOrCtrl+/',
  // In the Binder and Story Bible list, while it has focus.
  rename: 'F2',
  moveUp: 'Alt+Up',
  moveDown: 'Alt+Down',
  undoStructure: 'CmdOrCtrl+Z',
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
 * The command a key press in a window asks for, if any: the create chords,
 * Ctrl+E and Ctrl+1/2/3, which apply where a Project is shown, and Ctrl+/.
 * Ctrl is ⌘ on macOS. The menus take the others.
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
  // Wherever / is: some keyboards type it with Shift, as Swedish Shift+7.
  if (key === '/' && !alt) return { type: 'shortcuts' };
  if (shift || alt) return null;
  if (key.toLowerCase() === 'e') return { type: 'newEntry' };
  const mode = MODE_DIGITS[key];
  return mode ? { type: 'mode', mode } : null;
}

/** How the Author reads each key of an accelerator that isn't written as is. */
const KEY_TEXT: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Menu: 'Menu key',
};

/**
 * An accelerator as the Author reads it: Ctrl, or ⌘ and Option on macOS,
 * and arrows as arrows.
 */
export function shortcutText(accelerator: string, mac: boolean): string {
  return accelerator
    .split('+')
    .map((key) =>
      key === 'CmdOrCtrl'
        ? mac
          ? '⌘'
          : 'Ctrl'
        : key === 'Alt' && mac
          ? 'Option'
          : (KEY_TEXT[key] ?? key),
    )
    .join('+');
}

/**
 * Every shortcut, as the Help ▸ Keyboard Shortcuts cheat sheet lists them.
 * Each line's `keys` are accelerators, any of which does its `action`.
 */
export const CHEAT_SHEET: {
  title: string;
  shortcuts: { keys: string[]; action: string }[];
}[] = [
  {
    title: 'Create, in Writing',
    shortcuts: [
      {
        keys: [SHORTCUTS.newScene],
        action:
          'New Scene below the current Scene, or at the end of the selected Chapter',
      },
      { keys: [SHORTCUTS.newSceneAbove], action: 'New Scene above' },
      {
        keys: [SHORTCUTS.newChapter],
        action: 'New Chapter below the current Chapter, starting in rename',
      },
      { keys: [SHORTCUTS.newChapterAbove], action: 'New Chapter above' },
      { keys: [SHORTCUTS.newEntry], action: 'New Entry of a type' },
    ],
  },
  {
    title: 'In the Binder and Story Bible list',
    shortcuts: [
      { keys: ['Up', 'Down'], action: 'Move the highlight; opens nothing' },
      { keys: ['Enter'], action: 'Open the highlighted item' },
      { keys: ['Left'], action: 'Binder: from a Scene to its Chapter' },
      { keys: ['Right'], action: 'Binder: from a Chapter to its first Scene' },
      { keys: ['Home', 'End'], action: 'First or last item' },
      {
        keys: [SHORTCUTS.rename],
        action: 'Rename; in the Story Bible, open the Entry at its Name',
      },
      {
        keys: [SHORTCUTS.moveUp, SHORTCUTS.moveDown],
        action:
          'Binder: move the item up or down; a Scene crosses into the previous or next Chapter',
      },
      {
        keys: [SHORTCUTS.undoStructure],
        action: 'Undo the last structure change',
      },
    ],
  },
  {
    title: 'Item menus',
    shortcuts: [
      {
        keys: ['Shift+F10', 'Menu'],
        action: "Open the highlighted item's ⋯ menu",
      },
      { keys: ['Up', 'Down'], action: 'Choose in the menu' },
      { keys: ['Enter'], action: 'Do what is chosen' },
      { keys: ['Escape'], action: 'Close the menu, back to the item' },
    ],
  },
  {
    title: 'Panes and Modes',
    shortcuts: [
      { keys: [SHORTCUTS.writing], action: 'Writing' },
      { keys: [SHORTCUTS.brainstorm], action: 'Brainstorm' },
      { keys: [SHORTCUTS.interview], action: 'Interview' },
      {
        keys: ['F6', 'Shift+F6'],
        action: 'Next or previous pane: left pane, editor, Assistant',
      },
      {
        keys: ['Left', 'Right'],
        action: 'On the left pane’s tabs: the tab before or after',
      },
    ],
  },
  {
    title: 'Projects and Scaffold',
    shortcuts: [
      { keys: [SHORTCUTS.newProject], action: 'New Project' },
      { keys: [SHORTCUTS.openProject], action: 'Open Project' },
      { keys: ['CmdOrCtrl+S'], action: 'Save now' },
      { keys: [SHORTCUTS.settings], action: 'Settings' },
      { keys: [SHORTCUTS.projectSettings], action: 'Project Settings' },
      { keys: [SHORTCUTS.shortcuts], action: 'Keyboard Shortcuts' },
    ],
  },
];

/** A button's tooltip: its label with its shortcut, as "New Chapter (Ctrl+Shift+Enter)". */
export function withShortcut(
  label: string,
  accelerator: string,
  mac: boolean,
): string {
  return `${label} (${shortcutText(accelerator, mac)})`;
}
