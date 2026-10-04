import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import type { Command } from '../shared/shortcuts';
import { menuTemplate, type MenuState } from './menu';

const noProject: MenuState = { mac: false, project: null, recent: [] };
const writable: MenuState = {
  ...noProject,
  project: { readOnly: false, language: 'en-US' },
};

function build(state: MenuState) {
  const sent: Command[] = [];
  const template = menuTemplate(state, {
    send: (command) => sent.push(command),
    export: () => {},
    setLanguage: () => {},
  });
  return { template, sent };
}

function menu(
  template: MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions[] {
  const found = template.find((item) => item.label === label);
  if (!found) throw new Error(`No menu ${label}`);
  return found.submenu as MenuItemConstructorOptions[];
}

function item(items: MenuItemConstructorOptions[], label: string) {
  const found = items.find((item) => item.label === label);
  if (!found) throw new Error(`No item ${label}`);
  return found;
}

const click = (entry: MenuItemConstructorOptions, byKey = false) =>
  entry.click?.({} as Electron.MenuItem, undefined, {
    triggeredByAccelerator: byKey,
  } as Electron.KeyboardEvent);

const labels = (items: MenuItemConstructorOptions[]) =>
  items.filter((item) => item.type !== 'separator').map((item) => item.label);

describe('menuTemplate', () => {
  it('has File, Edit, View, Insert, Tools, Window and Help', () => {
    const { template } = build(writable);
    expect(template.map((item) => item.label ?? item.role)).toEqual([
      'File',
      'editMenu',
      'View',
      'Insert',
      'Tools',
      'windowMenu',
      'Help',
    ]);
  });

  it('opens and makes Projects from File, with their shortcuts', () => {
    const { template, sent } = build({
      ...writable,
      recent: [{ path: 'D:/Stories/Ferry', displayName: 'The Ferry' }],
    });
    const file = menu(template, 'File');
    expect(labels(file)).toEqual([
      'New Project…',
      'Open Project…',
      'Open Recent',
      'Import…',
      'Export…',
      'Prose Language',
      undefined,
    ]);
    expect(item(file, 'New Project…').accelerator).toBe('CmdOrCtrl+Shift+N');
    expect(item(file, 'Open Project…').accelerator).toBe('CmdOrCtrl+O');
    click(item(file, 'New Project…'));
    click(item(menu(file, 'Open Recent'), 'The Ferry'));
    expect(sent).toEqual([
      { type: 'newProject' },
      { type: 'openRecent', path: 'D:/Stories/Ferry' },
    ]);
  });

  it('switches Mode from View with Ctrl+1/2/3, taken by the window', () => {
    const { template, sent } = build(writable);
    const view = menu(template, 'View');
    const brainstorm = item(view, 'Brainstorm');
    expect(brainstorm.accelerator).toBe('CmdOrCtrl+2');
    expect(brainstorm.registerAccelerator).toBe(false);
    expect(labels(view)).toEqual(
      expect.arrayContaining(['Writing', 'Brainstorm', 'Interview']),
    );
    click(brainstorm);
    expect(sent).toEqual([{ type: 'mode', mode: 'brainstorm' }]);
  });

  it('creates from Insert, below or above, and Entries of each type', () => {
    const { template, sent } = build(writable);
    const insert = menu(template, 'Insert');
    expect(labels(insert)).toEqual([
      'New Scene',
      'New Scene Above',
      'New Chapter',
      'New Chapter Above',
      'New Entry',
    ]);
    expect(item(insert, 'New Chapter Above').accelerator).toBe(
      'CmdOrCtrl+Shift+Alt+Enter',
    );
    expect(labels(menu(insert, 'New Entry'))).toEqual([
      'Character',
      'Place',
      'Item',
      'World Rule',
      'Plot Thread',
      'Theme',
      'Other',
    ]);
    click(item(insert, 'New Scene Above'));
    click(item(insert, 'New Chapter'), true);
    click(item(menu(insert, 'New Entry'), 'Place'));
    expect(sent).toEqual([
      { type: 'newScene', above: true },
      { type: 'newChapter', above: false, byKey: true },
      { type: 'newEntry', entryType: 'place' },
    ]);
  });

  it('leaves the create chords to the window, so they work in an editor', () => {
    const { template } = build(writable);
    for (const entry of menu(template, 'Insert')) {
      if (entry.accelerator) expect(entry.registerAccelerator).toBe(false);
    }
  });

  it('can insert nothing without a Project, or in a read-only one', () => {
    for (const state of [
      noProject,
      { ...writable, project: { readOnly: true, language: 'en-US' as const } },
    ]) {
      const insert = menu(build(state).template, 'Insert');
      expect(
        insert.every(
          (entry) => entry.type === 'separator' || entry.enabled === false,
        ),
      ).toBe(true);
    }
  });

  it('opens Settings from Tools, or on macOS from the app menu', () => {
    const { template, sent } = build(writable);
    const settings = item(menu(template, 'Tools'), 'Settings…');
    expect(settings.accelerator).toBe('CmdOrCtrl+,');
    click(settings);
    expect(sent).toEqual([{ type: 'settings' }]);

    const mac = build({ ...writable, mac: true }).template;
    expect(mac[0].role).toBe('appMenu');
    expect(labels(mac[0].submenu as MenuItemConstructorOptions[])).toContain(
      'Settings…',
    );
    expect(mac.find((entry) => entry.label === 'Tools')).toBeUndefined();
  });

  it('opens the cheat sheet from Help, with or without a Project, showing Ctrl+/ that the window takes', () => {
    const { template, sent } = build(noProject);
    const shortcuts = item(menu(template, 'Help'), 'Keyboard Shortcuts');
    expect(shortcuts.accelerator).toBe('CmdOrCtrl+/');
    expect(shortcuts.registerAccelerator).toBe(false);
    expect(shortcuts.enabled).not.toBe(false);
    click(shortcuts, true);
    expect(sent).toEqual([{ type: 'shortcuts', byKey: true }]);
  });
});
