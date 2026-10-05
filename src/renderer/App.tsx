import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Changed,
  Conflict,
  Created,
  Dropped,
  ImportFile,
  OpenedProject,
  OpenResult,
  PanelWidths,
  PinnedNote,
  Tip,
  WelcomeReason,
} from '../shared/api';
import {
  ENTRY_TYPE_LABELS,
  PROJECT_OUTLINE,
  unitKey,
  type EntrySummary,
  type EntryType,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type TrashItem,
  type UnitRef,
  type UnitValue,
} from '../shared/project-types';
import { MODE_LABELS, type Mode } from '../shared/conversation';
import type { ImportConvention } from '../shared/manuscript-import';
import { upgradedMessage } from '../shared/format-gate';
import {
  commandForKey,
  SHORTCUTS,
  withShortcut,
  type Command,
} from '../shared/shortcuts';
import { capitalized, unitName } from '../shared/unit-name';
import { AssistantPanel } from './AssistantPanel';
import { Binder, type Selection } from './Binder';
import { BrainstormRoom } from './BrainstormRoom';
import { WINDOW_MODES, type ShowProposal } from './Conversation';
import { ConflictList, ConflictResolver } from './Conflicts';
import { ChapterCorkboard, ProjectCorkboard } from './Corkboard';
import { EntryTypePicker } from './EntryTypePicker';
import { EntryView, VISIBILITY_LABELS } from './EntryView';
import { ImportDialog } from './ImportDialog';
import { chapterInsertion, sceneInsertion, type Current } from './insertion';
import { InterviewRoom } from './InterviewRoom';
import { Notices } from './Notices';
import { OutlineNotes } from './OutlineNotes';
import { OverviewPane } from './OverviewPane';
import { usePaneCycle } from './pane-focus';
import { PanelResizer, type PaneSize } from './PanelResizer';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import { PinnedNotes } from './PinnedNotes';
import { applyChange, togglePin, withoutTrashed } from './pinned-notes';
import {
  onMentionClick,
  setMentionEntries,
  setMentionHighlighting,
  type MentionClick,
} from './mention-highlight';
import { MentionPeek } from './MentionPeek';
import { MAC } from './platform';
import { flushPendingEdits } from './pending-edits';
import { ReadOnlyContext } from './read-only';
import { SaveFailureBanner, useSaveStatus } from './SaveStatus';
import { SceneEditor, type QuoteJump } from './SceneEditor';
import { SettingsDialog } from './SettingsDialog';
import { ShortcutsDialog } from './ShortcutsDialog';
import { StartScreen } from './StartScreen';
import { StatusBar, useSceneCounts } from './StatusBar';
import { entryTitle, StoryBible } from './StoryBible';
import { trashTitle, TrashView } from './TrashView';
import { Toast } from './Toast';
import { forgetUnitEditors } from './unit-editors';
import { Welcome } from './Welcome';
import { countText, statusCounts, type Counts } from './word-count';

export function App() {
  /** Undefined until main says what this window shows. */
  const [project, setProject] = useState<OpenedProject | null>();
  const [error, setError] = useState<string | null>(null);
  /** Undefined until main says whether to welcome the Author. */
  const [welcome, setWelcome] = useState<WelcomeReason | null>();
  /** Open while set; `addKey` opens it at the form for adding a key. */
  const [settingsDialog, setSettingsDialog] = useState<{
    addKey: boolean;
  } | null>(null);
  const openSettings = () => setSettingsDialog({ addKey: false });
  const addKey = useCallback(() => setSettingsDialog({ addKey: true }), []);
  /** Whether the Keyboard Shortcuts cheat sheet is open. */
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** The file being imported, while the Author previews its split. */
  const [importing, setImporting] = useState<ImportFile | null>(null);

  useEffect(() => window.shell.onFlushRequest(flushPendingEdits), []);
  useEffect(
    () =>
      window.shell.onCommand((command) => {
        if (command.type === 'newProject')
          void open(window.shell.createProject);
        else if (command.type === 'openProject')
          void open(window.shell.openProject);
        else if (command.type === 'openRecent')
          void open(() => window.shell.openRecent(command.path));
        else if (command.type === 'import') void chooseImport();
        else if (command.type === 'settings') openSettings();
        else if (command.type === 'shortcuts') setShortcutsOpen(true);
      }),
    [],
  );
  // Ctrl+/ on every screen; the Help menu only shows it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (commandForKey(event, MAC)?.type !== 'shortcuts') return;
      // Not over another dialog, as Settings.
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      setShortcutsOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    void window.shell.currentProject().then(setProject);
    void window.settings.showWelcome().then(setWelcome);
  }, []);

  async function open(action: () => Promise<OpenResult>) {
    // Edits must reach main before a Project opens elsewhere and takes focus.
    flushPendingEdits();
    const result = await action();
    if (!result) return;
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setProject(result.project);
  }

  async function chooseImport() {
    const choice = await window.shell.chooseImport();
    if (!choice) return;
    if (!choice.ok) {
      setError(choice.message);
      return;
    }
    setError(null);
    setImporting({ name: choice.name, blocks: choice.blocks });
  }

  async function importProject(file: ImportFile, convention: ImportConvention) {
    let canceled = false;
    await open(async () => {
      const result = await window.shell.importProject(file, convention);
      if (result !== 'canceled') return result;
      canceled = true;
      return null;
    });
    // The preview stays while the Author hasn't chosen where the Project goes.
    if (!canceled) setImporting(null);
  }

  const startButtons = (
    <>
      <button
        title={withShortcut('New Project', SHORTCUTS.newProject, MAC)}
        onClick={() => open(window.shell.createProject)}
      >
        New Project…
      </button>
      <button
        title={withShortcut('Open Project', SHORTCUTS.openProject, MAC)}
        onClick={() => open(window.shell.openProject)}
      >
        Open Project…
      </button>
      <button onClick={() => void chooseImport()}>Import…</button>
      <button
        title={withShortcut('Settings', SHORTCUTS.settings, MAC)}
        onClick={openSettings}
      >
        Settings…
      </button>
    </>
  );

  if (project === undefined || welcome === undefined) return null;
  return (
    <>
      {project ? (
        <ProjectView
          project={project}
          error={error}
          onError={setError}
          onAddKey={addKey}
        />
      ) : welcome ? (
        <Welcome reason={welcome} onDone={() => setWelcome(null)} />
      ) : (
        <StartScreen actions={startButtons} error={error} onOpen={open} />
      )}
      {importing && (
        <ImportDialog
          file={importing}
          onImport={(convention) => void importProject(importing, convention)}
          onClose={() => setImporting(null)}
        />
      )}
      {settingsDialog && (
        <SettingsDialog
          addKey={settingsDialog.addKey}
          onClose={() => setSettingsDialog(null)}
        />
      )}
      {shortcutsOpen && (
        <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />
      )}
    </>
  );
}

