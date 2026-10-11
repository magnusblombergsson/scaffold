# Parts live beside the flat Chapter list in project.json, which an app without Parts still reads

A Project's Parts are stored in `project.json`'s tree as two keys beside `chapters`: `parts`, each Part's id, title and Chapters by id, and `top`, the order of the Parts and Loose Chapters. `chapters` stays the list of every Chapter, now kept in reading order, so an app without Parts still shows the whole Manuscript, flat. A Chapter that `chapters` holds but neither `top` nor a Part places is an Unplaced Chapter, as when an app without Parts adds one. A Project with no Part has neither key and is written exactly as before. A Part's details live in the header of its Outline file, as a Chapter's do (ADR 0008). A Part in Trash is recorded as `trash/<id>.part.json`, and each of its Chapters as an ordinary Chapter record marked as deleted with it. Decided in [Optional Parts (Acts/Episodes) above Chapters](https://github.com/magnusblombergsson/scaffold/issues/214).

We chose this because it needs no format bump (ADR 0006). An app without Parts keeps unknown keys in the tree and in Chapter records, never lists `*.part.json`, and so never mistakes a Part for a Chapter. It goes without Parts and misapplies nothing.

## Considered Options

- **Parts as nodes in `chapters`**: one list, but an older app would show each Part as an empty Chapter and could put Scenes in it.
- **A `part` key on each Chapter node**: no separate lists, but an empty Part has no place in the order, and the order of Parts and Loose Chapters would have to be inferred.
- **Merging `project.json` copies**: would keep both of two computers' moves, but `project.json` copies are resolved by one winning whole (ADR 0004), and merging only the Part keys could leave a Chapter in two Parts.

## Consequences

- When two computers rearrange Parts at once, one version of `project.json` is kept whole, as for Chapters and Scenes: a Chapter is never in two places, and the Parts only the other version had are reported as dropped. Part details merge one by one like any other unit details.
- An app without Parts can reorder or retitle Chapters and move Scenes: retitling and moving Scenes are kept. Its reordering of Chapters is not, because `top` and the Parts decide the order once there is a Part. A Chapter it adds is Unplaced until the Author places it, and one it deletes leaves its Part.
- A Chapter an app without Parts restores from Trash keeps the record's Part as an unknown key on its node, which this app ignores. The Chapter then shows as Unplaced.
