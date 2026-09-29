# Append-only Conversation logs that also hold Proposals

Each Conversation is one append-only JSONL file, `conversations/<id>.jsonl`. It starts with a header line (id, Mode, title, created, format version; see ADR 0004) followed by one event per line: Author and Assistant messages, compaction summaries, retitles, and Proposal events (proposed, edited, accepted, rejected, undone). A pending Proposal is not stored anywhere else; the app derives it from the log. We chose this because a Proposal only makes sense next to the exchange that produced it, and because a log that is only ever appended to cannot be half-rewritten by a crash.

**Amended 2026-09-29.** We originally also claimed that append-only files survive Dropbox/OneDrive better than rewritten ones. The hands-on sync test showed this is false for OneDrive: an appended log forks into `<id>-<HOST>.jsonl` exactly like a rewritten file, with the same header line and therefore the same Conversation id. See the fork rule under Consequences.

## Considered Options

- **One thread per Mode**: simplest, but it grows forever and mixes unrelated topics in one file that every session appends to.
- **A `proposals/` directory, one file per Proposal**: makes a Project-wide review list trivial, but it splits one exchange across two places. The files are also rewritten or deleted on every decision. A review list can instead be an index built by scanning the logs.
- **Storing the context sent to the model (Prose and Story Bible snapshots)**: allows exact replay, but it duplicates the Manuscript and could leak private notes into the log. Transcripts store only the ids of the Scenes and Entries in focus, and each turn rebuilds the context from the current Project.

## Consequences

- Conversations are not listed in `project.json`; the app lists them by scanning `conversations/`.
- A sync conflict copy of a log is kept as a separate Conversation, not merged. A union of events would interleave two exchanges neither side saw, and could accept the same Proposal twice. On detection the app writes a new `conversations/<new-uuid>.jsonl` whose header has a new id, `forkedFrom: <id>` and the title "<title> (from <HOST>)", copies the events over, and moves the conflict copy to Trash. Pending Proposals duplicated across the two are safe: once one is accepted, the base-value check shows the other as stale or already applied.
- Deleting a Conversation moves the whole file to Trash, pending Proposals included. Single messages cannot be deleted.
- Proposals are field-level: each field records its base value and its proposed value. An Outline Proposal records the whole Outline body instead. The base values detect stale Proposals. They also recover from a crash between writing the target and appending `accepted`: the target is written first, and on load a pending Proposal whose proposed values already equal the target's current values is treated as applied.
- An accepted Proposal can be undone from its card, across sessions. The `accepted` event records, per field, the value it replaced and the value it wrote, since a stale or edited Proposal's base is not what was in the target. Undo is offered only while the target still holds the written values; it writes the replaced values back (target first), appends `undone`, and the Proposal is pending again. Undoing a create-Entry Proposal moves the untouched Entry to Trash. Added by [Undo for Story Bible edits and accepted Proposals](https://github.com/magnusblombergsson/writing-tools/issues/27).
