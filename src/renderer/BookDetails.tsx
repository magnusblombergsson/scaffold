import { useContext, useState } from 'react';
import type {
  BookDetailKey,
  BookDetails,
  ManuscriptBook,
} from '../shared/project-types';
import {
  CONVENTIONS,
  conventionOf,
  FORMATS,
  GENRES,
  guideStructures,
  NO_STRUCTURE,
  qualifiedBeatId,
  shownIds,
  STRUCTURES,
  structureOf,
  type Format,
  type GenreConvention,
  type Structure,
} from '../shared/structure-catalogue';
import { beatWhere } from './Beats';
import { ReadOnlyContext } from './read-only';
import { useRun } from './use-project';
import { WordTargetForm } from './WordTarget';

// A Book's details in the Plan Room (spec: Outline planner §3, §7): the
// strip above the Outline tree that sets each with a click, and the
// structure guide below the unit's details. Ids the catalogue doesn't know,
// from a newer app, are kept as they are and never shown.

/** The id of the structure guide, which About Structures… scrolls to. */
const GUIDE_ID = 'structure-guide';

/** A Book's details and Word target, as the Manuscript holds them. */
export type PlannedBook = BookDetails & Pick<ManuscriptBook, 'wordTarget'>;

/** Sets one of the details of the Book `bookId`, as the window does. */
function useSetBookDetail(bookId: string) {
  const run = useRun();
  return <K extends BookDetailKey>(key: K, value: BookDetails[K] | null) =>
    run((project) => project.setBookDetail(bookId, key, value), {
      what: 'set the Book’s details',
    });
}

/** `ids` with `id` added, or taken out when there, keeping the rest as they are. */
function toggled(ids: readonly string[] | undefined, id: string): string[] {
  const all = ids ?? [];
  return all.includes(id) ? all.filter((i) => i !== id) : [...all, id];
}

/** A Format's band of words, as in “7,500–17,499 words”. */
export function formatBand({ words: { min, max } }: Format): string {
  const n = (words: number) => words.toLocaleString('en-US');
  if (min === undefined) return `under ${n(max! + 1)} words`;
  if (max === undefined) return `${n(min)}+ words`;
  return `${n(min)}–${n(max)} words`;
}

/**
 * The strip above the Outline tree: the Book's Structure, Genre
 * conventions, Genres, Format and Word target, each set with a click, and
 * a link to the structure guide.
 */
export function BookDetailsStrip({
  bookId,
  book,
}: {
  /** The Book's id, or `project` for a Project of one Book. */
  bookId: string;
  book: PlannedBook;
}) {
  const readOnly = useContext(ReadOnlyContext);
  const set = useSetBookDetail(bookId);
  const run = useRun();
  const [editingTarget, setEditingTarget] = useState(false);
  const { structure, bookFormat, wordTarget } = book;
  const knownStructure =
    structure === undefined ||
    structure === NO_STRUCTURE ||
    !!structureOf(structure);
  const knownFormat =
    bookFormat === undefined || FORMATS.some((f) => f.id === bookFormat);

  return (
    <section className="book-details-strip" aria-label="Book details">
      <label className="book-detail">
        Structure
        <select
          aria-label="Structure"
          value={structure ?? ''}
          disabled={readOnly}
          onChange={(event) =>
            void set('structure', event.target.value || null)
          }
        >
          <option value="">None chosen yet</option>
          {STRUCTURES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NO_STRUCTURE}>No set Structure</option>
          {!knownStructure && (
            <option value={structure} disabled>
              Not known to this version
            </option>
          )}
        </select>
      </label>
      <Chips
        label="Genre conventions"
        options={CONVENTIONS}
        chosen={book.genreConventions}
        disabled={readOnly}
        onToggle={(id) =>
          void set('genreConventions', toggled(book.genreConventions, id))
        }
      />
      <Chips
        label="Genres"
        options={GENRES}
        chosen={book.genres}
        disabled={readOnly}
        onToggle={(id) => void set('genres', toggled(book.genres, id))}
      />
      <label className="book-detail">
        Format
        <select
          aria-label="Format"
          value={bookFormat ?? ''}
          disabled={readOnly}
          onChange={(event) =>
            void set('bookFormat', event.target.value || null)
          }
        >
          <option value="">None</option>
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({formatBand(f)})
            </option>
          ))}
          {!knownFormat && (
            <option value={bookFormat} disabled>
              Not known to this version
            </option>
          )}
        </select>
      </label>
      <div className="book-detail">
        Word target
        {editingTarget ? (
          <WordTargetForm
            wordTarget={wordTarget}
            onSave={(words) => {
              setEditingTarget(false);
              void run((project) => project.setWordTarget(bookId, words), {
                what: 'set the Word target',
              });
            }}
            onCancel={() => setEditingTarget(false)}
          />
        ) : (
          <button
            className="link-button"
            aria-label="Word target"
            disabled={readOnly}
            onClick={() => setEditingTarget(true)}
          >
            {wordTarget === undefined
              ? 'None'
              : `${wordTarget.toLocaleString('en-US')} words`}
          </button>
        )}
      </div>
      <button
        className="link-button book-details-about"
        onClick={() =>
          document
            .getElementById(GUIDE_ID)
            ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
        }
      >
        About Structures…
      </button>
    </section>
  );
}

