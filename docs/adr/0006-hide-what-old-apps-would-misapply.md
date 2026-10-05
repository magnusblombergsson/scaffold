# Hide what old apps would misapply, before bumping the format

When a change would be misread by an older app, Scaffold first tries to store it where that app cannot see it: a new log event type, a new frontmatter or manifest key, or a file in a subfolder. An older app skips unknown event types, keeps unknown keys, and never lists subfolders, so it simply goes without the feature and does not misuse it. The format version (ADR 0004) is raised only when hiding the change is not possible. Scaffold v2 needs no bump this way and still writes format 1. Decided in [Project format changes in v2: which need a format bump](https://github.com/magnusblombergsson/scaffold/issues/73).

The case that forced the rule was Append and Add Proposals. They store only the added part, with no base. The MVP ignores an unknown `operation` key on `proposal.proposed` and applies every Proposal as a Replace, so accepting one there would overwrite a whole field with the fragment. Logged as a new event type, `proposal.offered`, these Proposals are invisible to the MVP. Replace Proposals keep `proposal.proposed` and work in both apps.

## Considered Options

- **Bump to format 2**: honest and simple, but every computer whose app isn't updated yet is locked out of the Project, and it brings the backup zip and the first migration chain for a single feature.
- **`operation` on the existing event**: the obvious shape, but the MVP would silently misapply it.
- **Store Append as a full Replace value with a base**: the MVP would apply it correctly, but it gives up the "never goes stale" property that Append exists for.

## Consequences

- On an older app a newer Project loses features without warning (here: Entry images, Role note, Appearance, Append and Add Proposals, the chosen Model, OpenRouter cost), but its files are never corrupted.
- A reader of the logs finds two Proposal event types. The older one is not deprecated; it remains the event for Replace.
- Every new stored thing in a feature needs the question "what does the oldest app still in use do with this?". If no hiding place answers it, bump the format.
