# One Project format version, raised gate-first; logs are upcast, never rewritten

A Project has a single format version, `format: <N>`. It is stored in `project.json`, where it decides whether this app may open the Project, and in every unit file's frontmatter and every Conversation log header, where it records the version that file was written in. The version rises only for changes an older app would misread or destroy. Additive changes need no bump, because every app preserves fields and event types it does not recognise when it rewrites a file (a tolerant reader). We chose this because a Project moves between computers by sync, and each bump locks out any computer whose app is not yet updated. The forgotten, still-open old app on another computer is the realistic hazard.

**Amended 2026-10-14.** We originally put the upgrade backup inside the Project, in `backups/`. It now goes to this computer's Backup folder (ADR 0014), because a Backup inside the Project is synced and goes wherever a bad sync or a deleted folder takes the Project. Manual Back Up already refuses that place for the same reason. Decided in [Where the format-upgrade Backup goes](https://github.com/magnusblombergsson/scaffold/issues/260).

## Considered Options

- **Bump for every format change**: simpler rules, but every small feature would strand the Author's second computer.
- **One version per file kind**: independent migrations, but several numbers to reason about, and no single gate to refuse a Project by.
- **Gate last (migrate files, then raise the version in `project.json`)**: matches the "unit file before manifest" save rule, but a crash leaves a folder that still says "old" while holding new-format files, which an old app would open and misread.
- **Rewriting Conversation logs in the new format**: breaks the append-only property of ADR 0003 on the largest, most fork-prone files.

## Consequences

- Upgrade order: write the upgrade Backup, raise the version in `project.json`, then rewrite every unit file eagerly. The upgrade Backup is an ordinary Backup, restorable as a new Project, written to this computer's Backup folder in the Project's subfolder, even when automatic Backups are turned off. Its name says which format it was made before, so pruning never matches it and it is kept for good. The app never writes inside the Project's own `backups/` folder, and Backups still leave that folder out.
- If the upgrade Backup can't be written (the folder isn't available, the Project's files are online-only, or the write fails), the Project is not upgraded. The app says why and offers Back Up to… another location, refused inside the Project as manual Back Up is, after which the upgrade goes ahead, or Cancel, which leaves the Project unopened. For online-only files it says to make them available offline first. Upgrading without a Backup is never offered. If this crashes, the next open finishes the pass without asking, and any file still in the old format is upgraded on read, because its own `format` says where it stands.
- Conversation logs are never rewritten. The migration appends a `formatChanged {format: N}` event, and older lines are upcast in memory through the same migration chain. The header's `format` is the log's starting version.
- The migration chain is kept forever, because a stale computer can still write old-format files into an upgraded Project.
- Before every write, an app checks the version in `project.json`. On seeing a newer one, it flushes its pending unit edits once in its own format, then goes read-only and never writes `project.json` again. If a `project.json` conflict copy has a higher version than the file at the original path, the higher version wins.
- An app never opens a Project newer than itself, not even read-only. There is no downgrade path. The upgrade Backup, on the computer that upgraded, is the only way back; a computer whose app is not yet updated gets back in by updating it.
