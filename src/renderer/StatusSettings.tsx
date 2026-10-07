import { useEffect, useRef, useState } from 'react';
import {
  STATUS_COLOURS,
  type Status,
  type StatusColour,
} from '../shared/status';
import type { StatusEdit } from '../shared/api';
import { capitalized } from '../shared/unit-name';
import { StatusDot } from './Binder';
import { NameField } from './NameField';

/**
 * Project Settings' Statuses: the ordered Status list, edited in place
 * (v3 spec §1, §14). A change is saved at once, made to the list as saved,
 * so what another computer changed meanwhile is kept; one that can't be
 * saved goes back, once main has warned the Author. Units name a Status by id, so
 * a rename relabels them all. A delete first asks where the units that have
 * the Status go.
 */
export function StatusSettings({
  statuses,
  readOnly,
}: {
  /** The Status list as main last said. */
  statuses: Status[];
  readOnly: boolean;
}) {
  /** The Status being deleted, and how many units have it. */
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  /** A Status just added, whose name takes focus. */
  const [added, setAdded] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  /** Saved, `statuses` follows from main before this resolves. */
  function edit(change: StatusEdit): Promise<boolean> {
    return window.project.editStatus(change);
  }

  function add() {
    const used = new Set(statuses.map((s) => s.colour));
    const status: Status = {
      id: crypto.randomUUID(),
      name: 'New Status',
      colour: STATUS_COLOURS.find((c) => !used.has(c)) ?? 'grey',
    };
    setAdded(status.id);
    void edit({ type: 'add', status });
  }

  /** Deletes a Status no unit has; asks where they go first if any do. */
  async function startDeleting(status: Status) {
    try {
      const uses = await window.project.statusUses(status.id);
      if (uses > 0) {
        setDeleting({ status, uses });
      } else if (await window.project.deleteStatus(status.id, null)) {
        addButton.current?.focus();
      }
    } catch (error) {
      console.error(`Can't delete the Status ${status.name}:`, error);
    }
  }

  return (
    <section aria-labelledby="statuses-heading">
      <h3 id="statuses-heading">Statuses</h3>
      <ol className="status-settings">
        {statuses.map((status, index) => (
          <li key={status.id}>
            <StatusDot status={status} named={false} />
            <NameField
              name={status.name}
              label={`Name of ${status.name}`}
              disabled={readOnly}
              focus={added === status.id}
              onRename={(name) =>
                edit({ type: 'change', statusId: status.id, change: { name } })
              }
            />
            <select
              aria-label={`Colour of ${status.name}`}
              value={status.colour}
              disabled={readOnly}
              onChange={(event) =>
                void edit({
                  type: 'change',
                  statusId: status.id,
                  change: { colour: event.target.value as StatusColour },
                })
              }
            >
              {STATUS_COLOURS.map((colour) => (
                <option key={colour} value={colour}>
                  {capitalized(colour)}
                </option>
              ))}
            </select>
            <button
              aria-label={`Move ${status.name} up`}
              title="Move up"
              disabled={readOnly || index === 0}
              onClick={() =>
                void edit({
                  type: 'move',
                  statusId: status.id,
                  index: index - 1,
                })
              }
            >
              ↑
            </button>
            <button
              aria-label={`Move ${status.name} down`}
              title="Move down"
              disabled={readOnly || index === statuses.length - 1}
              onClick={() =>
                void edit({
                  type: 'move',
                  statusId: status.id,
                  index: index + 1,
                })
              }
            >
              ↓
            </button>
            <button
              aria-label={`Delete ${status.name}`}
              title="Delete"
              disabled={readOnly || deleting !== null}
              onClick={() => void startDeleting(status)}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      {deleting ? (
        <DeleteStatus
          deleting={deleting}
          others={statuses.filter((s) => s.id !== deleting.status.id)}
          disabled={readOnly}
          onDone={() => {
            setDeleting(null);
            // Focus would be lost with the form; Add Status is still there.
            requestAnimationFrame(() => addButton.current?.focus());
          }}
        />
      ) : (
        <button ref={addButton} disabled={readOnly} onClick={add}>
          Add Status
        </button>
      )}
    </section>
  );
}

/** A Status being deleted, and how many Chapters and Scenes have it. */
type Deleting = { status: Status; uses: number };

/** Asks where the units that have a Status go, before deleting it. */
function DeleteStatus({
  deleting: { status, uses },
  others,
  disabled,
  onDone,
}: {
  deleting: Deleting;
  others: Status[];
  disabled: boolean;
  onDone(): void;
}) {
  /** The id of the Status they move to; '' for none. */
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => select.current?.focus(), []);

  async function confirm() {
    setBusy(true);
    const deleted = await window.project
      .deleteStatus(status.id, moveTo === '' ? null : moveTo)
      .catch(() => false);
    // Not deleted, main has told the Author; they may try again or cancel.
    if (deleted) onDone();
    else setBusy(false);
  }

  return (
    <div
      className="status-delete"
      role="group"
      aria-label={`Delete ${status.name}`}
    >
      <p>
        {uses === 1
          ? `1 Scene or Chapter has ${status.name}.`
          : `${uses} Scenes and Chapters have ${status.name}.`}
      </p>
      <label className="setting">
        Move them to
        <select
          ref={select}
          value={moveTo}
          disabled={disabled || busy}
          onChange={(event) => setMoveTo(event.target.value)}
        >
          <option value="">No Status</option>
          {others.map((other) => (
            <option key={other.id} value={other.id}>
              {other.name}
            </option>
          ))}
        </select>
      </label>
      <div className="settings-actions">
        <button disabled={disabled || busy} onClick={() => void confirm()}>
          Delete
        </button>
        <button disabled={busy} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
