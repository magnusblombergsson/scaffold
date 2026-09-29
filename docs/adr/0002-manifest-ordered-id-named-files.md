# Manifest-ordered, id-named files per Scene and Entry

A Project folder holds one file per Scene, Entry, Outline and Notes, each named by a UUID (`scenes/<id>.md`, `bible/<id>.md`, …) in flat directories. Chapter/Scene order and titles live only in `project.json`. We chose this because Dropbox/OneDrive are the main way a Project moves between computers, and in the prior art only a small manifest of stable ids survived sync: a conflict then touches one unit, and reordering, retitling or moving a Scene between Chapters never renames or moves a file.

## Considered Options

- **Readable filenames (`<slug>--<id>.md`)**: easier to browse, but a retitle renames the file, which is the rename-through-sync churn that scrambles Obsidian Longform projects.
- **Order in filename prefixes (Manuskript)**: a reorder renames every following file.
- **One file for the whole Project (bibisco)**: every edit conflicts with every other edit, and a crash can zero the whole novel.
- **Nested `chapters/<id>/` folders**: moving a Scene becomes a cross-folder file move.

## Consequences

- The folder is not meant to be browsed; reading the book outside the app goes through export.
- Each file also carries its id inside it, so a sync conflict copy can be matched back to its unit.
- The manifest holds structure only. Per-unit metadata (POV, status, targets) goes in the frontmatter of `outlines/<id>.md`, so the file every open depends on changes only on add, move, rename or delete.
- An Entry's private notes live in a separate `private/` directory that the Assistant-context loader is never given.
