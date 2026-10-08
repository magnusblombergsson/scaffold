import { describe, expect, it, vi } from 'vitest';
import { appBridge, type ProjectEvent } from '../shared/api';
import type { Filter, Filters } from '../shared/filter';
import { ALL_DOCKED } from '../shared/shortcuts';
import { memoryTransport, type MemoryWindow } from '../shared/memory-transport';
import type { VocabularyChange } from './project-store/vocabulary';
import {
  NoProjectOpen,
  ProjectWindows,
  type WindowedStore,
} from './project-windows';

// A Project window's state, over the memory transport and a stand-in store.

/** A store that does what ProjectWindows asks of one, and keeps a log. */
class FakeStore implements WindowedStore {
  readonly listeners = new Set<(event: ProjectEvent) => void>();
  readonly vocabulary = new Set<(change: VocabularyChange) => void>();
  unsaved = false;
  readOnlyNow: object | null = null;
  closeGate: Promise<void> = Promise.resolve();
  constructor(
    readonly id: string,
    readonly path: string,
    readonly log: string[] = [],
  ) {}
  readOnly() {
    return this.readOnlyNow;
  }
  async flush() {
    this.log.push(`flush ${this.id}`);
  }
  hasUnsaved() {
    return this.unsaved;
  }
  async close() {
    this.log.push(`close ${this.id} started`);
    await this.closeGate;
    this.log.push(`close ${this.id}`);
  }
  subscribe(listener: (event: ProjectEvent) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  onVocabularyChanged(listener: (change: VocabularyChange) => void) {
    this.vocabulary.add(listener);
    return () => void this.vocabulary.delete(listener);
  }
  fire(event: ProjectEvent) {
    for (const listener of this.listeners) listener(event);
  }
  change(change: VocabularyChange) {
    for (const listener of this.vocabulary) listener(change);
  }
}

function setUp(log: string[] = []) {
  const transport = memoryTransport();
  const { emit } = appBridge.main(transport.main);
  const changed = vi.fn();
  const leftZen = vi.fn();
  const changeFilters = vi.fn(
    (_id: string, _change: (filter: Filter) => Filter): Filters => ({}),
  );
  const windows = new ProjectWindows<MemoryWindow, FakeStore>({
    emit,
    flush: async (window) => void log.push(`renderer flush ${window.id}`),
    changeFilters,
    changed,
    leftZen,
  });
  /** A window, and what its renderer hears. */
  function open() {
    const { window, renderer } = transport.open();
    const heard = { project: [] as ProjectEvent[], filters: [] as Filters[] };
    const built = appBridge.renderer(renderer);
    built.build('project').subscribe((event) => heard.project.push(event));
    built.build('shell').onFilter((filters) => heard.filters.push(filters));
    return { window, heard };
  }
  return { windows, open, changed, leftZen, changeFilters, log };
}

describe('attaching a store to a window', () => {
  it('sends the store’s events to that window only', () => {
    const { windows, open } = setUp();
    const one = open();
    const two = open();
    const store = new FakeStore('p1', '/p1');
    windows.attach(one.window, store);

    store.fire({ type: 'languageChanged', language: 'en-US' });

    expect(one.heard.project).toEqual([
      { type: 'languageChanged', language: 'en-US' },
    ]);
    expect(two.heard.project).toEqual([]);
    expect(windows.find(one.window)).toBe(store);
    expect(windows.find(two.window)).toBeUndefined();
  });

  it('asks for the menu to be made anew when the language or read-only changes', () => {
    const { windows, open, changed } = setUp();
    const { window } = open();
    const store = new FakeStore('p1', '/p1');
    windows.attach(window, store);
    changed.mockClear();

    store.fire({ type: 'statusesChanged', statuses: [] });
    expect(changed).not.toHaveBeenCalled();
    store.fire({ type: 'languageChanged', language: 'sv-SE' });
    store.fire({ type: 'readOnly' });

    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('refuses a window with no Project, in a way that can be told', () => {
    const { windows, open } = setUp();
    const { window } = open();

    expect(() => windows.of(window)).toThrow(NoProjectOpen);
    expect(() => windows.of(window)).toThrow(
      'No Project is open in this window',
    );
    const store = new FakeStore('p1', '/p1');
    windows.attach(window, store);
    expect(windows.of(window)).toBe(store);
  });

  it('finds the window showing a Project by its path', () => {
    const { windows, open } = setUp();
    const { window } = open();
    windows.attach(window, new FakeStore('p1', '/p1'));

    expect(windows.showing('/p1')).toBe(window);
    expect(windows.showing('/elsewhere')).toBeUndefined();
  });
});

describe('the menu state of a window', () => {
  it('is nothing when there is no window or no Project', () => {
    const { windows, open } = setUp();
    const { window } = open();

    expect(windows.menuState(null)).toBeNull();
    expect(windows.menuState(window)).toBeNull();
  });

  it('shows a Project with every pane docked, no Prose focused and no zen', () => {
    const { windows, open } = setUp();
    const { window } = open();
    windows.attach(window, new FakeStore('p1', '/p1'));

    expect(windows.menuState(window)).toEqual({
      readOnly: false,
      docked: ALL_DOCKED,
      zen: false,
      proseFocused: false,
      splittable: false,
    });
  });

  it('shows read-only, docked panes, and a splittable or unsplittable Prose', () => {
    const { windows, open } = setUp();
    const { window } = open();
    const store = new FakeStore('p1', '/p1');
    windows.attach(window, store);
    store.readOnlyNow = {};
    const docked = { ...ALL_DOCKED, assistant: false };
    windows.setDocked(window, docked);

    expect(windows.setProseFocus(window, true, true)).toBe(true);
    expect(windows.menuState(window)).toMatchObject({
      readOnly: true,
      docked,
      proseFocused: true,
      splittable: true,
    });
    expect(windows.setProseFocus(window, true, false)).toBe(true);
    expect(windows.menuState(window)).toMatchObject({
      proseFocused: true,
      splittable: false,
    });
    expect(windows.setProseFocus(window, true, false)).toBe(false);
    windows.setProseFocus(window, false, false);
    expect(windows.menuState(window)).toMatchObject({ proseFocused: false });
  });

  it('shows zen on while the window is in it, and off after', () => {
    const { windows, open } = setUp();
    const { window } = open();
    windows.attach(window, new FakeStore('p1', '/p1'));

    windows.enterZen(window, true);
    expect(windows.menuState(window)).toMatchObject({ zen: true });
    expect(windows.exitZen(window)).toBe(true);
    expect(windows.menuState(window)).toMatchObject({ zen: false });
    expect(windows.exitZen(window)).toBeUndefined();
  });

  it('is that of the window asked for, not of another', () => {
    const { windows, open } = setUp();
    const one = open();
    const two = open();
    windows.attach(one.window, new FakeStore('p1', '/p1'));
    windows.attach(two.window, new FakeStore('p2', '/p2'));
    windows.enterZen(two.window, false);

    expect(windows.menuState(one.window)).toMatchObject({ zen: false });
    expect(windows.menuState(two.window)).toMatchObject({ zen: true });
  });
});

describe('closing a window’s Project', () => {
  it('asks the renderer to flush, then closes the store, before the window forgets it', async () => {
    const log: string[] = [];
    const { windows, open, changed } = setUp(log);
    const { window } = open();
    const store = new FakeStore('p1', '/p1', log);
    windows.attach(window, store);

    await windows.close(window);

    expect(log).toEqual([
      `renderer flush ${window.id}`,
      'close p1 started',
      'close p1',
    ]);
    expect(windows.find(window)).toBeUndefined();
    expect(store.listeners.size).toBe(0);
    expect(store.vocabulary.size).toBe(0);
    expect(changed).toHaveBeenCalled();
  });

  it('closes once, however many times it is asked for meanwhile', async () => {
    const log: string[] = [];
    const { windows, open } = setUp(log);
    const { window } = open();
    const store = new FakeStore('p1', '/p1', log);
    windows.attach(window, store);

    await Promise.all([windows.close(window), windows.close(window)]);

    expect(log.filter((line) => line === 'close p1')).toHaveLength(1);
  });

  it('keeps the Project while it fails to close', async () => {
    const { windows, open } = setUp();
    const { window } = open();
    const store = new FakeStore('p1', '/p1');
    store.closeGate = Promise.reject(new Error("can't save"));
    windows.attach(window, store);

    await expect(windows.close(window)).rejects.toThrow("can't save");

    expect(windows.find(window)).toBe(store);
    store.closeGate = Promise.resolve();
    await windows.close(window);
    expect(windows.find(window)).toBeUndefined();
  });

  it('leaves zen as it closes, saying what the window was before', async () => {
    const { windows, open, leftZen } = setUp();
    const { window } = open();
    windows.attach(window, new FakeStore('p1', '/p1'));
    windows.enterZen(window, true);

    await windows.close(window);

    expect(leftZen).toHaveBeenCalledWith(window, true);
  });

  it('does nothing for a window with no Project', async () => {
    const { windows, open, log } = setUp();
    const { window } = open();

    await windows.close(window);

    expect(log).toEqual([]);
  });
});

describe('closing every window to quit', () => {
  it('waits for every window’s Project to close', async () => {
    const { windows, open } = setUp();
    const one = open();
    const two = open();
    const slow = new FakeStore('p2', '/p2');
    let release!: () => void;
    slow.closeGate = new Promise((resolve) => (release = resolve));
    windows.attach(one.window, new FakeStore('p1', '/p1'));
    windows.attach(two.window, slow);

    let done = false;
    const closing = windows.closeAll().then((result) => {
      done = true;
      return result;
    });
    await vi.waitFor(() => expect(slow.log).toContain('close p2 started'));
    expect(done).toBe(false);
    release();

    expect(await closing).toEqual({
      stuck: [],
      closed: [one.window, two.window],
    });
    expect(windows.count()).toBe(0);
  });

  it('closes nothing while any Project has changes that are not saved', async () => {
    const log: string[] = [];
    const { windows, open } = setUp(log);
    const one = open();
    const two = open();
    const fine = new FakeStore('p1', '/p1', log);
    const stuck = new FakeStore('p2', '/p2', log);
    stuck.unsaved = true;
    windows.attach(one.window, fine);
    windows.attach(two.window, stuck);

    const result = await windows.closeAll();

    expect(result).toEqual({ stuck: [two.window], closed: [] });
    expect(log.filter((line) => line.startsWith('close'))).toEqual([]);
    expect(log).toContain('flush p2');
    expect(windows.find(one.window)).toBe(fine);
  });

  it('closes those it can when one fails between saving and closing', async () => {
    const { windows, open } = setUp();
    const one = open();
    const two = open();
    const failing = new FakeStore('p2', '/p2');
    failing.closeGate = Promise.reject(new Error('changed meanwhile'));
    windows.attach(one.window, new FakeStore('p1', '/p1'));
    windows.attach(two.window, failing);

    const result = await windows.closeAll();

    expect(result).toEqual({ stuck: [two.window], closed: [one.window] });
  });
});

describe('Filters following the vocabulary of a Project', () => {
  const filter: Filter = { tags: ['Mara', 'war'], statuses: ['idea', 'done'] };

  /** What a change does to `filter`, as the settings would apply it. */
  function applied(
    changeFilters: ReturnType<typeof setUp>['changeFilters'],
  ): Filter[] {
    return changeFilters.mock.calls.map(([, change]) => change(filter));
  }

  it('renames a Tag in the Filters once, with two windows open on the Project', () => {
    const { windows, open, changeFilters } = setUp();
    const one = open();
    const two = open();
    const store = new FakeStore('p1', '/p1');
    changeFilters.mockReturnValue({
      'writing-bible': { tags: ['Lind', 'war'] },
    });
    windows.attach(one.window, store);
    windows.attach(two.window, store);

    store.change({ kind: 'tag', renamed: { from: 'Mara', to: 'Lind' } });

    expect(changeFilters).toHaveBeenCalledTimes(1);
    expect(changeFilters.mock.calls[0][0]).toBe('p1');
    expect(applied(changeFilters)).toEqual([
      { tags: ['Lind', 'war'], statuses: ['idea', 'done'] },
    ]);
    // Every window of the Project hears what changed.
    expect(one.heard.filters).toEqual([
      { 'writing-bible': { tags: ['Lind', 'war'] } },
    ]);
    expect(two.heard.filters).toEqual([
      { 'writing-bible': { tags: ['Lind', 'war'] } },
    ]);
  });

  it('takes a deleted Tag out of the Filters', () => {
    const { windows, open, changeFilters } = setUp();
    const { window } = open();
    const store = new FakeStore('p1', '/p1');
    windows.attach(window, store);

    store.change({ kind: 'tag', deleted: 'Mara' });

    expect(applied(changeFilters)).toEqual([
      { tags: ['war'], statuses: ['idea', 'done'] },
    ]);
  });

  it('takes a deleted Status out of the Filters', () => {
    const { windows, open, changeFilters } = setUp();
    const { window } = open();
    const store = new FakeStore('p1', '/p1');
    windows.attach(window, store);

    store.change({ kind: 'status', deleted: 'idea' });

    expect(applied(changeFilters)).toEqual([
      { tags: ['Mara', 'war'], statuses: ['done'] },
    ]);
  });

  it('tells no window when no Filter changed', () => {
    const { windows, open } = setUp();
    const { window, heard } = open();
    const store = new FakeStore('p1', '/p1');
    windows.attach(window, store);

    store.change({ kind: 'tag', deleted: 'Mara' });

    expect(heard.filters).toEqual([]);
  });

  it('does not tell another Project’s window', () => {
    const { windows, open, changeFilters } = setUp();
    const one = open();
    const two = open();
    const store = new FakeStore('p1', '/p1');
    changeFilters.mockReturnValue({ 'writing-bible': { tags: [] } });
    windows.attach(one.window, store);
    windows.attach(two.window, new FakeStore('p2', '/p2'));

    store.change({ kind: 'tag', deleted: 'Mara' });

    expect(one.heard.filters).toHaveLength(1);
    expect(two.heard.filters).toEqual([]);
  });

  it('keeps following while one of two windows on the Project is open', async () => {
    const { windows, open, changeFilters } = setUp();
    const one = open();
    const two = open();
    const store = new FakeStore('p1', '/p1');
    windows.attach(one.window, store);
    windows.attach(two.window, store);
    await windows.close(one.window);

    store.change({ kind: 'status', deleted: 'idea' });

    expect(changeFilters).toHaveBeenCalledTimes(1);
  });
});