/** A choice of any number, each a chip that toggles with a click. */
function Chips({
  label,
  options,
  chosen,
  disabled,
  onToggle,
}: {
  label: string;
  options: readonly { id: string; name: string }[];
  chosen: readonly string[] | undefined;
  disabled: boolean;
  onToggle(id: string): void;
}) {
  return (
    <fieldset className="book-detail book-detail-chips">
      <legend>{label}</legend>
      {options.map((o) => (
        <button
          key={o.id}
          className="book-chip"
          aria-pressed={chosen?.includes(o.id) ?? false}
          disabled={disabled}
          onClick={() => onToggle(o.id)}
        >
          {o.name}
        </button>
      ))}
    </fieldset>
  );
}

/**
 * The structure guide: what the Book follows opened out, every other
 * Structure folded, those fitting the Book first, then the less usual for
 * it, and every other Genre convention; each to follow with a click.
 */
export function StructureGuide({
  bookId,
  book,
  carrying,
}: {
  bookId: string;
  book: PlannedBook;
  /** The titles of the Scenes carrying a Beat, by its qualified id. */
  carrying(beat: string): string[];
}) {
  const readOnly = useContext(ReadOnlyContext);
  const set = useSetBookDetail(bookId);
  const followed = structureOf(book.structure);
  const conventions = shownIds(book.genreConventions, CONVENTIONS).map(
    (id) => conventionOf(id)!,
  );
  const others = CONVENTIONS.filter((c) => !conventions.includes(c));
  const { fitting, lessUsual } = guideStructures(book);
  const follow = (s: Structure) => void set('structure', s.id);
  const followToo = (c: GenreConvention) =>
    void set('genreConventions', toggled(book.genreConventions, c.id));

  return (
    <section
      id={GUIDE_ID}
      className="structure-guide"
      aria-label="Structure guide"
    >
      <h3 className="in-focus-heading">Structure guide</h3>
      {book.structure === NO_STRUCTURE ? (
        <p className="structure-guide-note">
          This Book follows no set Structure.
        </p>
      ) : (
        book.structure !== undefined &&
        !followed && (
          <p className="structure-guide-note">
            This Book follows a Structure this version doesn’t know.
          </p>
        )
      )}
      {followed && (
        <article className="guide-entry" aria-label={followed.name} data-open>
          <h4>{followed.name}</h4>
          <StructureBody structure={followed} book={book} carrying={carrying} />
        </article>
      )}
      {conventions.map((c) => (
        <article className="guide-entry" key={c.id} aria-label={c.name}>
          <h4>{c.name}</h4>
          <ConventionBody convention={c} carrying={carrying} />
          <button disabled={readOnly} onClick={() => followToo(c)}>
            Stop following
          </button>
        </article>
      ))}
      <h4 className="guide-group">
        {followed ? 'Other Structures' : 'Structures'}
      </h4>
      {fitting.map((s) => (
        <FoldedStructure
          key={s.id}
          structure={s}
          book={book}
          disabled={readOnly}
          onFollow={follow}
        />
      ))}
      {lessUsual.length > 0 && (
        <p className="guide-group-note">Less usual for this Book</p>
      )}
      {lessUsual.map((s) => (
        <FoldedStructure
          key={s.id}
          structure={s}
          book={book}
          disabled={readOnly}
          onFollow={follow}
        />
      ))}
      {book.structure !== NO_STRUCTURE && (
        <button
          className="link-button"
          disabled={readOnly}
          onClick={() => void set('structure', NO_STRUCTURE)}
        >
          Follow No set Structure
        </button>
      )}
      {others.length > 0 && (
        <h4 className="guide-group">
          {conventions.length > 0
            ? 'Other Genre conventions'
            : 'Genre conventions'}
        </h4>
      )}
      {others.map((c) => (
        <details className="guide-entry" key={c.id}>
          <summary>{c.name}</summary>
          <ConventionBody convention={c} />
          <button disabled={readOnly} onClick={() => followToo(c)}>
            Follow too
          </button>
        </details>
      ))}
    </section>
  );
}