const DEFAULT_WIDTHS: Required<PanelWidths> = {
  binder: 256,
  overview: 300,
  assistant: 280,
  conversations: 220,
  reference: 300,
};
/** How long a structure change can be undone from its toast. */
const UNDO_TOAST_MS = 10_000;
const RELOADED_TOAST_MS = 5000;
/** How long the cursor rests before where it is gets remembered. */
const CURSOR_REPORT_MS = 1000;

function ProjectView({
  project,
  error,
  onError,
  onAddKey,
}: {
  project: OpenedProject;
  error: string | null;
  onError(message: string | null): void;
  /** Opens Settings to add an API key for the Assistant. */
  onAddKey(): void;
}) {
  const [manuscript, setManuscript] = useState(project.manuscript);
  const [selected, setSelected] = useState<Selection | null>(() => {
    const scenes = allScenes(project.manuscript);
    const last = scenes.find((s) => s.scene.id === project.view.lastSceneId);
    const scene = (last ?? scenes[0])?.scene;
    return scene ? { kind: 'scene', id: scene.id } : null;
  });
  const openSceneId = selected?.kind === 'scene' ? selected.id : null;
  const open = allScenes(manuscript).find((s) => s.scene.id === openSceneId);
  const openChapter =
    selected?.kind === 'chapter'
      ? manuscript.chapters.find((c) => c.id === selected.id)
      : undefined;
  const [mode, setMode] = useState<Mode>('writing');
  /**
   * The Modes shown so far. Each stays mounted, hidden while another is
   * shown, so that a reply streaming in, a draft or a Conversation open
   * there is as the Author left it.
   */
  const [visited, setVisited] = useState<Set<Mode>>(() => new Set([mode]));
  const [widths, setWidths] = useState<PanelWidths>(
    project.view.panelWidths ?? {},
  );
  const binderWidth = widths.binder ?? DEFAULT_WIDTHS.binder;
  /** A pane's width, remembered once the Author lets go: main keeps them all as one setting. */
  function pane(key: keyof PanelWidths): PaneSize {
    const resize = (width: number, done: boolean) => {
      const next = { ...widths, [key]: width };
      setWidths(next);
      if (done) window.shell.saveView({ panelWidths: next });
    };
    return {
      width: widths[key] ?? DEFAULT_WIDTHS[key],
      onResize: (width) => resize(width, false),
      onResized: (width) => resize(width, true),
    };
  }
  const [outlineNotesOpen, setOutlineNotesOpen] = useState(
    project.view.outlineNotesOpen ?? true,
  );
  /** Whether the Overview pane is open beside the Prose, while a Scene is. */
  const [overviewOpen, setOverviewOpen] = useState(
    project.view.overviewOpen ?? false,
  );
  const saveStatus = useSaveStatus();
  const { scenes: sceneCounts, setProse } = useSceneCounts(manuscript);
  /** What is selected in the open Scene's Prose, counted. */
  const [selectionCounts, setSelectionCounts] = useState<Counts | null>(null);
  const onSelection = useCallback(
    (text: string) => setSelectionCounts(countText(text)),
    [],
  );
  /**
   * Where to put the cursor in a Scene as it opens, as where the Author left
   * it, or which quote of it to select, as a Finding's.
   */
  const [jump, setJump] = useState<
    { sceneId: string; cursor?: number; quote?: QuoteJump } | undefined
  >(() => {
    const { lastSceneId, cursor } = project.view;
    return lastSceneId && cursor !== undefined
      ? { sceneId: lastSceneId, cursor }
      : undefined;
  });
  const [tips, setTips] = useState<Tip[]>([]);

  function select(selection: Selection) {
    setJump(undefined);
    setFocusName(null);
    setResolving(null);
    setPeek(null);
    setSelected(selection);
  }

  function continueAt(sceneId: string, cursor?: number) {
    setTab('manuscript');
    setResolving(null);
    setSelected({ kind: 'scene', id: sceneId });
    setJump(cursor === undefined ? undefined : { sceneId, cursor });
  }

  const quotes = useRef(0);
  /** Opens a Scene with a quote of its Prose selected, as a Finding's. */
  function showQuote(sceneId: string, text: string) {
    setTab('manuscript');
    setResolving(null);
    setPeek(null);
    setSelected({ kind: 'scene', id: sceneId });
    setJump({ sceneId, quote: { text, count: ++quotes.current } });
  }

  const cursorTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    // A cursor still waiting to be reported belongs to the Scene left.
    clearTimeout(cursorTimer.current);
    if (openSceneId) window.shell.saveView({ lastSceneId: openSceneId });
  }, [openSceneId]);
  useEffect(() => () => clearTimeout(cursorTimer.current), []);
  const reportCursor = useCallback(
    (cursor: number) => {
      if (!openSceneId) return;
      clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(
        () => window.shell.saveView({ lastSceneId: openSceneId, cursor }),
        CURSOR_REPORT_MS,
      );
    },
    [openSceneId],
  );
  useEffect(() => forgetUnitEditors, []);
  useEffect(() => {
    void window.shell.tips().then(setTips);
  }, []);

  function switchMode(next: Mode) {
    flushPendingEdits();
    setPeek(null);
    setMode(next);
    setVisited((visited) => new Set(visited).add(next));
  }

  /** Opens an Entry in the Story Bible tab, from a Peek or a Pinned note. */
  function showEntry(id: string) {
    setTab('bible');
    select({ kind: 'entry', id });
  }

  /** Opens an Entry in Writing, from a room. */
  function openEntryInWriting(id: string) {
    switchMode('writing');
    showEntry(id);
  }

  function toggleOutlineNotes() {
    setOutlineNotesOpen(!outlineNotesOpen);
    window.shell.saveView({ outlineNotesOpen: !outlineNotesOpen });
  }

  function toggleOverview() {
    setOverviewOpen(!overviewOpen);
    window.shell.saveView({ overviewOpen: !overviewOpen });
  }

  const [tab, setTab] = useState<Tab>('manuscript');
  const writingRoom = useRef<HTMLDivElement>(null);
  usePaneCycle(writingRoom, mode === 'writing');
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  /** Set once `entries` holds the Story Bible, not the empty list before it. */
  const entriesLoaded = useRef(false);
  useEffect(() => {
    void window.project.listEntries().then((listed) => {
      entriesLoaded.current = true;
      setEntries(listed);
    });
  }, []);
  useEffect(() => setMentionEntries(entries), [entries]);
  const [highlight, setHighlight] = useState(true);
  useEffect(() => {
    void window.shell.highlightMentions().then(setHighlight);
    return window.shell.onHighlightMentions(setHighlight);
  }, []);
  /** The highlight the Author clicked, whose Entries the peek shows. */
  const [peek, setPeek] = useState<MentionClick | null>(null);
  const closePeek = useCallback(() => setPeek(null), []);
  useEffect(() => onMentionClick(setPeek), []);
  useEffect(() => {
    setMentionHighlighting(highlight);
    if (!highlight) setPeek(null);
  }, [highlight]);
  const [pinnedNotes, setPinnedNotes] = useState<PinnedNote[]>(
    project.view.pinnedNotes ?? [],
  );
  /** The Pinned notes as last changed, for changes made before React renders. */
  const notesNow = useRef(pinnedNotes);
  /**
   * Changes the Pinned notes; `save` remembers them on this computer. Nothing
   * happens when they are the same notes.
   */
  const changePinnedNotes = useCallback((next: PinnedNote[], save = true) => {
    if (next === notesNow.current) return;
    notesNow.current = next;
    setPinnedNotes(next);
    if (save) window.shell.saveView({ pinnedNotes: next });
  }, []);
  useEffect(() => {
    // A trashed Entry's note goes.
    if (!entriesLoaded.current) return;
    changePinnedNotes(
      withoutTrashed(
        notesNow.current,
        entries.map((entry) => entry.id),
      ),
    );
  }, [entries, changePinnedNotes]);
  /** Whether a folded Pinned note shows its Entry's image, a Project setting. */
  const [foldedNoteImage, setFoldedNoteImage] = useState(
    project.foldedNoteImage,
  );
  const openEntry =
    selected?.kind === 'entry'
      ? entries.find((e) => e.id === selected.id)
      : undefined;
  const [trash, setTrash] = useState<TrashItem[]>([]);
  /** The latest structure change, while its toast offers to undo it. */
  const [latest, setLatest] = useState<{ message: string; step: number }>();
  const closeToast = useCallback(() => setLatest(undefined), []);
  /**
   * The step Ctrl+Z in the Binder or Story Bible list undoes: the latest
   * structure change, while main can still undo it, its toast gone or not.
   */
  const undoable = useRef<number>(undefined);
  /** Sets the latest structure change, or undefined once it can't be undone. */
  const changeLatest = useCallback(
    (change: { message: string; step: number } | undefined) => {
      undoable.current = change?.step;
      setLatest(change);
    },
    [],
  );
  /** Ctrl+Z in a list: the latest structure change, as its toast's Undo. No redo. */
  async function undoLatest() {
    if (undoable.current !== undefined) await undo(undoable.current);
  }

  const refreshTrash = useCallback(
    () => window.project.listTrash().then(setTrash),
    [],
  );
  useEffect(() => {
    void refreshTrash();
  }, [refreshTrash]);

  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  /** The unit whose Conflict the centre shows, instead of the selection. */
  const [resolving, setResolving] = useState<UnitRef | null>(null);
  const resolvingConflict =
    resolving && conflicts.find((c) => unitKey(c.ref) === unitKey(resolving));
  const conflicted = new Set(conflicts.map((c) => c.ref.id));
  /** The left pane's tabs; Conflicts shows while there are any, or it is open. */
  const tabs: Tab[] = [
    'manuscript',
    'bible',
    ...(conflicts.length > 0 || tab === 'conflicts'
      ? (['conflicts'] as const)
      : []),
    'trash',
  ];
  useEffect(() => {
    void window.project.listConflicts().then(setConflicts);
  }, []);
  const [dropped, setDropped] = useState<Dropped[]>(project.dropped);
  /** Set once a newer app has upgraded the Project, after which nothing is saved. */
  const [readOnly, setReadOnly] = useState(project.readOnly);
  /** The language the Prose is spellchecked and typeset in; the Author may change it. */
  const [language, setLanguage] = useState(project.language);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);

  /** The latest unit another computer changed; `count` starts its toast's time over. */
  const [reloaded, setReloaded] = useState<{ ref: UnitRef; count: number }>();
  const reloads = useRef(0);
  const closeReloaded = useCallback(() => setReloaded(undefined), []);
  /** The Proposal the Author asked to see in its Conversation, from an Entry. */
  const [showProposal, setShowProposal] = useState<ShowProposal | null>(null);
  const shows = useRef(0);
  useEffect(
    () =>
      window.project.subscribe((event) => {
        if (event.type === 'structureChanged') {
          setManuscript(event.manuscript);
          const lost = event.dropped;
          if (lost) setDropped((dropped) => [...dropped, ...lost]);
          // Main can no longer undo it.
          changeLatest(undefined);
          void refreshTrash();
        } else if (event.type === 'unitReloaded' && !event.byProposal) {
          setReloaded({ ref: event.ref, count: ++reloads.current });
        } else if (event.type === 'conflictsChanged') {
          setConflicts(event.conflicts);
        } else if (event.type === 'conversationsChanged') {
          // A Conversation may have gone to Trash, or come out.
          void refreshTrash();
        } else if (event.type === 'entriesChanged') {
          entriesLoaded.current = true;
          setEntries(event.entries);
          // An Entry may have gone to Trash, or come out, as by a Proposal's undo.
          void refreshTrash();
        } else if (event.type === 'languageChanged') {
          // Prose editors are made anew in it; their edits reach main first.
          flushPendingEdits();
          setLanguage(event.language);
        } else if (event.type === 'foldedNoteImageChanged') {
          setFoldedNoteImage(event.on);
        } else if (event.type === 'readOnly') {
          // Main still takes edits for a moment: these are the last.
          flushPendingEdits();
          setReadOnly({ ...(event.host && { host: event.host }) });
          // Main can no longer undo it.
          changeLatest(undefined);
        }
      }),
    [refreshTrash, changeLatest],
  );

  /** Runs a structure operation, and offers to undo it; null when the Author cancelled it. */
  async function change(
    operation: () => Promise<Changed | null>,
    message: string,
  ) {
    // Edits reach main before the structure changes under them.
    flushPendingEdits();
    try {
      const result = await operation();
      if (!result) return;
      setManuscript(result.manuscript);
      changeLatest({ message, step: result.step });
      onError(null);
    } catch (error) {
      onError(`Can't make that change: ${(error as Error).message}`);
    }
    await refreshTrash();
  }

  /** Runs a structure operation that makes a unit, as `change` does; its id, if made. */
  async function create(
    operation: () => Promise<Created>,
    message: string,
  ): Promise<string | undefined> {
    let id: string | undefined;
    await change(async () => {
      const created = await operation();
      id = created.id;
      return created;
    }, message);
    return id;
  }

  /** The Chapter or Scene whose title the Binder is editing, if any. */
  const [renaming, setRenaming] = useState<string | null>(null);
  /**
   * The Entry whose Name gets focus as it opens, as one just made or by F2;
   * `count` asks again for an Entry already open.
   */
  const [focusName, setFocusName] = useState<{
    id: string;
    count: number;
  } | null>(null);
  const nameFocuses = useRef(0);
  const focusNameOf = (id: string) =>
    setFocusName({ id, count: ++nameFocuses.current });
  /** Whether the menu of Entry types to make one from is open. */
  const [pickingEntryType, setPickingEntryType] = useState(false);

  /**
   * The Scene or Chapter a create chord works from: the highlighted one when
   * focus is in the Binder, else the open one.
   */
  function current(): Current {
    const row = document.activeElement?.closest<HTMLElement>(
      '.binder [data-kind]',
    );
    if (row?.dataset.id) {
      return {
        kind: row.dataset.kind === 'chapter' ? 'chapter' : 'scene',
        id: row.dataset.id,
      };
    }
    if (selected?.kind === 'scene' || selected?.kind === 'chapter') {
      return { kind: selected.kind, id: selected.id };
    }
    return null;
  }

  async function createEntry(type: EntryType) {
    const label = ENTRY_TYPE_LABELS[type];
    const id = await create(
      () => window.project.createEntry(type, `New ${label}`),
      `${label} created`,
    );
    if (!id) return;
    setTab('bible');
    select({ kind: 'entry', id });
    focusNameOf(id);
  }

  /**
   * Does what the Author chose from the menu bar or with a shortcut; false
   * when it doesn't apply here. Shortcuts other than the Modes' work in
   * Writing only; the menus switch to it.
   */
  function run(command: Command): boolean {
    if (command.type === 'mode') {
      switchMode(command.mode);
      return true;
    }
    if (command.type === 'projectSettings') {
      setProjectSettingsOpen(true);
      return true;
    }
    if (
      command.type !== 'newScene' &&
      command.type !== 'newChapter' &&
      command.type !== 'newEntry'
    ) {
      return false;
    }
    if (readOnly) return false;
    if (mode !== 'writing') {
      if (command.byKey) return false;
      switchMode('writing');
    }
    if (command.type === 'newScene') {
      const at = sceneInsertion(manuscript, current(), command.above);
      if (!at) return false;
      void create(
        () => window.project.createScene(at.chapterId, at.index),
        'Scene created',
      ).then((id) => {
        if (!id) return;
        setTab('manuscript');
        select({ kind: 'scene', id });
      });
    } else if (command.type === 'newChapter') {
      const index = chapterInsertion(manuscript, current(), command.above);
      void create(
        () => window.project.createChapter(index),
        'Chapter created',
      ).then((id) => {
        if (!id) return;
        setTab('manuscript');
        setRenaming(id);
      });
    } else if (command.entryType) {
      void createEntry(command.entryType);
    } else {
      setPickingEntryType(true);
    }
    return true;
  }
  const latestRun = useRef(run);
  useEffect(() => {
    latestRun.current = run;
  });
  useEffect(
    () => window.shell.onCommand((command) => latestRun.current(command)),
    [],
  );
  // The window takes the chords before an editor does, so they work in one.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const command = commandForKey(event, MAC);
      // A dialog, or an open menu such as the Entry types, takes its own keys.
      if (!command || document.querySelector('dialog[open], [role="menu"]')) {
        return;
      }
      if (latestRun.current({ ...command, byKey: true })) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  async function undo(step: number) {
    flushPendingEdits();
    changeLatest(undefined);
    try {
      setManuscript(await window.project.undo(step));
      onError(null);
    } catch (error) {
      onError(`Can't undo: ${(error as Error).message}`);
    }
    await refreshTrash();
  }

  /** Keeps one version of a unit in Conflict, then opens the unit. */
  async function resolve(ref: UnitRef, kept: UnitValue) {
    flushPendingEdits();
    try {
      await window.project.resolveConflict(ref, kept);
      onError(null);
    } catch (error) {
      onError(`Can't resolve the Conflict: ${(error as Error).message}`);
      return;
    }
    await refreshTrash();
    const selection = selectionOf(ref, manuscript);
    setTab(selection.kind === 'entry' ? 'bible' : 'manuscript');
    select(selection);
  }

  async function emptyTrash() {
    if (await window.project.emptyTrash()) {
      // Nothing before it can be undone.
      changeLatest(undefined);
      await refreshTrash();
    }
  }

  return (
    <ReadOnlyContext.Provider value={readOnly !== null}>
      <div className="project-view">
        <header>
          <span className="project-name">{project.displayName}</span>
          <div role="group" aria-label="Mode" className="mode-switch">
            {WINDOW_MODES.map((value) => (
              <button
                key={value}
                aria-pressed={mode === value}
                title={withShortcut(MODE_LABELS[value], SHORTCUTS[value], MAC)}
                onClick={() => switchMode(value)}
              >
                {MODE_LABELS[value]}
              </button>
            ))}
          </div>
          <span className="scene-title">
            {mode !== 'writing'
              ? ''
              : resolvingConflict
                ? 'Conflict'
                : open
                  ? [open.chapter?.title ?? 'Unplaced', open.scene.title].join(
                      ' · ',
                    )
                  : openChapter
                    ? openChapter.title
                    : openEntry
                      ? entryTitle(openEntry)
                      : selected?.kind === 'project' && 'Project Outline'}
          </span>
        </header>
        {readOnly && (
          <p className="read-only-banner" role="alert">
            {upgradedMessage(project.displayName, readOnly.host)}
          </p>
        )}
        <SaveFailureBanner
          statuses={saveStatus.statuses}
          manuscript={manuscript}
          entries={entries}
        />
        <Notices
          sessions={project.sessions}
          manuscript={manuscript}
          tips={tips}
          dropped={dropped}
          onDismissDropped={(notice) =>
            setDropped(dropped.filter((d) => d !== notice))
          }
          onContinue={continueAt}
          onDismissTip={(tip) => {
            window.shell.dismissTip(tip);
            setTips(tips.filter((t) => t !== tip));
          }}
        />
        {error && <p role="alert">{error}</p>}
        <div className="project-body">
          {visited.has('brainstorm') && (
            <div className="room" hidden={mode !== 'brainstorm'}>
              <BrainstormRoom
                active={mode === 'brainstorm'}
                names={{ manuscript, entries }}
                pane={pane}
                onAddKey={onAddKey}
                onOpenEntry={openEntryInWriting}
                onChange={change}
              />
            </div>
          )}
          {visited.has('interview') && (
            <div className="room" hidden={mode !== 'interview'}>
              <InterviewRoom
                active={mode === 'interview'}
                names={{ manuscript, entries }}
                pane={pane}
                onAddKey={onAddKey}
                onOpenEntry={openEntryInWriting}
                onChange={change}
              />
            </div>
          )}
          {visited.has('writing') && (
            <div className="room" hidden={mode !== 'writing'} ref={writingRoom}>
              <aside className="left-pane" style={{ width: binderWidth }}>
                <div
                  role="tablist"
                  aria-label="Left pane"
                  className="tabs"
                  onKeyDown={(event) => {
                    const next = tabAfter(event.key, tab, tabs);
                    if (!next) return;
                    event.preventDefault();
                    setTab(next);
                    document.getElementById(`${next}-tab`)?.focus();
                  }}
                >
                  <button
                    role="tab"
                    aria-selected={tab === 'manuscript'}
                    tabIndex={tab === 'manuscript' ? 0 : -1}
                    id="manuscript-tab"
                    onClick={() => setTab('manuscript')}
                  >
                    Manuscript
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'bible'}
                    tabIndex={tab === 'bible' ? 0 : -1}
                    id="bible-tab"
                    onClick={() => setTab('bible')}
                  >
                    Story Bible
                  </button>
                  {tabs.includes('conflicts') && (
                    <button
                      role="tab"
                      aria-selected={tab === 'conflicts'}
                      tabIndex={tab === 'conflicts' ? 0 : -1}
                      id="conflicts-tab"
                      onClick={() => setTab('conflicts')}
                    >
                      Conflicts
                      {conflicts.length > 0 && (
                        <span className="badge">{conflicts.length}</span>
                      )}
                    </button>
                  )}
                  <button
                    role="tab"
                    aria-selected={tab === 'trash'}
                    tabIndex={tab === 'trash' ? 0 : -1}
                    id="trash-tab"
                    onClick={() => setTab('trash')}
                  >
                    Trash{trash.length > 0 && ` (${trash.length})`}
                  </button>
                </div>
                <div role="tabpanel" aria-labelledby={`${tab}-tab`}>
                  {tab === 'manuscript' ? (
                    <Binder
                      manuscript={manuscript}
                      selected={selected}
                      onSelect={select}
                      conflicted={conflicted}
                      onChange={change}
                      renaming={renaming}
                      onRename={setRenaming}
                      onUndo={undoLatest}
                    />
                  ) : tab === 'bible' ? (
                    <StoryBible
                      entries={entries}
                      openId={openEntry?.id ?? null}
                      conflicted={conflicted}
                      onOpen={(id) => select({ kind: 'entry', id })}
                      onRename={(id) => {
                        select({ kind: 'entry', id });
                        focusNameOf(id);
                      }}
                      onCreate={(type) => void createEntry(type)}
                      onChange={change}
                      onUndo={undoLatest}
                      highlight={highlight}
                      onHighlight={(on) => {
                        setHighlight(on);
                        window.shell.setHighlightMentions(on);
                      }}
                    />
                  ) : tab === 'conflicts' ? (
                    <ConflictList
                      conflicts={conflicts}
                      manuscript={manuscript}
                      entries={entries}
                      open={resolvingConflict ? resolving : null}
                      onOpen={(ref) => {
                        flushPendingEdits();
                        setResolving(ref);
                      }}
                    />
                  ) : (
                    <TrashView
                      items={trash}
                      onRestore={(item) =>
                        change(
                          () => window.project.restore(item.id),
                          item.kind === 'version'
                            ? `Restored ${trashTitle(item)}`
                            : `Restored “${item.title}”`,
                        )
                      }
                      onEmpty={emptyTrash}
                    />
                  )}
                </div>
              </aside>
              <PanelResizer
                label="Binder width"
                min={160}
                max={600}
                {...pane('binder')}
              />
              {overviewOpen &&
                !resolvingConflict &&
                open &&
                !open.scene.missing && (
                  <>
                    <OverviewPane
                      manuscript={manuscript}
                      language={language}
                      writing={{
                        sceneId: open.scene.id,
                        chapterId: open.chapter?.id ?? null,
                      }}
                      width={pane('overview').width}
                      onOpenScene={(id) => select({ kind: 'scene', id })}
                      onOpenChapter={(id) => select({ kind: 'chapter', id })}
                      onOpenProject={() => select({ kind: 'project' })}
                      onClose={toggleOverview}
                    />
                    <PanelResizer
                      label="Overview width"
                      min={200}
                      max={600}
                      {...pane('overview')}
                    />
                  </>
                )}
              {/* A new key per unit: leaving one unmounts its editors, which
            flushes their pending edits. */}
              {resolvingConflict ? (
                <ConflictResolver
                  key={unitKey(resolvingConflict.ref)}
                  conflict={resolvingConflict}
                  manuscript={manuscript}
                  entries={entries}
                  onResolve={(kept) => resolve(resolvingConflict.ref, kept)}
                />
              ) : selected?.kind === 'project' ? (
                <main className="centre" key={PROJECT_OUTLINE}>
                  <ProjectCorkboard
                    manuscript={manuscript}
                    language={language}
                    onOpenScene={(id) => select({ kind: 'scene', id })}
                    onOpenChapter={(id) => select({ kind: 'chapter', id })}
                  />
                </main>
              ) : selected?.kind === 'entry' ? (
                openEntry ? (
                  <EntryView
                    // A type change rewrites its description and fields: read them anew.
                    key={`${openEntry.id}:${openEntry.type}`}
                    entry={openEntry}
                    entries={entries}
                    language={language}
                    focusName={
                      focusName?.id === openEntry.id
                        ? focusName.count
                        : undefined
                    }
                    onType={(type) =>
                      change(
                        () => window.project.setEntryType(openEntry.id, type),
                        `Type changed to ${ENTRY_TYPE_LABELS[type]}`,
                      )
                    }
                    onVisibility={(visibility) =>
                      change(
                        () =>
                          window.project.setEntryVisibility(
                            openEntry.id,
                            visibility,
                          ),
                        `Visibility set to ${VISIBILITY_LABELS[visibility]}`,
                      )
                    }
                    onShowProposal={(conversationId, proposalId) =>
                      setShowProposal({
                        conversationId,
                        proposalId,
                        count: ++shows.current,
                      })
                    }
                  />
                ) : (
                  <div className="editor empty">No Entry open</div>
                )
              ) : openChapter ? (
                <main className="centre" key={openChapter.id}>
                  <ChapterCorkboard
                    chapter={openChapter}
                    language={language}
                    onOpenScene={(id) => select({ kind: 'scene', id })}
                  />
                </main>
              ) : !open ? (
                <div className="editor empty">No Scene open</div>
              ) : open.scene.missing ? (
                <div className="editor missing" role="status">
                  <p>
                    <strong>{open.scene.title}</strong> is missing, possibly not
                    synced yet. It opens here once its file has arrived.
                  </p>
                </div>
              ) : (
                <main className="centre" key={open.scene.id}>
                  <section
                    className="outline-notes"
                    aria-label="Outline & Notes"
                  >
                    <div className="outline-notes-bar">
                      <button
                        className="outline-notes-toggle"
                        aria-expanded={outlineNotesOpen}
                        onClick={toggleOutlineNotes}
                      >
                        <span aria-hidden="true">
                          {outlineNotesOpen ? '▾' : '▸'}
                        </span>{' '}
                        Outline & Notes
                      </button>
                      <button
                        className="overview-button"
                        aria-pressed={overviewOpen}
                        onClick={toggleOverview}
                      >
                        <span aria-hidden="true">☰</span> Overview
                      </button>
                    </div>
                    {outlineNotesOpen && (
                      <OutlineNotes
                        unitId={open.scene.id}
                        language={language}
                        withNotes
                      />
                    )}
                  </section>
                  <SceneEditor
                    // Its editor's typography is made for one language.
                    key={language}
                    sceneId={open.scene.id}
                    language={language}
                    focusAt={
                      jump?.sceneId === open.scene.id ? jump.cursor : undefined
                    }
                    quote={
                      jump?.sceneId === open.scene.id ? jump.quote : undefined
                    }
                    onCursor={reportCursor}
                    onProse={setProse}
                    onSelection={onSelection}
                  />
                </main>
              )}
              <PanelResizer
                label="Assistant width"
                panel="right"
                {...pane('assistant')}
                min={220}
                max={640}
              />
              <AssistantPanel
                active={mode === 'writing'}
                width={pane('assistant').width}
                onAddKey={onAddKey}
                sceneId={open && !open.scene.missing ? open.scene.id : null}
                names={{ manuscript, entries }}
                show={showProposal}
                onQuote={showQuote}
                onChange={change}
              />
            </div>
          )}
        </div>
        <StatusBar
          saveStatus={saveStatus}
          {...statusCounts({
            manuscript,
            scenes: sceneCounts,
            open:
              mode !== 'writing' || resolvingConflict
                ? null
                : open
                  ? { kind: 'scene', id: open.scene.id }
                  : openChapter
                    ? { kind: 'chapter', id: openChapter.id }
                    : null,
            selection: mode === 'writing' ? selectionCounts : null,
          })}
        />
        {pickingEntryType && (
          <EntryTypePicker
            onPick={(type) => {
              setPickingEntryType(false);
              void createEntry(type);
            }}
            onClose={() => setPickingEntryType(false)}
          />
        )}
        {peek && (
          <MentionPeek
            peek={peek}
            pinned={pinnedNotes.map((note) => note.entryId)}
            onOpen={showEntry}
            onTogglePin={(id, card) =>
              changePinnedNotes(
                togglePin(notesNow.current, id, { x: card.left, y: card.top }),
              )
            }
            onClose={closePeek}
          />
        )}
        {/* Writing only: hidden in the other Modes, back on return. */}
        {mode === 'writing' && (
          <PinnedNotes
            notes={pinnedNotes}
            entries={entries}
            foldedImage={foldedNoteImage}
            onChange={(entryId, change, save) =>
              changePinnedNotes(
                applyChange(notesNow.current, entryId, change),
                save,
              )
            }
            onOpen={showEntry}
          />
        )}
        {projectSettingsOpen && (
          <ProjectSettingsDialog
            displayName={project.displayName}
            language={language}
            foldedNoteImage={foldedNoteImage}
            readOnly={readOnly !== null}
            onClose={() => setProjectSettingsOpen(false)}
          />
        )}
        <div className="toasts">
          {reloaded && (
            <Toast
              key={`reloaded-${reloaded.count}`}
              message={`${capitalized(unitName(reloaded.ref, manuscript, entries))} updated from another computer`}
              ms={RELOADED_TOAST_MS}
              onClose={closeReloaded}
            />
          )}
          {latest && (
            <Toast
              key={latest.step}
              message={latest.message}
              ms={UNDO_TOAST_MS}
              action={{ label: 'Undo', run: () => undo(latest.step) }}
              onClose={closeToast}
            />
          )}
        </div>
      </div>
    </ReadOnlyContext.Provider>
  );
}

