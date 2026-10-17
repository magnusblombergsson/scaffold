import { createContext, useContext } from 'react';
import {
  beatWhere,
  carriers,
  sceneBeatsInWriting,
  spanText,
  type FollowedBeat,
  type Measure,
  type Span,
} from '../shared/beat-measure';
import type { Manuscript, ManuscriptScene } from '../shared/project-types';
import { ReadOnlyContext } from './read-only';
import { useRun } from './use-project';

// A Scene's Beats in the Plan Room (spec: Outline planner §3, §7): chips on
// its row in the tree, checkboxes in its details, and the Beat rail beside
// the tree; and in Writing (§8), read-only chips on its Corkboard card and
// Overview row. Only the Beats of what the Book follows are shown; a
// Scene's other marks are set aside, kept but unseen.

const MEASURED: Record<Measure, string> = {
  words: 'by planned words',
  order: 'by Scene order',
};

/**
 * The Beats a Scene carries of what the Book follows, as chips on its row in
 * the tree; with a pending Beats Proposal's list, those it would add as
 * dashed chips and those it would take away struck through.
 */
export function BeatChips({
  marks,
  proposed,
  followed,
}: {
  marks: readonly string[] | undefined;
  /** The whole list a pending Proposal sets, null for none; undefined with none pending. */
  proposed?: readonly string[] | null;
  followed: readonly FollowedBeat[];
}) {
  const chips = followed.flatMap((beat) => {
    const carried = !!marks?.includes(beat.id);
    const change = proposedChange(beat.id, carried, proposed);
    return carried || change ? [{ beat, change }] : [];
  });
  if (chips.length === 0) return null;
  return (
    <ul className="beat-chips" aria-label="Beats">
      {chips.map(({ beat, change }) => (
        <li
          key={beat.id}
          className={change ? `beat-chip beat-chip-${change}` : 'beat-chip'}
          data-column={beat.column}
          title={change ? PROPOSED_LABELS[change] : undefined}
        >
          {change === 'removed' ? <del>{beat.name}</del> : beat.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * In Writing, the whole Manuscript, whose Books' details say which of a
 * Scene's Beats show, and opening Plan on a Scene; none outside Writing.
 */
export const WritingBeatsContext = createContext<{
  manuscript: Manuscript;
  onOpenPlan(sceneId: string): void;
} | null>(null);

/**
 * A Scene's Beats of what its Book follows, as chips on its Corkboard card
 * or Overview row (spec: Outline planner §8). They are set only in Plan:
 * choosing one opens Plan on the Scene.
 */
export function WritingBeatChips({ sceneId }: { sceneId: string }) {
  const writing = useContext(WritingBeatsContext);
  const shown = writing && sceneBeatsInWriting(writing.manuscript, sceneId);
  if (!shown || shown.beats.length === 0) return null;
  return (
    <ul className="beat-chips writing-beat-chips" aria-label="Beats">
      {shown.beats.map((beat) => (
        <li key={beat.id} className="beat-chip" data-column={beat.column}>
          <button
            className="beat-chip-open"
            title="Open in Plan"
            onClick={() => writing.onOpenPlan(sceneId)}
          >
            {beat.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** What a pending Beats Proposal would do to a mark. */
type MarkChange = 'added' | 'removed';

const PROPOSED_LABELS: Record<MarkChange, string> = {
  added: 'Proposed',
  removed: 'Proposed to take away',
};

/**
 * What a pending Beats Proposal setting `proposed` would do to the mark
 * `beat`, which the Scene has `carried` or not; null for nothing.
 */
function proposedChange(
  beat: string,
  carried: boolean,
  proposed: readonly string[] | null | undefined,
): MarkChange | null {
  if (proposed === undefined) return null;
  const marked = !!proposed?.includes(beat);
  if (marked === carried) return null;
  return marked ? 'added' : 'removed';
}

/**
 * A Scene's details of where it falls and the Beats of what the Book
 * follows, each a checkbox with its range, grouped by Structure or Genre
 * convention. Nothing checks a mark against where the Scene falls.
 */
export function SceneBeats({
  scene,
  falls,
  measure,
  followed,
  proposed,
}: {
  scene: ManuscriptScene;
  falls: Span | undefined;
  measure: Measure;
  followed: readonly FollowedBeat[];
  /** The whole list a pending Proposal sets, null for none; undefined with none pending. */
  proposed?: readonly string[] | null;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const run = useRun();
  const sources = [...new Set(followed.map((b) => b.source))];
  const mark = (beat: FollowedBeat, carries: boolean) =>
    void run((project) => project.setBeat(scene.id, beat.id, carries), {
      what: 'mark the Scene’s Beats',
    });
  return (
    <section className="scene-beats" aria-label="Beats">
      {falls && (
        <p className="scene-falls">
          Falls at {spanText(falls)} of the Book, {MEASURED[measure]}
        </p>
      )}
      {sources.length === 0 ? (
        <p className="reference-empty">
          The Book follows no Structure or Genre convention with Beats.
        </p>
      ) : (
        sources.map((source) => (
          <fieldset key={source} className="scene-beats-group">
            <legend>{source}</legend>
            {followed
              .filter((b) => b.source === source)
              .map((b) => {
                const carried = !!scene.beats?.includes(b.id);
                const change = proposedChange(b.id, carried, proposed);
                return (
                  <label key={b.id} className="scene-beat">
                    <input
                      type="checkbox"
                      checked={carried}
                      disabled={readOnly || !!scene.missing}
                      onChange={(event) => mark(b, event.target.checked)}
                    />
                    <span className="scene-beat-name">{b.name}</span>
                    <span className="scene-beat-where">{beatWhere(b)}</span>
                    {change && (
                      <span
                        className={`scene-beat-proposed beat-chip-${change}`}
                      >
                        {PROPOSED_LABELS[change]}
                      </span>
                    )}
                  </label>
                );
              })}
          </fieldset>
        ))
      )}
    </section>
  );
}

/**
 * The Beat rail beside the tree: each Beat of what the Book follows with
 * where it should fall, drawn on a track of the whole Book, and a pin for
 * each Scene carrying it at where that Scene falls; the Structure's Beats
 * in one column, the Genre conventions' in another. A pin chooses its
 * Scene.
 */
export function BeatRail({
  scenes,
  falls,
  measure,
  followed,
  onChoose,
}: {
  /** The Book's Scenes, in reading order. */
  scenes: readonly ManuscriptScene[];
  falls: Map<string, Span>;
  measure: Measure;
  followed: readonly FollowedBeat[];
  onChoose(sceneId: string): void;
}) {
  if (followed.length === 0) return null;
  const columns = [
    { key: 'structure', label: 'Structure' },
    { key: 'convention', label: 'Genre conventions' },
  ] as const;
  return (
    <section className="beat-rail" aria-label="Beat rail">
      <p className="beat-rail-measure">Measured {MEASURED[measure]}</p>
      {columns.map(({ key, label }) => {
        const beats = followed.filter((b) => b.column === key);
        if (beats.length === 0) return null;
        return (
          <ol
            key={key}
            className="beat-rail-column"
            aria-label={label}
            data-column={key}
          >
            {beats.map((beat) => (
              <RailBeat
                key={beat.id}
                beat={beat}
                carriers={carriers(scenes, beat.id)}
                falls={falls}
                onChoose={onChoose}
              />
            ))}
          </ol>
        );
      })}
    </section>
  );
}

/** One Beat on the rail: its name and range, its track, and its pins. */
function RailBeat({
  beat,
  carriers,
  falls,
  onChoose,
}: {
  beat: FollowedBeat;
  carriers: readonly ManuscriptScene[];
  falls: Map<string, Span>;
  onChoose(sceneId: string): void;
}) {
  return (
    <li className="rail-beat" aria-label={beat.name}>
      <span className="rail-beat-name">{beat.name}</span>{' '}
      <span className="rail-beat-where">{beatWhere(beat)}</span>
      <div className="rail-track">
        {beat.at && (
          <span
            className="rail-range"
            style={{
              left: `${beat.at.from}%`,
              width: `max(${beat.at.to - beat.at.from}%, 2px)`,
            }}
          />
        )}
        {carriers.map((s) => {
          const span = falls.get(s.id);
          if (!span) return null;
          return (
            <button
              key={s.id}
              className="rail-pin"
              style={{ left: `${(span.from + span.to) / 2}%` }}
              title={`Scene “${s.title}”, ${spanText(span)}`}
              aria-label={`Scene “${s.title}”`}
              onClick={() => onChoose(s.id)}
            />
          );
        })}
      </div>
      {carriers.length === 0 && (
        <span className="rail-beat-unmarked">Not marked</span>
      )}
    </li>
  );
}
