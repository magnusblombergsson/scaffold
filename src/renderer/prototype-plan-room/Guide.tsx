// PROTOTYPE (throwaway): the structure guide below Scene details in variant B
// of the Plan Room prototype (#300). What the Book's Structure and Genre
// conventions ask for, as a reminder, and every other one in the catalogue to
// read up on before choosing, the ones fitting the Book first. Never merge.

import {
  CONVENTIONS,
  fitsBook,
  scenePositions,
  STRUCTURES,
  type Beat,
  type Convention,
  type Structure,
} from './model';
import type { Plan } from './PlanRoom';

export function StructureGuide({ plan }: { plan: Plan }) {
  const { book } = plan.state;
  const followed = STRUCTURES.find((s) => s.id === book.structure);
  const others = STRUCTURES.filter((s) => s.id !== book.structure);
  const fitting = others.filter((s) => fitsBook(s, book));
  const rest = others.filter((s) => !fitsBook(s, book));
  const conventions = CONVENTIONS.filter((c) =>
    book.conventions.includes(c.id),
  );
  const otherConventions = CONVENTIONS.filter(
    (c) => !book.conventions.includes(c.id),
  );
  return (
    <section className="proto-plan-guide" aria-label="Structure guide">
      <h3 className="proto-plan-guide-h">This Book follows</h3>
      {book.structure === null && (
        <p className="proto-plan-muted">
          No Structure chosen yet.{' '}
          <button
            className="link-button"
            onClick={() => plan.send('Find a structure')}
          >
            Find a structure
          </button>
        </p>
      )}
      {book.structure === 'none' && (
        <p className="proto-plan-muted">
          No set Structure: Plan checks only Genre conventions and Scene-level
          shape.
        </p>
      )}
      {followed && <StructureCard plan={plan} s={followed} followed />}
      {conventions.map((c) => (
        <ConventionCard key={c.id} plan={plan} c={c} followed />
      ))}
      {book.structure !== null && conventions.length === 0 && (
        <p className="proto-plan-muted">No Genre conventions.</p>
      )}

      <h3 className="proto-plan-guide-h">Other Structures</h3>
      {fitting.length > 0 && (
        <p className="proto-plan-guide-sub">
          Fit a {book.genres.join(', ')} {book.format}
        </p>
      )}
      {fitting.map((s) => (
        <StructureCard key={s.id} plan={plan} s={s} />
      ))}
      {rest.length > 0 && (
        <p className="proto-plan-guide-sub">Less usual for this Book</p>
      )}
      {rest.map((s) => (
        <StructureCard key={s.id} plan={plan} s={s} />
      ))}
      {book.structure !== 'none' && (
        <p className="proto-plan-muted">
          Or{' '}
          <button
            className="link-button"
            onClick={() =>
              plan.edit((st) => {
                st.book.structure = 'none';
              })
            }
          >
            follow no set Structure
          </button>
          .
        </p>
      )}

      <h3 className="proto-plan-guide-h">Other Genre conventions</h3>
      {otherConventions.map((c) => (
        <ConventionCard key={c.id} plan={plan} c={c} />
      ))}
    </section>
  );
}

function StructureCard({
  plan,
  s,
  followed,
}: {
  plan: Plan;
  s: Structure;
  followed?: boolean;
}) {
  const { book } = plan.state;
  return (
    <details className="proto-plan-guide-card" open={followed}>
      <summary>
        <b>{s.name}</b>
        <span className="proto-plan-muted"> · {s.beats.length} Beats</span>
      </summary>
      <p className="proto-plan-muted">{s.credit}</p>
      <p>{s.description}</p>
      <p className="proto-plan-guide-fits">
        Fits{' '}
        {s.fits.genres.map((g, i) => (
          <span key={g} data-match={book.genres.includes(g) || undefined}>
            {i > 0 && ', '}
            {g}
          </span>
        ))}
        {' · '}
        {s.fits.formats.map((f, i) => (
          <span key={f} data-match={book.format === f || undefined}>
            {i > 0 && ', '}
            {f}
          </span>
        ))}
        {` · per ${s.fits.span}`}
      </p>
      <BeatTable plan={plan} beats={s.beats} followed={followed} />
      {!followed && (
        <div className="proposal-actions">
          <button
            onClick={() =>
              plan.edit((st) => {
                st.book.structure = s.id;
              })
            }
          >
            Follow this
          </button>
          <button
            className="link-button"
            onClick={() => plan.send(`Tell me about ${s.name}`)}
          >
            Ask Plan about it
          </button>
        </div>
      )}
    </details>
  );
}

function ConventionCard({
  plan,
  c,
  followed,
}: {
  plan: Plan;
  c: Convention;
  followed?: boolean;
}) {
  return (
    <details className="proto-plan-guide-card" open={followed}>
      <summary>
        <b>{c.name}</b>
        {plan.state.book.genres.includes(c.genre) && !followed && (
          <span className="proto-plan-guide-match"> · matches a Genre</span>
        )}
      </summary>
      <p className="proto-plan-muted">{c.credit}</p>
      <p>{c.description}</p>
      <p className="proto-plan-guide-sub">Required Scenes</p>
      <BeatTable plan={plan} beats={c.beats} followed={followed} />
      <p className="proto-plan-guide-sub">Rules</p>
      <ul className="proto-plan-guide-rules">
        {c.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <div className="proposal-actions">
        <button
          onClick={() =>
            plan.edit((st) => {
              st.book.conventions = followed
                ? st.book.conventions.filter((x) => x !== c.id)
                : [...st.book.conventions, c.id];
            })
          }
        >
          {followed ? 'Stop following' : 'Follow too'}
        </button>
        {!followed && (
          <button
            className="link-button"
            onClick={() => plan.send(`Tell me about ${c.name}`)}
          >
            Ask Plan about it
          </button>
        )}
      </div>
    </details>
  );
}

/** Beats with purpose, where they fall, one Scene or a run; and, when followed, the Scenes marked. */
function BeatTable({
  plan,
  beats,
  followed,
}: {
  plan: Plan;
  beats: Beat[];
  followed?: boolean;
}) {
  const pos = scenePositions(plan.state);
  return (
    <ol className="proto-plan-guide-beats">
      {beats.map((b) => {
        const on = pos.scenes.filter((x) =>
          plan.state.units[x.id].beats?.includes(b.id),
        );
        return (
          <li key={b.id}>
            <div className="proto-plan-guide-beat">
              <b>{b.name}</b>
              <span className="proto-plan-muted">
                {b.at ? `${b.at[0]}–${b.at[1]}%` : 'in order'}
                {b.run ? ' · a run of Scenes' : ' · one Scene'}
                {b.opensPart && ' · opens a Part'}
              </span>
            </div>
            <div className="proto-plan-guide-purpose">{b.purpose}</div>
            {followed && (
              <div className="proto-plan-guide-on">
                {on.length === 0 ? (
                  <span className="proto-plan-warn">not marked</span>
                ) : (
                  on.map((x) => (
                    <button
                      key={x.id}
                      className="link-button"
                      onClick={() => plan.select(x.id)}
                    >
                      {plan.state.units[x.id].title}{' '}
                      <span className="proto-plan-muted">
                        {Math.round(x.start)}%
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
