import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Changed,
  Created,
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
  type EntryType,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type UnitRef,
  type UnitValue,
} from '../shared/project-types';
import { MODE_LABELS, type Mode } from '../shared/conversation';
import { ProjectMirror } from './project-mirror';
import { useProject } from './use-project';
import type { Cut } from '../shared/prose-split';
import { entryTitle } from '../shared/entry';
import type { ProposalTarget, ProposalView } from '../shared/proposal';
import type { ImportConvention } from '../shared/manuscript-import';
import { upgradedMessage } from '../shared/format-gate';
import {
  commandForKey,
  SHORTCUTS,
  withShortcut,
  ALL_DOCKED,
  type Command,
  type DockedPanes,
  type SidePane,
} from '../shared/shortcuts';
import type { TodoLink } from '../shared/todo';
import { capitalized, unitName } from '../shared/unit-name';
import { AssistantPanel } from './AssistantPanel';
import { Binder, type Selection } from './Binder';
import { BrainstormRoom } from './BrainstormRoom';
import { WINDOW_MODES, type ShowProposal } from './Conversation';
import { ConflictList, ConflictResolver } from './Conflicts';
import { ChapterCorkboard, ProjectCorkboard } from './Corkboard';
import { EntryTypePicker } from './EntryTypePicker';
import { EntryView, VISIBILITY_LABELS } from './EntryView';
import { ExportManuscriptDialog } from './ExportManuscriptDialog';
import { ExportStoryBibleDialog } from './ExportStoryBibleDialog';
import { ImportDialog } from './ImportDialog';
import { chapterInsertion, sceneInsertion, type Current } from './insertion';
import { InterviewRoom } from './InterviewRoom';
import { Notices } from './Notices';
import { OutlineNotes } from './OutlineNotes';
import { OverviewPane } from './OverviewPane';
import { usePaneCycle } from './pane-focus';
import { PanelResizer, type PaneSize } from './PanelResizer';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import { ProposalTargetContext } from './ProposalCard';
import { ProposalPeek, type TargetPeek } from './ProposalPeek';
import { PinnedNotes } from './PinnedNotes';
import {
  applyChange,
  textWithoutImage,
  togglePin,
  withoutTrashed,
} from './pinned-notes';
import { revealedEdge, type ChromeEdge } from './zen';
import { cycleWritingWidth } from './view-settings';
import {
  onMentionClick,
  setMentionEntries,
  setMentionHighlighting,
  type MentionClick,
} from './mention-highlight';
import { MentionPeek } from './MentionPeek';
import { MAC } from './platform';
import { applyFormat, focusedProse } from './prose-format';
import { cutAtSelection } from './split-scene';
import { flushPendingEdits } from './pending-edits';
import type { Reveal } from './reveal';
import { SaveFailureBanner, useSaveStatus } from './SaveStatus';
import { SceneEditor, type QuoteJump } from './SceneEditor';
import { SettingsDialog } from './SettingsDialog';
import { ShortcutsDialog } from './ShortcutsDialog';
import { StartScreen } from './StartScreen';
import { StatusBar, useSceneCounts } from './StatusBar';
import { StoryBible } from './StoryBible';
import { ProjectContexts } from './StatusAndTags';
import { TagsDialog } from './TagsDialog';
import { WordTargetDialog } from './WordTarget';
import { TodoList, type TodoDraft } from './TodoList';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
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
        else if (command.type === 'format') {
          const prose = focusedProse();
          if (prose) applyFormat(prose, command.format);
        }
      }),
    [],
  );
  // The Format menu is enabled while the Prose has focus, and the Splits
  // while its Scene can be split, as its element says. Focus has moved on
  // once its events are done; it stays put while the window is behind.
  useEffect(() => {
    let shown = { focused: false, splittable: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const prose = focusedProse();
        const now = {
          focused: prose !== null,
          splittable: prose?.view.dom.dataset.split === 'true',
        };
        if (
          now.focused === shown.focused &&
          now.splittable === shown.splittable
        ) {
          return;
        }
        shown = now;
        window.shell.showProseFocus(now.focused, now.splittable);
      });
    };
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    // A Scene can become one that can't be split, as when a Conflict comes.
    const splits = new MutationObserver(check);
    splits.observe(document.body, {
      subtree: true,
      attributeFilter: ['data-split'],
    });
    return () => {
      clearTimeout(timer);
      splits.disconnect();
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
    };
  }, []);
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
          onAddProvider={openSettings}
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
      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} />
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
/** How long the status bar shows a notice. */
const NOTICE_MS = 4000;

