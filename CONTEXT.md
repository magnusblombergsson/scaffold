# Scaffold

A writing environment for creative fiction: an editor with an AI Assistant alongside that advises the Author but never writes their Prose.

## Language

### People and roles

**Author**:
The person writing the story; the only one who writes Prose.
_Avoid_: User, writer (when meaning the person using the tool)

**Assistant**:
The AI advisor beside the editor. It asks, comments, and suggests structure, but never produces Prose.
_Avoid_: AI, bot, co-writer, ghostwriter

### The story

**Project**:
One story (a novel or short story) with its own Manuscript and Story Bible.
_Avoid_: Book, workspace, document

**Manuscript**:
A Project's Prose, organised as Chapters containing Scenes.
_Avoid_: Draft, document

**Chapter**:
An ordered group of Scenes within the Manuscript. It may have one image, reference for the Author only: never in the Prose, never exported, never sent to the Assistant.

**Scene**:
The smallest movable unit of the Manuscript; the level at which the Assistant compares Prose against its Outline. It may have one image, like a Chapter's.
_Avoid_: Section, passage

**Binder**:
The view of the Manuscript's Chapters and Scenes in order, where the Author opens, arranges and titles them.
_Avoid_: Outline (that is the structural description), tree, navigator, sidebar

**Corkboard**:
The view in Writing mode of the Project Outline or a Chapter as index cards, each with its Outline and Notes editable in place. A Chapter's Corkboard shows its Scenes as cards; the Project's shows each Chapter as a lane that opens to its Scenes.
_Avoid_: Board, grid, overview (that is the pane)

