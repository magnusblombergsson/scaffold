import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Changed, OpenedProject, OpenResult } from '../shared/api';
import {
  PROJECT_OUTLINE,
  type Manuscript,
  type ManuscriptChapter,
  type ManuscriptScene,
  type TrashItem,
} from '../shared/project-types';
import { Binder, type Selection } from './Binder';
import { OutlineNotes } from './OutlineNotes';
import { PanelResizer } from './PanelResizer';
import { flushPendingEdits } from './pending-edits';
import { SceneEditor } from './SceneEditor';
import { StartScreen } from './StartScreen';
import { TrashView } from './TrashView';
import { UndoToast } from './UndoToast';
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

  useEffect(() => {
    if (openSceneId) window.shell.saveView({ lastSceneId: openSceneId });
  }, [openSceneId]);
  useEffect(() => forgetUnitEditors, []);

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
        <span className="header-actions">{headerActions}</span>
      </header>
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
                onSelect={setSelected}
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
              synced yet. Reopen the Project once the file has arrived.
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
            <SceneEditor sceneId={open.scene.id} language={project.language} />
          </main>
        )}
      </div>
      {latest && (
        <UndoToast
          key={latest.step}
          message={latest.message}
          onUndo={() => undo(latest.step)}
          onClose={closeToast}
        />
      )}
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
