import { describe, expect, it, vi } from 'vitest';
import {
  appBridge,
  type Conflict,
  type OpenedProject,
  type ProjectApi,
  type ProjectEvent,
} from '../shared/api';
import { memoryTransport } from '../shared/memory-transport';
import type {
  EntrySummary,
  Manuscript,
  TrashItem,
} from '../shared/project-types';
import type { Todo } from '../shared/todo';
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
  sessions: { alsoOpen: [] },
  dropped: [],
  readOnly: null,
};

/** What main holds, and answers with. */
type Held = {
  entries: EntrySummary[];
  trash: TrashItem[];
  todos: Todo[];
  conflicts: Conflict[];
  calls: string[];
  failWith?: string;
  undone: Manuscript;
  emptied: boolean;
};

function setUp(held: Partial<Held> = {}) {
  const main: Held = {
    entries: [],
    trash: [],
    todos: [],
    conflicts: [],
    calls: [],
    undone: emptyManuscript,
    emptied: true,
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
      listTodos: async () => main.todos,
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
      resolveConflict: async () => guard(),
      emptyTrash: async () => main.emptied,
    } as never,
    () => ({}),
  );
  const { window, renderer } = transport.open();
  const api: ProjectApi = appBridge.renderer(renderer).build('project');
  const mirror = new ProjectMirror(api, opened);
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
      todos: [todo('x')],
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
      todos: [todo('x')],
      conflicts: [conflict('s')],
      statuses: opened.statuses,
      language: 'en-US',
      readOnly: null,
      dropped: [],
      foldedNoteImage: false,
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

  describe('commands', () => {
    it('reports a failing command once, as what could not be done', async () => {
      const { mirror, main, events } = setUp({ failWith: 'Disk full' });

      const done = await mirror.setStatus('s1', 'idea');

      expect(done).toBe(false);
      expect(main.calls).toEqual(['setStatus s1']);
      expect(events).toEqual([
        {
          type: 'error',
          message: expect.stringMatching(/^Can't set the Status: .*Disk full/),
        },
      ]);
    });

    it('clears the error once a command succeeds', async () => {
      const { mirror, events } = setUp();

      expect(await mirror.setTags('s1', ['a'])).toBe(true);
      expect(await mirror.setWordTarget('s1', 5)).toBe(true);

      expect(events).toEqual([
        { type: 'error', message: null },
        { type: 'error', message: null },
      ]);
    });

    it('names the command that failed: Word target, Tags, undo and Conflict', async () => {
      const { mirror, events } = setUp({ failWith: 'No' });

      await mirror.setWordTarget('s', 1);
      await mirror.setTags('s', []);
      await mirror.undo(3);
      await mirror.resolveConflict({ kind: 'scene', id: 's' }, {} as never);

      expect(events.map((e) => (e.type === 'error' ? e.message : ''))).toEqual([
        expect.stringContaining("Can't set the Word target"),
        expect.stringContaining("Can't save the Tags"),
        expect.stringContaining("Can't undo"),
        expect.stringContaining("Can't resolve the Conflict"),
      ]);
    });

    it('change shows the Manuscript the operation made, and refreshes Trash', async () => {
      const { mirror, main } = setUp();
      main.trash = [trashed('gone')];

      const result = await mirror.change(async () => ({
        manuscript: one,
        step: 4,
      }));

      expect(result).toEqual({ manuscript: one, step: 4 });
      expect(mirror.getSnapshot()).toMatchObject({
        manuscript: one,
        trash: [trashed('gone')],
      });
    });

    it('change does nothing when the Author cancelled', async () => {
      const { mirror, events } = setUp();
      const before = mirror.getSnapshot().manuscript;

      expect(await mirror.change(async () => null)).toBeUndefined();

      expect(mirror.getSnapshot().manuscript).toBe(before);
      expect(events).toEqual([{ type: 'error', message: null }]);
    });

    it('change reports a failure once, and keeps the Manuscript', async () => {
      const { mirror, events } = setUp();

      const result = await mirror.change(async () => {
        throw { message: 'Read-only' };
      });

      expect(result).toBeUndefined();
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
});
