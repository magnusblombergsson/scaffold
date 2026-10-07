import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import type { Command } from '../shared/shortcuts';
import {
  DEFAULT_VIEW_SETTINGS,
  type ViewSettings,
} from '../shared/view-settings';
import { menuTemplate, proseMenuTemplate, type MenuState } from './menu';

const noProject: MenuState = {
  mac: false,
  dev: false,
  project: null,
  recent: [],
  view: DEFAULT_VIEW_SETTINGS,
};
const docked = { left: true, assistant: true };
const writable: MenuState = {
  ...noProject,
  project: {
    readOnly: false,
    docked,
    zen: false,
    proseFocused: false,
    splittable: false,
  },
};
/** A writable Project, typing in its Prose. */
const inProse: MenuState = {
  ...writable,
  project: { ...writable.project!, proseFocused: true },
};
/** As `inProse`, the Prose of a Scene that can be split. */
const inSplittable: MenuState = {
  ...inProse,
  project: { ...inProse.project!, splittable: true },
};

function build(state: MenuState) {
  const sent: Command[] = [];
  const viewChanges: Partial<ViewSettings>[] = [];
  const template = menuTemplate(state, {
    send: (command) => sent.push(command),
    setViewSettings: (change) => viewChanges.push(change),
  });
  return { template, sent, viewChanges };
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
  it('has File, Edit, View, Insert, Format, Tools, Window and Help', () => {
    const { template } = build(writable);
    expect(template.map((item) => item.label ?? item.role)).toEqual([
      'File',
      'editMenu',
      'View',
      'Insert',
      'Format',
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
      'Export Story Bible…',
      undefined,
    ]);
    expect(item(file, 'New Project…').accelerator).toBe('CmdOrCtrl+Shift+N');
    expect(item(file, 'Open Project…').accelerator).toBe('CmdOrCtrl+O');
    click(item(file, 'New Project…'));
    click(item(menu(file, 'Open Recent'), 'The Ferry'));
    click(item(file, 'Export Manuscript…'));
    click(item(file, 'Export Story Bible…'));
    expect(sent).toEqual([
      { type: 'newProject' },
      { type: 'openRecent', path: 'D:/Stories/Ferry' },
      { type: 'exportManuscript' },
      { type: 'exportStoryBible' },
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
      project: {
        readOnly: true,
        docked: { left: false, assistant: true },
        zen: false,
        proseFocused: false,
        splittable: false,
      },
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

  it('enters and leaves zen mode from View, a check item before the panes, with its key taken by the window', () => {
    const { template, sent } = build({
      ...writable,
      project: {
        readOnly: true,
        docked,
        zen: true,
        proseFocused: false,
        splittable: false,
      },
    });
    const view = menu(template, 'View');
    const zen = item(view, 'Zen Mode');
    expect(zen).toMatchObject({
      type: 'checkbox',
      checked: true,
      enabled: true,
      accelerator: 'CmdOrCtrl+Shift+F',
      registerAccelerator: false,
    });
    const at = view.indexOf(zen);
    expect(view[at - 1].type).toBe('separator');
    expect(view.slice(at + 1, at + 3).map((i) => i.label)).toEqual([
      'Left Pane',
      'Assistant',
    ]);
    click(zen);
    click(zen, true);
    expect(sent).toEqual([{ type: 'zen' }, { type: 'zen', byKey: true }]);
    expect(
      item(menu(build(writable).template, 'View'), 'Zen Mode').checked,
    ).toBe(false);
    const none = menu(build(noProject).template, 'View');
    expect(item(none, 'Zen Mode')).toMatchObject({
      checked: false,
      enabled: false,
    });
  });

  it('has View in its order: Modes, zen and panes, width, theme and spell check, zoom, full screen', () => {
    const view = menu(build(writable).template, 'View');
    expect(view.map((i) => i.label ?? i.role ?? i.type)).toEqual([
      'Writing',
      'Brainstorm',
      'Interview',
      'separator',
      'Zen Mode',
      'Left Pane',
      'Assistant',
      'separator',
      'Writing Width',
      'separator',
      'Theme',
      'Spell Check',
      'separator',
      'resetZoom',
      'zoomIn',
      'zoomOut',
      'separator',
      'togglefullscreen',
    ]);
  });

  it('has Electron’s Reload and Developer Tools only in a development build', () => {
    const roles = (state: MenuState) =>
      menu(build(state).template, 'View').map((i) => i.role);
    expect(roles(writable)).not.toContain('reload');
    // After the View menu's own items, which keep their order.
    expect(roles({ ...writable, dev: true }).slice(-5)).toEqual([
      'togglefullscreen',
      undefined,
      'reload',
      'forceReload',
      'toggleDevTools',
    ]);
  });

  it('sets the writing width from View, as radio items, with or without a Project', () => {
    for (const state of [writable, noProject]) {
      const { template, viewChanges } = build({
        ...state,
        view: { ...DEFAULT_VIEW_SETTINGS, writingWidth: 'wide' },
      });
      const widths = menu(menu(template, 'View'), 'Writing Width');
      expect(
        widths.map(({ label, type, checked }) => ({ label, type, checked })),
      ).toEqual([
        { label: 'Narrow', type: 'radio', checked: false },
        { label: 'Wide', type: 'radio', checked: true },
        { label: 'Full', type: 'radio', checked: false },
      ]);
      expect(widths.every((i) => i.enabled !== false)).toBe(true);
      click(item(widths, 'Full'));
      expect(viewChanges).toEqual([{ writingWidth: 'full' }]);
    }
  });

  it('sets the theme from View, as radio items', () => {
    const { template, viewChanges } = build({
      ...noProject,
      view: { ...DEFAULT_VIEW_SETTINGS, theme: 'dark' },
    });
    const themes = menu(menu(template, 'View'), 'Theme');
    expect(
      themes.map(({ label, type, checked }) => ({ label, type, checked })),
    ).toEqual([
      { label: 'System', type: 'radio', checked: false },
      { label: 'Light', type: 'radio', checked: false },
      { label: 'Dark', type: 'radio', checked: true },
    ]);
    click(item(themes, 'System'));
    expect(viewChanges).toEqual([{ theme: 'system' }]);
  });

  it('turns spell check off and on from View, a check item', () => {
    const on = build(noProject);
    const spellCheck = item(menu(on.template, 'View'), 'Spell Check');
    expect(spellCheck).toMatchObject({ type: 'checkbox', checked: true });
    click(spellCheck);
    expect(on.viewChanges).toEqual([{ spellCheck: false }]);

    const off = build({
      ...noProject,
      view: { ...DEFAULT_VIEW_SETTINGS, spellCheck: false },
    });
    click(item(menu(off.template, 'View'), 'Spell Check'));
    expect(off.viewChanges).toEqual([{ spellCheck: true }]);
  });

  it('creates from Insert, below or above, and Entries of each type', () => {
    const { template, sent } = build(writable);
    const insert = menu(template, 'Insert');
    expect(labels(insert)).toEqual([
      'New Scene',
      'New Scene Above',
      'Split Scene',
      'Split to Next Chapter',
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

  it('splits the Scene from Insert, with keys the window takes', () => {
    const { template, sent } = build(inSplittable);
    const insert = menu(template, 'Insert');
    const split = item(insert, 'Split Scene');
    const toNext = item(insert, 'Split to Next Chapter');
    expect(split).toMatchObject({
      accelerator: 'CmdOrCtrl+K',
      registerAccelerator: false,
      enabled: true,
    });
    expect(toNext).toMatchObject({
      accelerator: 'CmdOrCtrl+Shift+K',
      registerAccelerator: false,
      enabled: true,
    });
    click(split);
    click(toNext, true);
    expect(sent).toEqual([
      { type: 'splitScene', toNextChapter: false },
      { type: 'splitScene', toNextChapter: true, byKey: true },
    ]);
  });

  it('splits nothing unless the Prose of a Scene that can be split has focus', () => {
    for (const state of [
      noProject,
      writable,
      inProse,
      {
        ...inSplittable,
        project: { ...inSplittable.project!, readOnly: true },
      },
    ]) {
      const insert = menu(build(state).template, 'Insert');
      expect(item(insert, 'Split Scene').enabled).toBe(false);
      expect(item(insert, 'Split to Next Chapter').enabled).toBe(false);
    }
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
      { ...writable, project: { ...writable.project!, readOnly: true } },
    ]) {
      const insert = menu(build(state).template, 'Insert');
      expect(
        insert.every(
          (entry) => entry.type === 'separator' || entry.enabled === false,
        ),
      ).toBe(true);
    }
  });

  it('formats the Prose from Format, with keys the editor takes', () => {
    const { template, sent } = build(inProse);
    const format = menu(template, 'Format');
    expect(labels(format)).toEqual([
      'Bold',
      'Italic',
      'Align Left',
      'Align Centre',
      'Align Right',
      'Block Quote',
    ]);
    expect(format.map((entry) => entry.type ?? entry.accelerator)).toEqual([
      'CmdOrCtrl+B',
      'CmdOrCtrl+I',
      'separator',
      'CmdOrCtrl+Shift+L',
      'CmdOrCtrl+Shift+E',
      'CmdOrCtrl+Shift+R',
      'separator',
      'CmdOrCtrl+Shift+B',
    ]);
    for (const entry of format) {
      if (entry.type === 'separator') continue;
      expect(entry.registerAccelerator).toBe(false);
      expect(entry.enabled).toBe(true);
    }
    click(item(format, 'Bold'));
    click(item(format, 'Italic'));
    click(item(format, 'Align Left'));
    click(item(format, 'Align Centre'));
    click(item(format, 'Align Right'));
    click(item(format, 'Block Quote'));
    expect(sent).toEqual([
      { type: 'format', format: 'bold' },
      { type: 'format', format: 'italic' },
      { type: 'format', format: 'alignLeft' },
      { type: 'format', format: 'alignCentre' },
      { type: 'format', format: 'alignRight' },
      { type: 'format', format: 'blockQuote' },
    ]);
  });

  it('formats nothing unless the Prose of a writable Project has focus', () => {
    for (const state of [
      noProject,
      writable,
      { ...inProse, project: { ...inProse.project!, readOnly: true } },
    ]) {
      const format = menu(build(state).template, 'Format');
      expect(
        format.every(
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
      project: {
        readOnly: true,
        docked,
        zen: false,
        proseFocused: false,
        splittable: false,
      },
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

describe('proseMenuTemplate', () => {
  it('splits the Scene, or to the next Chapter, showing the keys', () => {
    const sent: Command[] = [];
    const items = proseMenuTemplate(true, (command) => sent.push(command));
    expect(labels(items)).toEqual(['Split Scene', 'Split to Next Chapter']);
    expect(items.map((entry) => entry.accelerator)).toEqual([
      'CmdOrCtrl+K',
      'CmdOrCtrl+Shift+K',
    ]);
    for (const entry of items) expect(entry.enabled).toBe(true);
    click(item(items, 'Split Scene'));
    click(item(items, 'Split to Next Chapter'));
    expect(sent).toEqual([
      { type: 'splitScene', toNextChapter: false },
      { type: 'splitScene', toNextChapter: true },
    ]);
  });

  it('can split nothing in a Scene that can not be split', () => {
    const items = proseMenuTemplate(false, () => {});
    for (const entry of items) expect(entry.enabled).toBe(false);
  });
});
