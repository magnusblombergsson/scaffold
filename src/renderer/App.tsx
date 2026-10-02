import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Changed,
  Conflict,
  Dropped,
  OpenedProject,
  OpenResult,
  Tip,
} from '../shared/api';
import {
  ENTRY_TYPE_LABELS,
  PROJECT_OUTLINE,
  unitKey,
  type EntrySummary,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type TrashItem,
  type UnitRef,
  type UnitValue,
} from '../shared/project-types';
import { upgradedMessage } from '../shared/format-gate';
import { capitalized, unitName } from '../shared/unit-name';
import { AssistantPanel } from './AssistantPanel';
import { Binder, type Selection } from './Binder';
import { ConflictList, ConflictResolver } from './Conflicts';
import { EntryView, VISIBILITY_LABELS } from './EntryView';
import { Notices } from './Notices';
import { OutlineNotes } from './OutlineNotes';
import { PanelResizer } from './PanelResizer';
import {
  onMentionClick,
  setMentionEntries,
  setMentionHighlighting,
  type MentionClick,
} from './mention-highlight';
import { MentionPeek } from './MentionPeek';
import { flushPendingEdits } from './pending-edits';
import { ReadOnlyContext } from './read-only';
import { SaveFailureBanner, SaveIndicator, useSaveStatus } from './SaveStatus';
import { SceneEditor } from './SceneEditor';
import { SettingsDialog } from './SettingsDialog';
import { StartScreen } from './StartScreen';
import { entryTitle, StoryBible } from './StoryBible';
import { trashTitle, TrashView } from './TrashView';
import { Toast } from './Toast';
import { forgetUnitEditors } from './unit-editors';
import { Welcome } from './Welcome';

export function App() {
  /** Undefined until main says what this window shows. */
  const [project, setProject] = useState<OpenedProject | null>();
  const [error, setError] = useState<string | null>(null);
  /** Undefined until main says whether to welcome the Author. */
  const [welcome, setWelcome] = useState<boolean>();
  /** Open while set; `addKey` opens it at the form for adding a key. */
  const [settingsDialog, setSettingsDialog] = useState<{
    addKey: boolean;
  } | null>(null);
  const openSettings = () => setSettingsDialog({ addKey: false });
  const addKey = useCallback(() => setSettingsDialog({ addKey: true }), []);

  useEffect(() => window.shell.onFlushRequest(flushPendingEdits), []);
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

  const startButtons = (
    <>
      <button onClick={() => open(window.shell.createProject)}>
        New Project…
      </button>
      <button onClick={() => open(window.shell.openProject)}>
        Open Project…
      </button>
      <button onClick={openSettings}>Settings…</button>
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
          headerActions={startButtons}
          onAddKey={addKey}
        />
      ) : welcome ? (
        <Welcome onDone={() => setWelcome(false)} />
      ) : (
        <StartScreen actions={startButtons} error={error} onOpen={open} />
      )}
      {settingsDialog && (
        <SettingsDialog
          addKey={settingsDialog.addKey}
          onClose={() => setSettingsDialog(null)}
        />
      )}
    </>
  );
}

const DEFAULT_BINDER_WIDTH = 256;
/** How long a structure change can be undone from its toast. */
const UNDO_TOAST_MS = 10_000;
const RELOADED_TOAST_MS = 5000;
/** How long the cursor rests before where it is gets remembered. */
const CURSOR_REPORT_MS = 1000;

