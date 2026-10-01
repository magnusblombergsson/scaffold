import { useEffect, useState } from 'react';
import type { OpenedProject, OpenResult } from '../shared/api';
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

  // The binder comes later; for now the first Scene is always open.
  const chapter = project.tree.chapters[0];
  const scene = chapter.scenes[0];
  return (
    <div className="project-view">
      <header>
        <span className="project-name">{project.displayName}</span>
        <span className="scene-title">
          {chapter.title} · {scene.title}
        </span>
        <span className="header-actions">{startButtons}</span>
      </header>
      {error && <p role="alert">{error}</p>}
      <SceneEditor
        key={scene.id}
        sceneId={scene.id}
        language={project.language}
      />
    </div>
  );
}
