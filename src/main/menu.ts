import type {
  BaseWindow,
  KeyboardEvent,
  MenuItemConstructorOptions,
} from 'electron';
import { MODE_LABELS } from '../shared/conversation';
import { ENTRY_TYPE_LABELS, ENTRY_TYPES } from '../shared/project-types';
import { SHORTCUTS, type Command } from '../shared/shortcuts';

/** What the menus show for the window in front. */
export type MenuState = {
  mac: boolean;
  /** The Project the window in front shows, if any. */
  project: { readOnly: boolean } | null;
  /** Latest first. */
  recent: { path: string; displayName: string }[];
};

/** What the menus do, in the window they were chosen in, if any. */
export type MenuActions = {
  /** Hands a command to the window, which knows what is current in it. */
  send(command: Command, window: BaseWindow | undefined): void;
  export(window: BaseWindow | undefined): void;
};

/**
 * The menu bar. The window takes the shortcuts of Mode and Insert, and
 * Ctrl+/, itself, so that they work inside an editor and only where they
 * apply; the menus only show them.
 */
export function menuTemplate(
  { mac, project, recent }: MenuState,
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
        {
          id: 'export',
          label: 'Export…',
          enabled: !!project,
          click: (_item, window) => actions.export(window),
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
        // Electron's own View menu.
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
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
