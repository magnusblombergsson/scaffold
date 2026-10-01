import { useEffect, useState, type ReactNode } from 'react';
import type { Created, OpenedProject, OpenResult } from '../shared/api';
import type {
  Manuscript,
  ManuscriptChapter,
  ManuscriptScene,
} from '../shared/project-types';
import { Binder } from './Binder';
import { flushPendingEdits } from './pending-edits';
import { SceneEditor } from './SceneEditor';

export function App() {
  const [project, setProject] = useState<OpenedProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => window.shell.onFlushRequest(flushPendingEdits), []);

  async function open(action: () => Promise<OpenResult>) {
    // The current Project's edits must reach main before it is replaced.
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

  if (!project) {
    return (
      <main className="start">
        <h1>Writing Tools</h1>
        <div className="start-actions">{startButtons}</div>
        {error && <p role="alert">{error}</p>}
      </main>
    );
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
  const [openSceneId, setOpenSceneId] = useState(
    () => allScenes(project.manuscript)[0]?.scene.id ?? null,
  );
  const open = allScenes(manuscript).find((s) => s.scene.id === openSceneId);

  async function change(operation: () => Promise<Manuscript | Created>) {
    try {
      const result = await operation();
      setManuscript('manuscript' in result ? result.manuscript : result);
      onError(null);
    } catch (error) {
      onError(`Can't change the Manuscript: ${(error as Error).message}`);
    }
  }

  return (
    <div className="project-view">
      <header>
        <span className="project-name">{project.displayName}</span>
        <span className="scene-title">
          {open &&
            [open.chapter?.title ?? 'Unplaced', open.scene.title].join(' · ')}
        </span>
        <span className="header-actions">{headerActions}</span>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="project-body">
        <aside className="left-pane">
          <div role="tablist" className="tabs">
            <button role="tab" aria-selected="true" id="manuscript-tab">
              Manuscript
            </button>
          </div>
          <div role="tabpanel" aria-labelledby="manuscript-tab">
            <Binder
              manuscript={manuscript}
              openSceneId={openSceneId}
              onOpenScene={setOpenSceneId}
              onChange={change}
            />
          </div>
        </aside>
        {!open ? (
          <div className="editor empty">No Scene open</div>
        ) : open.scene.missing ? (
          <div className="editor missing" role="status">
            <p>
              <strong>{open.scene.title}</strong> is missing, possibly not
              synced yet. Reopen the Project once the file has arrived.
            </p>
          </div>
        ) : (
          // A new key per Scene: leaving one unmounts its editor, which
          // flushes its pending edits.
          <SceneEditor
            key={open.scene.id}
            sceneId={open.scene.id}
            language={project.language}
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
