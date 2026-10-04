// PROTOTYPE (throwaway): the shortened peek card and the three ways to pin
// it (#68). See PeekSwitcher.tsx.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ENTRY_TYPE_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  type EntryValue,
} from '../../shared/project-types';
import { VISIBILITY_LABELS } from '../EntryView';
import type { MentionClick } from '../mention-highlight';
import { entryTitle } from '../StoryBible';
import { extrasOf } from './extras';

export type Pin = { id: string; x: number; y: number };

/** An Entry read once; null until it has been, or if it's gone. */
function useEntry(id: string): EntryValue | null {
  const [entry, setEntry] = useState<EntryValue | null>(null);
  useEffect(() => {
    let current = true;
    window.project
      .read({ kind: 'entry', id })
      .then((read) => current && setEntry(read))
      .catch(() => current && setEntry(null));
    return () => {
      current = false;
    };
  }, [id]);
  return entry;
}

type Field = [label: string, text: string];

/** Every field with a value, in the order the Entry view shows them. */
function allFields(entry: EntryValue): Field[] {
  const { voice, senses, status } = entry.fields;
  const extras = extrasOf(entry.name);
  const pairs: Field[] = [
    ['Appearance', entry.type === 'character' ? (extras.appearance ?? '') : ''],
    ['Voice traits', voice?.traits ?? ''],
    ['Says', voice?.says.join(', ') ?? ''],
    ['Never says', voice?.neverSays.join(', ') ?? ''],
    ['Example lines', voice?.examples.join('\n') ?? ''],
    ['Atmosphere', senses?.atmosphere ?? ''],
    ['Sight', senses?.sight ?? ''],
    ['Sound', senses?.sound ?? ''],
    ['Smells', senses?.smells ?? ''],
    ['Touch', senses?.touch ?? ''],
    ['Status', status ? STATUS_LABELS[status] : ''],
  ];
  return pairs.filter(([, text]) => text.trim());
}

/** The type's key fields, the ones the shortened card shows: at most two. */
const SHORT_FIELDS = [
  'Appearance',
  'Voice traits',
  'Atmosphere',
  'Sight',
  'Status',
];

/**
 * The shortened card: image, type, name, Role and Role note, the description
 * cut to three lines and the type's key fields, then Read more for the rest.
 */
