import { wordTargetText } from '../shared/word-target';
import { useContext, useState, type ReactNode } from 'react';
import { beatWhere } from '../shared/beat-measure';
import {
  detailText,
  formatBand,
  mayRunInEveryPart,
} from '../shared/book-details';
import type { ProposalView } from '../shared/proposal';
import { proposalCardId } from './ProposalCard';
import type {
  BookDetailKey,
  BookDetails,
  ManuscriptBook,
  StructureRuns,
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
  type Across,
  type GenreConvention,
  type Structure,
} from '../shared/structure-catalogue';
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

/**
 * The strip above the Outline tree: the Book's Structure, with where it
 * runs once the Book has a Part, Genre conventions, Genres, Format and
 * Word target, each set with a click, and a link to the structure guide. A
 * detail or Word target `proposed` in the Conversation open shows as a
 * ghost value beside it, which goes to its card.
 */
export function BookDetailsStrip({
  bookId,
  book,
  partLabel,
  proposed = [],
}: {
  /** The Book's id, or `project` for a Project of one Book. */
  bookId: string;
  book: PlannedBook;
  /** What the Project calls its Parts, while the Book has one; none without. */
  partLabel?: string;
  /** The Book's details and its Manuscript's Word target proposed and still to decide. */
  proposed?: ProposalView[];
}) {
  const ghost = (key: BookDetailKey) => (
    <Ghost
      proposal={proposed.findLast(
        (p) => p.kind === 'book-detail' && p.detail === key,
      )}
    />
  );
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
        {ghost('structure')}
      </label>
      {partLabel !== undefined && mayRunInEveryPart(structure) && (
        <label className="book-detail">
          Runs
          <select
            aria-label="Where the Structure runs"
            value={book.structureRuns ?? 'book'}
            disabled={readOnly}
            onChange={(event) =>
              void run(
                (project) =>
                  project.setStructureRuns(
                    bookId,
                    event.target.value as StructureRuns,
                  ),
                { what: 'set where the Structure runs' },
              )
            }
          >
            <option value="book">Over the whole Book</option>
            <option value="part">Anew in every {partLabel}</option>
          </select>
        </label>
      )}
      <Chips
        label="Genre conventions"
        options={CONVENTIONS}
        chosen={book.genreConventions}
        disabled={readOnly}
        onToggle={(id) =>
          void set('genreConventions', toggled(book.genreConventions, id))
        }
        ghost={ghost('genreConventions')}
      />
      <Chips
        label="Genres"
        options={GENRES}
        chosen={book.genres}
        disabled={readOnly}
        onToggle={(id) => void set('genres', toggled(book.genres, id))}
        ghost={ghost('genres')}
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
        {ghost('bookFormat')}
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
            {wordTargetText(wordTarget)}
          </button>
        )}
        <Ghost proposal={proposed.findLast((p) => p.kind === 'word-target')} />
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

/**
 * A detail proposed and still to decide, as a ghost value beside the one
 * the Book has: it goes to its card in the Conversation.
 */
function Ghost({ proposal }: { proposal: ProposalView | undefined }) {
  if (proposal?.kind !== 'book-detail' && proposal?.kind !== 'word-target') {
    return null;
  }
  const text =
    proposal.kind === 'book-detail'
      ? detailText(proposal.detail, proposal.proposed)
      : wordTargetText(proposal.proposed);
  return (
    <button
      className="link-button book-detail-ghost"
      title="Proposed in the Conversation: decide it there"
      aria-label={`Proposed: ${text}`}
      onClick={(event) => {
        // Inside a label, a click would open its select too.
        event.preventDefault();
        document
          .getElementById(proposalCardId(proposal.id))
          ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      }}
    >
      {text}
    </button>
  );
}

/** A choice of any number, each a chip that toggles with a click. */
function Chips({
  label,
  options,
  chosen,
  disabled,
  onToggle,
  ghost,
}: {
  label: string;
  options: readonly { id: string; name: string }[];
  chosen: readonly string[] | undefined;
  disabled: boolean;
  onToggle(id: string): void;
  /** What is proposed for it, if anything. */
  ghost?: ReactNode;
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
      {ghost}
    </fieldset>
  );
}

/**
 * The structure guide: what the Book follows opened out, every other
 * Structure folded, those fitting the Book first, then the less usual for
 * it, and every other Genre convention; each to follow with a click, and
 * to ask Plan about, which sends it in full.
 */
export function StructureGuide({
  bookId,
  book,
  carrying,
  onAsk,
}: {
  bookId: string;
  book: PlannedBook;
  /** The titles of the Scenes carrying a Beat, by its qualified id. */
  carrying(beat: string): string[];
  /** Asks Plan about an entry by its name; unset while Plan can't be asked. */
  onAsk?(name: string): void;
}) {
  const ask = (entry: Structure | GenreConvention) => (
    <button disabled={!onAsk} onClick={() => onAsk?.(entry.name)}>
      Ask Plan about it
    </button>
  );
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
          {ask(followed)}
        </article>
      )}
      {conventions.map((c) => (
        <article className="guide-entry" key={c.id} aria-label={c.name}>
          <h4>{c.name}</h4>
          <ConventionBody convention={c} carrying={carrying} />
          <button disabled={readOnly} onClick={() => followToo(c)}>
            Stop following
          </button>
          {ask(c)}
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
          ask={ask(s)}
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
          ask={ask(s)}
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
          {ask(c)}
        </details>
      ))}
    </section>
  );
}

/** A Structure the Book doesn't follow, folded, to follow with a click or `ask` about. */
function FoldedStructure({
  structure,
  book,
  disabled,
  onFollow,
  ask,
}: {
  structure: Structure;
  book: PlannedBook;
  disabled: boolean;
  onFollow(structure: Structure): void;
  ask: ReactNode;
}) {
  return (
    <details className="guide-entry">
      <summary>{structure.name}</summary>
      <StructureBody structure={structure} book={book} />
      <button disabled={disabled} onClick={() => onFollow(structure)}>
        Follow this
      </button>
      {ask}
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
        {acrossText(fits.across)}
      </p>
      <Beats source={structure} carrying={carrying} />
    </>
  );
}

/** Where a Structure is used, in words, as in “per Book or across a Series”. */
function acrossText(across: readonly Across[]): string {
  const words = (['book', 'part', 'series'] as const)
    .filter((a) => across.includes(a))
    .map((a) => ACROSS_WORDS[a]);
  return words.length > 1
    ? `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`
    : words.join('');
}

/** Each place a Structure is used, in words. */
const ACROSS_WORDS: Record<Across, string> = {
  book: 'per Book',
  part: 'per Part',
  series: 'across a Series',
};

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
