import { describe, expect, it, vi } from 'vitest';
import {
  appBridge,
  type AssistantApi,
  type Conflict,
  type OpenedProject,
  type ProjectApi,
  type ProjectEvent,
} from '../shared/api';
import { memoryTransport } from '../shared/memory-transport';
import { DEFAULT_TODO_DOCK } from '../shared/todo-dock';
import {
  unitKey,
  type EntrySummary,
  type EntryValue,
  type Manuscript,
  type TrashItem,
  type UnitRef,
  type UnitValue,
} from '../shared/project-types';
import type { PendingProposal } from '../shared/proposal';
import type { CustomField } from '../shared/custom-field';
import type { KeyFieldChoices } from '../shared/key-fields';
import type { Todo } from '../shared/todo';
import { registerPendingEdits } from './pending-edits';
import { ProjectMirror, type MirrorEvent } from './project-mirror';

// The renderer's Project mirror over the bridge, in memory: no DOM, no React.

const emptyManuscript: Manuscript = { chapters: [], unplaced: [] };
const one: Manuscript = { chapters: [], unplaced: [], wordTarget: 1 };
const two: Manuscript = { chapters: [], unplaced: [], wordTarget: 2 };

const entry = (id: string): EntrySummary => ({
  id,
  type: 'character',
  name: id,
  aliases: [],
  visibility: 'always',
});
const trashed = (id: string): TrashItem => ({
  kind: 'version',
  id,
  title: id,
  trashedAt: 1,
  savedAt: 1,
});
const todo = (id: string): Todo => ({ id, text: id, done: false });
const field = (id: string): CustomField => ({
  id,
  type: 'character',
  label: id,
});
const conflict = (id: string): Conflict => ({
  ref: { kind: 'scene', id },
  versions: [],
});

const opened: OpenedProject = {
  displayName: 'Novel',
  language: 'en-US',
  foldedNoteImage: false,
  statuses: [{ id: 'idea', name: 'Idea', colour: 'purple' }],
  manuscript: emptyManuscript,
  view: {},
  todoDock: DEFAULT_TODO_DOCK,
  composerHeight: null,
  sessions: { alsoOpen: [] },
  dropped: [],
  readOnly: null,
  offerGathering: false,
};

/** What main holds, and answers with. */
type Held = {
  entries: EntrySummary[];
  trash: TrashItem[];
  drawer: TrashItem[];
  todos: Todo[];
  customFields: CustomField[];
  keyFields: KeyFieldChoices;
  conflicts: Conflict[];
  calls: string[];
  failWith?: string;
  undone: Manuscript;
  emptied: boolean;
  /** Each unit's value, by key. */
  units: Record<string, UnitValue>;
  /** The keys of the units read, in order. */
  reads: string[];
  /** The Proposals pending on each Entry, by its id. */
  pending: Record<string, PendingProposal[]>;
};

