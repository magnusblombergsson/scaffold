import { useEffect, useRef, useState } from 'react';
import {
  chapterTick,
  partTick,
  pickedManuscript,
  sceneTicked,
  TICK_ALL,
  tickMatching,
  toggleChapter,
  togglePart,
  toggleScene,
  type ExportUnticked,
  type Tick,
} from '../shared/export-choice';
import { filterManuscript, filterOn, type Filter } from '../shared/filter';
import type {
  Manuscript,
  ManuscriptChapter,
  ManuscriptPart,
} from '../shared/project-types';
import { FilterControl, useFilter } from './Filter';
import { useStatuses } from './StatusAndTags';

/**
 * File › Export Manuscript…: which Scenes and Chapters go in, each Chapter
 * with its Scenes ticked under it, and each Part with its Chapters, before
 * the save dialog. Unplaced Chapters never go in, so aren't listed. Tick matching…
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
          {topLevel(manuscript).map((item) =>
            'chapter' in item ? (
              <ChapterTicks
                key={item.chapter.id}
                chapter={item.chapter}
                unticked={unticked}
                onChange={setUnticked}
              />
            ) : (
              <li key={item.part.id}>
                <label className="export-chapter">
                  <TickBox
                    tick={partTick(manuscript, item.part, unticked)}
                    onChange={() =>
                      setUnticked(togglePart(manuscript, item.part, unticked))
                    }
                  />
                  {item.part.title}
                </label>
                <ul>
                  {item.chapters.map((chapter) => (
                    <ChapterTicks
                      key={chapter.id}
                      chapter={chapter}
                      unticked={unticked}
                      onChange={setUnticked}
                    />
                  ))}
                </ul>
              </li>
            ),
          )}
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

/**
 * The Manuscript's top level as the dialog lists it: each Part with its
 * Chapters, and the Loose Chapters between them. A Part with no Chapters
 * and the Unplaced Chapters are left out, as they never go in.
 */
type TopItem =
  | { chapter: ManuscriptChapter }
  | { part: ManuscriptPart; chapters: ManuscriptChapter[] };

function topLevel(manuscript: Manuscript): TopItem[] {
  const chapters = manuscript.chapters.filter((c) => !c.unplaced);
  if (!manuscript.parts) return chapters.map((chapter) => ({ chapter }));
  const parts = new Map(manuscript.parts.map((p) => [p.id, p]));
  return (manuscript.top ?? []).flatMap((id): TopItem[] => {
    const part = parts.get(id);
    if (part) {
      const members = chapters.filter((c) => c.part === id);
      return members.length > 0 ? [{ part, chapters: members }] : [];
    }
    const chapter = chapters.find((c) => c.id === id);
    return chapter ? [{ chapter }] : [];
  });
}

/** A Chapter's tick box, with its Scenes' under it. */
function ChapterTicks({
  chapter,
  unticked,
  onChange,
}: {
  chapter: ManuscriptChapter;
  unticked: ExportUnticked;
  onChange(unticked: ExportUnticked): void;
}) {
  return (
    <li>
      <label className="export-chapter">
        <TickBox
          tick={chapterTick(chapter, unticked)}
          onChange={() => onChange(toggleChapter(chapter, unticked))}
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
                    onChange(toggleScene(chapter, scene.id, unticked))
                  }
                />
                {scene.title}
              </label>
            </li>
          ))}
        </ul>
      )}
    </li>
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
