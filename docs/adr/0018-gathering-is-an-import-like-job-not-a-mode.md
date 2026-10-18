# A Gathering is an Import-like job, not a Mode

An Author with Prose but an empty Story Bible, typically after a Manuscript Import, wants the Assistant to find the story's Entries in what is already written. This is a **Gathering**: a Story Bible action, outside any Conversation or Mode, that reads the chosen Prose Chapter by Chapter and ends in one list of candidates that the Author edits, ticks, and accepts and undoes as a whole, as with a Story Bible Import. Besides Writing, it is the only reader of Prose. Interview still asks the Author, and Plan still never reads the Prose. Decided in [Build a Story Bible from the Prose](https://github.com/magnusblombergsson/scaffold/issues/348).

We chose this because reading a novel takes many requests, while a Conversation sends one per turn, and because reviewing dozens of Entries at once is the shape a Story Bible Import already has. Keeping the candidates out of Proposals keeps that term what it is: a suggestion made in a Conversation, with its own staleness and undo.

## Considered Options

- **An Interview focus "from the Prose"**: reuses a Room and its Proposals, but Interview is defined by asking the Author, a whole book doesn't fit one turn, and Proposals arriving one turn at a time make a long review.
- **A fifth Mode**: a Room, prompt and Proposal rules of its own for work that isn't a dialogue.

## Consequences

- A result not yet reviewed is kept on this computer, not in the Project, so a paid run survives closing the app without syncing or causing Conflicts.
- A Gathering's additions to existing Entries only add, never replace, so they need no staleness rule.
- The never-Prose eval needs cases for Gathering before a Model counts as tested for it.
