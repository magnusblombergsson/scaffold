import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { Manuscript } from '../shared/project-types';
import { ReadOnlyContext } from './read-only';
import { SaveIndicator } from './SaveStatus';
import type { SaveStatuses } from './save-status';
import { WordTargetForm } from './WordTarget';
import {
  formatCounts,
  proseCounts,
  wordTargetProgress,
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
 * Along the bottom of the window: the save state on the left, and centred
 * under the Prose the counts of what is open, or selected, against its Word
 * target if it has one; hovering them shows the Manuscript's. Clicking them
 * sets the Word target of what is shown, a selection's aside.
 */
export function StatusBar({
  saveStatus,
  shown,
  manuscript,
  onSetWordTarget,
}: {
  saveStatus: { statuses: SaveStatuses; confirmed: boolean };
  shown: ShownCounts;
  manuscript: Counts;
  /** Gives a Scene, a Chapter or, with `project`, the Manuscript a Word target, or none. */
  onSetWordTarget(unitId: string, words: number | null): void;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const footer = useRef<HTMLElement>(null);
  const countsButton = useRef<HTMLButtonElement>(null);
  const centre = useCentreUnderProse(footer);
  /** The unit whose Word target is being set, by id. */
  const [settingOf, setSettingOf] = useState<string | null>(null);
  const { scope, counts, unitId, wordTarget } = shown;
  const editing = settingOf !== null && settingOf === unitId && !readOnly;
  const progress =
    wordTarget === undefined
      ? undefined
      : wordTargetProgress(counts.words, wordTarget);
  const title = `Manuscript: ${formatCounts(manuscript)}`;
  const className = progress?.reached ? 'counts reached' : 'counts';
  const text = (
    <>
      <span className="counts-scope">{scope}</span>{' '}
      {formatCounts(counts, wordTarget)}
    </>
  );

  function closeForm() {
    setSettingOf(null);
    countsButton.current?.focus();
  }

  return (
    <footer className="status-bar" ref={footer}>
      <SaveIndicator {...saveStatus} />
      <div
        className="counts-place"
        style={centre === null ? undefined : { left: centre }}
        onBlur={(event) => {
          // Clicking away leaves the Word target as it was.
          if (editing && !event.currentTarget.contains(event.relatedTarget)) {
            setSettingOf(null);
          }
        }}
      >
        <span className="counts-and-line">
          {unitId === undefined || readOnly ? (
            <span className={className} title={title}>
              {text}
            </span>
          ) : (
            <button
              ref={countsButton}
              className={className}
              title={title}
              aria-expanded={editing}
              aria-label={`${scope} ${formatCounts(counts, wordTarget)}. Set word target`}
              onClick={() => setSettingOf(editing ? null : unitId)}
            >
              {text}
            </button>
          )}
          {progress && (
            <span className="word-target-line" aria-hidden="true">
              <span style={{ width: `${progress.filled * 100}%` }} />
            </span>
          )}
        </span>
        {editing && (
          <div
            className="word-target-popover"
            role="group"
            aria-label={`Word target of the ${scope}`}
          >
            <WordTargetForm
              wordTarget={wordTarget}
              onSave={(words) => {
                onSetWordTarget(unitId, words);
                closeForm();
              }}
              onCancel={closeForm}
            />
          </div>
        )}
      </div>
    </footer>
  );
}

/**
 * Where, across `bar`, the Prose, or else its sheet, in the room showing has
 * its middle; null without a sheet, as in Brainstorm, for the bar's own
 * middle. Measured again whenever the bar or the sheet changes size, as
 * when a pane is resized or collapsed.
 */
function useCentreUnderProse(bar: RefObject<HTMLElement | null>) {
  const [centre, setCentre] = useState<number | null>(null);
  useLayoutEffect(() => {
    const footer = bar.current;
    if (!footer) return;
    const room = footer.parentElement?.querySelector('.room:not([hidden])');
    const sheet = room?.querySelector('.centre');
    // The Prose, its width capped, moves without resizing as a pane does.
    const prose = sheet?.querySelector('.prose') ?? sheet;
    const measure = () => {
      const box = prose?.getBoundingClientRect();
      setCentre(
        box && box.width > 0
          ? box.left + box.width / 2 - footer.getBoundingClientRect().left
          : null,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    if (sheet) observer.observe(sheet);
    return () => observer.disconnect();
  });
  return centre;
}
