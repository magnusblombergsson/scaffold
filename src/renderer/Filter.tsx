import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  filterOn,
  filterSummary,
  keepKnown,
  sameFilter,
  withValue,
  type Filter,
  type FilterPlace,
} from '../shared/filter';
import { ENTRY_TYPE_LABELS, ENTRY_TYPES } from '../shared/project-types';
import type { Status } from '../shared/status';
import { tagKey } from '../shared/tags';
import { StatusDot } from './Binder';
import { useStatuses } from './StatusAndTags';

/** The events after which the Tags in use may have changed. */
const TAG_EVENTS = new Set([
  'unitDetailsChanged',
  'entriesChanged',
  'structureChanged',
]);

/**
 * The Filter at `place`, as this computer remembers it for the Project, and
 * the Tags in use to pick from. A Tag no longer in use, or a Status no longer
 * in the list, drops out; one gone as the place opens is forgotten, so a
 * Filter emptied that way is off.
 */
export function useFilter(place: FilterPlace): {
  filter: Filter;
  setFilter(filter: Filter): void;
  inUse: string[];
} {
  const [stored, setStored] = useState<Filter | null>(null);
  const [inUse, setInUse] = useState<string[] | null>(null);
  const statuses = useStatuses();

  useEffect(() => {
    let current = true;
    void window.shell.filter(place).then((filter) => {
      if (current) setStored(filter);
    });
    // As when it follows a renamed Tag.
    const unsubscribe = window.shell.onFilter((filters) => {
      const filter = filters[place];
      if (filter) setStored(filter);
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [place]);

  useEffect(() => {
    let current = true;
    const read = () =>
      window.project.tags().then(
        (tags) => current && setInUse(tags),
        (error: unknown) => console.error("Can't list the Tags in use:", error),
      );
    void read();
    const unsubscribe = window.project.subscribe((event) => {
      if (TAG_EVENTS.has(event.type)) void read();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  // The same object while it chooses the same values, as the Tags in use
  // are read anew.
  const filterKey = JSON.stringify(
    stored && inUse ? keepKnown(stored, { tags: inUse, statuses }) : {},
  );
  const filter = useMemo(() => JSON.parse(filterKey) as Filter, [filterKey]);

  // Only as the place opens: a Tag may be gone for a moment while it is
  // renamed, before the Filter follows.
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !stored || !inUse) return;
    checked.current = true;
    if (!sameFilter(filter, stored)) window.shell.setFilter(place, filter);
  }, [place, stored, inUse, filter]);

  return {
    filter,
    setFilter: (next) => {
      setStored(next);
      window.shell.setFilter(place, next);
    },
    inUse: inUse ?? [],
  };
}

/**
 * The Filter button, and the panel it opens: Entry types or Statuses to
 * tick, and Tags picked from those in use. While a Filter is on, the button
 * sums it up with how many units it shows, and ✕ clears it. It changes
 * nothing the Assistant sees; Tick matching… uses it to tick units.
 */
export function FilterControl({
  filter,
  onChange,
  inUse,
  shown,
  total,
  by = 'types',
  label = 'Filter',
}: {
  filter: Filter;
  onChange(filter: Filter): void;
  inUse: string[];
  /** How many units match, of how many. */
  shown: number;
  total: number;
  /** What it filters on besides Tags: Entry types, or Statuses. */
  by?: 'types' | 'statuses';
  /** The button's name while no Filter is on. */
  label?: string;
}) {
  const statuses = useStatuses();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const on = filterOn(filter);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      // Not the dialog it may be in, too.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    }
  }

  return (
    <div className="filter" ref={root} onKeyDown={onKeyDown}>
      <div className="filter-buttons">
        <button
          ref={button}
          className="filter-button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-pressed={on}
          onClick={() => setOpen(!open)}
        >
          {on
            ? `${filterSummary(filter, statuses)} — ${shown} of ${total}`
            : label}
        </button>
        {on && (
          <button
            className="filter-clear"
            aria-label="Clear Filter"
            title="Clear Filter"
            onClick={() => onChange({})}
          >
            ✕
          </button>
        )}
      </div>
      {open && (
        <FilterPanel
          filter={filter}
          onChange={onChange}
          inUse={inUse}
          statuses={by === 'statuses' ? statuses : null}
        />
      )}
    </div>
  );
}

function FilterPanel({
  filter,
  onChange,
  inUse,
  statuses,
}: {
  filter: Filter;
  onChange(filter: Filter): void;
  inUse: string[];
  /** The Statuses to tick, or null for Entry types. */
  statuses: Status[] | null;
}) {
  const [typing, setTyping] = useState('');
  const listId = useId();
  const types = filter.types ?? [];
  const chosenStatuses = filter.statuses ?? [];
  const tags = filter.tags ?? [];
  const chosen = new Set(
    tags.flatMap((tag) => (tag === null ? [] : [tagKey(tag)])),
  );

  /** Picks the Tag in use spelled `text`, ignoring case; nothing else. */
  function pick(text: string): boolean {
    const tag = inUse.find((t) => tagKey(t) === tagKey(text.trim()));
    if (tag === undefined) return false;
    onChange(withValue(filter, 'tags', tag, true));
    setTyping('');
    return true;
  }

  return (
    <div className="filter-panel" role="dialog" aria-label="Filter">
      {statuses ? (
        <fieldset>
          <legend>Status</legend>
          {[...statuses, null].map((status) => (
            <label key={status?.id ?? ''}>
              <input
                type="checkbox"
                checked={chosenStatuses.includes(status?.id ?? null)}
                onChange={(event) =>
                  onChange(
                    withValue(
                      filter,
                      'statuses',
                      status?.id ?? null,
                      event.target.checked,
                    ),
                  )
                }
              />
              {status && <StatusDot status={status} named={false} />}
              {status?.name ?? 'No Status'}
            </label>
          ))}
        </fieldset>
      ) : (
        <fieldset>
          <legend>Type</legend>
          {ENTRY_TYPES.map((type) => (
            <label key={type}>
              <input
                type="checkbox"
                checked={types.includes(type)}
                onChange={(event) =>
                  onChange(
                    withValue(filter, 'types', type, event.target.checked),
                  )
                }
              />
              {ENTRY_TYPE_LABELS[type]}
            </label>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Tags</legend>
        <label>
          <input
            type="checkbox"
            checked={tags.includes(null)}
            onChange={(event) =>
              onChange(withValue(filter, 'tags', null, event.target.checked))
            }
          />
          No tags
        </label>
        <div className="tag-input">
          <ul className="tag-chips" aria-label="Chosen Tags">
            {tags.map(
              (tag) =>
                tag !== null && (
                  <li key={tag} className="tag-chip">
                    {tag}
                    <button
                      className="tag-remove"
                      aria-label={`Remove ${tag}`}
                      title="Remove"
                      onClick={() =>
                        onChange(withValue(filter, 'tags', tag, false))
                      }
                    >
                      ×
                    </button>
                  </li>
                ),
            )}
          </ul>
          <input
            aria-label="Filter by Tag"
            placeholder="A Tag in use"
            list={listId}
            value={typing}
            onChange={(event) => {
              const { value } = event.target;
              // A suggestion picked replaces the text at once.
              const { inputType } = event.nativeEvent as InputEvent;
              const picked =
                !inputType || inputType === 'insertReplacementText';
              if (!(picked && pick(value))) setTyping(value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                pick(typing);
              }
            }}
          />
          <datalist id={listId}>
            {inUse
              .filter((tag) => !chosen.has(tagKey(tag)))
              .map((tag) => (
                <option key={tag} value={tag} />
              ))}
          </datalist>
        </div>
      </fieldset>
    </div>
  );
}