/** A Structure the Book doesn't follow, folded, to follow with a click. */
function FoldedStructure({
  structure,
  book,
  disabled,
  onFollow,
}: {
  structure: Structure;
  book: PlannedBook;
  disabled: boolean;
  onFollow(structure: Structure): void;
}) {
  return (
    <details className="guide-entry">
      <summary>{structure.name}</summary>
      <StructureBody structure={structure} book={book} />
      <button disabled={disabled} onClick={() => onFollow(structure)}>
        Follow this
      </button>
    </details>
  );
}

/** A Structure's credit, description, fits (the Book's own marked) and Beats. */
function StructureBody({
  structure,
  book,
  carrying,
}: {
  structure: Structure;
  book: PlannedBook;
  /** The Scenes carrying each Beat, to say: for what the Book follows. */
  carrying?(beat: string): string[];
}) {
  const { fits } = structure;
  return (
    <>
      <p className="guide-credit">{structure.credit}</p>
      <p className="guide-description">{structure.description}</p>
      <p className="guide-fits">
        Fits:{' '}
        {GENRES.filter((g) => fits.genres.includes(g.id)).map((g, i) => (
          <span key={g.id}>
            {i > 0 && ', '}
            <Fit matches={!!book.genres?.includes(g.id)}>{g.name}</Fit>
          </span>
        ))}
        {'; '}
        {FORMATS.filter((f) => fits.formats.includes(f.id)).map((f, i) => (
          <span key={f.id}>
            {i > 0 && ', '}
            <Fit matches={book.bookFormat === f.id}>{f.name}</Fit>
          </span>
        ))}
        {'; '}
        {fits.across === 'book'
          ? 'per Book'
          : fits.across === 'series'
            ? 'across a Series'
            : 'per Book or across a Series'}
      </p>
      <Beats source={structure} carrying={carrying} />
    </>
  );
}

/** A Genre or Format a Structure fits, marked when the Book has it. */
function Fit({ matches, children }: { matches: boolean; children: string }) {
  return matches ? (
    <mark className="guide-fit-match">{children}</mark>
  ) : (
    <>{children}</>
  );
}

/** A Genre convention's credit, description, required Scenes and rules. */
function ConventionBody({
  convention,
  carrying,
}: {
  convention: GenreConvention;
  carrying?(beat: string): string[];
}) {
  return (
    <>
      <p className="guide-credit">{convention.credit}</p>
      <p className="guide-description">{convention.description}</p>
      <p className="guide-subheading">Required Scenes</p>
      <Beats source={convention} carrying={carrying} />
      <p className="guide-subheading">Rules</p>
      <ul className="guide-rules">
        {convention.rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </>
  );
}

/**
 * Each Beat of a Structure or Genre convention: its purpose, position,
 * span, and whether it opens a Part; with `carrying`, the Scenes marked
 * with it.
 */
function Beats({
  source,
  carrying,
}: {
  source: Structure | GenreConvention;
  carrying?(beat: string): string[];
}) {
  return (
    <ol className="guide-beats">
      {source.beats.map((beat) => (
        <li key={beat.id}>
          <span className="guide-beat-name">{beat.name}</span>{' '}
          <span className="guide-beat-where">
            {beatWhere(beat)}
            {' · '}
            {beat.span === 'scene' ? 'one Scene' : 'a run of Scenes'}
            {beat.opensPart && ' · opens a Part'}
          </span>
          <span className="guide-beat-purpose">{beat.purpose}</span>
          {carrying && (
            <Carriers titles={carrying(qualifiedBeatId(source, beat))} />
          )}
        </li>
      ))}
    </ol>
  );
}

/** The Scenes marked with a Beat, by title, or that none is. */
function Carriers({ titles }: { titles: string[] }) {
  return (
    <span className="guide-beat-marked">
      {titles.length === 0
        ? 'Not marked'
        : `Marked on ${titles.map((t) => `“${t}”`).join(', ')}`}
    </span>
  );
}
