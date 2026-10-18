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
One story (a novel or short story), or a Series of them, with its own Story Bible. A Project holds one or more Books; with only one, the Book level isn't shown.
_Avoid_: Workspace, document, book (that is one volume of it)

**Book**:
One volume of a Project, with its own Manuscript. A Project's Books are in reading order, and Scenes, Chapters and Parts can move between them, keeping their Outline, Notes and details. A Book has the same details as a Part: a title, Status, Tags, its own Word target, image, Outline and Notes; besides those, its Genres, Format, Structure, Archetype and Genre conventions. Prose language, the Part label, Statuses, Custom fields and Key fields are the Project's, shared by every Book. In Writing, the Book is the one holding the Scene in focus. The Author may also add a Book from a Backup of another Project: its Books, Story Bible, Trash, Drawer and Conversations come into this Project, and the Author then chooses which of its Entries to Combine with those already here.
_Avoid_: Volume, installment, novel (when meaning one of the Series)

**Series**:
Said of a Project with more than one Book. Its Books share one Story Bible, in which an Entry may change from one Book to the next through Evolutions, and one Series Outline above each Book's own. Working in one Book, the Assistant sees the Series Outline and every Book's Outline, but the Parts, Chapters and Scenes of that Book only, and never an Entry that first appears in a later Book.
_Avoid_: Saga, collection, universe

**Series Outline**:
The Outline of the whole Project, above every Book's own Outline: the overarching plan of the Series. In a Project with one Book, it and the Book's Outline are one.
_Avoid_: Arc, master outline, series bible

**Manuscript**:
A Book's Prose, organised as Chapters containing Scenes, with Chapters optionally grouped into Parts.
_Avoid_: Draft, document

**Part**:
An optional, ordered group of Chapters within the Manuscript, for an Act in a novel or an Episode in an episodic story. The Project chooses whether Parts are shown as "Part", "Act" or "Episode"; that is only a label, and changing it changes nothing else. A Part has the same details as a Chapter: Status, Tags, its own Word target, image, Outline and Notes. A Project needs no Parts, and a Part is never required to hold a Chapter.
_Avoid_: Section, book (that is a Book), season, arc

**Chapter**:
An ordered group of Scenes within the Manuscript, inside a Part or loose. It may have one image, reference for the Author only: never in the Prose, never exported, never sent to the Assistant.

**Loose Chapter**:
A Chapter that belongs to no Part, such as a prologue, an epilogue or an interlude. Loose Chapters and Parts share one order at the top of the Manuscript, so a Loose Chapter can sit before, between or after Parts.
_Avoid_: Standalone, orphan Chapter

**Unplaced Chapter**:
A Chapter that exists in the Project but has no place in the Manuscript's order and isn't in Trash, such as one made on another computer. It stays after the Parts and Chapters, in a Series after the last Book and in none of them, until the Author places it. A Loose Chapter is placed; an Unplaced Chapter is not.
_Avoid_: Orphan, stray, lost Chapter

**Scene**:
The smallest movable unit of the Manuscript; the level at which the Assistant compares Prose against its Outline. It may have one image, like a Chapter's.
_Avoid_: Section, passage

**Binder**:
The view of the Manuscript's Parts, Chapters and Scenes in order, in a Series under each Book, where the Author opens, arranges and titles them.
_Avoid_: Outline (that is the structural description), tree, navigator, sidebar

**Corkboard**:
The view in Writing mode of the Project Outline, a Part or a Chapter as index cards, each with its Outline and Notes editable in place; a Scene's, Chapter's or Part's card sets its Status, Tags and image too, and shows the image beside its title. The Author may switch every Corkboard to show images instead: each card's image large, with its title, its Outline's beginning on hover, and nothing to edit in place but Status, Tags and image. A Chapter's Corkboard shows its Scenes as cards and a Part's shows its Chapters; the Project's shows each Part and each Loose Chapter as a lane, a Part's lane opening to its Chapters and a Chapter's to its Scenes. In a Series the Project's Corkboard shows each Book as a lane opening to its Parts and Loose Chapters, and each Book has a Corkboard like that of a Project with one Book.
_Avoid_: Board, grid, overview (that is the pane)

