import { useEffect, useState, type ReactNode } from 'react';
import type { OpenResult, RecentProject } from '../shared/api';

type Props = {
  actions: ReactNode;
  error: string | null;
  /** Runs an open action and shows its result. */
  onOpen(action: () => Promise<OpenResult>): Promise<void>;
};

/** Shown by a window with no Project: the open actions and the recent list. */
export function StartScreen({ actions, error, onOpen }: Props) {
  const [recent, setRecent] = useState<RecentProject[]>([]);

  const refresh = () => window.shell.recentProjects().then(setRecent);
  useEffect(() => {
    void refresh();
  }, []);

  async function open(action: () => Promise<OpenResult>) {
    await onOpen(action);
    // An entry may have turned out gone, or moved.
    await refresh();
  }

  return (
    <main className="start">
      <h1>Writing Tools</h1>
      <div className="start-actions">{actions}</div>
      {error && <p role="alert">{error}</p>}
      {recent.length > 0 && (
        <section className="recent" aria-labelledby="recent-heading">
          <h2 id="recent-heading">Recent Projects</h2>
          <ul>
            {recent.map((project) => (
              <li
                key={project.path}
                className={project.found ? undefined : 'recent-gone'}
              >
                {project.found ? (
                  <button
                    className="recent-open"
                    title={project.path}
                    onClick={() =>
                      open(() => window.shell.openRecent(project.path))
                    }
                  >
                    <span className="recent-name">{project.displayName}</span>
                    <span className="recent-path">{project.path}</span>
                  </button>
                ) : (
                  <>
                    <span className="recent-open" title={project.path}>
                      <span className="recent-name">{project.displayName}</span>
                      <span className="recent-path">
                        Not found · {project.path}
                      </span>
                    </span>
                    <button
                      aria-label={`Locate ${project.displayName}…`}
                      onClick={() =>
                        open(() => window.shell.locateProject(project.path))
                      }
                    >
                      Locate…
                    </button>
                    <button
                      aria-label={`Remove ${project.displayName}`}
                      onClick={async () =>
                        setRecent(await window.shell.removeRecent(project.path))
                      }
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
