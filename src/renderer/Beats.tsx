import { useContext } from 'react';
import {
  beatWhere,
  carriers,
  shownBeats,
  spanText,
  type FollowedBeat,
  type Measure,
  type Span,
} from '../shared/beat-measure';
import type { ManuscriptScene } from '../shared/project-types';
import { ReadOnlyContext } from './read-only';
import { useRun } from './use-project';

// A Scene's Beats in the Plan Room (spec: Outline planner §3, §7): chips on
// its row in the tree, checkboxes in its details, and the Beat rail beside
// the tree. Only the Beats of what the Book follows are shown; a Scene's
// other marks are set aside, kept but unseen.

const MEASURED: Record<Measure, string> = {
  words: 'by planned words',
  order: 'by Scene order',
};

/** The Beats a Scene carries of what the Book follows, as chips on its row in the tree. */
export function BeatChips({
  scene,
  followed,
}: {
  scene: ManuscriptScene;
  followed: readonly FollowedBeat[];
}) {
  const shown = shownBeats(scene.beats, followed);
  if (shown.length === 0) return null;
  return (
    <ul className="beat-chips" aria-label="Beats">
      {shown.map((b) => (
        <li key={b.id} className="beat-chip" data-column={b.column}>
          {b.name}
        </li>
      ))}
    </ul>
  );
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
}: {
  scene: ManuscriptScene;
  falls: Span | undefined;
  measure: Measure;
  followed: readonly FollowedBeat[];
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
              .map((b) => (
                <label key={b.id} className="scene-beat">
                  <input
                    type="checkbox"
                    checked={!!scene.beats?.includes(b.id)}
                    disabled={readOnly || !!scene.missing}
                    onChange={(event) => mark(b, event.target.checked)}
                  />
                  <span className="scene-beat-name">{b.name}</span>
                  <span className="scene-beat-where">{beatWhere(b)}</span>
                </label>
              ))}
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