function setUp(held: Partial<Held> = {}) {
  const main: Held = {
    entries: [],
    trash: [],
    drawer: [],
    todos: [],
    customFields: [],
    keyFields: {},
    conflicts: [],
    calls: [],
    undone: emptyManuscript,
    emptied: true,
    units: {},
    reads: [],
    pending: {},
    ...held,
  };
  const guard = () => {
    if (main.failWith) throw new Error(main.failWith);
  };
  const transport = memoryTransport();
  const bridge = appBridge.main(transport.main);
  bridge.register(
    'project',
    {
      listEntries: async () => main.entries,
      listTrash: async () => main.trash,
      listDrawer: async () => main.drawer,
      listTodos: async () => main.todos,
      listCustomFields: async () => main.customFields,
      listKeyFields: async () => main.keyFields,
      listRelations: async () => [],
      listConflicts: async () => main.conflicts,
      setStatus: async (_ctx: unknown, unitId: string) => {
        main.calls.push(`setStatus ${unitId}`);
        guard();
      },
      setWordTarget: async () => guard(),
      setTags: async () => guard(),
      undo: async () => {
        guard();
        return main.undone;
      },
      resolveConflict: async (_ctx: unknown, ref: UnitRef, kept: UnitValue) => {
        guard();
        main.units[unitKey(ref)] = kept;
      },
      emptyTrash: async () => main.emptied,
      read: async (_ctx: unknown, ref: UnitRef) => {
        const key = unitKey(ref);
        main.reads.push(key);
        const value = main.units[key];
        if (!value) throw new Error(`${key} isn't there`);
        return value;
      },
      write: async (_ctx: unknown, ref: UnitRef, value: UnitValue) => {
        main.calls.push(`write ${unitKey(ref)}`);
        guard();
        main.units[unitKey(ref)] = value;
      },
    } as never,
    () => ({}),
  );
  bridge.register(
    'assistant',
    {
      pendingProposals: async (_ctx: unknown, entryId: string) =>
        main.pending[entryId] ?? [],
    } as never,
    () => ({}),
  );
  const { window, renderer } = transport.open();
  const api: ProjectApi = appBridge.renderer(renderer).build('project');
  const assistant: Pick<AssistantApi, 'pendingProposals'> = appBridge
    .renderer(renderer)
    .build('assistant');
  const mirror = new ProjectMirror(api, opened, assistant);
  const events: MirrorEvent[] = [];
  mirror.onEvent((event) => events.push(event));
  return {
    main,
    mirror,
    events,
    /** Main tells the window of `event`. */
    tell: (event: ProjectEvent) =>
      bridge.emit(window, 'project', 'subscribe', event),
    /** Lets the calls in flight finish. */
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

describe('ProjectMirror', () => {
  it('starts from the opened Project, and loads the rest from main', async () => {
    const { mirror, main, settle } = setUp({
      entries: [entry('a')],
      trash: [trashed('t')],
      drawer: [trashed('d')],
      todos: [todo('x')],
      customFields: [field('f')],
      keyFields: { item: { description: false } },
      conflicts: [conflict('s')],
    });
    expect(main).toBeDefined();
    const before = mirror.getSnapshot();
    expect(before.entriesLoaded).toBe(false);
    expect(before.statuses).toEqual(opened.statuses);
    expect(before.language).toBe('en-US');

    mirror.start();
    await settle();

    expect(mirror.getSnapshot()).toMatchObject({
      manuscript: emptyManuscript,
      entries: [entry('a')],
      entriesLoaded: true,
      trash: [trashed('t')],
      drawer: [trashed('d')],
      todos: [todo('x')],
      customFields: [field('f')],
      keyFields: { item: { description: false } },
      conflicts: [conflict('s')],
      statuses: opened.statuses,
      language: 'en-US',
      readOnly: null,
      dropped: [],
      foldedNoteImage: false,
    });
  });

  it('takes the Custom fields main tells of, and reads the Trash again', async () => {
    const { mirror, main, tell, settle } = setUp();
    mirror.start();
    await settle();
    main.trash = [trashed('f')];

    tell({ type: 'customFieldsChanged', fields: [field('g')] });
    await settle();

    expect(mirror.getSnapshot()).toMatchObject({
      customFields: [field('g')],
      trash: [trashed('f')],
    });
  });

  it('reads the Drawer again with the Trash, as when a Conversation goes there', async () => {
    const { mirror, main, tell, settle } = setUp();
    mirror.start();
    await settle();
    main.drawer = [trashed('c')];

    tell({ type: 'conversationsChanged' });
    await settle();

    expect(mirror.getSnapshot().drawer).toEqual([trashed('c')]);
  });

  it('takes the Key fields main tells of, over those it was loading', async () => {
    const { mirror, tell, settle } = setUp({
      keyFields: { item: { description: false } },
    });
    mirror.start();
    tell({ type: 'keyFieldsChanged', choices: { theme: { aliases: false } } });
    await settle();

    expect(mirror.getSnapshot().keyFields).toEqual({
      theme: { aliases: false },
    });
  });

  it('tells its listeners when the snapshot changes, and hands out a new one', async () => {
    const { mirror, tell, settle } = setUp();
    mirror.start();
    await settle();
    const listener = vi.fn();
    mirror.subscribe(listener);
    const before = mirror.getSnapshot();

    tell({ type: 'todosChanged', todos: [todo('y')] });
    await settle();

    expect(listener).toHaveBeenCalled();
    expect(mirror.getSnapshot()).not.toBe(before);
    expect(before.todos).toEqual([]);
  });

  it('stops listening to main once stopped', async () => {
    const { mirror, tell, settle } = setUp();
    mirror.start()();
    await settle();

    tell({ type: 'todosChanged', todos: [todo('y')] });
    await settle();

    expect(mirror.getSnapshot().todos).toEqual([]);
  });

  describe('the events of main', () => {
    async function started() {
      const world = setUp();
      world.mirror.start();
      await world.settle();
      return world;
    }

    it('structureChanged shows the Manuscript, keeps what was dropped, and refreshes Trash', async () => {
      const { mirror, main, tell, settle, events } = await started();
      main.trash = [trashed('t')];
      const first = { chapters: ['c1'], scenes: [] };
      const second = { host: 'other', chapters: [], scenes: ['s1'] };

      tell({ type: 'structureChanged', manuscript: one, dropped: [first] });
      tell({ type: 'structureChanged', manuscript: two, dropped: [second] });
      await settle();

      expect(mirror.getSnapshot()).toMatchObject({
        manuscript: two,
        dropped: [first, second],
        trash: [trashed('t')],
      });
      expect(events.filter((e) => e.type === 'structureChanged')).toHaveLength(
        2,
      );
    });

    it('entriesChanged shows the Entries and refreshes Trash', async () => {
      const { mirror, main, tell, settle } = await started();
      main.trash = [trashed('e')];

      tell({ type: 'entriesChanged', entries: [entry('b')] });
      await settle();

      expect(mirror.getSnapshot()).toMatchObject({
        entries: [entry('b')],
        entriesLoaded: true,
        trash: [trashed('e')],
      });
    });

    it('conversationsChanged refreshes Trash alone', async () => {
      const { mirror, main, tell, settle } = await started();
      const before = mirror.getSnapshot();
      main.trash = [trashed('c')];

      tell({ type: 'conversationsChanged' } as ProjectEvent);
      await settle();

      expect(mirror.getSnapshot()).toMatchObject({
        trash: [trashed('c')],
        manuscript: before.manuscript,
        entries: before.entries,
      });
    });

    it('conflictsChanged, todosChanged, statusesChanged, unitDetailsChanged and foldedNoteImageChanged each show their slice', async () => {
      const { mirror, tell, settle } = await started();
      const statuses = [{ id: 'done', name: 'Done', colour: 'teal' as const }];

      tell({ type: 'conflictsChanged', conflicts: [conflict('s')] });
      tell({ type: 'todosChanged', todos: [todo('z')] });
      tell({ type: 'statusesChanged', statuses });
      tell({ type: 'unitDetailsChanged', manuscript: one });
      tell({ type: 'foldedNoteImageChanged', on: true });
      await settle();

      expect(mirror.getSnapshot()).toMatchObject({
        conflicts: [conflict('s')],
        todos: [todo('z')],
        statuses,
        manuscript: one,
        foldedNoteImage: true,
      });
    });

    it('languageChanged tells the UI before the language changes, so edits reach main first', async () => {
      const { mirror, tell, settle } = await started();
      const seen: string[] = [];
      mirror.onEvent((event) => {
        if (event.type === 'languageChanged') {
          seen.push(mirror.getSnapshot().language);
        }
      });

      tell({ type: 'languageChanged', language: 'sv-SE' });
      await settle();

      expect(seen).toEqual(['en-US']);
      expect(mirror.getSnapshot().language).toBe('sv-SE');
    });

    it('pinnedNotesChanged tells the UI this computer’s Pinned notes as main left them', async () => {
      const { mirror, tell, settle } = await started();
      const seen: unknown[] = [];
      mirror.onEvent((event) => seen.push(event));
      const notes = [{ entryId: 'e1', x: 4, y: 8, folded: false }];

      tell({ type: 'pinnedNotesChanged', notes });
      await settle();

      expect(seen).toEqual([{ type: 'pinnedNotesChanged', notes }]);
    });

    it('readOnly tells the UI before the Project is read-only, then shows who upgraded it', async () => {
      const { mirror, tell, settle } = await started();
      const seen: unknown[] = [];
      mirror.onEvent((event) => {
        if (event.type === 'readOnlyStarted') {
          seen.push(mirror.getSnapshot().readOnly);
        }
      });

      tell({ type: 'readOnly', host: 'laptop' });
      await settle();

      expect(seen).toEqual([null]);
      expect(mirror.getSnapshot().readOnly).toEqual({ host: 'laptop' });
    });

    it('readOnly without a host says none', async () => {
      const { mirror, tell, settle } = await started();

      tell({ type: 'readOnly' });
      await settle();

      expect(mirror.getSnapshot().readOnly).toEqual({});
    });

    it('unitReloaded tells the UI of a unit another computer changed, not one a Proposal or Split did', async () => {
      const { tell, settle, events } = await started();
      const ref = { kind: 'scene', id: 's' } as const;
      const value = { prose: '' } as never;

      tell({ type: 'unitReloaded', ref, value });
      tell({ type: 'unitReloaded', ref, value, byProposal: true });
      tell({ type: 'unitReloaded', ref, value, bySplit: true });
      await settle();

      expect(events).toEqual([{ type: 'unitReloaded', ref }]);
    });

    it('leaves what the views show themselves alone', async () => {
      const { mirror, tell, settle, events } = await started();
      const before = mirror.getSnapshot();

      tell({
        type: 'unitSaveStatus',
        ref: { kind: 'scene', id: 's' },
        state: 'saved',
      });
      await settle();

      expect(mirror.getSnapshot()).toBe(before);
      expect(events).toEqual([]);
    });

    it('lets an event that came while the lists loaded stand over them', async () => {
      const { mirror, main, tell, settle } = setUp({ todos: [todo('old')] });
      mirror.start();
      tell({ type: 'todosChanged', todos: [todo('new')] });
      await settle();

      expect(main.todos).toEqual([todo('old')]);
      expect(mirror.getSnapshot().todos).toEqual([todo('new')]);
    });
  });

  describe('run', () => {
    it('reports a failing command once, as what could not be done', async () => {
      const { mirror, main, events } = setUp({ failWith: 'Disk full' });

      const done = await mirror.run(
        (project) => project.setStatus('s1', 'idea'),
        {
          what: 'set the Status',
        },
      );

      expect(done).toBeUndefined();
      expect(main.calls).toEqual(['setStatus s1']);
      expect(events).toEqual([
        {
          type: 'error',
          message: expect.stringMatching(/^Can't set the Status: .*Disk full/),
        },
      ]);
    });

    it('records an undo step with its label, and shows the Manuscript', async () => {
      const { mirror, events } = setUp();

      const result = await mirror.run(
        async () => ({ manuscript: one, step: 4 }),
        {
          undo: 'Scene created',
        },
      );

      expect(result).toEqual({ manuscript: one, step: 4 });
      expect(mirror.getSnapshot().manuscript).toEqual(one);
      expect(events).toEqual([
        { type: 'error', message: null },
        { type: 'undoable', message: 'Scene created', step: 4 },
      ]);
    });

    it('records no undo step without a label', async () => {
      const { mirror, events } = setUp();

      await mirror.run(async () => ({ manuscript: one, step: 4 }));

      expect(mirror.getSnapshot().manuscript).toEqual(one);
      expect(events).toEqual([{ type: 'error', message: null }]);
    });

    it('flushes pending edits before the command reaches main', async () => {
      const { mirror, main } = setUp();
      const stop = registerPendingEdits(() => {
        void mirror.write({ kind: 'outline', id: 's' }, {
          id: 's',
          body: 'typed',
        } as never);
      });

      await mirror.run((project) => project.setStatus('s', 'idea'));
      stop();

      expect(main.calls).toEqual(['write outline:s', 'setStatus s']);
    });
  });

  describe('commands', () => {
    it('clears the error once a command succeeds, true for one that gives nothing', async () => {
      const { mirror, events } = setUp();

      expect(await mirror.run((p) => p.setTags('s1', ['a']))).toBe(true);
      expect(await mirror.run((p) => p.setWordTarget('s1', 5))).toBe(true);

      expect(events).toEqual([
        { type: 'error', message: null },
        { type: 'error', message: null },
      ]);
    });

    it('names what failed, by default a change; undo and Conflict too', async () => {
      const { mirror, events } = setUp({ failWith: 'No' });

      await mirror.run((p) => p.setTags('s', []));
      await mirror.undo(3);
      await mirror.resolveConflict({ kind: 'scene', id: 's' }, {} as never);

      expect(events.map((e) => (e.type === 'error' ? e.message : ''))).toEqual([
        expect.stringContaining("Can't make that change"),
        expect.stringContaining("Can't undo"),
        expect.stringContaining("Can't resolve the Conflict"),
      ]);
    });

    it('a structure change refreshes Trash', async () => {
      const { mirror, main } = setUp();
      main.trash = [trashed('gone')];

      await mirror.run(async () => ({ manuscript: one, step: 4 }));

      expect(mirror.getSnapshot().trash).toEqual([trashed('gone')]);
    });

    it('does nothing when the Author cancelled', async () => {
      const { mirror, events } = setUp();
      const before = mirror.getSnapshot().manuscript;

      expect(
        await mirror.run(async () => null, { undo: 'Scene created' }),
      ).toBeUndefined();

      expect(mirror.getSnapshot().manuscript).toBe(before);
      expect(events).toEqual([]);
    });

    it('keeps the Manuscript when a structure change fails', async () => {
      const { mirror, events } = setUp();
      const before = mirror.getSnapshot().manuscript;

      const result = await mirror.run(
        async () => {
          throw { message: 'Read-only' };
        },
        { undo: 'Scene created' },
      );

      expect(result).toBeUndefined();
      expect(mirror.getSnapshot().manuscript).toBe(before);
      expect(events).toEqual([
        { type: 'error', message: "Can't make that change: Read-only" },
      ]);
    });

    it('undo shows the Manuscript main hands back', async () => {
      const { mirror, main } = setUp();
      main.undone = two;

      await mirror.undo(1);

      expect(mirror.getSnapshot().manuscript).toEqual(two);
    });

    it('emptyTrash refreshes Trash only if the Author agreed', async () => {
      const { mirror, main } = setUp();
      main.trash = [trashed('t')];
      main.emptied = false;

      expect(await mirror.emptyTrash()).toBe(false);
      expect(mirror.getSnapshot().trash).toEqual([]);

      main.emptied = true;
      main.trash = [];
      expect(await mirror.emptyTrash()).toBe(true);
    });

    it('dismisses a dropped notice', async () => {
      const { mirror, tell, settle } = setUp();
      mirror.start();
      const a = { chapters: ['a'], scenes: [] };
      const b = { chapters: ['b'], scenes: [] };
      tell({ type: 'structureChanged', manuscript: one, dropped: [a, b] });
      await settle();

      mirror.dismissDropped(mirror.getSnapshot().dropped[0]!);

      expect(mirror.getSnapshot().dropped).toEqual([b]);
    });
  });

  describe('unit values', () => {
    const ref = { kind: 'entry', id: 'e' } as const;
    const value = (description: string): EntryValue => ({
      ...entry('e'),
      description,
      fields: {},
    });
    const pending = (id: string): PendingProposal =>
      ({ conversationId: 'c', proposal: { id } }) as never;

    async function holding(units: Record<string, UnitValue> = {}) {
      const world = setUp({ entries: [entry('e')], units });
      world.mirror.start();
      await world.settle();
      return world;
    }

    it('reads a unit once for two subscribers', async () => {
      const { mirror, main, settle } = await holding({ 'entry:e': value('a') });

      mirror.watchUnit(ref, () => {});
      mirror.watchUnit(ref, () => {});
      await settle();

      expect(main.reads).toEqual(['entry:e']);
      expect(mirror.unit(ref)).toEqual(value('a'));
    });

    it('takes a reload from another computer to every subscriber', async () => {
      const { mirror, tell, settle } = await holding({ 'entry:e': value('a') });
      const first = vi.fn();
      const second = vi.fn();
      mirror.watchUnit(ref, first);
      mirror.watchUnit(ref, second);
      await settle();
      first.mockClear();
      second.mockClear();

      tell({ type: 'unitReloaded', ref, value: value('b') });
      await settle();

      expect(mirror.unit(ref)).toEqual(value('b'));
      expect(first).toHaveBeenCalled();
      expect(second).toHaveBeenCalled();
    });

    it("shows this window's own write to a second subscriber once main has it", async () => {
      const { mirror, settle } = await holding({ 'entry:e': value('a') });
      const other = vi.fn();
      mirror.watchUnit(ref, () => {});
      mirror.watchUnit(ref, other);
      await settle();
      other.mockClear();

      const written = mirror.write(ref, value('b'));
      expect(mirror.unit(ref)).toEqual(value('a'));
      await written;

      expect(mirror.unit(ref)).toEqual(value('b'));
      expect(other).toHaveBeenCalled();
    });

    it("says a unit is being written while this window's write is on its way", async () => {
      const { mirror, main, settle } = await holding({ 'entry:e': value('a') });
      const listener = vi.fn();
      mirror.watchUnit(ref, listener);
      await settle();
      listener.mockClear();

      const written = mirror.write(ref, value('b'));
      expect(mirror.writing(ref)).toBe(true);
      await written;
      expect(mirror.writing(ref)).toBe(false);

      main.failWith = 'Read-only';
      await expect(mirror.write(ref, value('c'))).rejects.toThrow();
      expect(mirror.writing(ref)).toBe(false);
      expect(mirror.unit(ref)).toEqual(value('b'));
      // Told each time, so that a view waiting for the write goes on.
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('forgets a unit moved to Trash', async () => {
      const { mirror, main, tell, settle } = await holding({
        'entry:e': value('a'),
      });
      mirror.watchUnit(ref, () => {});
      await settle();

      delete main.units['entry:e'];
      tell({ type: 'entriesChanged', entries: [] });
      await settle();

      expect(mirror.unit(ref)).toBeNull();
    });

    it("forgets the Outline of a Scene moved to Trash, and reads it once it's back", async () => {
      const scene = { id: 's', title: 'S' } as never;
      const { mirror, tell, settle } = await holding({
        'outline:s': { id: 's', body: 'a', meta: {} },
      });
      const outline = { kind: 'outline', id: 's' } as const;
      tell({
        type: 'structureChanged',
        manuscript: { chapters: [], unplaced: [scene] },
      });
      mirror.watchUnit(outline, () => {});
      await settle();

      tell({ type: 'structureChanged', manuscript: emptyManuscript });
      await settle();
      expect(mirror.unit(outline)).toBeNull();

      tell({
        type: 'structureChanged',
        manuscript: { chapters: [], unplaced: [scene] },
      });
      await settle();
      expect(mirror.unit(outline)).toEqual({ id: 's', body: 'a', meta: {} });
    });

    it('keeps a value watched anew as soon as the last watcher stops', async () => {
      const { mirror, main, settle } = await holding({ 'entry:e': value('a') });
      const stop = mirror.watchUnit(ref, () => {});
      await settle();

      stop();
      mirror.watchUnit(ref, () => {});
      await settle();

      expect(main.reads).toEqual(['entry:e']);
      expect(mirror.unit(ref)).toEqual(value('a'));
    });

    it('keeps a unit forgotten when a write to it resolves after it went to Trash', async () => {
      const { mirror, tell, settle } = await holding({ 'entry:e': value('a') });
      mirror.watchUnit(ref, () => {});
      await settle();

      const written = mirror.write(ref, value('b'));
      tell({ type: 'entriesChanged', entries: [] });
      await written;

      expect(mirror.unit(ref)).toBeNull();
    });

    it('reads an Entry anew when its summary changes', async () => {
      const { mirror, main, tell, settle } = await holding({
        'entry:e': value('a'),
      });
      mirror.watchUnit(ref, () => {});
      await settle();

      main.units['entry:e'] = { ...value('a'), visibility: 'never' };
      tell({
        type: 'entriesChanged',
        entries: [{ ...entry('e'), visibility: 'never' }],
      });
      await settle();

      expect(mirror.unit(ref)).toMatchObject({ visibility: 'never' });
    });

    it('reads the Proposals pending on an Entry anew after proposalsChanged', async () => {
      const { mirror, main, tell, settle } = await holding();
      main.pending = { e: [pending('p')] };
      const listener = vi.fn();
      mirror.watchPending('e', listener);
      await settle();
      expect(mirror.pending('e')).toEqual([pending('p')]);

      main.pending = { e: [pending('p'), pending('q')] };
      tell({ type: 'proposalsChanged' });
      await settle();

      expect(mirror.pending('e')).toEqual([pending('p'), pending('q')]);
      expect(listener).toHaveBeenCalled();
    });

    it('drops a value after its last subscriber, and reads it again for the next', async () => {
      const { mirror, main, settle } = await holding({ 'entry:e': value('a') });
      const stopFirst = mirror.watchUnit(ref, () => {});
      const stopSecond = mirror.watchUnit(ref, () => {});
      await settle();

      stopFirst();
      await settle();
      expect(mirror.unit(ref)).toEqual(value('a'));
      stopSecond();
      await settle();
      expect(mirror.unit(ref)).toBeUndefined();

      mirror.watchUnit(ref, () => {});
      await settle();
      expect(main.reads).toEqual(['entry:e', 'entry:e']);
    });

    it('tells editors of a reload, and of a value read anew once a Conflict is resolved', async () => {
      const { mirror, tell, settle } = await holding({ 'entry:e': value('a') });
      mirror.watchUnit(ref, () => {});
      await settle();
      const changes = vi.fn();
      mirror.onUnitChanged(changes);

      const reload = { type: 'unitReloaded', ref, value: value('b') } as const;
      tell(reload);
      await settle();
      await mirror.resolveConflict(ref, value('c'));
      await settle();

      expect(changes.mock.calls.map(([change]) => change)).toEqual([
        { ref, value: value('b'), reloaded: reload },
        { ref, value: value('c') },
      ]);
      expect(mirror.unit(ref)).toEqual(value('c'));
    });

    it("tells editors of a Scene's reload, though it holds no Prose", async () => {
      const { mirror, tell, settle } = await holding();
      const changes = vi.fn();
      mirror.onUnitChanged(changes);
      const scene = { kind: 'scene', id: 's' } as const;
      const reload = {
        type: 'unitReloaded',
        ref: scene,
        value: { id: 's', markdown: 'x' },
      } as never;

      tell(reload);
      await settle();

      expect(changes).toHaveBeenCalledWith({
        ref: scene,
        value: { id: 's', markdown: 'x' },
        reloaded: reload,
      });
    });
  });
});
