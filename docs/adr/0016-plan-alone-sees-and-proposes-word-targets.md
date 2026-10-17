# Plan alone sees and proposes Word targets

Until now a Word target was never sent to the Assistant. Plan now sees the Word targets of its Book, and may propose setting or clearing one on a Scene, Chapter, Part or the Manuscript, and give an added unit one. Brainstorm, Interview and Writing still never see Word targets. Decided in [The built-in structure catalogue](https://github.com/magnusblombergsson/scaffold/issues/296), charted on [Map: Outline planner](https://github.com/magnusblombergsson/scaffold/issues/292).

We chose this because a Structure's Beats fall at shares of a Book's length, and planning a Book's length is part of planning its shape: the Author's rough length becomes the Manuscript's Word target, and Plan can size Scenes to their Beats. Where a Beat falls is measured in planned words when every Scene of the Book has a Word target, and otherwise by Scene order, never by a mix of the two.

## Considered Options

- **Scene order only, Word targets still unsent**: keeps the old rule whole and works on a bare skeleton, but positions are crude when Scenes differ widely in length, and Plan can't help the Author plan length at all.
- **Word targets in every Mode**: simpler to state, but no other Mode has a use for them, and Writing's advice should not turn into nagging about counts.

## Consequences

- A Word target Proposal is stale when that Word target has changed since it was made, and can be undone while the unit still holds the accepted value.
- The Book's own Word target is never used to measure positions, since it is not the sum of what the Book holds.
- With ADR 0015, Plan now has two exceptions to rules every other Mode keeps; which data a Mode is sent, like which Proposals it may make, is a per-Mode rule.
