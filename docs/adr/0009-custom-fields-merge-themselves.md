# Custom fields are one file each and merge themselves, not a list in project.json

A Project's Custom fields (free-text fields the Author adds to one Entry type) are each stored as one small file in a folder of their own, carrying the field's id, Entry type, label, position and when each was last edited. Copies of one field's file merge on their own the way Todos do (ADR 0008): the later edit of each property wins, and a delete leaves a marker so that an edit made after it brings the field back. An Entry holds its values in its own file's header, keyed by the field's id, so renaming a field rewrites only that field's file. Decided in [Let the Author add custom attributes to Entry types in a Project](https://github.com/magnusblombergsson/scaffold/issues/211).

We chose this because defining a field is a deliberate act the Author would be confused to lose, and `project.json`'s sync copies are never merged: one wins whole, so a field defined on one computer could vanish when the other computer changed anything else in that file at about the same time.

## Considered Options

- **A list in `project.json`, beside the Status list**: the obvious place and the existing precedent, but it inherits the silent loss described above.
- **A list in `project.json`, merged when its copies disagree**: would also protect the Status list, but it changes how every `project.json` copy is resolved, for a feature that only needs its own list.

## Consequences

- No format bump (ADR 0006): older apps never look in the new folder and keep the unknown header key in Entry files, so they simply don't show Custom fields.
- A deleted Custom field goes to Trash with its values; the values stay in the Entry files until Trash is emptied, so restoring brings them back unchanged.
- An Entry value whose field id is unknown (deleted, or defined on a computer whose file hasn't synced yet) is kept and not shown, like a Status id missing from the Status list.
- The Status list keeps its silent-loss risk; that is tracked separately.
