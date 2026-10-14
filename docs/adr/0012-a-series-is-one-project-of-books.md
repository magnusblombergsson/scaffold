# A Series is one Project holding several Books, not several Projects linked together

A book series is one Project holding several Books, each with its own Manuscript of Parts, Chapters and Scenes, all sharing the Project's one Story Bible, Trash, Drawer and Conversations. A Project with a single Book is today's Project and shows no Book level. We chose this because a Project folder is the unit that syncs (ADR 0002): files are flat and id-named, so moving a Scene or Chapter between Books only changes `project.json`, and a shared Story Bible needs no owner outside the folder. Decided in [Book series: a Project can hold several Books](https://github.com/magnusblombergsson/scaffold/issues/242).

A Series needs no format bump (ADR 0006). Books are stored in new `project.json` keys beside the flat `chapters` list, as Parts are (ADR 0010), and Evolutions in new keys in each Entry's file. An older app keeps both, shows the whole Series as one flat Manuscript, and shows and edits only each Entry's own values. That view is misleading, but nothing is misapplied, and a bump would lock out the Author's second computer until its app is updated.

As built ([Evolutions](https://github.com/magnusblombergsson/scaffold/issues/243)): an Entry's Evolutions are one header key of `bible/<id>.md`, `evolutions`, by Book id and then by field, as a Proposal names fields (`name`, `voice.examples`, `custom:<id>` among them); a value this app doesn't understand is kept. It is Entry text, so two versions that differ in it are in Conflict, and the Conflict shows each Evolution as a part of its own, such as "Name from Book 2". The Book an Entry first appears in (`firstAppears`) and its images from a Book on (`evolvedImages`, by Book id, each `images/<entry id>.<book id>.<ext>`) are unit details, merged on their own (ADR 0008); `evolvedImages` is one key, so two computers each giving an image to a different Book at once keep only the later. Emptying Trash of a Book takes its Evolutions off every Entry.

## Considered Options

- **One Project per Book, linked into a Series**: each Book stays small and separately openable, but nothing in the app spans folders today. Moving a Scene between Books would move files between synced folders, the churn ADR 0002 avoids. A shared Story Bible would need a folder of its own, with its own conflicts and its own question of which Project owns an Entry.

## Consequences

- "Project" no longer means one novel: everything that was per Manuscript (its Word target, a Manuscript Export, a Manuscript Import) is now per Book.
- A Series grows inside one folder, so a long Series is a larger Project to sync, back up and scan for mentions.
