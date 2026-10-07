# Unit details and Todos merge themselves; only text makes a Conflict

Scaffold v3 adds data the Author changes in quick clicks: a Scene's or Chapter's Status, Tags, Word target and image, an Entry's Tags, and Todos. When two computers disagree on any of it, Scaffold merges it on its own and never shows a Conflict. Only text (Prose, Outline and Notes text, an Entry's fields) can be a Conflict. Setting a Status on one computer while typing an Outline on another should never cost the Author a Conflict, and Todos were decided as never making one ("later edit wins, edit beats delete"). Decided in [Project format changes for v3](https://github.com/magnusblombergsson/scaffold/issues/125).

- **Unit details** live as keys in the header of the unit's file: the Outline file for Scenes and Chapters (`outlines/project.md` for the Manuscript's Word target, as ADR 0002 planned), and the Entry file for Entry Tags. When two versions of a file differ, these keys are merged one by one, and where both changed the same key the later save wins. The text alone decides whether there is a Conflict. The same rule applies when the pre-save check finds the file changed on disk.
- **Todos** are one small file each, in `todos/`, carrying their text, done tick, link, position and when each was last edited. Copies of one Todo's file are merged automatically: the later edit wins. A delete leaves a deleted marker for about 30 days instead of removing the file, so that an edit made after the version the deleter saw beats the delete. Drag order is a position on each Todo, so moving one rewrites only that one.

## Considered Options

- **Everything is a Conflict, as before**: simple and uniform, but a Status click, or a ticked Todo, would regularly produce Conflicts that have nothing to read or choose between.
- **Unit details in `project.json`, beside the titles**: one file to read on open, but it is the file every open depends on, and its sync copies are never merged (one wins whole), so changes would be silently lost.
- **Todos as one append-only change log per computer** (`todos/<computer>.jsonl`): sync never makes copies, but the logs grow forever unless compacted.

## Consequences

- Neither needs a format bump (ADR 0006). The MVP and v2 keep header keys they don't know and never look in `todos/`, so v3 still writes format 1. An older app still treats a header-only difference as a Conflict. Choosing a version there can undo a Status change, but never corrupts anything.
- A Status is stored on the unit as the id of an item in the Project's Status list (in `project.json`), so renaming a Status rewrites only the list. A unit whose Status id is not in the list shows as having no Status, and keeps the id until the Author sets another. Tags are stored by their spelling, so renaming a Tag rewrites every unit that has it.
- Scene and Chapter images are stored like Entry images (`images/<id>.<ext>`, named in the unit's Outline header) and move to and from Trash in the same way.
- Remembered Export choices and the Filter stay in each computer's own settings, not in the Project.
