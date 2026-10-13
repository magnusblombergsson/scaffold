# Relations are records of their own that merge themselves and warn instead of repairing

A Relation (a connection the Author records between two Entries) is stored outside both Entries, as one small file of its own in a `relations/` folder, and merges on its own the way Custom fields do (ADR 0009): the later edit of each property wins, and a delete leaves a marker so that an edit made after it brings the Relation back. A *part of* or free-text Relation is one record naming its two Entries in order, its kind or label, and the Book it holds from. A *same as* group is one record listing its faces as switches, each with its own last-edited stamp, so that adding Malone on one computer and removing Bruce on another both survive. Decided in [Relations between Entries](https://github.com/magnusblombergsson/scaffold/issues/248).

We chose this because a Relation belongs to neither Entry, so storing it in one Entry's file would make the two sides disagree whenever only one file synced, and because a Relation is a quick deliberate act that a side-by-side Conflict would make heavier than the thing itself.

Merging can produce what the rules forbid: an Entry *part of* two parents, a *part of* loop, or one Entry in two *same as* groups. Scaffold keeps every record and shows a warning on the Entry until the Author fixes it, instead of quietly dropping one side. Meanwhile the Room nests an Entry under the parent from the later edit, shows a loop's Entries at top level, and treats two groups sharing a face as one group; the next edit to either group writes them as one record.

## Considered Options

- **In the Entry's file header, like Custom field values**: no new folder, but a Relation has two sides; storing it on one side makes the other Entry's file unaware of it, and storing it on both lets the copies disagree.
- **Pairs only, *same as* groups worked out from them**: one record shape, but removing one face can leave the group held together by another pair, which the Author would not expect.
- **Repair on merge, later edit wins**: keeps the rules true at all times, but silently loses a deliberate act, the loss ADR 0009 exists to prevent.
- **A Conflict**: loses nothing, but a Conflict UI for a one-line link is out of proportion; Conflicts stay for text (ADR 0008).

## Consequences

- No format bump (ADR 0006): older apps never list the new folder, so they simply don't show Relations.
- A Relation is hidden, not deleted, while either Entry is in Trash or the Drawer, and is removed only when Trash is emptied with that Entry. A record naming an Entry that doesn't exist (not yet synced, or gone) is kept and not shown.
- In a Series a Relation holds from the later of its own Book and each Entry's first appearance, worked out when read, so reordering Books or moving an Entry's first appearance needs no rewrite.