**Overview pane**:
A pane beside the Prose in Writing mode that lists the Chapter or the whole Project one row per unit, so the Author keeps the whole story in view while writing a Scene. A row opens to edit its Outline and Notes.
_Avoid_: Outline skeleton (that is Brainstorm's read-only view), navigator, sidebar

**Unplaced Scene**:
A Scene that exists in the Project but has no place in the Manuscript's order and isn't in Trash, such as one written on another computer or left by an interrupted change. It stays after the Chapters until the Author places it.
_Avoid_: Orphan, stray, lost Scene

**Missing**:
Said of a Scene that the Manuscript lists but whose Prose isn't on this computer, usually because it hasn't synced yet. A Missing Scene is shown but can't be written, and is never replaced by an empty one.
_Avoid_: Deleted, broken, lost

**Prose**:
The story text itself — narration and dialogue — as written by the Author. The Assistant never writes, rewrites, or exemplifies Prose; it may comment on it. Text about the story, such as a blurb, tagline or caption, is not Prose, so the Assistant may suggest it; an epigraph it suggests by naming where to find one, never by quoting it.
_Avoid_: Text, draft (when meaning the words themselves)

**Story Bible**:
The Author-visible, Author-editable body of knowledge about a story: characters, places, world rules, themes, plot structure. The Assistant draws on it; it is not the Assistant's conversation history.
_Avoid_: Memory, knowledge base, lore, wiki

**Entry**:
One typed item in the Story Bible — a Character, Place, Item, World Rule, Plot Thread, Theme, or Other — with a name, aliases, a free-text description, private notes the Assistant never sees, an optional image the Assistant never sees, and a few optional type-specific fields.
_Avoid_: Card, note, record

**Image prompt**:
A description of an Entry, written by the Assistant on request from what the Entry says it looks, sounds, smells and feels like, for the Author to paste into an image generator elsewhere. It describes only: no narration, new dialogue or story moment, so it is not Prose, though it may quote the Author's own lines. It isn't kept.
_Avoid_: Image description, caption

**Peek**:
A short, read-only look at the Entries a highlighted name refers to, opened by clicking the name; or at a Proposal's target, an Entry or an Outline, opened by clicking its title in Brainstorm and Interview. Long text is cut off until the Author asks to read more.
_Avoid_: Popup, tooltip, preview

**Pinned note**:
A Peek the Author has pinned in Writing so it stays while they write: it floats over the page, can be dragged aside, folded to its title, switched to show the Entry's image instead of its text, and unpinned, and stays where it was left for the Project until unpinned.
_Avoid_: Sticky, pin (as a noun), floating window

**Voice**:
A character's way of speaking, described in its Entry as traits (register, rhythm, tics), words the character uses and never uses, and short example lines written by the Author. The Assistant compares dialogue in the Prose against it and may propose trait descriptions, but never example lines.
_Avoid_: Tone, style (when meaning a character's speech)

**Role note**:
A few words beside a Character's Role saying what they are to the story, such as "love interest" or "her mentor". A label, never a sentence or a blurb.
_Avoid_: Tagline, role description

**Proposal**:
A change to the Story Bible or an Outline suggested by the Assistant during a Conversation; it takes effect only when the Author accepts it, optionally after editing it. A Proposal to a field or Outline either replaces its text, appends text to it, or adds an item to a list; an append or add lands on whatever the target holds when accepted. The Author may also append a replacing Proposal's text instead of replacing. A replacing Proposal is stale when its target has changed since it was made. An accepted Proposal can be undone while its target still holds the accepted values; it then becomes pending again. A reply the Assistant didn't finish (cut short, failed partway, or empty) makes no Proposals. Proposals never touch Prose, Notes, or private notes.
_Avoid_: Suggestion (when meaning a Story Bible change), auto-save

**Outline**:
Structural description of chapters and scenes in bullet form (what happens, who, why). Not Prose; the Assistant may propose it.
_Avoid_: Beat sheet, synopsis, summary

**Notes**:
The Author's working notes on a Chapter or Scene. Visible to the Assistant, unlike an Entry's private notes.
_Avoid_: Comments (when meaning the Author's own), annotations

**Status**:
How far along a Scene or Chapter is, chosen by the Author from the Project's ordered list of Statuses (such as Idea, Outlined, Drafted, Revised, Done); a unit has one Status or none. A Chapter's Status is its own, not derived from its Scenes.
_Avoid_: Label, stage, state

**Tag**:
A free word or phrase the Author attaches to Scenes, Chapters and Entries to say what they concern, such as "Mara" or "flashback"; a unit may have any number, and the Project's Tags are simply those in use.
_Avoid_: Keyword, label, category

**Filter**:
A narrowing of one list or view to the units matching chosen Statuses, Tags or Entry types; it changes only what the Author sees, never what the Assistant sees.
_Avoid_: Search

**Trash**:
Where deleted Scenes, Chapters, Entries and Conversations go within a Project; they stay recoverable until the Author empties it. A Chapter goes with its Scenes and comes back with them; an Entry, Scene or Chapter with its image; a Conversation goes with its pending Proposals.
_Avoid_: Bin, archive

**Export**:
A copy of the whole Manuscript's Prose written outside the Project for others to read: Chapter titles as headings, Scenes separated by a break, nothing else from the Project (no Scene titles, Outlines, Notes, Story Bible or Conversations).
_Avoid_: Compile, publish, backup

**Import**:
Making a new Project from a Word or Markdown manuscript, the mirror of an Export: a Heading 1 starts a Chapter and a break such as `***` starts a Scene, unless the Author chooses another split after seeing it. An Import never adds to an existing Project.
_Avoid_: Open (when meaning a manuscript file), convert

**Conflict**:
Two or more versions of one Scene, Outline, Notes or Entry, saved on different computers or at the same moment, kept side by side until the Author chooses one or merges them; the others go to Trash. A diverged Conversation is not a Conflict: it becomes a second Conversation.
_Avoid_: Conflicted copy, sync error, merge conflict

**Project setting**:
A choice the Author makes for one Project, such as its Prose language, saved with the Project so it is the same on every computer. Where a window or pane sat on this computer is remembered, not a Project setting.
_Avoid_: Preference, option

**Setting**:
A choice that holds for the whole app on this computer, whichever Project is open, such as a Provider's credential or Model shortlist.
_Avoid_: Preference, Project setting (when meaning these)

### The Assistant's models

**Model**:
The AI model a Conversation's Assistant runs on, reached through one Provider. A Conversation may switch Model between messages; each reply records the Model that wrote it.
_Avoid_: Engine, LLM, AI (when meaning the model)

**Provider**:
The service a Model is reached through: Anthropic, OpenRouter, or LM Studio on the Author's own computer.
_Avoid_: Vendor, backend, API

**Model shortlist**:
The Models the Author has chosen, per Provider, to have on offer when picking a Conversation's Model.
_Avoid_: Favourites, model list

**Untested**:
Said of a Model that hasn't been checked against the rule that the Assistant never writes Prose. The rule still applies; the mark only warns that the Model may slip.
_Avoid_: Unsupported, unsafe

### Modes

**Mode**:
One of the tool's working states, each giving the Assistant a different role: Brainstorm, Interview, or Writing.
_Avoid_: State, phase

**Conversation**:
A thread of exchanges between the Author and the Assistant, started by the Author and belonging to one Mode. In a Writing Conversation, the Scene in focus is the one open in the editor when a message is sent; each message notes it, and the Conversation is not bound to it. The Assistant sees only the current Conversation, never earlier ones.
_Avoid_: Chat, session, history

**Brainstorm**:
Mode for free idea generation with the Assistant.

**Interview**:
Mode where the Assistant asks the Author questions to capture facts about the story's world, characters, and plot into the Story Bible and Outlines. The Author chooses a focus (one Entry, one Entry type, a Tag, a Chapter or Scene, or open) and may change it at any time; within it the Assistant asks about what is missing, one question at a time, and turns each answer into Proposals.
_Avoid_: Q&A, questionnaire

**Writing**:
Mode where the Author writes Prose in the editor and the Assistant advises on scenes and chapters — including revision of what is already written — pointing out what is missing or excessive.
_Avoid_: Drafting mode, editor mode

**Review**:
An examination of one Scene or one Chapter that the Author asks for in Writing mode, answered as a short, ordered list of Findings. A Chapter Review looks only at what spans its Scenes and at the Chapter's Outline.
_Avoid_: Analysis, critique, feedback

**Finding**:
One point in a Review: a contradiction with the Story Bible or Outline, something missing against the Outline, something excessive, a line out of a character's Voice, or an Outline point not yet covered. It points at the Author's own Prose and usually ends in a question; it never proposes replacement Prose.
_Avoid_: Issue, error, suggestion
