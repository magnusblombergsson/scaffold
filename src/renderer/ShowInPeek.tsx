import { useContext, useState } from 'react';
import { isKeyField, type KeyFieldItem } from '../shared/key-fields';
import { ENTRY_GROUP_TITLES, type EntryType } from '../shared/project-types';
import { useKeyFields } from './StatusAndTags';
import { ReadOnlyContext } from './read-only';

/**
 * Beside a field's label in the Entry view: whether the field is one of its
 * type's Key fields, which a shortened Peek and every Pinned note show, and
 * a switch to change that for every Entry of the type, as it says.
 */
export function ShowInPeek({
  type,
  item,
  label,
}: {
  type: EntryType;
  item: KeyFieldItem;
  /** The field's label, as the Entry view shows it. */
  label: string;
}) {
  const readOnly = useContext(ReadOnlyContext);
  // As the Author set it, until main has it too.
  const [setting, setSetting] = useState<boolean | null>(null);
  const on = setting ?? isKeyField(type, item, useKeyFields());
  const plural = ENTRY_GROUP_TITLES[type];
  return (
    <label
      className="show-in-peek"
      title={`Show ${label} in the Peek of all ${plural}, and in their Pinned notes`}
    >
      <input
        type="checkbox"
        aria-label={`Show ${label} in Peek for all ${plural}`}
        checked={on}
        disabled={readOnly}
        onChange={(event) => {
          setSetting(event.target.checked);
          window.project
            .setKeyField(type, item, event.target.checked)
            .catch((error: unknown) => console.error(error))
            .finally(() => setSetting(null));
        }}
      />
      {/* Named in full on the box, so that it adds nothing to the name of
          the heading or group it sits in. */}
      <span aria-hidden="true">Show in Peek for all {plural}</span>
    </label>
  );
}
