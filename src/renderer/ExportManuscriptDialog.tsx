import { useEffect, useRef, useState } from 'react';
import {
  chapterTick,
  pickedManuscript,
  sceneTicked,
  TICK_ALL,
  tickMatching,
  toggleChapter,
  toggleScene,
  type ExportUnticked,
  type Tick,
} from '../shared/export-choice';
import { filterManuscript, filterOn, type Filter } from '../shared/filter';
import type { Manuscript } from '../shared/project-types';
import { FilterControl, useFilter } from './Filter';
import { useStatuses } from './StatusAndTags';

/**
 * File › Export Manuscript…: which Scenes and Chapters go in, each Chapter
 * with its Scenes ticked under it, before the save dialog. Tick matching…
 * ticks only what a Filter matches, for the Author to adjust by hand. What
 * they leave unticked is remembered for the Project on this computer.
 */
export function ExportManuscriptDialog({
  manuscript,
  onClose,
}: {
  manuscript: Manuscript;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** Null until main says what was left unticked last time. */
  const [unticked, setUnticked] = useState<ExportUnticked | null>(null);
  const { filter, setFilter, inUse } = useFilter('export-manuscript');
  const statuses = useStatuses();
  const matched = filterManuscript(filter, manuscript, statuses);
  useEffect(() => {
    dialogRef.current?.showModal();
    void window.shell.exportChoice().then(setUnticked);
  }, []);

  const nothingTicked =
    !unticked || pickedManuscript(manuscript, unticked).chapters.length === 0;

  /** Ticks only what `next` matches; clearing it leaves the ticks as they are. */
  function tickBy(next: Filter) {
    setFilter(next);
    if (filterOn(next)) setUnticked(tickMatching(manuscript, next, statuses));
  }

  function exportTicked() {
    if (!unticked) return;
    // Gone at once, not on the close event, which would come after a quick reopen.
    onClose();
    void window.shell.exportManuscript(unticked);
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings export"
      aria-labelledby="export-heading"
      // Escape closes it.
      onClose={onClose}
    >
      <h2 id="export-heading">Export Manuscript</h2>
      <p className="field-hint">
        Tick the Scenes and Chapters to export. The file type you save as sets
        Word or Markdown.
      </p>
      {unticked && (
        <FilterControl
          filter={filter}
          onChange={tickBy}
          inUse={inUse}
          shown={matched.matching}
          total={matched.total}
          by="statuses"
          label="Tick matching…"
        />
      )}
      {unticked && (
        <ul className="export-tree" aria-label="Scenes and Chapters">
          {manuscript.chapters.map((chapter) => (
            <li key={chapter.id}>
              <label className="export-chapter">
                <TickBox
                  tick={chapterTick(chapter, unticked)}
                  onChange={() => setUnticked(toggleChapter(chapter, unticked))}
                />
                {chapter.title}
              </label>
              {chapter.scenes.length > 0 && (
                <ul>
                  {chapter.scenes.map((scene) => (
                    <li key={scene.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={sceneTicked(scene.id, unticked)}
                          onChange={() =>
                            setUnticked(
                              toggleScene(chapter, scene.id, unticked),
                            )
                          }
                        />
                        {scene.title}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="settings-close">
        <button
          className="export-tick-all"
          onClick={() => setUnticked(TICK_ALL)}
        >
          Tick all
        </button>
        <button onClick={() => dialogRef.current?.close()}>Cancel</button>
        <button disabled={nothingTicked} onClick={exportTicked}>
          Export…
        </button>
      </div>
    </dialog>
  );
}

/** A tick box that can also show half-ticked. */
function TickBox({ tick, onChange }: { tick: Tick; onChange(): void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = tick === 'half';
  }, [tick]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={tick === 'ticked'}
      aria-checked={tick === 'half' ? 'mixed' : tick === 'ticked'}
      onChange={onChange}
    />
  );
}
