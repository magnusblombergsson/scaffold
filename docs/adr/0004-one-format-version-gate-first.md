# One Project format version, raised gate-first; logs are upcast, never rewritten

A Project has a single format version, `format: <N>`. It is stored in `project.json`, where it decides whether this app may open the Project, and in every unit file's frontmatter and every Conversation log header, where it records the version that file was written in. The version rises only for changes an older app would misread or destroy. Additive changes need no bump, because every app preserves fields and event types it does not recognise when it rewrites a file (a tolerant reader). We chose this because a Project moves between computers by sync, and each bump locks out any computer whose app is not yet updated. The forgotten, still-open old app on another computer is the realistic hazard.

## Considered Options

- **Bump for every format change**: simpler rules, but every small feature would strand the Author's second computer.
- **One version per file kind**: independent migrations, but several numbers to reason about, and no single gate to refuse a Project by.
- **Gate last (migrate files, then raise the version in `project.json`)**: matches the "unit file before manifest" save rule, but a crash leaves a folder that still says "old" while holding new-format files, which an old app would open and misread.
- **Rewriting Conversation logs in the new format**: breaks the append-only property of ADR 0003 on the largest, most fork-prone files.

## Consequences

- Upgrade order: write the backup zip (`backups/before-v<N>-<date>.zip`, which includes Trash but not `.sessions/` or earlier backups), raise the version in `project.json`, then rewrite every unit file eagerly. If this crashes, the next open finishes the pass without asking, and any file still in the old format is upgraded on read, because its own `format` says where it stands.
- Conversation logs are never rewritten. The migration appends a `formatChanged {format: N}` event, and older lines are upcast in memory through the same migration chain. The header's `format` is the log's starting version.
- The migration chain is kept forever, because a stale computer can still write old-format files into an upgraded Project.
- Before every write, an app checks the version in `project.json`. On seeing a newer one, it flushes its pending unit edits once in its own format, then goes read-only and never writes `project.json` again. If a `project.json` conflict copy has a higher version than the file at the original path, the higher version wins.
- An app never opens a Project newer than itself, not even read-only. There is no downgrade path. The backup zip is the only way back.
