import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Changed, OpenedProject, OpenResult, Tip } from '../shared/api';
import {
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type TrashItem,
  type UnitRef,
} from '../shared/project-types';
import { unitName } from '../shared/unit-name';
import { Binder, type Selection } from './Binder';
import { Notices } from './Notices';
import { OutlineNotes } from './OutlineNotes';
import { PanelResizer } from './PanelResizer';
import { flushPendingEdits } from './pending-edits';
import { SaveFailureBanner, SaveIndicator, useSaveStatus } from './SaveStatus';
import { SceneEditor } from './SceneEditor';
import { StartScreen } from './StartScreen';
import { TrashView } from './TrashView';
import { Toast } from './Toast';
import { forgetUnitEditors } from './unit-editors';

export function App() {
  /** Undefined until main says what this window shows. */
  const [project, setProject] = useState<OpenedProject | null>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => window.shell.onFlushRequest(flushPendingEdits), []);
  useEffect(() => {
    void window.shell.currentProject().then(setProject);
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
    </>
  );

  if (project === undefined) return null;
  if (!project) {
    return <StartScreen actions={startButtons} error={error} onOpen={open} />;
  }

  return (
    <ProjectView
      project={project}
      error={error}
      onError={setError}
      headerActions={startButtons}
    />
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
}: {
  project: OpenedProject;
  error: string | null;
  onError(message: string | null): void;
  headerActions: ReactNode;
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
    setSelected(selection);
  }

  function continueAt(sceneId: string, cursor?: number) {
    setTab('manuscript');
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

  const [tab, setTab] = useState<'manuscript' | 'trash'>('manuscript');
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

  /** The latest unit another computer changed; `count` starts its toast's time over. */
  const [reloaded, setReloaded] = useState<{ ref: UnitRef; count: number }>();
  const reloads = useRef(0);
  const closeReloaded = useCallback(() => setReloaded(undefined), []);
  useEffect(
    () =>
      window.project.subscribe((event) => {
        if (event.type === 'structureChanged') {
          setManuscript(event.manuscript);
          // Main can no longer undo it.
          setLatest(undefined);
          void refreshTrash();
        } else if (event.type === 'unitReloaded') {
          setReloaded({ ref: event.ref, count: ++reloads.current });
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
      onError(`Can't change the Manuscript: ${(error as Error).message}`);
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

  async function emptyTrash() {
    if (await window.project.emptyTrash()) {
      // Nothing before it can be undone.
      setLatest(undefined);
      await refreshTrash();
    }
  }

  return (
    <div className="project-view">
      <header>
        <span className="project-name">{project.displayName}</span>
        <span className="scene-title">
          {open
            ? [open.chapter?.title ?? 'Unplaced', open.scene.title].join(' · ')
            : openChapter
              ? openChapter.title
              : selected?.kind === 'project' && 'Project Outline'}
        </span>
        <SaveIndicator {...saveStatus} />
        <span className="header-actions">{headerActions}</span>
      </header>
      <SaveFailureBanner
        statuses={saveStatus.statuses}
        manuscript={manuscript}
      />
      <Notices
        sessions={project.sessions}
        manuscript={manuscript}
        tips={tips}
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
                onChange={change}
              />
            ) : (
              <TrashView
                items={trash}
                onRestore={(item) =>
                  change(
                    () => window.project.restore(item.id),
                    `Restored “${item.title}”`,
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
        {selected?.kind === 'project' ? (
          <main className="centre" key={PROJECT_OUTLINE}>
            <h2 className="centre-title">Project Outline</h2>
            <OutlineNotes
              unitId={PROJECT_OUTLINE}
              language={project.language}
              withNotes={false}
            />
          </main>
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
      </div>
      <div className="toasts">
        {reloaded && (
          <Toast
            key={`reloaded-${reloaded.count}`}
            message={`${capitalized(unitName(reloaded.ref, manuscript))} updated from another computer`}
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

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
