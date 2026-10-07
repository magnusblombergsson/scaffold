import { useCallback, useEffect, useRef, useState } from 'react';
import type { Manuscript } from '../shared/project-types';
import { SaveIndicator } from './SaveStatus';
import type { SaveStatuses } from './save-status';
import {
  formatCounts,
  proseCounts,
  type Counts,
  type ShownCounts,
} from './word-count';

/**
 * Each Scene's counts, by id: read from main once, then kept as the Author
 * types (`setProse`) or another computer changes the Scene.
 */
export function useSceneCounts(manuscript: Manuscript): {
  scenes: ReadonlyMap<string, Counts>;
  setProse(sceneId: string, markdown: string): void;
} {
  const [scenes, setScenes] = useState<ReadonlyMap<string, Counts>>(
    () => new Map(),
  );
  const setProse = useCallback(
    (sceneId: string, markdown: string) =>
      setScenes((scenes) =>
        new Map(scenes).set(sceneId, proseCounts(markdown)),
      ),
    [],
  );

  /** Scenes read, or being read; one that couldn't be is tried again on the next change. */
  const asked = useRef(new Set<string>());
  useEffect(() => {
    const present = [
      ...manuscript.chapters.flatMap((chapter) =>
        chapter.scenes.filter((scene) => !scene.missing),
      ),
      ...manuscript.unplaced,
    ];
    for (const { id } of present) {
      if (asked.current.has(id)) continue;
      asked.current.add(id);
      window.project.read({ kind: 'scene', id }).then(
        (value) =>
          setScenes((scenes) =>
            // The Author's own edits, if any came first, are newer.
            scenes.has(id)
              ? scenes
              : new Map(scenes).set(id, proseCounts(value.markdown)),
          ),
        () => asked.current.delete(id),
      );
    }
  }, [manuscript]);

  useEffect(
    () =>
      window.project.subscribe((event) => {
        if (event.type === 'unitReloaded' && event.ref.kind === 'scene') {
          const { id } = event.ref;
          if ('markdown' in event.value) setProse(id, event.value.markdown);
        }
      }),
    [setProse],
  );

  return { scenes, setProse };
}

/**
 * Along the bottom of the window: the save state on the left, then any
 * `notice`, and on the right the counts of what is open, or selected;
 * hovering them shows the Manuscript's.
 */
export function StatusBar({
  saveStatus,
  notice,
  shown,
  manuscript,
}: {
  saveStatus: { statuses: SaveStatuses; confirmed: boolean };
  notice?: string;
  shown: ShownCounts;
  manuscript: Counts;
}) {
  return (
    <footer className="status-bar">
      <SaveIndicator {...saveStatus} />
      <span className="status-notice" role="status">
        {notice}
      </span>
      <span
        className="counts"
        title={`Manuscript: ${formatCounts(manuscript)}`}
      >
        <span className="counts-scope">{shown.scope}</span>{' '}
        {formatCounts(shown.counts)}
      </span>
    </footer>
  );
}