function ProjectView({
  project,
  error,
  onError,
  headerActions,
  onAddKey,
}: {
  project: OpenedProject;
  error: string | null;
  onError(message: string | null): void;
  headerActions: ReactNode;
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
  const [binderWidth, setBinderWidth] = useState(
    project.view.panelWidths?.binder ?? DEFAULT_BINDER_WIDTH,
  );
  const [outlineNotesOpen, setOutlineNotesOpen] = useState(
    project.view.outlineNotesOpen ?? true,
  );
  const saveStatus = useSaveStatus();
  /** Where to put the cursor in a Scene as it opens, as where the Author left it. */
  const [jump, setJump] = useState<
    { sceneId: string; cursor: number } | undefined
  >(() => {
    const { lastSceneId, cursor } = project.view;
    return lastSceneId && cursor !== undefined
      ? { sceneId: lastSceneId, cursor }
      : undefined;
  });
  const [tips, setTips] = useState<Tip[]>([]);

  function select(selection: Selection) {
    setJump(undefined);
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

  function toggleOutlineNotes() {
    setOutlineNotesOpen(!outlineNotesOpen);
    window.shell.saveView({ outlineNotesOpen: !outlineNotesOpen });
  }

  const [tab, setTab] = useState<
    'manuscript' | 'bible' | 'conflicts' | 'trash'
  >('manuscript');
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  useEffect(() => {
    void window.project.listEntries().then(setEntries);
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
  const openEntry =
    selected?.kind === 'entry'
      ? entries.find((e) => e.id === selected.id)
      : undefined;
  const [trash, setTrash] = useState<TrashItem[]>([]);
  /** The latest structure change, while it can still be undone. */
  const [latest, setLatest] = useState<{ message: string; step: number }>();
  const closeToast = useCallback(() => setLatest(undefined), []);

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
  useEffect(() => {
    void window.project.listConflicts().then(setConflicts);
  }, []);
  const [dropped, setDropped] = useState<Dropped[]>(project.dropped);
  /** Set once a newer app has upgraded the Project, after which nothing is saved. */
  const [readOnly, setReadOnly] = useState(project.readOnly);

  /** The latest unit another computer changed; `count` starts its toast's time over. */
  const [reloaded, setReloaded] = useState<{ ref: UnitRef; count: number }>();
  const reloads = useRef(0);
  const closeReloaded = useCallback(() => setReloaded(undefined), []);
  useEffect(
    () =>
      window.project.subscribe((event) => {
        if (event.type === 'structureChanged') {
          setManuscript(event.manuscript);
          const lost = event.dropped;
          if (lost) setDropped((dropped) => [...dropped, ...lost]);
          // Main can no longer undo it.
          setLatest(undefined);
          void refreshTrash();
        } else if (event.type === 'unitReloaded') {
          setReloaded({ ref: event.ref, count: ++reloads.current });
        } else if (event.type === 'conflictsChanged') {
          setConflicts(event.conflicts);
        } else if (event.type === 'entriesChanged') {
          setEntries(event.entries);
        } else if (event.type === 'readOnly') {
          // Main still takes edits for a moment: these are the last.
          flushPendingEdits();
          setReadOnly({ ...(event.host && { host: event.host }) });
          // Main can no longer undo it.
          setLatest(undefined);
        }
      }),
    [refreshTrash],
  );

  /** Runs a structure operation, and offers to undo it. */
  async function change(operation: () => Promise<Changed>, message: string) {
    // Edits reach main before the structure changes under them.
    flushPendingEdits();
    try {
      const result = await operation();
      setManuscript(result.manuscript);
      setLatest({ message, step: result.step });
      onError(null);
    } catch (error) {
      onError(`Can't make that change: ${(error as Error).message}`);
    }
    await refreshTrash();
  }

  async function undo(step: number) {
    flushPendingEdits();
    setLatest(undefined);
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
      setLatest(undefined);
      await refreshTrash();
    }
  }

  return (
    <ReadOnlyContext.Provider value={readOnly !== null}>
      <div className="project-view">
        <header>
          <span className="project-name">{project.displayName}</span>
          <span className="scene-title">
            {resolvingConflict
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
          <SaveIndicator {...saveStatus} />
          <span className="header-actions">{headerActions}</span>
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
          <aside className="left-pane" style={{ width: binderWidth }}>
            <div role="tablist" className="tabs">
              <button
                role="tab"
                aria-selected={tab === 'manuscript'}
                id="manuscript-tab"
                onClick={() => setTab('manuscript')}
              >
                Manuscript
              </button>
              <button
                role="tab"
                aria-selected={tab === 'bible'}
                id="bible-tab"
                onClick={() => setTab('bible')}
              >
                Story Bible
              </button>
              {(conflicts.length > 0 || tab === 'conflicts') && (
                <button
                  role="tab"
                  aria-selected={tab === 'conflicts'}
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
                />
              ) : tab === 'bible' ? (
                <StoryBible
                  entries={entries}
                  openId={openEntry?.id ?? null}
                  onOpen={(id) => select({ kind: 'entry', id })}
                  onChange={change}
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
            width={binderWidth}
            min={160}
            max={600}
            onResize={setBinderWidth}
            onResized={(width) =>
              window.shell.saveView({ panelWidths: { binder: width } })
            }
          />
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
              <h2 className="centre-title">Project Outline</h2>
              <OutlineNotes
                unitId={PROJECT_OUTLINE}
                language={project.language}
                withNotes={false}
              />
            </main>
          ) : selected?.kind === 'entry' ? (
            openEntry ? (
              <EntryView
                // A type change rewrites its description and fields: read them anew.
                key={`${openEntry.id}:${openEntry.type}`}
                entry={openEntry}
                entries={entries}
                language={project.language}
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
              />
            ) : (
              <div className="editor empty">No Entry open</div>
            )
          ) : openChapter ? (
            <main className="centre" key={openChapter.id}>
              <h2 className="centre-title">{openChapter.title}</h2>
              <OutlineNotes
                unitId={openChapter.id}
                language={project.language}
                withNotes
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
              <section className="outline-notes" aria-label="Outline & Notes">
                <button
                  className="outline-notes-toggle"
                  aria-expanded={outlineNotesOpen}
                  onClick={toggleOutlineNotes}
                >
                  <span aria-hidden="true">{outlineNotesOpen ? '▾' : '▸'}</span>{' '}
                  Outline & Notes
                </button>
                {outlineNotesOpen && (
                  <OutlineNotes
                    unitId={open.scene.id}
                    language={project.language}
                    withNotes
                  />
                )}
              </section>
              <SceneEditor
                sceneId={open.scene.id}
                language={project.language}
                focusAt={
                  jump?.sceneId === open.scene.id ? jump.cursor : undefined
                }
                onCursor={reportCursor}
              />
            </main>
          )}
          <AssistantPanel onAddKey={onAddKey} />
        </div>
        {peek && (
          <MentionPeek
            peek={peek}
            onOpen={(id) => {
              setTab('bible');
              select({ kind: 'entry', id });
            }}
            onClose={closePeek}
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
