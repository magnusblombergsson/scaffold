import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CallFailure } from '../shared/api';
import { labelRefusal, type CustomField } from '../shared/custom-field';
import {
  ENTRY_GROUP_TITLES,
  ENTRY_TYPE_LABELS,
  type EntryType,
} from '../shared/project-types';
import { customFieldKey } from '../shared/proposal';
import { Menu } from './Binder';
import { ShowInPeek } from './ShowInPeek';
import { ReadOnlyContext } from './read-only';

/**
 * A Custom field's heading in the Entry view: its label, and a menu to
 * rename it, move it among its type's fields, or delete it, which main
 * confirms. Each change applies to every Entry of the type.
 */
export function CustomFieldHeading({
  field,
  index,
  fields,
}: {
  field: CustomField;
  /** Its place among its type's fields. */
  index: number;
  /** Every Custom field of the Project, to refuse a label one has. */
  fields: CustomField[];
}) {
  const readOnly = useContext(ReadOnlyContext);
  const [renaming, setRenaming] = useState(false);
  const count = fields.filter((f) => f.type === field.type).length;
  const plural = ENTRY_GROUP_TITLES[field.type];
  if (renaming) {
    return (
      <LabelInput
        initial={field.label}
        label={`Rename ${field.label}`}
        refusal={(label) => labelRefusal(label, field.type, fields, field.id)}
        submit={(label) =>
          label === field.label
            ? Promise.resolve()
            : window.project.renameCustomField(field.id, label)
        }
        onDone={() => setRenaming(false)}
      >
        Rename
      </LabelInput>
    );
  }
  return (
    <div className="custom-field-heading">
      <h3>{field.label}</h3>
      <ShowInPeek
        type={field.type}
        item={customFieldKey(field.id)}
        label={field.label}
      />
      <Menu
        label={`Field actions: ${field.label}`}
        disabled={readOnly}
        items={[
          { label: 'Rename…', run: () => setRenaming(true) },
          {
            label: 'Move up',
            disabled: index === 0,
            run: () =>
              logFailure(window.project.moveCustomField(field.id, index - 1)),
          },
          {
            label: 'Move down',
            disabled: index === count - 1,
            run: () =>
              logFailure(window.project.moveCustomField(field.id, index + 1)),
          },
          {
            label: `Delete from all ${plural}…`,
            run: () => logFailure(window.project.trashCustomField(field.id)),
          },
        ]}
      />
    </div>
  );
}

/** A change that failed shows nowhere else: it is logged. */
function logFailure(change: Promise<unknown>): void {
  change.catch((error: unknown) => console.error(error));
}

/**
 * After an Entry's last field: adds a Custom field to every Entry of
 * `type`, named as the Author types it.
 */
export function AddCustomField({
  type,
  fields,
}: {
  type: EntryType;
  fields: CustomField[];
}) {
  const readOnly = useContext(ReadOnlyContext);
  const [adding, setAdding] = useState(false);
  const plural = ENTRY_GROUP_TITLES[type];
  if (adding) {
    return (
      <LabelInput
        initial=""
        label={`New field for every ${ENTRY_TYPE_LABELS[type]}`}
        placeholder="Field name, such as Allegiance"
        refusal={(label) => labelRefusal(label, type, fields)}
        submit={(label) => window.project.addCustomField(type, label)}
        onDone={() => setAdding(false)}
      >
        Add
      </LabelInput>
    );
  }
  return (
    <button
      className="link-button custom-field-add"
      disabled={readOnly}
      onClick={() => setAdding(true)}
    >
      + Add a field to all {plural}
    </button>
  );
}

/**
 * A field's label being typed: Enter or the button saves it, unless
 * `refusal` says why not, and Escape cancels. What main refuses is shown
 * too, and the Author may try again.
 */
function LabelInput({
  initial,
  label,
  placeholder,
  refusal,
  submit,
  onDone,
  children,
}: {
  initial: string;
  label: string;
  placeholder?: string;
  refusal(label: string): string | null;
  submit(label: string): Promise<unknown>;
  onDone(): void;
  /** The save button's text. */
  children: ReactNode;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);

  async function save() {
    const refused = refusal(text);
    if (refused) {
      setError(refused);
      return;
    }
    setBusy(true);
    try {
      await submit(text.trim());
      onDone();
    } catch (failure) {
      setError((failure as CallFailure).message);
      setBusy(false);
    }
  }

  return (
    <div className="custom-field-label" role="group" aria-label={label}>
      <div className="custom-field-label-row">
        <input
          ref={input}
          type="text"
          aria-label={label}
          aria-invalid={error !== null}
          placeholder={placeholder}
          value={text}
          disabled={busy}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void save();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onDone();
            }
          }}
        />
        <button disabled={busy} onClick={() => void save()}>
          {children}
        </button>
        <button disabled={busy} onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