/** The left pane's tabs in Writing. */
type Tab = 'manuscript' | 'bible' | 'conflicts' | 'trash';

/** The tab ← / →, Home or End switches to from `tab`, round the ends; null for other keys. */
function tabAfter(key: string, tab: Tab, tabs: Tab[]): Tab | null {
  const at = tabs.indexOf(tab);
  if (key === 'ArrowLeft') return tabs.at(at - 1) ?? null;
  if (key === 'ArrowRight') return tabs[(at + 1) % tabs.length];
  if (key === 'Home') return tabs[0];
  if (key === 'End') return tabs.at(-1) ?? null;
  return null;
}

function allScenes(
  manuscript: Manuscript,
): { chapter: ManuscriptChapter | null; scene: ManuscriptScene }[] {
  return [
    ...manuscript.chapters.flatMap((chapter) =>
      chapter.scenes.map((scene) => ({ chapter, scene })),
    ),
    ...manuscript.unplaced.map((scene) => ({ chapter: null, scene })),
  ];
}

/** What to open once a unit's Conflict is resolved: the unit it belongs to. */
function selectionOf(ref: UnitRef, manuscript: Manuscript): Selection {
  if (ref.kind === 'entry' || ref.kind === 'private') {
    return { kind: 'entry', id: ref.id };
  }
  if (ref.id === PROJECT_OUTLINE) return { kind: 'project' };
  return manuscript.chapters.some((c) => c.id === ref.id)
    ? { kind: 'chapter', id: ref.id }
    : { kind: 'scene', id: ref.id };
}
