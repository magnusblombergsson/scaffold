import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import type { Command } from '../shared/shortcuts';
import { menuTemplate, type MenuState } from './menu';

const noProject: MenuState = { mac: false, project: null, recent: [] };
const docked = { left: true, assistant: true };
const writable: MenuState = {
  ...noProject,
  project: { readOnly: false, docked },
};

function build(state: MenuState) {
  const sent: Command[] = [];
  const template = menuTemplate(state, {
    send: (command) => sent.push(command),
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
      'Export Manuscript…',
      undefined,
    ]);
    expect(item(file, 'New Project…').accelerator).toBe('CmdOrCtrl+Shift+N');
    expect(item(file, 'Open Project…').accelerator).toBe('CmdOrCtrl+O');
    click(item(file, 'New Project…'));
    click(item(menu(file, 'Open Recent'), 'The Ferry'));
    click(item(file, 'Export Manuscript…'));
    expect(sent).toEqual([
      { type: 'newProject' },
      { type: 'openRecent', path: 'D:/Stories/Ferry' },
      { type: 'exportManuscript' },
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

  it('collapses and docks the left pane and the Assistant from View, as check items, with keys taken by the window', () => {
    const { template, sent } = build({
      ...writable,
      project: { readOnly: true, docked: { left: false, assistant: true } },
    });
    const view = menu(template, 'View');
    const left = item(view, 'Left Pane');
    const assistant = item(view, 'Assistant');
    expect(left).toMatchObject({
      type: 'checkbox',
      checked: false,
      enabled: true,
      accelerator: 'CmdOrCtrl+Shift+M',
      registerAccelerator: false,
    });
    expect(assistant).toMatchObject({
      type: 'checkbox',
      checked: true,
      accelerator: 'CmdOrCtrl+Shift+A',
      registerAccelerator: false,
    });
    click(left);
    click(assistant, true);
    expect(sent).toEqual([
      { type: 'togglePane', pane: 'left' },
      { type: 'togglePane', pane: 'assistant', byKey: true },
    ]);
    const none = menu(build(noProject).template, 'View');
    expect(item(none, 'Left Pane').enabled).toBe(false);
    expect(item(none, 'Assistant').enabled).toBe(false);
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
      'New Todo',
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
    expect(item(insert, 'New Todo').accelerator).toBe('CmdOrCtrl+T');
    click(item(insert, 'New Todo'), true);
    expect(sent).toEqual([
      { type: 'newScene', above: true },
      { type: 'newChapter', above: false, byKey: true },
      { type: 'newEntry', entryType: 'place' },
      { type: 'newTodo', byKey: true },
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
      { ...writable, project: { readOnly: true, docked } },
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
    expect(labels(menu(template, 'Tools'))).toEqual([
      'Project Settings…',
      'Settings…',
    ]);
    const settings = item(menu(template, 'Tools'), 'Settings…');
    expect(settings.accelerator).toBe('CmdOrCtrl+,');
    click(settings);
    expect(sent).toEqual([{ type: 'settings' }]);

    const mac = build({ ...writable, mac: true }).template;
    expect(mac[0].role).toBe('appMenu');
    expect(labels(mac[0].submenu as MenuItemConstructorOptions[])).toContain(
      'Settings…',
    );
    expect(labels(menu(mac, 'Tools'))).toEqual(['Project Settings…']);
  });

  it('opens Project Settings from Tools with Ctrl+Shift+, on every platform, only with a Project', () => {
    for (const mac of [false, true]) {
      const { template, sent } = build({ ...writable, mac });
      const projectSettings = item(
        menu(template, 'Tools'),
        'Project Settings…',
      );
      expect(projectSettings.accelerator).toBe('CmdOrCtrl+Shift+,');
      expect(projectSettings.enabled).toBe(true);
      click(projectSettings);
      expect(sent).toEqual([{ type: 'projectSettings' }]);
    }
    const tools = menu(build(noProject).template, 'Tools');
    expect(item(tools, 'Project Settings…').enabled).toBe(false);
  });

  it('keeps Project Settings open to a read-only Project, to see its values', () => {
    const { template } = build({
      ...writable,
      project: { readOnly: true, docked },
    });
    expect(item(menu(template, 'Tools'), 'Project Settings…').enabled).toBe(
      true,
    );
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
