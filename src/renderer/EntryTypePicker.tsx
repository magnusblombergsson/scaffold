import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  type EntryType,
} from '../shared/project-types';

/**
 * The menu of Entry types Ctrl+E opens: ↑/↓ or a type's first letter picks,
 * Enter creates, Escape closes it and returns focus to where it was.
 */
export function EntryTypePicker({
  onPick,
  onClose,
}: {
  onPick(type: EntryType): void;
  onClose(): void;
}) {
  const [index, setIndex] = useState(0);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const [before] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(() => items.current[index]?.focus(), [index]);

  function close() {
    onClose();
    before?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    const last = ENTRY_TYPES.length - 1;
    const key = event.key;
    if (key === 'ArrowDown') setIndex(index === last ? 0 : index + 1);
    else if (key === 'ArrowUp') setIndex(index === 0 ? last : index - 1);
    else if (key === 'Home') setIndex(0);
    else if (key === 'End') setIndex(last);
    else if (key === 'Enter') onPick(ENTRY_TYPES[index]);
    else if (key === 'Escape') close();
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey) {
      // The next type with that letter, so Place and Plot Thread take turns.
      const letter = key.toLowerCase();
      const next = [...ENTRY_TYPES.keys()]
        .map((i) => (index + 1 + i) % ENTRY_TYPES.length)
        .find((i) =>
          ENTRY_TYPE_LABELS[ENTRY_TYPES[i]].toLowerCase().startsWith(letter),
        );
      if (next === undefined) return;
      setIndex(next);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div className="menu entry-type-picker">
      <div
        role="menu"
        aria-label="New Entry"
        className="menu-items"
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onClose();
        }}
      >
        {ENTRY_TYPES.map((type, i) => (
          <button
            key={type}
            ref={(item) => {
              items.current[i] = item;
            }}
            role="menuitem"
            tabIndex={i === index ? 0 : -1}
            onClick={() => onPick(type)}
          >
            {ENTRY_TYPE_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  );
}
