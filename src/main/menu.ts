import type {
  BaseWindow,
  KeyboardEvent,
  MenuItemConstructorOptions,
} from 'electron';
import { MODE_LABELS } from '../shared/conversation';
import { ENTRY_TYPE_LABELS, ENTRY_TYPES } from '../shared/project-types';
import {
  SHORTCUTS,
  type Command,
  type DockedPanes,
  type ProseFormat,
} from '../shared/shortcuts';
import {
  THEME_LABELS,
  THEMES,
  WRITING_WIDTH_LABELS,
  WRITING_WIDTHS,
  type ViewSettings,
} from '../shared/view-settings';

/** What the menus show for the window in front. */
export type MenuState = {
  mac: boolean;
  /** A development build, which has Electron's Reload and Developer Tools. */
  dev: boolean;
  /**
   * The Project the window in front shows, if any, its Writing panes,
   * whether it is in zen mode, and whether its Prose has focus.
   */
  project: {
    readOnly: boolean;
    docked: DockedPanes;
    zen: boolean;
    proseFocused: boolean;
  } | null;
  /** Latest first. */
  recent: { path: string; displayName: string }[];
  view: ViewSettings;
};

/** What the menus do, in the window they were chosen in, if any. */
export type MenuActions = {
  /** Hands a command to the window, which knows what is current in it. */
  send(command: Command, window: BaseWindow | undefined): void;
  /** Changes how every window looks. */
  setViewSettings(change: Partial<ViewSettings>): void;
};

/**
 * The menu bar. The window takes the shortcuts of Mode, zen, the panes and
 * Insert, and Ctrl+/, itself, so that they work inside an editor and only
 * where they apply, and the Prose takes Format's; the menus only show them.
 */