**Overview pane**:
A pane beside the Prose in Writing mode that lists the Chapter or the whole Book one row per unit, so the Author keeps the whole story in view while writing a Scene. A Part's row holds its Chapters' rows. A Scene's, Chapter's or Part's row shows its Status dot and image, and opens to edit its Status, Tags, image, Outline and Notes.
_Avoid_: Outline skeleton (that is Brainstorm's read-only view), navigator, sidebar

**Unplaced Scene**:
A Scene that exists in the Project but has no place in the Manuscript's order and isn't in Trash, such as one written on another computer or left by an interrupted change. It stays after the Chapters, in a Series after the last Book and in none of them, until the Author places it.
_Avoid_: Orphan, stray, lost Scene

**Missing**:
Said of a Scene that the Manuscript lists but whose Prose isn't on this computer, usually because it hasn't synced yet. A Missing Scene is shown but can't be written, and is never replaced by an empty one.
_Avoid_: Deleted, broken, lost

**Split**:
Cutting a Scene in two at the cursor: the Prose after the cut becomes a new Scene right after it, or the first Scene of the next Chapter, never one in another Book. The new Scene has the original's Status and Tags; its Outline and Notes start empty, and the image, Word target and Todos stay with the original. Undoing a Split joins the new Scene's Prose, as it is by then, back onto the end of the original's. A Missing or Unplaced Scene, or one in Conflict, can't be split.
_Avoid_: Break (that separates Scenes in an Export or Import), divide, cut (that is where it splits)

**Prose**:
The story text itself — narration and dialogue — as written by the Author. The Assistant never writes, rewrites, or exemplifies Prose; it may comment on it. Text about the story, such as a blurb, tagline or caption, is not Prose, so the Assistant may suggest it; an epigraph it suggests by naming where to find one, never by quoting it.
_Avoid_: Text, draft (when meaning the words themselves)

**Story Bible**:
The Author-visible, Author-editable body of knowledge about a story: characters, places, world rules, themes, plot structure. The Assistant draws on it; it is not the Assistant's conversation history. The Room where the Author browses and edits its Entries shares its name; in a Series it shows them as of a chosen Book, marking values that come from an Evolution.
_Avoid_: Memory, knowledge base, lore, wiki

**Entry**:
One typed item in the Story Bible — a Character, Place, Item, World Rule, Plot Thread, Theme, Fact, or Other — with a name, aliases, a free-text description, private notes the Assistant never sees, an optional image the Assistant never sees, a few optional type-specific fields, and the Custom fields its Project defines for its type. In a Series every Entry belongs to the whole Project, may say in which Book it first appears, and is seen as of one Book: its own values with the Evolutions up to that Book.
_Avoid_: Card, note, record

**Fact**:
An Entry type for something true of the real world that the story relies on, one fact or a body of them, such as how lay judges sit in a Swedish district court; how the story's own world works is a World Rule instead. Besides what every Entry has, it holds its Sources (each a link or a citation such as a book and page), when it was Captured (gathered or last checked), what it Applies to (where and when it holds), and whether the Author has Checked it, a mark only the Author sets. The Assistant sees all of these, so a Review or Plan check can say when what it contradicts is a Fact not yet Checked. Interview may propose Facts; a Gathering never looks for them, since a Fact comes from a source, not from the Prose.
_Avoid_: Research, Reference, Source (that is one of its fields)

**Evolution**:
One changed value of an Entry taking effect from a given Book onward, such as a Character's Allegiance becoming "Rebels" from Book 2; later Books keep it until a later Evolution changes it again. An Entry's name, aliases, description, image, type-specific fields (Voice included) and Custom fields may evolve; its type, Tags and private notes belong to the whole Series. A change within one Book is not an Evolution; it stays in the Entry's text. An Evolution belongs to its Book, not to a position: reordering the Books reorders their Evolutions, and a Book in Trash or the Drawer takes its Evolutions with it until it comes back. The Author makes one by changing a value "from this Book on" while seeing the Entry as of any Book after the first; any other edit lands where the shown value comes from. Removing an Evolution gives the value back to what earlier Books give it. Like the value it changes, a text Evolution can be in Conflict, and an image Evolution merges on its own.
_Avoid_: Revision (that is rewriting Prose), version, change, history

**Custom field**:
A free-text field the Author adds to one Entry type in one Project, such as a Character's "Allegiance", held by every Entry of that type in addition to the type's own fields. The Assistant sees it like any other field.
_Avoid_: Attribute, property, trait

**Relation**:
A connection the Author records between two Entries, either of a built-in kind or with a free-text label such as "mother of" or "rival of". The built-in kinds are _same as_, joining two Entries of one type that are the same person or thing under different faces (Clark Kent and Superman), and _part of_, putting a Place inside a Place or an Item inside an Item (the basement and its house). A free-text Relation may join Entries of any types and reads one way, shown as the same sentence on both Entries. _Part of_ reads one way too, gives an Entry at most one parent and never makes a loop; _same as_ has no direction and joins every face it reaches into one group. Unlike an alias, which is another name for one Entry, _same as_ keeps two full Entries, and the Assistant is told to keep each face's facts to it. A Relation is not an Evolution: in a Series it may say from which Book it holds. While either Entry is in Trash or the Drawer the Relation is hidden, and it comes back with that Entry.
_Avoid_: Link (that is a highlighted name's tie to its Entry), connection, association

**Combine**:
Making two Entries of one type into one. The Author keeps one; the other's name becomes an alias of it, its aliases and Tags are added, its private notes appended, and for each other field that differs the Author picks one value, or in a Series may keep the other's from a given Book on, as an Evolution. What pointed to the other now points to the kept one, and the other goes to Trash as it was.
_Avoid_: Merge (that is how synced copies come together), join (that is _same as_), dedupe

**Image prompt**:
A description of an Entry, written by the Assistant on request from what the Entry says it looks, sounds, smells and feels like, for the Author to paste into an image generator elsewhere. It describes only: no narration, new dialogue or story moment, so it is not Prose, though it may quote the Author's own lines. It isn't kept.
_Avoid_: Image description, caption

**Peek**:
A short, read-only look at the Entries a highlighted name refers to, opened by clicking the name; or at a Proposal's target, an Entry or an Outline, opened by clicking its title in Brainstorm and Interview. An Entry shows only its type's Key fields, long text cut off, until the Author asks to read more. In a Series it shows the Entry as of the Book being written, and in that Book a name highlights for every name and alias the Entry has had up to it, never one it takes only later.
_Avoid_: Popup, tooltip, preview

**Key fields**:
The parts of an Entry a Peek shows before the Author asks to read more, chosen by the Author for each Entry type in a Project from its description, aliases, Role, type-specific fields, Custom fields and Relations. They change only what the Author sees, never what the Assistant sees.
_Avoid_: Summary fields, pinned fields

**Pinned note**:
A Peek the Author has pinned in Writing so it stays while they write: it floats over the page, can be dragged aside, folded to its title, switched to show the Entry's image instead of its text, and unpinned, and stays where it was left for the Project until unpinned.
_Avoid_: Sticky, pin (as a noun), floating window

**Floating image**:
The image of the Scene being written, floating over the page in Writing so the Author can look at it while writing: it can be dragged aside, resized, folded to its title and closed, stays where it was left, and changes as the Author moves to another Scene.
_Avoid_: Pinned image, picture-in-picture

**Large view**:
An Entry's, Scene's or Chapter's image shown alone over the dimmed app, as large as the window allows, with that Entry's or unit's name beneath; opened by clicking the image wherever it shows. It only shows: there is nothing to edit and no going to the next image.
_Avoid_: Lightbox, zoom, preview, image viewer

**Voice**:
A character's way of speaking, described in its Entry as traits (register, rhythm, tics), words the character uses and never uses, and short example lines written by the Author. The Assistant compares dialogue in the Prose against it and may propose trait descriptions, but never example lines.
_Avoid_: Tone, style (when meaning a character's speech)

**Role note**:
A few words beside a Character's Role saying what they are to the story, such as "love interest" or "her mentor". A label, never a sentence or a blurb.
_Avoid_: Tagline, role description

**Proposal**:
A change to the Story Bible, an Outline, Notes, the Manuscript's structure, a Word target, a Scene's Beats, or a Book's Genres, Format, Structure and Genre conventions suggested by the Assistant during a Conversation; it takes effect only when the Author accepts it, optionally after editing it. A Proposal to a field or Outline either replaces its text, appends text to it, or adds an item to a list; an append or add lands on whatever the target holds when accepted. The Author may also append a replacing Proposal's text instead of replacing. A replacing Proposal is stale when its target has changed since it was made. A Proposal may also add a Relation between two Entries already in the Story Bible; it never goes stale, but can be accepted only while the Relation's rules allow it, and of its parts only a free-text label can be edited. In Plan, a Proposal may also add, move, retitle or put in Trash a Scene, Chapter or Part of the Conversation's Book, never one in another Book; an added unit brings its title, its Outline and optionally a Word target and, for a Scene, its Beats, and no other Unit details. Plan may also propose setting or clearing the Word target of a Scene, Chapter, Part or the Manuscript of that Book, setting the Beats of a Scene (its whole list, one Scene per Proposal, Prose or not), or setting the Book's Genres, Format, Structure and Genre conventions; such a Proposal is stale when that value has changed since. It never puts in Trash a unit that holds Prose or contains one, and never touches a Missing or Unplaced Scene, or one in Conflict. A move is stale when its unit has left the container it was in, or the unit it is to follow has left the destination or is gone; reordering within a container never makes it stale. A retitle is stale when the title has changed; a move to Trash when the unit's title or Outline has changed or a unit has been added into it. A reply moves a unit at most once. A Proposal that needs another still pending, such as a move into a Chapter only proposed, or one placed after a unit the same reply moves, can be accepted only after it, and rejecting one rejects those that need it. An accepted Proposal can be undone while its target still holds the accepted values (an added unit holds no Prose, a moved one is still in the container it was put in, a unit put in Trash is still there), and not while an accepted Proposal needs it; it then becomes pending again. A reply the Assistant didn't finish (cut short, failed partway, or empty) makes no Proposals. In a Series, a Proposal lands where the value the Conversation's Book sees comes from, the Entry's own value or the Evolution in effect, unless the Author accepts it "from this Book on", making it an Evolution; the Assistant never chooses that. Proposals never touch Prose or private notes, and touch Notes only by appending, in Plan.
_Avoid_: Suggestion (when meaning a Story Bible change), auto-save

**Outline**:
Structural description of parts, chapters and scenes in bullet form (what happens, who, why). Not Prose; the Assistant may propose it, in short bullets only: a Scene's at most six, each one short line, and a Chapter's, Part's or Book's naming its turns and threads rather than retelling its Scenes; never quoted speech, sensory description or the story's voice.
_Avoid_: Beat sheet, synopsis, summary

**Notes**:
The Author's working notes on a Part, Chapter or Scene. Visible to the Assistant, unlike an Entry's private notes. What Plan appends records only what the Author said or agreed, as bullets, never the Assistant's own ideas.
_Avoid_: Comments (when meaning the Author's own), annotations

**Status**:
How far along a Scene, Chapter or Part is, chosen by the Author from the Project's ordered list of Statuses (such as Idea, Outlined, Drafted, Revised, Done); a unit has one Status or none. A Chapter's or Part's Status is its own, not derived from what it holds.
_Avoid_: Label, stage, state

**Tag**:
A free word or phrase the Author attaches to Scenes, Chapters, Parts and Entries to say what they concern, such as "Mara" or "flashback"; a unit may have any number, and the Project's Tags are simply those in use.
_Avoid_: Keyword, label, category

**Word target**:
The number of words the Author aims for in a Scene, a Chapter, a Part or a Book's Manuscript, shown beside its count; each unit has one or none. A Chapter's, Part's or the Manuscript's Word target is its own, not the sum of what it holds. Sent to the Assistant only in Plan.
_Avoid_: Goal, quota, target (that is what a Proposal changes)

**Genre**:
A kind of story a Book belongs to, chosen by the Author from a fixed list: Mystery, Crime, Thriller, Horror, Fantasy, Science fiction, Romance, Literary or Other. A Book may have several, or none.
_Avoid_: Category, Tag (Tags are free words)

**Format**:
The length class of a Book: Flash fiction, Short story, Novelette, Novella or Novel, each with a rough band of words. A Book has one or none; a Series is not a Format.
_Avoid_: Length, form, type

**Structure**:
A named pattern of Beats that a story can follow, such as Three-act, Save the Cat or Kishōtenketsu, from the catalogue built into the tool, credited to its source and described in the tool's own words. Each says which Genres and Formats it suits, and whether it fits one Book, every Part of one, or a whole Series; that is advice, never a limit. Each Book records its own: a Structure, no set Structure (a choice too), or none chosen yet; and whether its Structure runs over the whole Book or anew in every Part, as for the Episodes of an episodic story. A Book follows one Structure only: a season's arc over its Episodes is carried by its Outline and Plot Threads. In a Book without Parts, every Part means the whole Book.
_Avoid_: Spine, template, formula, plot (when meaning the pattern)

**Archetype**:
A kind of story a Book's plot follows, such as Rags to riches or Overcoming the monster, from Christopher Booker's seven basic plots as the catalogue built into the tool describes them in its own words, each with its typical rise and fall. It sits across Structures: Rags to riches may follow Three-act or anything else. It has no Beats. Each Book records its own: one Archetype, none, or none chosen yet; a blend of two is the Author's to describe in the Book's Notes. Sent to the Assistant only in Plan, like the Book's Structure.
_Avoid_: Plot type, basic plot, story shape, arc

**Beat**:
One step of a Structure, or a Scene a Genre convention requires: what it does in the story, where it falls (a share of the Book, or of each Part when the Structure runs anew in every Part, or only its order among the other Beats), and whether it takes one Scene or a run of Scenes. A Scene carries the Beats it performs, any number of them, and a Beat may be carried by several Scenes; nothing stops a mark the Book's plan would not expect, the check points it out. A Part or Chapter carries no Beats: where it falls follows from its Scenes. A Beat stays with its Scene through moves and Trash; one of a Structure or Genre convention the Book no longer follows is kept but set aside, unseen by Author and Assistant, and returns if the Book follows it again. Set only in Plan; in Writing a Scene's card on the Corkboard and its row in the Overview pane show its Beats, and choosing one opens Plan there, but no Filter selects by them. Sent to the Assistant only in Plan, like the Book's Structure and Genre conventions. Where a Scene falls is measured in planned words when every Scene of the Book has a Word target, and otherwise by Scene order.
_Avoid_: Plot point, milestone, step

**Genre convention**:
Something a Genre's readers expect, from the catalogue built into the tool, such as a mystery's fair play or a romance's happy ending: a Scene that must exist, an order that must hold, or where something falls. A Book may follow several, with or without a Structure. Its required Scenes are Beats; its orders and positions are not.
_Avoid_: Overlay, trope, rule

**Filter**:
A narrowing of one list or view to the units matching chosen Statuses, Tags or Entry types, or Entries by the Book they first appear in; it changes only what the Author sees, never what the Assistant sees.
_Avoid_: Search

**Unit details**:
What the Author sets on a Scene, Chapter, Part, Entry or the Manuscript with a click rather than by writing: its Status, Tags, Word target and image, on a Scene also its Beats, and on a Book also its Genres, Format, Structure and Genre conventions. When computers disagree on them, they merge one by one on their own, the later change of each winning; they never make a Conflict.
_Avoid_: Metadata, properties, attributes, header keys

**Todo**:
One line on the Project's list of things the Author still means to do, ticked off when done, optionally linked to one Scene, Chapter, Part, Book or Entry. The Author's own bookkeeping: the Assistant never sees or proposes Todos, though the Author may turn a Finding into one. Never exported.
_Avoid_: Task, checklist item, reminder

**Trash**:
Where deleted Scenes, Chapters, Parts, Entries, Custom fields and Conversations go within a Project; they stay recoverable until the Author empties it. A Book goes with its Parts, Chapters and Scenes, a Part with its Chapters and their Scenes, and a Chapter with its Scenes, and they come back together; an Entry, Scene, Chapter or Part with its image; a Custom field with the values Entries held in it; a Conversation goes with its pending Proposals.
_Avoid_: Bin, archive

**Drawer**:
Where the Author keeps Scenes, Chapters, Parts, Entries and Conversations they've taken out of the story but don't mean to delete, such as material for a sequel. Unlike Trash, it is never emptied. An Entry in the Drawer is never seen by the Assistant.
_Avoid_: Archive, bin, shelf, trunk, For Later

**Export**:
A copy written outside the Project for others to read, of either the Manuscript's Prose or the Story Bible. A Manuscript Export is of one Book and holds the Prose of the Scenes the Author ticks, with Chapter titles as headings, a Part's title as a heading one level above them, and Scenes separated by a break, and nothing else from the Project. A Part with none of its Scenes ticked leaves no heading. A Story Bible Export holds the chosen Entries grouped by type, with their images, and their private notes only if the Author asks; in a Series, as of a chosen Book, or with every Evolution under its field as "From Book N". Neither includes Outlines, Notes or Conversations.
_Avoid_: Compile, publish, backup

**Backup**:
One file holding a whole Project as it was when it was made, Trash and Drawer included, from which the Author can restore it as a new Project. Besides those the Author makes, the app makes its own on each computer, at most once a day and before Trash is emptied or a Book is added from a Backup, kept outside every Project so they are never synced. Before upgrading a Project to a newer format it always makes one there too, kept for good, and upgrades only once it is made. A Backup can also be added to another Project as a new Book.
_Avoid_: Snapshot (that is one Scene's Prose), archive, copy

**Snapshot**:
A named copy of one Scene's Prose, kept by the Author to compare beside the current Prose or to restore it. Its Prose never changes once taken, and it belongs to its Scene, going wherever the Scene goes; a Split leaves it with the original. It is never seen by the Assistant, never in an Export, and never counted toward a Word target.
_Avoid_: Draft, version, revision, checkpoint, take

**Import**:
Reading a Word or Markdown file into the Project, the mirror of an Export, of either a manuscript or a Story Bible. A Manuscript Import makes a new Project, or a new Book in the open Project, and never adds to an existing Book: a Heading 1 starts a Chapter and a break such as `***` starts a Scene, unless the Author chooses another split after seeing it. When the file also has Heading 2s, the Author may choose that a Heading 1 starts a Part and a Heading 2 a Chapter; it is never chosen for them. A Story Bible Import adds the Entries the Author ticks after seeing them to the open Project's Story Bible, beside those already there, and changes none of them; undoing it moves them all to Trash. A Manuscript Import ends by offering a Gathering.
_Avoid_: Open (when meaning a manuscript file), convert

**Gathering**:
The Assistant reading the Prose of a Book, Part, Chapter or Scene to find Story Bible Entries in it, asked for from the Story Bible at any time and outside any Conversation or Mode; besides Writing, the only reader of Prose. The Author chooses its scope, the Entry types to look for (any but Facts) and the Model, and confirms after seeing an estimate of its requests and cost, and of any Scene too big for the Model to read, which is never cut. It reads Chapter by Chapter, knowing the Story Bible and what it has gathered so far, so the same Entry found again is added to rather than doubled. Its result is one list for the Author to edit and tick, not Proposals: new Entries, each with a name, its aliases, a short description and the fields the Prose states, and additions to existing Entries that only add (an alias, text appended to a description, an empty field filled, a Relation), never replacing what is written; each shows the Scenes it comes from. The ticked ones are added together and undone together. A Gathering stopped or failed partway can still be reviewed, saying which Chapters were not read; reading them is a new Gathering. A result not yet reviewed is kept on this computer until reviewed or discarded. In a Series, a new Entry first appears in the earliest Book where it was found; Evolutions are left to the Author. It describes what the Prose says, never writes Prose, and never quotes long passages or imitates the story's voice.
_Avoid_: Extraction, scan, Finding (that is a Review's or Plan check's)

**Conflict**:
Two or more versions of one Scene, Outline, Notes or Entry, saved on different computers or at the same moment, kept side by side until the Author chooses one or merges them; the others go to Trash. Only text makes a Conflict (Prose, an Outline's or Notes' text, an Entry's fields and their Evolutions): Unit details and Todos merge on their own. A diverged Conversation is not a Conflict: it becomes a second Conversation.
_Avoid_: Conflicted copy, sync error, merge conflict

**Project setting**:
A choice the Author makes for one Project, such as its Prose language or whether its Parts are called Parts, Acts or Episodes, saved with the Project so it is the same on every computer. Where a window or pane sat on this computer is remembered, not a Project setting.
_Avoid_: Preference, option

**Setting**:
A choice that holds for the whole app on this computer, whichever Project is open, such as a Provider's credential or Model shortlist.
_Avoid_: Preference, Project setting (when meaning these)

**Typewriter scrolling**:
A Setting that keeps the line holding the caret at the vertical middle of a Scene's Prose while the Author writes. Typing, deleting, pasting, undo and moving the caret by key re-centre it, as do opening a Scene and jumping to a quote; a click, a drag or the wheel never scrolls it back. Blank space above the first line and below the last lets either reach the middle; it is layout only, never part of the Prose. Only the Prose scrolls: pinned notes, the Floating image, the panes and the header stay put.
_Avoid_: Focus mode (which would dim the rest of the text)

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

**Tested**:
Said of a Model on the tested list: one checked against the rule that the Assistant never writes Prose. Its opposite is Untested.
_Avoid_: Supported, safe

**Untested**:
Said of a Model that hasn't been checked against the rule that the Assistant never writes Prose. The rule still applies; the mark only warns that the Model may slip.
_Avoid_: Unsupported, unsafe

### Modes

**Room**:
One of the six places the Author switches between at the top of the window: Writing, Story Bible, Brainstorm, Interview, Research and Plan. Each fills the window; all but the Story Bible are also Modes.
_Avoid_: Place, view, tab, workspace

**Mode**:
One of the tool's working states, each giving the Assistant a different role: Brainstorm, Interview, Research, Plan, or Writing.
_Avoid_: State, phase

**Conversation**:
A thread of exchanges between the Author and the Assistant, started by the Author and belonging to one Mode. In a Series, a Brainstorm, Interview or Plan Conversation also belongs to one Book, chosen when started and changeable later, and sees the Story Bible as of it; a Writing Conversation sees it as of the Book of the Scene in focus. In a Writing Conversation, the Scene in focus is the one open in the editor when a message is sent; each message notes it, and the Conversation is not bound to it. The Assistant sees only the current Conversation, never earlier ones, except Brainstorm Conversations the Author brings into a Plan Conversation.
_Avoid_: Chat, session, history

**Starred**:
Said of a Conversation the Author has marked to keep it at the top of the Conversation list, above the rest. Every computer sees the same stars.
_Avoid_: Pinned (that is a Pinned note), favorite

**Brainstorm**:
Mode for free idea generation with the Assistant.

**Interview**:
Mode where the Assistant asks the Author questions to capture facts about the story's world, characters, and plot into the Story Bible and Outlines. The Author chooses a focus (one Entry, one Entry type, a Tag, a Book, Part, Chapter or Scene, or open) and may change it at any time; within it the Assistant asks about what is missing, one question at a time, and turns each answer into Proposals.
_Avoid_: Q&A, questionnaire

**Research**:
Mode where the Author asks the Assistant about the real world the story relies on, and turns what is worth keeping into Facts: Interview turned around. The Assistant reads links the Author pastes, and text pasted in, and may search the web where the Model's Provider offers it; LM Studio cannot search. It is the only Mode that goes online. Searching is on in each Research Conversation until the Author turns it off there, and every search made is shown with the answer. It sees what Brainstorm sees and every Fact in full, never the Prose, and proposes only to Facts: new ones, or their description, Sources, Applies to and Captured (the day of the answer), never Checked. Every claim in an answer names its source, kept apart from the Assistant's own reading of it, and a claim with none is said to come from the Model's memory and need checking. No copy of a page is kept: a Fact keeps the link and when it was Captured.
_Avoid_: Q&A, lookup

**Plan**:
Mode where the Assistant helps the Author choose a Structure and Genre conventions for a Book and shape its Outline to them: it asks about the story's shape one question at a time, makes Plan checks, and turns what is agreed into Proposals to Outlines, Notes, the Manuscript's structure, Word targets, Scenes' Beats and the Book's Genres, Format, Structure, Archetype and Genre conventions, never to the Story Bible. The Author chooses a focus (the Book, a Part or a Chapter) and may change it at any time. In a Series it plans one Book at a time: it may propose to the Series Outline, but never to another Book. It reads the plan (Outlines, Notes, titles, Statuses, Word targets, Genres, Format, the Structure, Archetype, Genre conventions and Beats, and the Story Bible), never the Prose; the plan comes in full within its focus, and only as titles and Outlines for the rest of the Book. When that is more than the Model can take, nothing is sent and the Author is told what is biggest; nothing is ever left out unasked. The Author may bring in Brainstorm Conversations of the same Book, as far as they went when brought in, and remove them; one in Trash or the Drawer, or of another Book, is not sent.
_Avoid_: Planner, Outliner, Plotting; attach, import or link (for bringing in)

**Plan check**:
An examination of the plan within a Plan Conversation's focus, answered as one reply of a short, ordered list of Findings, most consequential first; asked for by the Author, or made unasked when Plan opens on a Book already outlined. It looks for Beats missing, doubled or out of place, a Genre convention's order or position not holding, Outlines whose turns of fortune contradict the Archetype's rise and fall, Outlines contradicting the Story Bible, units without an Outline or further along by Status than their Outline, stretches thin or crowded against the Beats, threads raised and never paid off, and Scenes that perform no Beat and move no thread. Notes are read as the Author's intent, quoted but never faulted. Where Scenes carry no Beats, it reads from their Outlines where the Beats seem to fall; with no Structure chosen it offers to find one; with No set Structure it says nothing of Beats. With no Archetype chosen, or none, it says nothing of one; a blend of Archetypes the Book's Notes describe is read as intent. It makes no Proposals: those come after, on what the Author chooses to act on.
_Avoid_: Review (that is Writing's), structure check, audit, analysis

**Writing**:
Mode where the Author writes Prose in the editor and the Assistant advises on scenes and chapters — including revision of what is already written — pointing out what is missing or excessive.
_Avoid_: Drafting mode, editor mode

**Review**:
An examination of one Scene or one Chapter that the Author asks for in Writing mode, answered as a short, ordered list of Findings. A Chapter Review looks only at what spans its Scenes and at the Chapter's Outline.
_Avoid_: Analysis, critique, feedback

**Finding**:
One point in a Review or a Plan check. In a Review: a contradiction with the Story Bible or Outline, something missing against the Outline, something excessive, a line out of a character's Voice, or an Outline point not yet covered, pointing at the Author's own Prose. In a Plan check: one thing in the plan, naming the units it concerns. It usually ends in a question; it never proposes replacement Prose, and is no Proposal.
_Avoid_: Issue, error, suggestion