export function ShortCard({
  entry,
  onOpen,
  actions,
  startExpanded = false,
  hideHeader = false,
}: {
  entry: EntryValue;
  onOpen(id: string): void;
  actions?: ReactNode;
  startExpanded?: boolean;
  hideHeader?: boolean;
}) {
  const [expanded, setExpanded] = useState(startExpanded);
  const extras = extrasOf(entry.name);
  const fields = allFields(entry);
  const short = fields
    .filter(([label]) => SHORT_FIELDS.includes(label))
    .slice(0, 2);
  const shown = expanded ? fields : short;
  const hasMore =
    entry.description.length > 160 ||
    fields.length > short.length ||
    short.some(([, text]) => text.length > 110) ||
    Boolean(extras.image);
  const role = entry.fields.role ? ROLE_LABELS[entry.fields.role] : '';
  const roleLine = [role, extras.roleNote].filter(Boolean).join(' · ');

  return (
    <article
      className={`pk-card${expanded ? ' pk-expanded' : ''}`}
      aria-label={entryTitle(entry)}
    >
      {expanded && extras.image && (
        <img
          className={`pk-image${extras.image.wide ? ' pk-wide' : ''}`}
          src={extras.image.src}
          alt=""
        />
      )}
      {!hideHeader && (
        <header className="pk-head">
          {!expanded && extras.image && (
            <img
              className={`pk-thumb${extras.image.wide ? ' pk-wide' : ''}`}
              src={extras.image.src}
              alt=""
            />
          )}
          <div className="pk-titles">
            <span className="pk-type">{ENTRY_TYPE_LABELS[entry.type]}</span>
            <h2>{entryTitle(entry)}</h2>
            {roleLine && <p className="pk-role">{roleLine}</p>}
          </div>
          <div className="pk-actions">
            {actions}
            <button
              className="pk-icon"
              aria-label={`Open “${entryTitle(entry)}”`}
              title="Open Entry"
              onClick={() => onOpen(entry.id)}
            >
              ↗
            </button>
          </div>
        </header>
      )}
      {hideHeader && (roleLine || (!expanded && extras.image)) && (
        <div className="pk-subhead">
          {!expanded && extras.image && (
            <img
              className={`pk-thumb${extras.image.wide ? ' pk-wide' : ''}`}
              src={extras.image.src}
              alt=""
            />
          )}
          {roleLine && <p className="pk-role">{roleLine}</p>}
        </div>
      )}
      {entry.aliases.length > 0 && (
        <p className="pk-aliases">Also: {entry.aliases.join(', ')}</p>
      )}
      {entry.description.trim() && (
        <p className="pk-description">{entry.description}</p>
      )}
      {shown.length > 0 && (
        <dl className="pk-fields">
          {shown.map(([label, text]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{text}</dd>
            </div>
          ))}
          {expanded && (
            <div>
              <dt>Assistant sees it</dt>
              <dd>{VISIBILITY_LABELS[entry.visibility]}</dd>
            </div>
          )}
        </dl>
      )}
      {hasMore && (
        <button className="pk-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </article>
  );
}

function PinButton({ pinned, onClick }: { pinned: boolean; onClick(): void }) {
  return (
    <button
      className="pk-icon pk-pin"
      aria-pressed={pinned}
      title={pinned ? 'Unpin' : 'Pin while writing'}
      onClick={onClick}
    >
      📌
    </button>
  );
}

/**
 * The peek below a clicked highlight, with the shortened card and a pin on
 * each Entry. Escape, a click elsewhere, or scrolling closes it, as today.
 */
export function PeekPopover({
  peek,
  pinnedIds,
  onTogglePin,
  onOpen,
  onClose,
}: {
  peek: MentionClick;
  pinnedIds: string[];
  onTogglePin(id: string, at: { x: number; y: number }): void;
  onOpen(id: string): void;
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const closeOutside = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('scroll', closeOutside, true);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('scroll', closeOutside, true);
    };
  }, [onClose]);

  const width = 340;
  const { anchor } = peek;
  const left = Math.max(
    8,
    Math.min(anchor.left, window.innerWidth - width - 8),
  );
  const top = anchor.bottom + 4;
  return (
    <div
      ref={ref}
      className="pk-popover"
      role="dialog"
      aria-label="Story Bible peek"
      style={{ top, left, width }}
    >
      {peek.entryIds.map((id) => (
        <PopoverEntry
          key={id}
          id={id}
          pinned={pinnedIds.includes(id)}
          onTogglePin={() => {
            onTogglePin(id, { x: left, y: top });
            onClose();
          }}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function PopoverEntry({
  id,
  pinned,
  onTogglePin,
  onOpen,
}: {
  id: string;
  pinned: boolean;
  onTogglePin(): void;
  onOpen(id: string): void;
}) {
  const entry = useEntry(id);
  if (!entry) return null;
  return (
    <ShortCard
      entry={entry}
      onOpen={onOpen}
      actions={<PinButton pinned={pinned} onClick={onTogglePin} />}
    />
  );
}

// ---------------------------------------------------------------- A

/**
 * A: pinned cards dock into the column the Overview pane opens in, left of
 * the Prose. With the Overview pane open they stack under it; with it closed
 * the column holds only them.
 */
export function DockedColumn({
  overview,
  pins,
  onUnpin,
  onOpen,
}: {
  overview: ReactNode | null;
  pins: Pin[];
  onUnpin(id: string): void;
  onOpen(id: string): void;
}) {
  if (!overview && pins.length === 0) return null;
  return (
    <div className="pk-column">
      {overview && <div className="pk-column-overview">{overview}</div>}
      {pins.length > 0 && (
        <section
          className={`pk-column-pins${overview ? '' : ' pk-alone'}`}
          aria-label="Pinned Entries"
        >
          <h3 className="pk-column-title">Pinned</h3>
          {pins.map((pin) => (
            <DockedPin
              key={pin.id}
              id={pin.id}
              onUnpin={() => onUnpin(pin.id)}
              onOpen={onOpen}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function DockedPin({
  id,
  onUnpin,
  onOpen,
}: {
  id: string;
  onUnpin(): void;
  onOpen(id: string): void;
}) {
  const entry = useEntry(id);
  const [open, setOpen] = useState(true);
  if (!entry) return null;
  return (
    <div className="pk-docked">
      <div className="pk-docked-bar">
        <button
          className="pk-docked-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> {entryTitle(entry)}
        </button>
        <button
          className="pk-icon"
          title="Open Entry"
          onClick={() => onOpen(entry.id)}
        >
          ↗
        </button>
        <button className="pk-icon" title="Unpin" onClick={onUnpin}>
          ×
        </button>
      </div>
      {open && <ShortCard entry={entry} onOpen={onOpen} hideHeader />}
    </div>
  );
}

// ---------------------------------------------------------------- B

/**
 * B: a pinned card floats where the peek was, over the page, until the
 * Author drags it aside by its header, folds it to its title, or unpins it.
 */
export function FloatingNotes({
  pins,
  onMove,
  onUnpin,
  onOpen,
}: {
  pins: Pin[];
  onMove(id: string, x: number, y: number): void;
  onUnpin(id: string): void;
  onOpen(id: string): void;
}) {
  return (
    <>
      {pins.map((pin) => (
        <FloatingNote
          key={pin.id}
          pin={pin}
          onMove={(x, y) => onMove(pin.id, x, y)}
          onUnpin={() => onUnpin(pin.id)}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}

function FloatingNote({
  pin,
  onMove,
  onUnpin,
  onOpen,
}: {
  pin: Pin;
  onMove(x: number, y: number): void;
  onUnpin(): void;
  onOpen(id: string): void;
}) {
  const entry = useEntry(pin.id);
  const [folded, setFolded] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  if (!entry) return null;

  const width = 320;
  const x = Math.max(0, Math.min(pin.x, window.innerWidth - width));
  const y = Math.max(0, Math.min(pin.y, window.innerHeight - 48));

  return (
    <div
      className={`pk-float${folded ? ' pk-folded' : ''}`}
      style={{ left: x, top: y, width }}
      role="dialog"
      aria-label={`Pinned: ${entryTitle(entry)}`}
    >
      <div
        className="pk-float-handle"
        title="Drag to move"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { dx: event.clientX - x, dy: event.clientY - y };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          onMove(
            event.clientX - drag.current.dx,
            event.clientY - drag.current.dy,
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <span className="pk-grip" aria-hidden="true">
          ⠿
        </span>
        <span className="pk-float-name">{entryTitle(entry)}</span>
        <button
          className="pk-icon"
          title={folded ? 'Unfold' : 'Fold to title'}
          onClick={() => setFolded(!folded)}
        >
          {folded ? '▸' : '▾'}
        </button>
        <button
          className="pk-icon"
          title="Open Entry"
          onClick={() => onOpen(entry.id)}
        >
          ↗
        </button>
        <button className="pk-icon" title="Unpin" onClick={onUnpin}>
          ×
        </button>
      </div>
      {!folded && (
        <div className="pk-float-body">
          <ShortCard entry={entry} onOpen={onOpen} hideHeader />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- C

/**
 * C: pinned cards dock into a column right of the Prose, before the
 * Assistant, one tab per Entry, so the Overview pane on the left and the
 * pins never share a column.
 */
export function TabbedColumn({
  pins,
  active,
  onActivate,
  onUnpin,
  onOpen,
}: {
  pins: Pin[];
  active: string | null;
  onActivate(id: string): void;
  onUnpin(id: string): void;
  onOpen(id: string): void;
}) {
  if (pins.length === 0) return null;
  const shown = pins.find((pin) => pin.id === active) ?? pins[pins.length - 1];
  return (
    <aside className="pk-right" aria-label="Pinned Entries">
      <div className="pk-tabs" role="tablist">
        {pins.map((pin) => (
          <PinTab
            key={pin.id}
            id={pin.id}
            selected={pin.id === shown.id}
            onSelect={() => onActivate(pin.id)}
            onUnpin={() => onUnpin(pin.id)}
          />
        ))}
      </div>
      <div className="pk-right-body">
        <TabCard key={shown.id} id={shown.id} onOpen={onOpen} />
      </div>
    </aside>
  );
}

function PinTab({
  id,
  selected,
  onSelect,
  onUnpin,
}: {
  id: string;
  selected: boolean;
  onSelect(): void;
  onUnpin(): void;
}) {
  const entry = useEntry(id);
  return (
    <span className="pk-tab" aria-selected={selected}>
      <button role="tab" aria-selected={selected} onClick={onSelect}>
        {entry ? entryTitle(entry) : '…'}
      </button>
      <button className="pk-tab-x" title="Unpin" onClick={onUnpin}>
        ×
      </button>
    </span>
  );
}

function TabCard({ id, onOpen }: { id: string; onOpen(id: string): void }) {
  const entry = useEntry(id);
  if (!entry) return null;
  return <ShortCard entry={entry} onOpen={onOpen} />;
}