export function menuTemplate(
  { mac, dev, project, recent, view }: MenuState,
  actions: MenuActions,
): MenuItemConstructorOptions[] {
  /** A menu item that hands `command` to the window it was chosen in. */
  const sending = (
    command: Command,
  ): Pick<MenuItemConstructorOptions, 'click'> => ({
    // A click made by code, as in tests, comes without an event.
    click: (_item, window, event: KeyboardEvent | undefined) =>
      actions.send(
        event?.triggeredByAccelerator ? { ...command, byKey: true } : command,
        window,
      ),
  });
  const writable = !!project && !project.readOnly;
  const windowKey = (accelerator: string) => ({
    accelerator,
    registerAccelerator: false,
  });
  const settings: MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: SHORTCUTS.settings,
    ...sending({ type: 'settings' }),
  };
  // Open to a read-only Project too, which shows its values.
  /** Radio items, one per value of the Setting `key`, the current one ticked. */
  const choices = <K extends 'writingWidth' | 'theme'>(
    key: K,
    values: readonly ViewSettings[K][],
    labels: Record<ViewSettings[K], string>,
  ): MenuItemConstructorOptions[] =>
    values.map((value) => ({
      label: labels[value],
      type: 'radio',
      checked: view[key] === value,
      click: () => actions.setViewSettings({ [key]: value }),
    }));
  const formatting = writable && project.proseFocused;
  /** A Format item, enabled while the Prose has focus. */
  const formatItem = (
    label: string,
    format: ProseFormat,
  ): MenuItemConstructorOptions => ({
    label,
    enabled: formatting,
    ...windowKey(SHORTCUTS[format]),
    ...sending({ type: 'format', format }),
  });
  const projectSettings: MenuItemConstructorOptions = {
    label: 'Project Settings…',
    accelerator: SHORTCUTS.projectSettings,
    enabled: !!project,
    ...sending({ type: 'projectSettings' }),
  };

  return [
    ...(mac
      ? [
          {
            role: 'appMenu' as const,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              settings,
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project…',
          accelerator: SHORTCUTS.newProject,
          ...sending({ type: 'newProject' }),
        },
        {
          label: 'Open Project…',
          accelerator: SHORTCUTS.openProject,
          ...sending({ type: 'openProject' }),
        },
        {
          label: 'Open Recent',
          enabled: recent.length > 0,
          submenu: recent.map(({ path, displayName }) => ({
            label: displayName,
            toolTip: path,
            ...sending({ type: 'openRecent', path }),
          })),
        },
        // The window shows the file's split before anything is written.
        { label: 'Import…', ...sending({ type: 'import' }) },
        // The window asks which Scenes and Chapters first.
        {
          id: 'exportManuscript',
          label: 'Export Manuscript…',
          enabled: !!project,
          ...sending({ type: 'exportManuscript' }),
        },
        // The window asks which Entries, and with what, first.
        {
          id: 'exportStoryBible',
          label: 'Export Story Bible…',
          enabled: !!project,
          ...sending({ type: 'exportStoryBible' }),
        },
        { type: 'separator' },
        mac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(['writing', 'brainstorm', 'interview'] as const).map((mode) => ({
          label: MODE_LABELS[mode],
          enabled: !!project,
          ...windowKey(SHORTCUTS[mode]),
          ...sending({ type: 'mode', mode }),
        })),
        { type: 'separator' },
        {
          label: 'Zen Mode',
          type: 'checkbox',
          checked: project?.zen ?? false,
          enabled: !!project,
          ...windowKey(SHORTCUTS.zen),
          ...sending({ type: 'zen' }),
        },
        {
          label: 'Left Pane',
          type: 'checkbox',
          checked: project?.docked.left ?? false,
          enabled: !!project,
          ...windowKey(SHORTCUTS.leftPane),
          ...sending({ type: 'togglePane', pane: 'left' }),
        },
        {
          label: 'Assistant',
          type: 'checkbox',
          checked: project?.docked.assistant ?? false,
          enabled: !!project,
          ...windowKey(SHORTCUTS.assistant),
          ...sending({ type: 'togglePane', pane: 'assistant' }),
        },
        { type: 'separator' },
        // Ctrl+Shift+W, which the window takes, cycles them in Writing.
        {
          label: 'Writing Width',
          submenu: choices(
            'writingWidth',
            WRITING_WIDTHS,
            WRITING_WIDTH_LABELS,
          ),
        },
        { type: 'separator' },
        { label: 'Theme', submenu: choices('theme', THEMES, THEME_LABELS) },
        {
          label: 'Spell Check',
          type: 'checkbox',
          checked: view.spellCheck,
          click: () =>
            actions.setViewSettings({ spellCheck: !view.spellCheck }),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // Electron's own, for development only.
        ...(dev
          ? [
              { type: 'separator' as const },
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
            ]
          : []),
      ],
    },
    {
      label: 'Insert',
      submenu: [
        {
          label: 'New Scene',
          enabled: writable,
          ...windowKey(SHORTCUTS.newScene),
          ...sending({ type: 'newScene', above: false }),
        },
        {
          label: 'New Scene Above',
          enabled: writable,
          ...windowKey(SHORTCUTS.newSceneAbove),
          ...sending({ type: 'newScene', above: true }),
        },
        {
          label: 'New Chapter',
          enabled: writable,
          ...windowKey(SHORTCUTS.newChapter),
          ...sending({ type: 'newChapter', above: false }),
        },
        {
          label: 'New Chapter Above',
          enabled: writable,
          ...windowKey(SHORTCUTS.newChapterAbove),
          ...sending({ type: 'newChapter', above: true }),
        },
        { type: 'separator' },
        {
          label: 'New Entry',
          enabled: writable,
          submenu: ENTRY_TYPES.map((entryType) => ({
            label: ENTRY_TYPE_LABELS[entryType],
            ...sending({ type: 'newEntry', entryType }),
          })),
        },
        {
          label: 'New Todo',
          enabled: writable,
          ...windowKey(SHORTCUTS.newTodo),
          ...sending({ type: 'newTodo' }),
        },
      ],
    },
    {
      label: 'Format',
      submenu: [
        formatItem('Bold', 'bold'),
        formatItem('Italic', 'italic'),
        { type: 'separator' },
        formatItem('Align Left', 'alignLeft'),
        formatItem('Align Centre', 'alignCentre'),
        formatItem('Align Right', 'alignRight'),
        { type: 'separator' },
        formatItem('Block Quote', 'blockQuote'),
      ],
    },
    // On macOS Settings… is in the app menu.
    {
      label: 'Tools',
      submenu: mac ? [projectSettings] : [projectSettings, settings],
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      role: 'help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          ...windowKey(SHORTCUTS.shortcuts),
          ...sending({ type: 'shortcuts' }),
        },
      ],
    },
  ];
}
