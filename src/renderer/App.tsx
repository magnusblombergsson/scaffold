import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import type {
  BackupNotice,
  Changed,
  Created,
  FloatingImage,
  ImportFile,
  OpenedProject,
  OpenResult,
  PanelWidths,
  ProjectApi,
  PinnedNote,
  Tip,
  WelcomeReason,
} from '../shared/api';
import {
  ENTRY_TYPE_LABELS,
  partName,
  PROJECT_OUTLINE,
  unitKey,
  VISIBILITY_LABELS,
  type EntryType,
  type Manuscript,
  type ManuscriptBook,
  type ManuscriptChapter,
  type ManuscriptPart,
  type ManuscriptScene,
  type UnitRef,
  type UnitValue,
} from '../shared/project-types';
import {
  bookManuscript,
  bookOf,
  splitsToNextChapter,
} from '../shared/manuscript-order';
import { ROOM_LABELS, ROOMS, type Room } from '../shared/room';
import { bookBeingWritten, storyBibleAsOf } from '../shared/story-bible-as-of';
import { ProjectMirror } from './project-mirror';
import { SceneSnapshots, type ListenToProse } from './Snapshots';
import { useProject } from './use-project';
import type { Cut } from '../shared/prose-split';
import { entryCount, entryTitle } from '../shared/entry';
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
import type { ShowProposal } from './Conversation';
import { ConflictList, ConflictResolver } from './Conflicts';
import {
  ChapterCorkboard,
  BookCorkboard,
  PartCorkboard,
  ProjectCorkboard,
  useCorkboardView,
} from './Corkboard';
import { EntryTypePicker } from './EntryTypePicker';
import { EntryView } from './EntryView';
import { ExportManuscriptDialog } from './ExportManuscriptDialog';
import type { NewEntry, StoryBibleFile } from '../shared/story-bible-import';
import { ExportStoryBibleDialog } from './ExportStoryBibleDialog';
import { ImportStoryBibleDialog } from './ImportStoryBibleDialog';
import { ImportDialog } from './ImportDialog';
import { chapterInsertion, sceneInsertion, type Current } from './insertion';
import { InterviewRoom } from './InterviewRoom';
import { PlanRoom, type PlanOpening } from './PlanRoom';
import { WritingBeatsContext } from './Beats';
import { sceneBeatsInWriting } from '../shared/beat-measure';
import { Notices } from './Notices';
import { OutlineNotes } from './OutlineNotes';
import { OverviewPane } from './OverviewPane';
import { usePaneCycle } from './pane-focus';
import { PanelResizer, type PaneSize } from './PanelResizer';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import { ProposalTargetContext } from './ProposalCard';
import { ProposalPeek, type TargetPeek } from './ProposalPeek';
import { PinnedNotes } from './PinnedNotes';
import { CombineDialog } from './CombineDialog';
import { AddFromBackupDialog } from './AddFromBackupDialog';
import { pairChoices } from '../shared/combine-pairs';
import type { AddedFromBackup } from '../shared/api';
import type { CombineChoices } from '../shared/combine';
import { FloatingImagePanel, OutlineBarImage } from './FloatingImage';
import { applyImageChange, floatImage } from './floating-image';
import {
  applyChange,
  textWithoutImage,
  togglePin,
  withoutTrashed,
} from './pinned-notes';
import { revealedEdge, type ChromeEdge } from './zen';
import { cycleWritingWidth, toggleTypewriter } from './view-settings';
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
import { dockRoomOf, keyApplies, roomOf, type DockRoom } from './rooms';
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
import { TodoDockPane, useTodoDock } from './TodoDock';
import { useComposerHeight } from './composer-height';
import { TodoList, type TodoDraft } from './TodoList';
import { movedText, trashTitle, TrashView } from './TrashView';
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
        else if (command.type === 'restoreBackup')
          void open(window.shell.restoreBackup);
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
    let shown = { focused: false, splittable: false, toNext: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const prose = focusedProse();
        const now = {
          focused: prose !== null,
          splittable: prose?.view.dom.dataset.split === 'true',
          toNext: prose?.view.dom.dataset.splitNext === 'true',
        };
        if (
          now.focused === shown.focused &&
          now.splittable === shown.splittable &&
          now.toNext === shown.toNext
        ) {
          return;
        }
        shown = now;
        window.shell.showProseFocus(now.focused, now.splittable, now.toNext);
      });
    };
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    // A Scene can become one that can't be split, as when a Conflict comes.
    const splits = new MutationObserver(check);
    splits.observe(document.body, {
      subtree: true,
      attributeFilter: ['data-split', 'data-split-next'],
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
        title="Restore Project from Backup"
        onClick={() => open(window.shell.restoreBackup)}
      >
        Restore from Backup…
      </button>
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
          onOpenSettings={openSettings}
          importing={importing}
          onImportProject={(file, convention) =>
            void importProject(file, convention)
          }
          onCloseImport={() => setImporting(null)}
        />
      ) : welcome ? (
        <Welcome reason={welcome} onDone={() => setWelcome(null)} />
      ) : (
        <StartScreen actions={startButtons} error={error} onOpen={open} />
      )}
      {/* With a Project open, its window offers a new Book too. */}
      {importing && !project && (
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
/** Long enough to read why a Backup wasn't made. */
const BACKUP_TOAST_MS = 12_000;
/** How long the cursor rests before where it is gets remembered. */
const CURSOR_REPORT_MS = 1000;

function ProjectView({
  project,
  error,
  onError,
  onAddProvider,
  onOpenSettings,
  importing,
  onImportProject,
  onCloseImport,
}: {
  project: OpenedProject;
  error: string | null;
  onError(message: string | null): void;
  /** Opens Settings to add an API key for the Assistant. */
  onAddProvider(): void;
  /** Opens Settings, as to choose another Backup folder. */
  onOpenSettings(): void;
  /** The manuscript file being imported, while the Author previews its split. */
  importing: ImportFile | null;
  /** Imports it into a new Project, as with no Project open. */
  onImportProject(file: ImportFile, convention: ImportConvention): void;
  onCloseImport(): void;
}) {
  const [mirror] = useState(
    () => new ProjectMirror(window.project, project, window.assistant),
  );
  useEffect(() => mirror.start(), [mirror]);
  const {
    manuscript,
    entries,
    entriesLoaded,
    trash,
    drawer,
    todos,
    customFields,
    keyFields,
    relations,
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
  const openPart =
    selected?.kind === 'part'
      ? manuscript.parts?.find((p) => p.id === selected.id)
      : undefined;
  const openBook =
    selected?.kind === 'book'
      ? manuscript.books?.find((b) => b.id === selected.id)
      : undefined;
  /** In a Series, the Book holding the Scene being written, if it has one. */
  const writingBook = open
    ? manuscript.books?.find(
        (b) =>
          b.id === bookOf(manuscript, { kind: 'scene', id: open.scene.id }),
      )
    : undefined;
  /** In a Series, the Books in reading order, by title; none otherwise. */
  const seriesBooks = useMemo(
    () => (manuscript.books ?? []).map(({ id, title }) => ({ id, title })),
    [manuscript.books],
  );
  /**
   * In a Series, the Book being written, as `bookBeingWritten` says. A Peek,
   * the Pinned notes and highlighting show the Entries as of it.
   */
  const writtenBook = bookBeingWritten(manuscript, selected);
  // By the Books' order alone: a change elsewhere in the Manuscript, as to
  // a Tag, changes no lens.
  const bookOrder = manuscript.books?.map((b) => b.id).join();
  /** What every lens in the window sees the Story Bible from. */
  const storyBible = useMemo(
    () => ({
      manuscript:
        bookOrder === undefined
          ? {}
          : { books: bookOrder.split(',').map((id) => ({ id })) },
      entries,
      relations,
    }),
    [bookOrder, entries, relations],
  );
  /** The Story Bible as of the Book being written. */
  const writtenLens = useMemo(
    () => storyBibleAsOf(storyBible, writtenBook),
    [storyBible, writtenBook],
  );
  /** The Book the Story Bible Room shows the Entries as of, if the Author chose one. */
  const [bibleBook, setBibleBook] = useState<string | null>(null);
  /** In a Series, the Book the Story Bible Room shows the Entries as of: the one chosen, or the Book being written. */
  const bibleAsOf =
    bibleBook !== null && writtenLens.books.includes(bibleBook)
      ? bibleBook
      : writtenBook;
  /** The Story Bible as the Story Bible Room shows it. */
  const bibleLens = useMemo(
    () => storyBibleAsOf(storyBible, bibleAsOf),
    [storyBible, bibleAsOf],
  );
  /** What the Project Outline is called: in a Series, the Series Outline. */
  const projectOutlineName = manuscript.books
    ? 'Series Outline'
    : 'Project Outline';
  /** What the Project calls a Part, as in “Act”. */
  const partNamed = partName(manuscript.partLabel);
  const [room, setRoom] = useState<Room>('writing');
  /**
   * The Rooms shown so far. Each stays mounted, hidden while another is
   * shown, so that a reply streaming in, a draft, a Conversation or an
   * Entry open there is as the Author left it.
   */
  const [visited, setVisited] = useState<Set<Room>>(() => new Set([room]));
  /** The Entry open in the Story Bible Room, by id. */
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
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
      size: widths[key] ?? DEFAULT_WIDTHS[key],
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
  const saveStatus = useSaveStatus(mirror);
  const { scenes: sceneCounts, setProse } = useSceneCounts(mirror, manuscript);
  /** Whether the open Scene's Snapshots are listed above its Prose. */
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  /** Hear the open Scene's Prose as it changes, as a Snapshot beside it does. */
  const proseListeners = useRef(new Set<Parameters<ListenToProse>[0]>());
  const listenToProse = useCallback<ListenToProse>((listener) => {
    proseListeners.current.add(listener);
    return () => proseListeners.current.delete(listener);
  }, []);
  const onSceneProse = useCallback(
    (sceneId: string, markdown: string) => {
      setProse(sceneId, markdown);
      for (const listener of proseListeners.current) {
        listener(sceneId, markdown);
      }
    },
    [setProse],
  );
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
    switchRoom('writing');
    setTab('manuscript');
    setResolving(null);
    setSelected({ kind: 'scene', id: sceneId });
    setJump(cursor === undefined ? undefined : { sceneId, cursor });
  }

  const quotes = useRef(0);
  /** Opens a Scene with a quote of its Prose selected, as a Finding's. */
  function showQuote(sceneId: string, text: string) {
    switchRoom('writing');
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

  function switchRoom(next: Room) {
    flushPendingEdits();
    setPeek(null);
    setTargetPeek(null);
    setRoom(next);
    setVisited((visited) => new Set(visited).add(next));
  }

  /** The Scene Plan was last asked to open on, from a Beat in Writing. */
  const [planOpening, setPlanOpening] = useState<PlanOpening>();
  /**
   * Writing's Beat chips: which of a Scene's Beats show, and opening Plan on
   * the Scene, its Chapter the focus and the Scene selected.
   */
  const writingBeats = {
    manuscript,
    onOpenPlan(sceneId: string) {
      const shown = sceneBeatsInWriting(manuscript, sceneId);
      if (!shown) return;
      const { chapterId, book } = shown;
      setPlanOpening((last) => ({
        sceneId,
        chapterId,
        book,
        count: (last?.count ?? 0) + 1,
      }));
      enterRoom('plan');
    },
  };

  /** Whether the Prose takes focus back once Writing shows again. */
  const refocusProse = useRef(false);
  /**
   * Switches Room as the Author asked, by the switch or its key. Back in
   * Writing, the cursor is in the Prose where it was left.
   */
  function enterRoom(next: Room) {
    refocusProse.current = next === 'writing' && room !== 'writing';
    switchRoom(next);
  }
  useEffect(() => {
    if (room !== 'writing' || !refocusProse.current) return;
    refocusProse.current = false;
    const prose = writingRoom.current?.querySelector('.prose');
    // TipTap keeps its editor on the element it edits, and its selection.
    (prose as { editor?: Editor } | null | undefined)?.editor?.commands.focus();
  }, [room]);

  /**
   * Opens an Entry in the Story Bible Room, from any Room: a Peek, a Pinned
   * note, an Entry card or a Todo. Writing keeps its Scene and cursor.
   */
  function showEntry(id: string) {
    switchRoom('storyBible');
    setFocusName(null);
    setRevealing(null);
    setOpenEntryId(id);
  }

  /** Opens a Todo's Scene, Chapter, Part or Book in Writing, or its Entry in the Story Bible. */
  function openLink(link: TodoLink) {
    if (link.kind === 'entry') return showEntry(link.id);
    switchRoom('writing');
    setTab('manuscript');
    select({ kind: link.kind, id: link.id });
  }

  /**
   * The Entry or Outline a Proposal's title went to, by its id,
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
   * Goes to a Proposal's target: its Entry, at the field, in the Story Bible
   * Room, or the Outline of its Scene, Chapter or the Project in Writing.
   * The Conversation stays open beside it. Nothing happens once the target
   * is in Trash or gone.
   */
  function goToTarget(target: ProposalTarget, proposalId: string) {
    if (!reachable(target)) return;
    const count = ++revealCount.current;
    if (target.kind === 'entry') {
      showEntry(target.entryId);
      setRevealing({
        id: target.entryId,
        reveal: { field: target.field, proposalId, count },
      });
      return;
    }
    const selection = selectionOf(target.outlineId, manuscript);
    switchRoom('writing');
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
      !!manuscript.parts?.some((part) => part.id === id) ||
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
      ...('book' in proposal &&
        proposal.book !== undefined && { book: proposal.book }),
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
   * Which side panes are docked in Writing, and the Assistant in the Story
   * Bible, rather than collapsed to their edge tabs. In memory for the
   * window, across Room switches.
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
  /** Moves focus to the open Entry's row in the Story Bible list if it is in the Assistant, about to go. */
  function focusEntryOutOfAssistant() {
    if (!document.activeElement?.closest('.assistant-panel')) return;
    bibleRoomElement
      ?.querySelector<HTMLElement>(
        '.left-pane [data-row][aria-current="true"], .left-pane [data-row]',
      )
      ?.focus();
  }
  /**
   * Collapses a side pane, or docks it back at the tab it last showed. Focus
   * in a pane that collapses goes to the Prose, or in the Story Bible to the
   * open Entry's row.
   */
  function togglePane(pane: SidePane) {
    if (docked[pane] && pane === 'assistant' && room === 'storyBible') {
      focusEntryOutOfAssistant();
    } else if (docked[pane]) {
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
  const zen = beforeZen !== null && room === 'writing';
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
  usePaneCycle(writingRoom, room === 'writing');
  /**
   * The Story Bible Room's element, once it is first shown: kept as state,
   * as it mounts after the first render, and given to the pane cycle as a
   * ref to it.
   */
  const [bibleRoomElement, setBibleRoomElement] =
    useState<HTMLDivElement | null>(null);
  const bibleRoom = useMemo(
    () => ({ current: bibleRoomElement }),
    [bibleRoomElement],
  );
  usePaneCycle(bibleRoom, room === 'storyBible');
  /**
   * The Assistant panel, one for Writing and the Story Bible, so that its
   * Conversation, draft and a reply streaming in go with the Author. It is
   * moved into the slot of whichever of them is shown, and stays where it
   * was while another Room is.
   */
  const [assistantHome] = useState(() => {
    const home = document.createElement('div');
    home.className = 'assistant-home';
    return home;
  });
  const writingAssistantSlot = useRef<HTMLDivElement>(null);
  const bibleAssistantSlot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const at = dockRoomOf(room);
    const slot =
      at === 'writing'
        ? writingAssistantSlot.current
        : at === 'storyBible'
          ? bibleAssistantSlot.current
          : null;
    if (slot && assistantHome.parentElement !== slot) {
      slot.appendChild(assistantHome);
    }
  }, [room, visited, assistantHome]);
  // In Book N, every name and alias an Entry has had up to it.
  useEffect(
    () =>
      setMentionEntries(
        writtenLens.all.flatMap((e) => writtenLens.names(e.id) ?? []),
      ),
    [writtenLens],
  );
  const [corkboardView, setCorkboardView] = useCorkboardView();
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
  const [floatingImage, setFloatingImage] = useState(
    project.view.floatingImage,
  );
  /** The Floating image as last changed, for changes made before React renders. */
  const floatingNow = useRef(floatingImage);
  /** Changes the Floating image; `save` remembers it on this computer. */
  const changeFloatingImage = useCallback(
    (next: FloatingImage, save = true) => {
      floatingNow.current = next;
      setFloatingImage(next);
      if (save) window.shell.saveView({ floatingImage: next });
    },
    [],
  );
  /** Floats the Floating image, where it was left. */
  const showFloatingImage = useCallback(() => {
    changeFloatingImage(
      floatImage(floatingNow.current, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [changeFloatingImage]);
  /** Whether the Floating image stacks over the Pinned notes: used last. */
  const [imageOnTop, setImageOnTop] = useState(false);
  const openEntry =
    openEntryId === null
      ? undefined
      : entries.find((e) => e.id === openEntryId);
  /** The latest structure change, while its toast offers to undo it. */
  const [latest, setLatest] = useState<{ message: string; step: number }>();
  /**
   * The step of a Combine while its toast offers to undo it: Undo is
   * offered only there, never later, as by Ctrl+Z once the toast is gone.
   */
  const undoOnlyInToast = useRef<number>(undefined);
  const closeToast = useCallback(() => {
    if (undoable.current === undoOnlyInToast.current) {
      undoable.current = undefined;
    }
    undoOnlyInToast.current = undefined;
    setLatest(undefined);
  }, []);
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

  /** The Trash or Drawer item a Todo's link went to; `count` goes to it again. */
  const [trashReveal, setTrashReveal] = useState<{
    id: string;
    count: number;
  }>();
  const trashReveals = useRef(0);
  useEffect(() => {
    if (tab !== 'trash' && tab !== 'drawer') setTrashReveal(undefined);
  }, [tab]);
  /** Shows a Trash or Drawer item in Writing's tab for it, as a Todo's link to it does. */
  function openTrashItem(id: string) {
    switchRoom('writing');
    setTab(drawer.some((item) => item.id === id) ? 'drawer' : 'trash');
    dockLeftPane();
    setTrashReveal({ id, count: ++trashReveals.current });
  }

  /** What a new Todo in Writing is linked to unless the Author unlinks it: the unit open there. */
  const prelink: TodoLink | null = open
    ? { kind: 'scene', id: open.scene.id }
    : openChapter
      ? { kind: 'chapter', id: openChapter.id }
      : openPart
        ? { kind: 'part', id: openPart.id }
        : openBook
          ? { kind: 'book', id: openBook.id }
          : null;
  /** What a new Todo in the Story Bible is linked to: the Entry open there. */
  const biblePrelink: TodoLink | null = openEntry
    ? { kind: 'entry', id: openEntry.id }
    : null;
  const [todoDock, changeTodoDock] = useTodoDock(project.todoDock);
  const composerHeight = useComposerHeight(project.composerHeight);
  /**
   * The Todo the Author started from elsewhere, while the Todos dock is
   * raised, and the Room whose dock it is in.
   */
  const [todoDraft, setTodoDraft] = useState<{
    room: DockRoom;
    draft: TodoDraft;
  }>();
  const draftIn = (at: DockRoom) =>
    todoDraft?.room === at ? todoDraft.draft : undefined;
  const todoDrafts = useRef(0);
  useEffect(() => {
    if (todoDock.folded) setTodoDraft(undefined);
  }, [todoDock.folded]);
  /**
   * Starts a Todo in the Todos dock of Writing or the Story Bible, raising
   * it, and in Writing docking the left pane if collapsed: New Todo,
   * focused, linked to `link`, holding `text` if given.
   */
  function startTodo(at: DockRoom, link: TodoLink | null, text?: string) {
    if (todoDock.folded) changeTodoDock({ folded: false });
    if (at === 'writing') dockLeftPane();
    setTodoDraft({
      room: at,
      draft: {
        link,
        ...(text !== undefined && { text }),
        count: ++todoDrafts.current,
      },
    });
  }
  /** Starts a Todo in Writing, as its Binder and Corkboards do. */
  const startWritingTodo = (link: TodoLink | null) =>
    startTodo('writing', link);

  /** The unit whose Conflict the centre shows, instead of the selection. */
  const [resolving, setResolving] = useState<UnitRef | null>(null);
  const resolvingConflict =
    resolving && conflicts.find((c) => unitKey(c.ref) === unitKey(resolving));
  const conflicted = new Set(conflicts.map((c) => c.ref.id));
  /** The left pane's tabs; Conflicts shows while there are any, or it is open. */
  const tabs: Tab[] = [
    'manuscript',
    ...(conflicts.length > 0 || tab === 'conflicts'
      ? (['conflicts'] as const)
      : []),
    'trash',
    'drawer',
  ];
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [storyBibleExportOpen, setStoryBibleExportOpen] = useState(false);
  /** The Story Bible being imported, while the Author ticks its Entries. */
  const [storyBibleImport, setStoryBibleImport] =
    useState<StoryBibleFile | null>(null);
  /** The Book, Part, Chapter or Scene whose Tags… is open, by id. */
  const [tagging, setTagging] = useState<string | null>(null);
  /** It, as the Manuscript has it now; gone if it is no longer there. */
  const taggingUnit =
    tagging === null ? undefined : unitOf(tagging, manuscript);
  /** The Book, Part, Chapter or Scene whose Set word target… is open, by id. */
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
        } else if (event.type === 'undoable') {
          changeLatest({ message: event.message, step: event.step });
        } else if (event.type === 'unitReloaded') {
          setReloaded({ ref: event.ref, count: ++reloads.current });
        } else if (
          event.type === 'proposalsChanged' ||
          event.type === 'languageChanged'
        ) {
          // For the views that show Proposals, and the Prose editors.
        } else if (event.type === 'pinnedNotesChanged') {
          // Saved already, by main.
          changePinnedNotes(event.notes, false);
        } else {
          // Main can no longer undo it.
          changeLatest(undefined);
        }
      }),
    [mirror, onError, changeLatest, changePinnedNotes],
  );

  // The Manuscript or Entries showing a change follow from main.
  const setStatus = async (unitId: string, statusId: string | null) => {
    await mirror.run((project) => project.setStatus(unitId, statusId), {
      what: 'set the Status',
    });
  };
  const setWordTarget = async (unitId: string, words: number | null) => {
    await mirror.run((project) => project.setWordTarget(unitId, words), {
      what: 'set the Word target',
    });
  };
  const setTags = async (unitId: string, tags: string[]) => {
    await mirror.run((project) => project.setTags(unitId, tags), {
      what: 'save the Tags',
    });
  };

  /** Runs a structure operation, and offers to undo it; nothing when the Author cancelled it. */
  async function change(
    operation: (project: ProjectApi) => Promise<Changed | null>,
    message: string,
  ) {
    await mirror.run(operation, { undo: message });
  }

  /** Runs a structure operation that makes a unit, as `change` does; its id, if made. */
  async function create(
    operation: (project: ProjectApi) => Promise<Created>,
    message: string,
  ): Promise<string | undefined> {
    return (await mirror.run(operation, { undo: message }))?.id;
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

  /** Whether a Scene that can be split can be split to the next Chapter: never into another Book. */
  function splitsToNext(sceneId: string): boolean {
    const found = allScenes(manuscript).find((s) => s.scene.id === sceneId);
    return (
      !!found?.chapter && splitsToNextChapter(manuscript, found.chapter.id)
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
    // The Prose as cut is what main has, before the split writes over it:
    // `create` flushes it first.
    const id = await create(
      (project) => project.splitScene(sceneId, cut, toNextChapter),
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

  /** Whether an automatic Backup before emptying Trash is being made. */
  const [backingUp, setBackingUp] = useState(false);
  useEffect(() => window.shell.onBackingUp(setBackingUp), []);
  /** The latest automatic Backup that wasn't made; `count` starts its toast's time over. */
  const [backupNotice, setBackupNotice] = useState<
    BackupNotice & { count: number }
  >();
  const backupNotices = useRef(0);
  const closeBackupNotice = useCallback(() => setBackupNotice(undefined), []);
  useEffect(
    () =>
      window.shell.onBackupNotice((notice) =>
        setBackupNotice({ ...notice, count: ++backupNotices.current }),
      ),
    [],
  );

  /** The Part, Chapter or Scene whose title the Binder is editing, if any. */
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
   * The Scene, Chapter, Part or Book a create chord works from: the
   * highlighted one when focus is in the Binder, else the open one.
   */
  function current(): Current {
    const row = document.activeElement?.closest<HTMLElement>(
      '.binder [data-kind]',
    );
    if (row?.dataset.id) {
      const { kind } = row.dataset;
      return {
        kind:
          kind === 'chapter' || kind === 'part' || kind === 'book'
            ? kind
            : 'scene',
        id: row.dataset.id,
      };
    }
    if (selected && selected.kind !== 'project') {
      return { kind: selected.kind, id: selected.id };
    }
    return null;
  }

  async function chooseStoryBibleImport() {
    const choice = await window.shell.chooseStoryBibleImport();
    if (!choice) return;
    if (!choice.ok) {
      onError(choice.message);
      return;
    }
    onError(null);
    const { ok: _, ...file } = choice;
    setStoryBibleImport(file);
  }

  /**
   * Adds the manuscript file as a new Book after the last, as one step the
   * Author can undo.
   */
  async function importBook(file: ImportFile, convention: ImportConvention) {
    onCloseImport();
    const id = await create(
      (project) => project.importBook(file, convention),
      `Imported ${file.name} as a new Book`,
    );
    if (!id) return;
    switchRoom('writing');
    setTab('manuscript');
  }

  /** Adds the Entries the Author ticked, as one step they can undo. */
  async function importEntries(added: NewEntry[], leftOut: number) {
    switchRoom('storyBible');
    await change(
      (project) => project.importEntries(added),
      `Imported ${entryCount(added.length)}` +
        (leftOut > 0 ? `, ${leftOut} left out` : ''),
    );
  }

  async function createEntry(type: EntryType) {
    const label = ENTRY_TYPE_LABELS[type];
    const id = await create(
      (project) => project.createEntry(type, `New ${label}`),
      `${label} created`,
    );
    if (!id) return;
    showEntry(id);
    focusNameOf(id);
  }

  /**
   * Does what the Author chose from the menu bar or with a shortcut; false
   * when it doesn't apply here. Shortcuts work in the Rooms `keyApplies`
   * says; the menus switch to Writing for the rest.
   */
  function run(command: Command): boolean {
    if (command.type === 'room') {
      enterRoom(command.room);
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
    if (command.type === 'importStoryBible') {
      void chooseStoryBibleImport();
      return true;
    }
    if (command.type === 'addBookFromBackup') {
      if (readOnly) return false;
      setAddingFromBackup('choosing');
      return true;
    }
    if (command.type === 'backUp') {
      void window.shell.backUpProject().then((name) => {
        if (name) showNotice(`Backed up as ${name}`);
      });
      return true;
    }
    if (command.type === 'zen') {
      if (room !== 'writing') {
        if (command.byKey) return false;
        // Resumes zen, if the Author left Writing in it.
        switchRoom('writing');
        if (!beforeZen) enterZen();
      } else if (beforeZen) {
        leaveZen();
      } else {
        enterZen();
      }
      return true;
    }
    if (command.type === 'cycleWritingWidth') {
      if (!keyApplies(command, room)) return false;
      cycleWritingWidth();
      return true;
    }
    if (command.type === 'toggleTypewriter') {
      if (!keyApplies(command, room)) return false;
      toggleTypewriter();
      return true;
    }
    if (command.type === 'togglePane') {
      if (!keyApplies(command, room)) {
        if (command.byKey) return false;
        switchRoom('writing');
      }
      togglePane(command.pane);
      return true;
    }
    if (command.type === 'newTodo') {
      if (readOnly) return false;
      if (!keyApplies(command, room)) {
        if (command.byKey) return false;
        switchRoom('writing');
      }
      if (room === 'storyBible') startTodo('storyBible', biblePrelink);
      else startTodo('writing', prelink);
      return true;
    }
    if (command.type === 'splitScene') {
      // Only with the cursor in a Scene's Prose, which is only in Writing.
      const prose = focusedProse();
      const sceneId = prose?.view.dom.dataset.scene;
      if (
        !keyApplies(command, room) ||
        !prose ||
        !sceneId ||
        !splittable(sceneId) ||
        (command.toNextChapter && !splitsToNext(sceneId))
      ) {
        return false;
      }
      void split(sceneId, cutAtSelection(prose), command.toNextChapter);
      return true;
    }
    if (
      command.type !== 'newScene' &&
      command.type !== 'newChapter' &&
      command.type !== 'newBook' &&
      command.type !== 'newEntry'
    ) {
      return false;
    }
    if (readOnly) return false;
    if (!keyApplies(command, room)) {
      if (command.byKey) return false;
      switchRoom('writing');
    }
    if (command.type === 'newScene') {
      const at = sceneInsertion(manuscript, current(), command.above);
      if (!at) return false;
      void create(
        (project) => project.createScene(at.chapterId, at.index),
        'Scene created',
      ).then((id) => {
        if (!id) return;
        setTab('manuscript');
        select({ kind: 'scene', id });
      });
    } else if (command.type === 'newChapter') {
      const at = chapterInsertion(manuscript, current(), command.above);
      void create(
        (project) =>
          project.createChapter(at.index, undefined, at.partId, at.bookId),
        'Chapter created',
      ).then((id) => {
        if (!id) return;
        setTab('manuscript');
        setRenaming(id);
      });
    } else if (command.type === 'newBook') {
      void create((project) => project.createBook(), 'Book created').then(
        (id) => {
          if (!id) return;
          setTab('manuscript');
          setRenaming(id);
        },
      );
    } else if (command.entryType) {
      // From any Room; it opens in the Story Bible.
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
    changeLatest(undefined);
    await mirror.undo(step);
  }

  /** Add a Book from a Backup…, while its dialog is open: before the add, then what was added. */
  const [addingFromBackup, setAddingFromBackup] = useState<
    'choosing' | AddedFromBackup | null
  >(null);

  /** Adds the Backup the Author chooses, as one step they can undo from the dialog. */
  async function addBookFromBackup() {
    const added = await mirror.run((project) => project.addBookFromBackup(), {
      undo: (added) =>
        `Added “${added.name}” as ${added.books.length === 1 ? 'a new Book' : `${added.books.length} new Books`}`,
    });
    if (added) setAddingFromBackup(added);
  }

  /**
   * Combines each pair the Author ticked after an add, the Entry here kept
   * and what the added one says differently from the first added Book on;
   * the way back is the Backup made before the add.
   */
  async function combineAdded(
    pairs: { added: string; here: string }[],
    firstBook: string,
  ) {
    let combined = 0;
    const dropped: string[] = [];
    for (const pair of pairs) {
      const result = await mirror.run(async (project) => {
        const [here, added] = await Promise.all([
          project.read({ kind: 'entry', id: pair.here }),
          project.read({ kind: 'entry', id: pair.added }),
        ]);
        return project.combineEntries(
          pair.here,
          pair.added,
          pairChoices(here, added, customFields, firstBook),
        );
      });
      if (!result) break;
      combined++;
      dropped.push(...result.dropped);
    }
    // Only the Backup made before the add undoes them.
    changeLatest(undefined);
    if (combined === 0) return;
    showNotice(
      `Combined ${combined === 1 ? 'a pair of Entries' : `${combined} pairs of Entries`}` +
        (dropped.length > 0
          ? `; dropped ${dropped.length === 1 ? 'a Relation' : `${dropped.length} Relations`} that broke a rule: ${dropped.join('; ')}`
          : ''),
    );
  }

  /** The Entry Combine with… is open on, if any. */
  const [combining, setCombining] = useState<string | null>(null);
  const combiningEntry = entries.find((e) => e.id === combining);

  /**
   * Combines `otherId` into `keptId`, as one step the Author can undo from
   * its toast only; main makes the other's Pinned note the kept one's.
   */
  async function combineEntries(
    keptId: string,
    otherId: string,
    choices: CombineChoices,
    names: { kept: string; other: string },
  ) {
    const result = await mirror.run(
      (project) => project.combineEntries(keptId, otherId, choices),
      {
        undo: ({ dropped }) =>
          `Combined “${names.other}” into “${names.kept}”` +
          (dropped.length > 0
            ? `; dropped ${dropped.length === 1 ? 'a Relation' : `${dropped.length} Relations`} that broke a rule: ${dropped.join('; ')}`
            : ''),
      },
    );
    if (!result) return;
    undoOnlyInToast.current = result.step;
    showEntry(keptId);
  }

  /**
   * Keeps one version of a unit in Conflict, then opens the unit: an Entry
   * in the Story Bible Room, the rest in Writing.
   */
  async function resolve(ref: UnitRef, kept: UnitValue) {
    if (!(await mirror.resolveConflict(ref, kept))) return;
    setResolving(null);
    if (roomOf(ref) === 'storyBible') {
      showEntry(ref.id);
      return;
    }
    setTab('manuscript');
    select(selectionOf(ref.id, manuscript));
  }

  /**
   * Where the Assistant panel goes in Writing or the Story Bible, between
   * its resizer and its edge tab while collapsed.
   */
  function assistantSlot(slot: RefObject<HTMLDivElement | null>) {
    return (
      <>
        {docked.assistant && (
          <PanelResizer
            label="Assistant width"
            panel="right"
            {...pane('assistant')}
            min={220}
            max={640}
          />
        )}
        <div className="assistant-slot" ref={slot} />
        {!docked.assistant && (
          <div
            role="group"
            aria-label="Assistant, collapsed"
            className="edge-tabs edge-tabs-right"
          >
            <button onClick={() => togglePane('assistant')}>Assistant</button>
          </div>
        )}
      </>
    );
  }

  /** Whether Trash is being emptied, which can't be asked for again meanwhile. */
  const [emptying, setEmptying] = useState(false);
  async function emptyTrash() {
    setEmptying(true);
    try {
      if (await mirror.emptyTrash()) {
        // Nothing before it can be undone.
        changeLatest(undefined);
      }
    } finally {
      setEmptying(false);
    }
  }

  return (
    <ProjectContexts
      mirror={mirror}
      readOnly={readOnly !== null}
      partLabel={manuscript.partLabel}
      customFields={customFields}
      keyFields={keyFields}
      composerHeight={composerHeight}
      storyBible={storyBible}
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
          <div role="group" aria-label="Room" className="mode-switch">
            {ROOMS.map((value) => (
              <button
                key={value}
                aria-pressed={room === value}
                title={withShortcut(ROOM_LABELS[value], SHORTCUTS[value], MAC)}
                onClick={() => enterRoom(value)}
              >
                {ROOM_LABELS[value]}
              </button>
            ))}
          </div>
          <span className="scene-title">
            {room === 'storyBible'
              ? openEntry && entryTitle(openEntry)
              : room !== 'writing'
                ? ''
                : resolvingConflict
                  ? 'Conflict'
                  : open
                    ? [
                        open.chapter?.title ?? 'Unplaced',
                        open.scene.title,
                      ].join(' · ')
                    : openChapter
                      ? openChapter.title
                      : openPart
                        ? openPart.title
                        : openBook
                          ? openBook.title
                          : selected?.kind === 'project' && projectOutlineName}
          </span>
          {room === 'writing' && (
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
              <div className="room" hidden={room !== 'brainstorm'}>
                <BrainstormRoom
                  active={room === 'brainstorm'}
                  names={{ manuscript, entries }}
                  book={writtenBook}
                  pane={pane}
                  onAddProvider={onAddProvider}
                  onOpenEntry={showEntry}
                  todos={
                    <TodoList
                      todos={todos}
                      names={{ manuscript, entries, trash, drawer }}
                      prelink={null}
                      onOpen={openLink}
                      onOpenTrash={openTrashItem}
                    />
                  }
                />
              </div>
            )}
            {visited.has('interview') && (
              <div className="room" hidden={room !== 'interview'}>
                <InterviewRoom
                  active={room === 'interview'}
                  names={{ manuscript, entries }}
                  book={writtenBook}
                  pane={pane}
                  onAddProvider={onAddProvider}
                  onOpenEntry={showEntry}
                />
              </div>
            )}
            {visited.has('plan') && (
              <div className="room" hidden={room !== 'plan'}>
                <PlanRoom
                  active={room === 'plan'}
                  names={{ manuscript, entries }}
                  book={writtenBook}
                  title={project.displayName}
                  language={language}
                  pane={pane}
                  opening={planOpening}
                  onAddProvider={onAddProvider}
                  // Plan has no Todos dock: a Finding's Todo starts in Writing's.
                  onAddTodo={(text, link) => {
                    switchRoom('writing');
                    startTodo('writing', link, text);
                  }}
                />
              </div>
            )}
          </ProposalTargetContext.Provider>
          {visited.has('writing') && (
            <div className="room" hidden={room !== 'writing'} ref={writingRoom}>
              <WritingBeatsContext.Provider value={writingBeats}>
                {!docked.left && (
                  <div
                    role="group"
                    aria-label="Left pane, collapsed"
                    className="edge-tabs edge-tabs-left"
                  >
                    <button onClick={() => dockLeftPaneAt('manuscript')}>
                      Manuscript
                    </button>
                  </div>
                )}
                <aside
                  className="left-pane with-todo-dock"
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
                      <button
                        role="tab"
                        aria-selected={tab === 'drawer'}
                        tabIndex={tab === 'drawer' ? 0 : -1}
                        id="drawer-tab"
                        onClick={() => setTab('drawer')}
                      >
                        Drawer{drawer.length > 0 && ` (${drawer.length})`}
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
                        entries={entries}
                        selected={selected}
                        onSelect={select}
                        conflicted={conflicted}
                        renaming={renaming}
                        onRename={setRenaming}
                        onUndo={undoLatest}
                        statuses={statuses}
                        onSetStatus={(unitId, statusId) =>
                          void setStatus(unitId, statusId)
                        }
                        onEditTags={setTagging}
                        onSetWordTarget={setSettingWordTarget}
                        onAddTodo={startWritingTodo}
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
                        key={tab}
                        place={tab === 'drawer' ? 'drawer' : 'trash'}
                        items={tab === 'drawer' ? drawer : trash}
                        partLabel={manuscript.partLabel}
                        reveal={trashReveal}
                        onRestore={(item) =>
                          change(
                            (project) => project.restore(item.id),
                            item.kind === 'version'
                              ? `Restored ${trashTitle(item)}`
                              : `Restored “${item.title}”`,
                          )
                        }
                        onMove={(item) => {
                          const to = tab === 'drawer' ? 'trash' : 'drawer';
                          return change(
                            (project) =>
                              project.moveBetweenTrashAndDrawer(item.id, to),
                            movedText(item, to),
                          );
                        }}
                        {...(tab === 'trash' && {
                          onEmpty: emptyTrash,
                          emptying,
                        })}
                      />
                    )}
                  </div>
                  <TodoDockPane
                    dock={todoDock}
                    onDock={changeTodoDock}
                    todos={todos}
                    names={{ manuscript, entries, trash, drawer }}
                    prelink={prelink}
                    draft={draftIn('writing')}
                    onOpen={openLink}
                    onOpenTrash={openTrashItem}
                  />
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
                        manuscript={bookManuscript(manuscript, writingBook?.id)}
                        book={writingBook}
                        language={language}
                        writing={{
                          sceneId: open.scene.id,
                          chapterId: open.chapter?.id ?? null,
                        }}
                        width={pane('overview').size}
                        onOpenScene={(id) => select({ kind: 'scene', id })}
                        onOpenChapter={(id) => select({ kind: 'chapter', id })}
                        onOpenPart={(id) => select({ kind: 'part', id })}
                        onOpenBook={(id) => select({ kind: 'book', id })}
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
                    customFields={customFields}
                    onResolve={(kept) => resolve(resolvingConflict.ref, kept)}
                  />
                ) : selected?.kind === 'project' ? (
                  <main className="centre" key={PROJECT_OUTLINE}>
                    <ProjectCorkboard
                      manuscript={manuscript}
                      language={language}
                      reveal={revealIn(PROJECT_OUTLINE)}
                      view={corkboardView}
                      onView={setCorkboardView}
                      onOpenScene={(id) => select({ kind: 'scene', id })}
                      onOpenChapter={(id) => select({ kind: 'chapter', id })}
                      onOpenPart={(id) => select({ kind: 'part', id })}
                      onOpenBook={(id) => select({ kind: 'book', id })}
                      onAddTodo={startWritingTodo}
                    />
                  </main>
                ) : openBook ? (
                  <main className="centre" key={openBook.id}>
                    <BookCorkboard
                      book={openBook}
                      manuscript={manuscript}
                      language={language}
                      reveal={revealIn(openBook.id)}
                      view={corkboardView}
                      onView={setCorkboardView}
                      onOpenScene={(id) => select({ kind: 'scene', id })}
                      onOpenChapter={(id) => select({ kind: 'chapter', id })}
                      onOpenPart={(id) => select({ kind: 'part', id })}
                      onAddTodo={startWritingTodo}
                    />
                  </main>
                ) : openChapter ? (
                  <main className="centre" key={openChapter.id}>
                    <ChapterCorkboard
                      chapter={openChapter}
                      language={language}
                      reveal={revealIn(openChapter.id)}
                      view={corkboardView}
                      onView={setCorkboardView}
                      onOpenScene={(id) => select({ kind: 'scene', id })}
                      onAddTodo={startWritingTodo}
                    />
                  </main>
                ) : openPart ? (
                  <main className="centre" key={openPart.id}>
                    <PartCorkboard
                      part={openPart}
                      // Its Chapters are numbered from its Book's first.
                      manuscript={bookManuscript(manuscript, openPart.book)}
                      language={language}
                      reveal={revealIn(openPart.id)}
                      view={corkboardView}
                      onView={setCorkboardView}
                      onOpenChapter={(id) => select({ kind: 'chapter', id })}
                      onAddTodo={startWritingTodo}
                    />
                  </main>
                ) : !open ? (
                  <div className="editor empty">No Scene open</div>
                ) : open.scene.missing ? (
                  <div className="editor missing" role="status">
                    <p>
                      <strong>{open.scene.title}</strong> is missing, possibly
                      not synced yet. It opens here once its file has arrived.
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
                        <div className="outline-notes-bar-end">
                          <OutlineBarImage
                            scene={open.scene}
                            floating={floatingImage?.on === true}
                            onFloat={showFloatingImage}
                          />
                          <button
                            className="overview-button"
                            aria-pressed={snapshotsOpen}
                            onClick={() => setSnapshotsOpen(!snapshotsOpen)}
                          >
                            Snapshots
                          </button>
                          <button
                            className="overview-button"
                            aria-pressed={overviewOpen}
                            onClick={toggleOverview}
                          >
                            <span aria-hidden="true">☰</span> Overview
                          </button>
                        </div>
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
                    <SceneSnapshots
                      sceneId={open.scene.id}
                      open={snapshotsOpen}
                      inConflict={conflicted.has(open.scene.id)}
                      listen={listenToProse}
                    >
                      <SceneEditor
                        // Its editor's typography is made for one language.
                        key={language}
                        sceneId={open.scene.id}
                        language={language}
                        // Focus goes to the Outline instead, as a Proposal's title asks.
                        autofocus={!revealIn(open.scene.id)}
                        focusAt={
                          jump?.sceneId === open.scene.id
                            ? jump.cursor
                            : undefined
                        }
                        quote={
                          jump?.sceneId === open.scene.id
                            ? jump.quote
                            : undefined
                        }
                        onCursor={reportCursor}
                        onProse={onSceneProse}
                        onSelection={onSelection}
                        splittable={splittable(open.scene.id)}
                        splitsToNext={splitsToNext(open.scene.id)}
                      />
                    </SceneSnapshots>
                  </main>
                )}
                {assistantSlot(writingAssistantSlot)}
              </WritingBeatsContext.Provider>
            </div>
          )}
          {visited.has('storyBible') && (
            <div
              className="room"
              hidden={room !== 'storyBible'}
              ref={setBibleRoomElement}
            >
              <aside
                className="left-pane with-todo-dock"
                aria-label="Story Bible list"
                style={{ width: binderWidth }}
              >
                <div className="left-pane-list">
                  <StoryBible
                    entries={bibleLens.all}
                    relations={bibleLens.relations}
                    books={seriesBooks}
                    asOf={bibleLens.book}
                    onAsOf={setBibleBook}
                    openId={openEntry?.id ?? null}
                    conflicted={conflicted}
                    onOpen={showEntry}
                    onRename={(id) => {
                      showEntry(id);
                      focusNameOf(id);
                    }}
                    onCreate={(type) => void createEntry(type)}
                    onUndo={undoLatest}
                    highlight={highlight}
                    onHighlight={(on) => {
                      setHighlight(on);
                      window.shell.setHighlightMentions(on);
                    }}
                    onAddTodo={(id) =>
                      startTodo('storyBible', { kind: 'entry', id })
                    }
                    onCombine={setCombining}
                  />
                </div>
                <TodoDockPane
                  dock={todoDock}
                  onDock={changeTodoDock}
                  todos={todos}
                  names={{ manuscript, entries, trash, drawer }}
                  prelink={biblePrelink}
                  draft={draftIn('storyBible')}
                  onOpen={openLink}
                  onOpenTrash={openTrashItem}
                />
              </aside>
              <PanelResizer
                label="Story Bible list width"
                min={160}
                max={600}
                {...pane('binder')}
              />
              {/* A new key per Entry: leaving one unmounts its editors, which
            flushes their pending edits. */}
              {openEntry ? (
                <EntryView
                  // A type change rewrites its description and fields: show
                  // them anew; so does seeing it as of another Book, or the
                  // Books reordered.
                  key={`${openEntry.id}:${openEntry.type}:${bibleLens.book}:${bibleLens.books.join()}`}
                  entry={bibleLens.summary(openEntry.id) ?? openEntry}
                  lens={bibleLens}
                  onOpenEntry={showEntry}
                  language={language}
                  books={seriesBooks}
                  onFirstAppears={(bookId) =>
                    void mirror.run(
                      (project) =>
                        project.setFirstAppears(openEntry.id, bookId),
                      { what: 'save the Book it first appears in' },
                    )
                  }
                  focusName={
                    focusName?.id === openEntry.id ? focusName.count : undefined
                  }
                  reveal={revealIn(openEntry.id)}
                  onType={(type) =>
                    change(
                      (project) => project.setEntryType(openEntry.id, type),
                      `Type changed to ${ENTRY_TYPE_LABELS[type]}`,
                    )
                  }
                  onVisibility={(visibility) =>
                    change(
                      (project) =>
                        project.setEntryVisibility(openEntry.id, visibility),
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
              )}
              {assistantSlot(bibleAssistantSlot)}
            </div>
          )}
          {createPortal(
            <ProposalTargetContext.Provider
              value={(proposal, target) => goToTarget(target, proposal.id)}
            >
              <AssistantPanel
                active={dockRoomOf(room) !== null}
                docked={docked.assistant}
                onCollapse={() => togglePane('assistant')}
                width={pane('assistant').size}
                onAddProvider={onAddProvider}
                // A Review or a message is about the Scene open in Writing, shown.
                sceneId={
                  room === 'writing' && open && !open.scene.missing
                    ? open.scene.id
                    : null
                }
                names={{ manuscript, entries }}
                show={showProposal}
                onQuote={showQuote}
                onAddTodo={(text, link) =>
                  startTodo(dockRoomOf(room) ?? 'writing', link, text)
                }
              />
            </ProposalTargetContext.Provider>,
            assistantHome,
          )}
        </div>
        <StatusBar
          saveStatus={saveStatus}
          notice={
            backingUp ? 'Backing up before emptying Trash…' : notice?.text
          }
          {...statusCounts({
            manuscript,
            scenes: sceneCounts,
            open:
              room !== 'writing' || resolvingConflict
                ? null
                : open
                  ? { kind: 'scene', id: open.scene.id }
                  : openChapter
                    ? { kind: 'chapter', id: openChapter.id }
                    : openPart
                      ? { kind: 'part', id: openPart.id }
                      : openBook
                        ? { kind: 'book', id: openBook.id }
                        : selected?.kind === 'project'
                          ? { kind: 'project' }
                          : null,
            selection: room === 'writing' ? selectionCounts : null,
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
            lens={writtenLens}
            pinned={pinnedNotes.map((note) => note.entryId)}
            onOpen={showEntry}
            onTogglePin={(id, card) =>
              changePinnedNotes(
                togglePin(notesNow.current, id, {
                  x: card.left,
                  y: card.top,
                }),
              )
            }
            onClose={closePeek}
          />
        )}
        {targetPeek && room !== 'writing' && (
          <ProposalPeek
            peek={targetPeek}
            onOpen={() => goToTarget(targetPeek.target, targetPeek.proposalId)}
            onClose={closeTargetPeek}
          />
        )}
        {/* Writing only: hidden in the other Rooms, back on return. */}
        {room === 'writing' && (
          <PinnedNotes
            notes={pinnedNotes}
            lens={writtenLens}
            foldedImage={foldedNoteImage}
            onChange={(entryId, change, save) => {
              if (change.type === 'raise') setImageOnTop(false);
              changePinnedNotes(
                applyChange(notesNow.current, entryId, change),
                save,
              );
            }}
            onOpen={showEntry}
          >
            {/* While a Scene is open: not on a Corkboard or an Entry. */}
            {floatingImage?.on &&
              !resolvingConflict &&
              open &&
              !open.scene.missing && (
                <FloatingImagePanel
                  image={floatingImage}
                  scene={open.scene}
                  onTop={imageOnTop}
                  onChange={(change, save) => {
                    const now = floatingNow.current;
                    if (now) {
                      changeFloatingImage(applyImageChange(now, change), save);
                    }
                  }}
                  onRaise={() => setImageOnTop(true)}
                />
              )}
          </PinnedNotes>
        )}
        {taggingUnit && (
          <TagsDialog
            unitName={`${unitKindName(taggingUnit.kind, partNamed)} “${taggingUnit.node.title}”`}
            tags={taggingUnit.node.tags ?? NO_TAGS}
            onChange={(tags) => setTags(taggingUnit.node.id, tags)}
            onClose={() => setTagging(null)}
          />
        )}
        {wordTargetUnit && (
          <WordTargetDialog
            unitName={`${unitKindName(wordTargetUnit.kind, partNamed)} “${wordTargetUnit.node.title}”`}
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
            book={writtenBook}
            onClose={() => setExportOpen(false)}
          />
        )}
        {importing && (
          <ImportDialog
            file={importing}
            onImport={(convention) => onImportProject(importing, convention)}
            onImportBook={
              readOnly === null
                ? (convention) => void importBook(importing, convention)
                : undefined
            }
            onClose={onCloseImport}
          />
        )}
        {storyBibleImport && (
          <ImportStoryBibleDialog
            file={storyBibleImport}
            entries={entries}
            customFields={customFields}
            onImport={(added, leftOut) => void importEntries(added, leftOut)}
            onClose={() => setStoryBibleImport(null)}
          />
        )}
        {addingFromBackup && (
          <AddFromBackupDialog
            added={addingFromBackup === 'choosing' ? null : addingFromBackup}
            entries={entries}
            firstBookTitle={
              addingFromBackup === 'choosing'
                ? undefined
                : seriesBooks.find((b) => b.id === addingFromBackup.books[0])
                    ?.title
            }
            onChoose={() => void addBookFromBackup()}
            onUndo={() => {
              if (addingFromBackup !== 'choosing') {
                void undo(addingFromBackup.step);
              }
              setAddingFromBackup(null);
            }}
            onCombine={(pairs) => {
              if (addingFromBackup === 'choosing') return;
              void combineAdded(pairs, addingFromBackup.books[0]);
            }}
            onClose={() => setAddingFromBackup(null)}
          />
        )}
        {combiningEntry && (
          <CombineDialog
            entry={combiningEntry}
            entries={entries}
            relations={relations}
            customFields={customFields}
            books={seriesBooks}
            onCombine={(keptId, otherId, choices, names) =>
              void combineEntries(keptId, otherId, choices, names)
            }
            onClose={() => setCombining(null)}
          />
        )}
        {storyBibleExportOpen && (
          <ExportStoryBibleDialog
            books={manuscript.books}
            book={writtenBook}
            onClose={() => setStoryBibleExportOpen(false)}
          />
        )}
        {projectSettingsOpen && (
          <ProjectSettingsDialog
            displayName={project.displayName}
            language={language}
            foldedNoteImage={foldedNoteImage}
            partLabel={manuscript.partLabel}
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
          {backupNotice && (
            <Toast
              key={`backup-${backupNotice.count}`}
              message={backupNotice.message}
              ms={BACKUP_TOAST_MS}
              {...(backupNotice.offerSettings && {
                action: { label: 'Open Settings', run: onOpenSettings },
              })}
              onClose={closeBackupNotice}
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
type Tab = 'manuscript' | 'conflicts' | 'trash' | 'drawer';

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

/** The Book, Part, Chapter or Scene of `id` in `manuscript`, if it is there. */
function unitOf(
  id: string,
  manuscript: Manuscript,
):
  | { kind: 'book'; node: ManuscriptBook }
  | { kind: 'part'; node: ManuscriptPart }
  | { kind: 'chapter'; node: ManuscriptChapter }
  | { kind: 'scene'; node: ManuscriptScene }
  | undefined {
  const book = manuscript.books?.find((b) => b.id === id);
  if (book) return { kind: 'book', node: book };
  const part = manuscript.parts?.find((p) => p.id === id);
  if (part) return { kind: 'part', node: part };
  const chapter = manuscript.chapters.find((c) => c.id === id);
  if (chapter) return { kind: 'chapter', node: chapter };
  const found = allScenes(manuscript).find(({ scene }) => scene.id === id);
  return found && { kind: 'scene', node: found.scene };
}

/** A Book, a Part, as the Project calls it, a Chapter or a Scene, as in a dialog's title. */
function unitKindName(
  kind: 'book' | 'part' | 'chapter' | 'scene',
  partNamed: string,
): string {
  if (kind === 'book') return 'Book';
  return kind === 'part' ? partNamed : kind === 'chapter' ? 'Chapter' : 'Scene';
}

/**
 * What Writing opens for the id of a Scene, Outline or Notes, as once its
 * Conflict is resolved: the Book, Part, Chapter or Scene it belongs to, or
 * the Project.
 */
function selectionOf(id: string, manuscript: Manuscript): Selection {
  if (id === PROJECT_OUTLINE) return { kind: 'project' };
  if (manuscript.books?.some((b) => b.id === id)) return { kind: 'book', id };
  if (manuscript.parts?.some((p) => p.id === id)) return { kind: 'part', id };
  return manuscript.chapters.some((c) => c.id === id)
    ? { kind: 'chapter', id }
    : { kind: 'scene', id };
}
