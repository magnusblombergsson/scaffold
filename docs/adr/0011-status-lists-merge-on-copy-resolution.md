# The Status lists of project.json's sync copies merge; the rest of the file still wins whole

When a sync client leaves a copy of `project.json` beside it, Scaffold still keeps one copy whole, as before: the one with the higher `format`, or the original if they are equal, and the other goes to Trash. The Status list is the one exception. Before the kept copy is written, its Status list is merged with the other's by Status id. A Status in both keeps the kept copy's name, colour and position. A Status only the other copy had is added after the kept copy's, in the other copy's order. If either copy holds no readable list, the other's is used as is. Decided in [Merge the Status lists of project.json's sync copies](https://github.com/magnusblombergsson/scaffold/issues/218).

We chose this because adding a Status is a deliberate act the Author would be confused to lose, and losing it was silent: the Author is told only about Chapters and Scenes lost with the other copy. This amends what ADRs 0008 and 0009 say about `project.json`'s copies never merging, for the Status list alone.

## Considered Options

- **Leave it, as ADR 0009 did**: no new rule, but a Status added on one computer keeps vanishing whenever the other computer saved `project.json` at about the same time.
- **Move the Status list out of `project.json`, one file per Status merging itself like Custom fields (ADR 0009)**: deletes and renames would merge too, but every older Project would need its list moved. Units already name Statuses by id in their own files (ADR 0008), so the list itself is all that needs saving from loss.
- **Merge every setting in `project.json`**: the Prose language and the folded-note image are single values with no id to merge by, and the tree already has its own rule (what only the other copy placed becomes Unplaced).

## Consequences

- A Status deleted on one computer comes back if the other copy still had it, since a delete leaves no marker. A rename or recolour made only in the copy that loses is lost, and its Status keeps the kept copy's name and colour.
- When the merge adds a Status, `project.json` is rewritten even if the original was kept. While the Project is open, the Author's windows hear of it as any other change to the Status list.
- No format bump (ADR 0006): the list's shape is unchanged, and an older app resolving copies keeps letting one win whole.
- The merged list is written as this app reads it, so a colour it doesn't know is written as grey, as already happens when the Author edits the list.