/** How long a structure change can be undone from its toast. */
const UNDO_TOAST_MS = 10_000;
const RELOADED_TOAST_MS = 5000;
/** How long the cursor rests before where it is gets remembered. */
const CURSOR_REPORT_MS = 1000;

function ProjectView({
  project,
  error,
  onError,
  onAddProvider,
}: {
  project: OpenedProject;
  error: string | null;
  onError(message: string | null): void;
  /** Opens Settings to add an API key for the Assistant. */
  onAddProvider(): void;
}) {
  const [mirror] = useState(() => new ProjectMirror(window.project, project));
  useEffect(() => mirror.start(), [mirror]);
  const {
    manuscript,
    entries,
    entriesLoaded,
    trash,
    todos,
    conflicts,
    statuses,
    language,
    readOnly,
    dropped,
    foldedNoteImage,
  } = useProject(mirror);
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
    setRevealing(null);
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
    setTargetPeek(null);
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

  /** Opens a Todo's Scene, Chapter or Entry in Writing, from a room. */
  function openInWriting(link: TodoLink) {
    if (link.kind === 'entry') return openEntryInWriting(link.id);
    switchMode('writing');
    setTab('manuscript');
    select(link);
  }

  /**
   * The Entry or Outline a Proposal's title went to in Writing, by its id,
   * and the field there to go to.
   */
  const [revealing, setRevealing] = useState<{
    id: string;
    reveal: Reveal;
  } | null>(null);
  const revealCount = useRef(0);
  /** What the Author goes to in its unit, if it is `id`'s. */
  const revealIn = (id: string) =>
    revealing?.id === id ? revealing.reveal : undefined;

  /**
   * Goes to a Proposal's target in Writing: its Entry, at the field, or the
   * Outline of its Scene, Chapter or the Project. The Conversation stays
   * open beside it. Nothing happens once the target is in Trash or gone.
   */
  function goToTarget(target: ProposalTarget, proposalId: string) {
    if (!reachable(target)) return;
    const count = ++revealCount.current;
    if (target.kind === 'entry') {
      setTab('bible');
      select({ kind: 'entry', id: target.entryId });
      setRevealing({
        id: target.entryId,
        reveal: { field: target.field, proposalId, count },
      });
      return;
    }
    const selection = selectionOf(
      { kind: 'outline', id: target.outlineId },
      manuscript,
    );
    setTab('manuscript');
    select(selection);
    if (selection.kind === 'scene' && !outlineNotesOpen) toggleOutlineNotes();
    setRevealing({ id: target.outlineId, reveal: { proposalId, count } });
  }

  /** Whether a Proposal's target is still in the Story Bible or Manuscript. */
  function reachable(target: ProposalTarget): boolean {
    if (target.kind === 'entry') {
      return entries.some((entry) => entry.id === target.entryId);
    }
    const id = target.outlineId;
    return (
      id === PROJECT_OUTLINE ||
      manuscript.chapters.some((chapter) => chapter.id === id) ||
      allScenes(manuscript).some(({ scene }) => scene.id === id)
    );
  }

  /** The Proposal target the Author Peeks at from its title, in a room. */
  const [targetPeek, setTargetPeek] = useState<TargetPeek | null>(null);
  const closeTargetPeek = useCallback(() => setTargetPeek(null), []);
  const peekAtTarget = (
    proposal: ProposalView,
    target: ProposalTarget,
    anchor: DOMRect,
  ) =>
    setTargetPeek({
      target,
      proposalId: proposal.id,
      name: proposal.name,
      anchor,
    });

  function toggleOutlineNotes() {
    setOutlineNotesOpen(!outlineNotesOpen);
    window.shell.saveView({ outlineNotesOpen: !outlineNotesOpen });
  }

  /** Opens or closes the Overview pane; saved, except in zen, which gives it back on leaving. */
  function toggleOverview() {
    setOverviewOpen(!overviewOpen);
    if (!beforeZen) window.shell.saveView({ overviewOpen: !overviewOpen });
  }

  const [tab, setTab] = useState<Tab>('manuscript');
  /**
   * Which side panes are docked in Writing, rather than collapsed to their
   * edge tabs. In memory for the window, across Mode switches.
   */
  const [docked, setDocked] = useState<DockedPanes>(ALL_DOCKED);
  useEffect(() => window.shell.showDocked(docked), [docked]);
  /** Moves focus to the Prose if it is in a pane of Writing matching `paneSelector`, about to go. */
  function focusProseOutOf(paneSelector: string) {
    const room = writingRoom.current;
    const active = document.activeElement;
    if (
      ![...(room?.querySelectorAll(paneSelector) ?? [])].some((pane) =>
        pane.contains(active),
      )
    ) {
      return;
    }
    room?.querySelector<HTMLElement>('[aria-label="Prose"]')?.focus();
  }
  /**
   * Collapses a side pane, or docks it back at the tab it last showed. Focus
   * in a pane that collapses goes to the Prose.
   */
  function togglePane(pane: SidePane) {
    if (docked[pane]) {
      focusProseOutOf(pane === 'left' ? '.left-pane' : '.assistant-panel');
    }
    setDocked({ ...docked, [pane]: !docked[pane] });
  }
  function dockLeftPane() {
    setDocked((now) => ({ ...now, left: true }));
  }
  /** Docks the left pane back, open at `at`, from its edge tab. */
  function dockLeftPaneAt(at: Tab) {
    setTab(at);
    setDocked({ ...docked, left: true });
  }
  /**
   * While the Author is in zen mode, in Writing or away from it, the panes
   * and Overview as they were before, to give back on leaving it. In memory
   * for the window.
   */
  const [beforeZen, setBeforeZen] = useState<PanesBeforeZen | null>(null);
  /** Zen is shown in Writing only, and resumes on the return to it. */
  const zen = beforeZen !== null && mode === 'writing';
  useEffect(() => window.shell.setZen(zen), [zen]);
  /** Puts every pane away, the Overview too, leaving the Overview's saved state as is. */
  function enterZen() {
    focusProseOutOf('.left-pane, .overview-pane, .assistant-panel');
    setBeforeZen({ docked, overviewOpen });
    setDocked({ left: false, assistant: false });
    setOverviewOpen(false);
  }
  /** Gives the panes back as they were before zen. */
  function leaveZen() {
    if (!beforeZen) return;
    setBeforeZen(null);
    setDocked(beforeZen.docked);
    setOverviewOpen(beforeZen.overviewOpen);
  }
  /** The header or status bar zen shows, as the pointer reaches its edge. */
  const [revealed, setRevealed] = useState<ChromeEdge | null>(null);
  useEffect(() => {
    if (!zen) return;
    const onMove = (event: MouseEvent) =>
      setRevealed((now) =>
        revealedEdge(event.clientY, window.innerHeight, now),
      );
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('mousemove', onMove);
      setRevealed(null);
    };
  }, [zen]);
  const writingRoom = useRef<HTMLDivElement>(null);
  usePaneCycle(writingRoom, mode === 'writing');
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
    // A trashed Entry's note goes; one whose Entry lost its image is text.
    if (!entriesLoaded) return;
    changePinnedNotes(
      textWithoutImage(
        withoutTrashed(
          notesNow.current,
          entries.map((entry) => entry.id),
        ),
        entries.filter((entry) => entry.image).map((entry) => entry.id),
      ),
    );
  }, [entries, entriesLoaded, changePinnedNotes]);
  const openEntry =
    selected?.kind === 'entry'
      ? entries.find((e) => e.id === selected.id)
      : undefined;
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

  /** The Trash item a Todo's link went to; `count` goes to it again. */
  const [trashReveal, setTrashReveal] = useState<{
    id: string;
    count: number;
  }>();
  const trashReveals = useRef(0);
  useEffect(() => {
    if (tab !== 'trash') setTrashReveal(undefined);
  }, [tab]);
  /** Shows a Trash item in Writing's Trash tab, as a Todo's link to it does. */
  function openTrashItem(id: string) {
    setTab('trash');
    dockLeftPane();
    setTrashReveal({ id, count: ++trashReveals.current });
  }

  /** What a new Todo is linked to unless the Author unlinks it: the unit open in Writing. */
  const prelink: TodoLink | null = open
    ? { kind: 'scene', id: open.scene.id }
    : openChapter
      ? { kind: 'chapter', id: openChapter.id }
      : openEntry
        ? { kind: 'entry', id: openEntry.id }
        : null;
  /** Whether Writing's Todos tab shows only the open unit's. In memory for the window. */
  const [onlyOpenTodos, setOnlyOpenTodos] = useState(false);
  /** The Todo the Author started from elsewhere, while the Todos tab is open. */
  const [todoDraft, setTodoDraft] = useState<TodoDraft>();
  const todoDrafts = useRef(0);
  useEffect(() => {
    if (tab !== 'todos') setTodoDraft(undefined);
  }, [tab]);
  /**
   * Starts a Todo in Writing's Todos tab, docking the left pane if
   * collapsed: New Todo, focused, linked to `link`, holding `text` if given.
   */
  function startTodo(link: TodoLink | null, text?: string) {
    setTab('todos');
    dockLeftPane();
    setTodoDraft({
      link,
      ...(text !== undefined && { text }),
      count: ++todoDrafts.current,
    });
  }

  /** The unit whose Conflict the centre shows, instead of the selection. */
  const [resolving, setResolving] = useState<UnitRef | null>(null);
  const resolvingConflict =
    resolving && conflicts.find((c) => unitKey(c.ref) === unitKey(resolving));
  const conflicted = new Set(conflicts.map((c) => c.ref.id));
  /** The left pane's tabs; Conflicts shows while there are any, or it is open. */
  const tabs: Tab[] = [
    'manuscript',
    'bible',
    'todos',
    ...(conflicts.length > 0 || tab === 'conflicts'
      ? (['conflicts'] as const)
      : []),
    'trash',
  ];
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [storyBibleExportOpen, setStoryBibleExportOpen] = useState(false);
  /** The Chapter or Scene whose Tags… is open, by id. */
  const [tagging, setTagging] = useState<string | null>(null);
  /** It, as the Manuscript has it now; gone if it is no longer there. */
  const taggingUnit =
    tagging === null ? undefined : unitOf(tagging, manuscript);
  /** The Chapter or Scene whose Set word target… is open, by id. */
  const [settingWordTarget, setSettingWordTarget] = useState<string | null>(
    null,
  );
  /** It, as the Manuscript has it now; gone if it is no longer there. */
  const wordTargetUnit =
    settingWordTarget === null
      ? undefined
      : unitOf(settingWordTarget, manuscript);

  /** The latest unit another computer changed; `count` starts its toast's time over. */
  const [reloaded, setReloaded] = useState<{ ref: UnitRef; count: number }>();
  const reloads = useRef(0);
  const closeReloaded = useCallback(() => setReloaded(undefined), []);
  /** The Proposal the Author asked to see in its Conversation, from an Entry. */
  const [showProposal, setShowProposal] = useState<ShowProposal | null>(null);
  const shows = useRef(0);
  // What the UI does as the mirror tells it of the Project.
  useEffect(
    () =>
      mirror.onEvent((event) => {
        if (event.type === 'error') {
          onError(event.message);
        } else if (event.type === 'unitReloaded') {
          setReloaded({ ref: event.ref, count: ++reloads.current });
        } else if (event.type === 'languageChanged') {
          // Prose editors are made anew in it; their edits reach main first.
          flushPendingEdits();
        } else {
          if (event.type === 'readOnlyStarted') flushPendingEdits();
          // Main can no longer undo it.
          changeLatest(undefined);
        }
      }),
    [mirror, onError, changeLatest],
  );

  // The Manuscript or Entries showing a change follow from main.
  const setStatus = (unitId: string, statusId: string | null) =>
    mirror.setStatus(unitId, statusId).then(() => {});
  const setWordTarget = (unitId: string, words: number | null) =>
    mirror.setWordTarget(unitId, words).then(() => {});
  const setTags = (unitId: string, tags: string[]) =>
    mirror.setTags(unitId, tags).then(() => {});

  /** Runs a structure operation, and offers to undo it; null when the Author cancelled it. */
  async function change(
    operation: () => Promise<Changed | null>,
    message: string,
  ) {
    // Edits reach main before the structure changes under them.
    flushPendingEdits();
    const result = await mirror.change(operation);
    if (result) changeLatest({ message, step: result.step });
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

  /**
   * Whether a Scene can be split: one in a Chapter, here, and not in
   * Conflict, in a Project that isn't read-only.
   */
  function splittable(sceneId: string): boolean {
    const found = allScenes(manuscript).find((s) => s.scene.id === sceneId);
    return (
      readOnly === null &&
      !!found?.chapter &&
      !found.scene.missing &&
      !conflicts.some((c) => c.ref.kind === 'scene' && c.ref.id === sceneId)
    );
  }

  /**
   * Splits a Scene at `cut`, as Insert › Split Scene does, then opens the
   * new Scene at the start of its Prose; without a cut, the status bar says
   * there is nothing to split.
   */
  async function split(
    sceneId: string,
    cut: Cut | null,
    toNextChapter: boolean,
  ) {
    if (!cut) {
      showNotice('Nothing to split at the start or end of the Prose');
      return;
    }
    // The Prose as cut is what main has, before the split writes over it.
    flushPendingEdits();
    const id = await create(
      () => window.project.splitScene(sceneId, cut, toNextChapter),
      'Scene split',
    );
    // The start of its first paragraph.
    if (id) continueAt(id, 1);
  }

  /** What the status bar says for a moment, as that there is nothing to split. */
  const [notice, setNotice] = useState<{ text: string; count: number }>();
  const notices = useRef(0);
  const showNotice = (text: string) =>
    setNotice({ text, count: ++notices.current });
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

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
    if (command.type === 'exportManuscript') {
      setExportOpen(true);
      return true;
    }
    if (command.type === 'exportStoryBible') {
      setStoryBibleExportOpen(true);
      return true;
    }
    if (command.type === 'zen') {
      if (mode !== 'writing') {
        if (command.byKey) return false;
        // Resumes zen, if the Author left Writing in it.
        switchMode('writing');
        if (!beforeZen) enterZen();
      } else if (beforeZen) {
        leaveZen();
      } else {
        enterZen();
      }
      return true;
    }
    if (command.type === 'cycleWritingWidth') {
      if (mode !== 'writing') return false;
      cycleWritingWidth();
      return true;
    }
    if (command.type === 'togglePane') {
      if (mode !== 'writing') {
        if (command.byKey) return false;
        switchMode('writing');
      }
      togglePane(command.pane);
      return true;
    }
    if (command.type === 'newTodo') {
      if (readOnly) return false;
      if (mode !== 'writing') {
        if (command.byKey) return false;
        switchMode('writing');
      }
      startTodo(prelink);
      return true;
    }
    if (command.type === 'splitScene') {
      // Only with the cursor in a Scene's Prose, which is only in Writing.
      const prose = focusedProse();
      const sceneId = prose?.view.dom.dataset.scene;
      if (mode !== 'writing' || !prose || !sceneId || !splittable(sceneId)) {
        return false;
      }
      void split(sceneId, cutAtSelection(prose), command.toNextChapter);
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
  // Escape leaves zen, unless a dialog, menu, list or field takes it first.
  useEffect(() => {
    if (!zen) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.repeat ||
        document.querySelector(
          'dialog[open], [role="dialog"], [role="menu"], [role="listbox"]',
        ) ||
        document.activeElement?.matches('input, textarea, select')
      ) {
        return;
      }
      latestRun.current({ type: 'zen', byKey: true });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [zen]);

  async function undo(step: number) {
    flushPendingEdits();
    changeLatest(undefined);
    await mirror.undo(step);
  }

  /** Keeps one version of a unit in Conflict, then opens the unit. */
  async function resolve(ref: UnitRef, kept: UnitValue) {
    flushPendingEdits();
    if (!(await mirror.resolveConflict(ref, kept))) return;
    const selection = selectionOf(ref, manuscript);
    setTab(selection.kind === 'entry' ? 'bible' : 'manuscript');
    select(selection);
  }

  async function emptyTrash() {
    if (await mirror.emptyTrash()) {
      // Nothing before it can be undone.
      changeLatest(undefined);
    }
  }

  return (
    <ProjectContexts
      readOnly={readOnly !== null}
      statusAndTags={{
        statuses,
        setStatus: (unitId, statusId) => void setStatus(unitId, statusId),
        setTags,
      }}
    >
      <div
        className="project-view"
        data-zen={zen || undefined}
        data-revealed={revealed ?? undefined}
      >
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
          {mode === 'writing' && (
            <button
              className="zen-button"
              aria-pressed={zen}
              title={withShortcut('Zen Mode', SHORTCUTS.zen, MAC)}
              onClick={() => run({ type: 'zen' })}
            >
              Zen
            </button>
          )}
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
          onDismissDropped={(notice) => mirror.dismissDropped(notice)}
          onContinue={continueAt}
          onDismissTip={(tip) => {
            window.shell.dismissTip(tip);
            setTips(tips.filter((t) => t !== tip));
          }}
        />
        {error && <p role="alert">{error}</p>}
        <div className="project-body">
          <ProposalTargetContext.Provider value={peekAtTarget}>
            {visited.has('brainstorm') && (
              <div className="room" hidden={mode !== 'brainstorm'}>
                <BrainstormRoom
                  active={mode === 'brainstorm'}
                  names={{ manuscript, entries }}
                  pane={pane}
                  onAddProvider={onAddProvider}
                  onOpenEntry={openEntryInWriting}
                  onChange={change}
                  todos={
                    <TodoList
                      todos={todos}
                      names={{ manuscript, entries, trash }}
                      prelink={null}
                      onOpen={openInWriting}
                      onOpenTrash={(id) => {
                        switchMode('writing');
                        openTrashItem(id);
                      }}
                      onError={onError}
                    />
                  }
                />
              </div>
            )}
            {visited.has('interview') && (
              <div className="room" hidden={mode !== 'interview'}>
                <InterviewRoom
                  active={mode === 'interview'}
                  names={{ manuscript, entries }}
                  pane={pane}
                  onAddProvider={onAddProvider}
                  onOpenEntry={openEntryInWriting}
                  onChange={change}
                />
              </div>
            )}
          </ProposalTargetContext.Provider>
          {visited.has('writing') && (
            <div className="room" hidden={mode !== 'writing'} ref={writingRoom}>
              {!docked.left && (
                <div
                  role="group"
                  aria-label="Left pane, collapsed"
                  className="edge-tabs edge-tabs-left"
                >
                  <button onClick={() => dockLeftPaneAt('manuscript')}>
                    Manuscript
                  </button>
                  <button onClick={() => dockLeftPaneAt('bible')}>
                    Story Bible
                  </button>
                </div>
              )}
              <aside
                className="left-pane"
                hidden={!docked.left}
                style={{ width: binderWidth }}
              >
                <div className="left-pane-bar">
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
                    <button
                      role="tab"
                      aria-selected={tab === 'todos'}
                      tabIndex={tab === 'todos' ? 0 : -1}
                      id="todos-tab"
                      onClick={() => setTab('todos')}
                    >
                      Todos
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
                  <button
                    className="collapse-pane"
                    aria-label="Collapse the left pane"
                    title={withShortcut(
                      'Collapse the left pane',
                      SHORTCUTS.leftPane,
                      MAC,
                    )}
                    onClick={() => togglePane('left')}
                  >
                    «
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
                      statuses={statuses}
                      onSetStatus={(unitId, statusId) =>
                        void setStatus(unitId, statusId)
                      }
                      onEditTags={setTagging}
                      onSetWordTarget={setSettingWordTarget}
                      onAddTodo={(link) => startTodo(link)}
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
                      onAddTodo={(id) => startTodo({ kind: 'entry', id })}
                    />
                  ) : tab === 'todos' ? (
                    <TodoList
                      todos={todos}
                      names={{ manuscript, entries, trash }}
                      prelink={prelink}
                      draft={todoDraft}
                      onlyOpen={onlyOpenTodos}
                      onOnlyOpen={setOnlyOpenTodos}
                      onOpen={select}
                      onOpenTrash={openTrashItem}
                      onError={onError}
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
                      reveal={trashReveal}
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
              {docked.left && (
                <PanelResizer
                  label="Binder width"
                  min={160}
                  max={600}
                  {...pane('binder')}
                />
              )}
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
                    reveal={revealIn(PROJECT_OUTLINE)}
                    onOpenScene={(id) => select({ kind: 'scene', id })}
                    onOpenChapter={(id) => select({ kind: 'chapter', id })}
                    onAddTodo={startTodo}
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
                    reveal={revealIn(openEntry.id)}
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
                    onTags={(tags) => setTags(openEntry.id, tags)}
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
                    reveal={revealIn(openChapter.id)}
                    onOpenScene={(id) => select({ kind: 'scene', id })}
                    onAddTodo={startTodo}
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
                        reveal={revealIn(open.scene.id)}
                      />
                    )}
                  </section>
                  <SceneEditor
                    // Its editor's typography is made for one language.
                    key={language}
                    sceneId={open.scene.id}
                    language={language}
                    // Focus goes to the Outline instead, as a Proposal's title asks.
                    autofocus={!revealIn(open.scene.id)}
                    focusAt={
                      jump?.sceneId === open.scene.id ? jump.cursor : undefined
                    }
                    quote={
                      jump?.sceneId === open.scene.id ? jump.quote : undefined
                    }
                    onCursor={reportCursor}
                    onProse={setProse}
                    onSelection={onSelection}
                    splittable={splittable(open.scene.id)}
                  />
                </main>
              )}
              {docked.assistant && (
                <PanelResizer
                  label="Assistant width"
                  panel="right"
                  {...pane('assistant')}
                  min={220}
                  max={640}
                />
              )}
              <ProposalTargetContext.Provider
                value={(proposal, target) => goToTarget(target, proposal.id)}
              >
                <AssistantPanel
                  active={mode === 'writing'}
                  docked={docked.assistant}
                  onCollapse={() => togglePane('assistant')}
                  width={pane('assistant').width}
                  onAddProvider={onAddProvider}
                  sceneId={open && !open.scene.missing ? open.scene.id : null}
                  names={{ manuscript, entries }}
                  show={showProposal}
                  onQuote={showQuote}
                  onAddTodo={(text, link) => startTodo(link, text)}
                  onChange={change}
                />
              </ProposalTargetContext.Provider>
              {!docked.assistant && (
                <div
                  role="group"
                  aria-label="Assistant, collapsed"
                  className="edge-tabs edge-tabs-right"
                >
                  <button onClick={() => togglePane('assistant')}>
                    Assistant
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <StatusBar
          saveStatus={saveStatus}
          notice={notice?.text}
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
                    : selected?.kind === 'project'
                      ? { kind: 'project' }
                      : null,
            selection: mode === 'writing' ? selectionCounts : null,
          })}
          onSetWordTarget={(unitId, words) => void setWordTarget(unitId, words)}
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
        {targetPeek && mode !== 'writing' && (
          <ProposalPeek
            peek={targetPeek}
            onOpenInWriting={() => {
              switchMode('writing');
              goToTarget(targetPeek.target, targetPeek.proposalId);
            }}
            onClose={closeTargetPeek}
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
        {taggingUnit && (
          <TagsDialog
            unitName={`${taggingUnit.kind === 'chapter' ? 'Chapter' : 'Scene'} “${taggingUnit.node.title}”`}
            tags={taggingUnit.node.tags ?? NO_TAGS}
            onChange={(tags) => setTags(taggingUnit.node.id, tags)}
            onClose={() => setTagging(null)}
          />
        )}
        {wordTargetUnit && (
          <WordTargetDialog
            unitName={`${wordTargetUnit.kind === 'chapter' ? 'Chapter' : 'Scene'} “${wordTargetUnit.node.title}”`}
            wordTarget={wordTargetUnit.node.wordTarget}
            onSave={(words) =>
              void setWordTarget(wordTargetUnit.node.id, words)
            }
            onClose={() => setSettingWordTarget(null)}
          />
        )}
        {exportOpen && (
          <ExportManuscriptDialog
            manuscript={manuscript}
            onClose={() => setExportOpen(false)}
          />
        )}
        {storyBibleExportOpen && (
          <ExportStoryBibleDialog
            entries={entries}
            onClose={() => setStoryBibleExportOpen(false)}
          />
        )}
        {projectSettingsOpen && (
          <ProjectSettingsDialog
            displayName={project.displayName}
            language={language}
            foldedNoteImage={foldedNoteImage}
            statuses={statuses}
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
    </ProjectContexts>
  );
}

/** What zen puts away in Writing, and gives back on leaving it. */
type PanesBeforeZen = { docked: DockedPanes; overviewOpen: boolean };

/** The left pane's tabs in Writing. */
type Tab = 'manuscript' | 'bible' | 'todos' | 'conflicts' | 'trash';

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

/** No Tags, the same each time. */
const NO_TAGS: string[] = [];

/** The Chapter or Scene of `id` in `manuscript`, if it is there. */
function unitOf(
  id: string,
  manuscript: Manuscript,
):
  | { kind: 'chapter'; node: ManuscriptChapter }
  | { kind: 'scene'; node: ManuscriptScene }
  | undefined {
  const chapter = manuscript.chapters.find((c) => c.id === id);
  if (chapter) return { kind: 'chapter', node: chapter };
  const found = allScenes(manuscript).find(({ scene }) => scene.id === id);
  return found && { kind: 'scene', node: found.scene };
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
