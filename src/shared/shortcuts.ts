import type { Mode } from './conversation';
import type { EntryType } from './project-types';

/** A side pane of Writing that collapses on its own: the left pane or the Assistant. */
export type SidePane = 'left' | 'assistant';

/** Whether each side pane is docked, rather than collapsed to its edge tabs. */
export type DockedPanes = Record<SidePane, boolean>;

/** Formatting the Author applies to the Prose from the Format menu. */
export type ProseFormat =
  | 'bold'
  | 'italic'
  | 'alignLeft'
  | 'alignCentre'
  | 'alignRight'
  | 'blockQuote';

/** How a window shows Writing's side panes until the Author collapses one. */
export const ALL_DOCKED: DockedPanes = { left: true, assistant: true };

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
  /** File › Export Story Bible…, which asks which Entries, and with what. */
  | { type: 'exportStoryBible' }
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
  /** Focuses the Todos tab's New Todo field, docking the left pane if collapsed. */
  | { type: 'newTodo' }
  /** Collapses the pane, or docks it back at the tab it last showed. */
  | { type: 'togglePane'; pane: SidePane }
  /** Enters zen mode in Writing, or leaves it. */
  | { type: 'zen' }
  /** Narrow, Wide, Full, Narrow: Ctrl+Shift+W in Writing. */
  | { type: 'cycleWritingWidth' }
  /** Formats the Prose where it has focus; the Prose takes the keys itself. */
  | { type: 'format'; format: ProseFormat }
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
  newTodo: 'CmdOrCtrl+T',
  shortcuts: 'CmdOrCtrl+/',
  zen: 'CmdOrCtrl+Shift+F',
  leftPane: 'CmdOrCtrl+Shift+M',
  assistant: 'CmdOrCtrl+Shift+A',
  writingWidth: 'CmdOrCtrl+Shift+W',
  // In the Prose, while it has focus.
  bold: 'CmdOrCtrl+B',
  italic: 'CmdOrCtrl+I',
  alignLeft: 'CmdOrCtrl+Shift+L',
  alignCentre: 'CmdOrCtrl+Shift+E',
  alignRight: 'CmdOrCtrl+Shift+R',
  blockQuote: 'CmdOrCtrl+Shift+B',
  // In the Binder and Story Bible list, while it has focus.
  rename: 'F2',
  moveUp: 'Alt+Up',
  moveDown: 'Alt+Down',
  undoStructure: 'CmdOrCtrl+Z',
} as const satisfies Record<string, string>;

/** The command of each letter after Ctrl+Shift that the window takes, as in `SHORTCUTS`. */
const SHIFT_LETTERS: Record<string, Command> = {
  f: { type: 'zen' },
  m: { type: 'togglePane', pane: 'left' },
  a: { type: 'togglePane', pane: 'assistant' },
  w: { type: 'cycleWritingWidth' },
};

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
 * Ctrl+E, Ctrl+T, Ctrl+1/2/3, zen, the pane keys and the width key, which
 * apply where a Project is shown, and Ctrl+/.
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
  if (alt) return null;
  if (shift) return SHIFT_LETTERS[key.toLowerCase()] ?? null;
  if (key.toLowerCase() === 'e') return { type: 'newEntry' };
  if (key.toLowerCase() === 't') return { type: 'newTodo' };
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
      {
        keys: [SHORTCUTS.newTodo],
        action: 'New Todo, linked to the open Scene, Chapter or Entry',
      },
    ],
  },
  {
    title: 'Formatting, in the Prose',
    shortcuts: [
      { keys: [SHORTCUTS.bold], action: 'Bold' },
      { keys: [SHORTCUTS.italic], action: 'Italic' },
      {
        keys: [SHORTCUTS.alignLeft],
        action: 'Align the paragraphs left',
      },
      {
        keys: [SHORTCUTS.alignCentre],
        action: 'Centre the paragraphs, or return them to left',
      },
      {
        keys: [SHORTCUTS.alignRight],
        action: 'Align the paragraphs right, or return them to left',
      },
      {
        keys: [SHORTCUTS.blockQuote],
        action: 'Block quote the paragraphs, or take them out of it',
      },
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
    title: 'View',
    shortcuts: [
      {
        keys: [SHORTCUTS.zen],
        action: 'Zen mode in Writing: full screen, the panes and header away',
      },
      { keys: ['Escape'], action: 'Leave zen mode' },
      {
        keys: [SHORTCUTS.leftPane],
        action: 'Collapse the left pane, or dock it back at its last tab',
      },
      {
        keys: [SHORTCUTS.assistant],
        action: 'Collapse the Assistant, or dock it back',
      },
      {
        keys: [SHORTCUTS.writingWidth],
        action: 'Writing width: Narrow, Wide or Full, in turn',
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
