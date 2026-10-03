# Writing Tools

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
An ordered group of Scenes within the Manuscript.

**Scene**:
The smallest movable unit of the Manuscript; the level at which the Assistant compares Prose against its Outline.
_Avoid_: Section, passage

**Binder**:
The view of the Manuscript's Chapters and Scenes in order, where the Author opens, arranges and titles them.
_Avoid_: Outline (that is the structural description), tree, navigator, sidebar

**Unplaced Scene**:
A Scene that exists in the Project but has no place in the Manuscript's order and isn't in Trash, such as one written on another computer or left by an interrupted change. It stays after the Chapters until the Author places it.
_Avoid_: Orphan, stray, lost Scene

**Missing**:
Said of a Scene that the Manuscript lists but whose Prose isn't on this computer, usually because it hasn't synced yet. A Missing Scene is shown but can't be written, and is never replaced by an empty one.
_Avoid_: Deleted, broken, lost

**Prose**:
The story text itself — narration and dialogue — as written by the Author. The Assistant never writes, rewrites, or exemplifies Prose; it may comment on it.
_Avoid_: Text, draft (when meaning the words themselves)

**Story Bible**:
The Author-visible, Author-editable body of knowledge about a story: characters, places, world rules, themes, plot structure. The Assistant draws on it; it is not the Assistant's conversation history.
_Avoid_: Memory, knowledge base, lore, wiki

**Entry**:
One typed item in the Story Bible — a Character, Place, Item, World Rule, Plot Thread, Theme, or Other — with a name, aliases, a free-text description, private notes the Assistant never sees, and a few optional type-specific fields.
_Avoid_: Card, note, record

**Voice**:
A character's way of speaking, described in its Entry as traits (register, rhythm, tics), words the character uses and never uses, and short example lines written by the Author. The Assistant compares dialogue in the Prose against it and may propose trait descriptions, but never example lines.
_Avoid_: Tone, style (when meaning a character's speech)

**Proposal**:
A change to the Story Bible or an Outline suggested by the Assistant during a Conversation; it takes effect only when the Author accepts it, optionally after editing it. A Proposal is stale when its target has changed since it was made. An accepted Proposal can be undone while its target still holds the accepted values; it then becomes pending again. Proposals never touch Prose, Notes, or private notes.
_Avoid_: Suggestion (when meaning a Story Bible change), auto-save

**Outline**:
Structural description of chapters and scenes in bullet form (what happens, who, why). Not Prose; the Assistant may propose it.
_Avoid_: Beat sheet, synopsis, summary

**Notes**:
The Author's working notes on a Chapter or Scene. Visible to the Assistant, unlike an Entry's private notes.
_Avoid_: Comments (when meaning the Author's own), annotations

**Trash**:
Where deleted Scenes, Chapters, Entries and Conversations go within a Project; they stay recoverable until the Author empties it. A Chapter goes with its Scenes and comes back with them; a Conversation goes with its pending Proposals.
_Avoid_: Bin, archive

**Export**:
A copy of the whole Manuscript's Prose written outside the Project for others to read: Chapter titles as headings, Scenes separated by a break, nothing else from the Project (no Scene titles, Outlines, Notes, Story Bible or Conversations).
_Avoid_: Compile, publish, backup

**Conflict**:
Two or more versions of one Scene, Outline, Notes or Entry, saved on different computers or at the same moment, kept side by side until the Author chooses one or merges them; the others go to Trash. A diverged Conversation is not a Conflict: it becomes a second Conversation.
_Avoid_: Conflicted copy, sync error, merge conflict

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
Mode where the Assistant asks the Author questions to capture facts about the story's world, characters, and plot into the Story Bible and Outlines. The Author chooses a focus (one Entry, one Entry type, a Chapter or Scene, or open) and may change it at any time; within it the Assistant asks about what is missing, one question at a time, and turns each answer into Proposals.
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
