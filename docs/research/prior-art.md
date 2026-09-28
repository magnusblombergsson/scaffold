# Prior art: story bibles and AI in fiction tools

Research for #5 (child of #1). Researched 2026-09-28.

**Question:** How do Novelcrafter (Codex), Sudowrite (Story Bible), Scrivener, Plottr, Campfire and similar tools structure story knowledge (entry types, fields, relations/links to scenes), structure manuscripts, and use AI? What do users praise and complain about, especially AI writing prose vs advising? Which patterns should we adopt, and which pitfalls should we avoid?

**Sources.** Sections marked *[docs]* come from the vendor's own help center or official blog. Sections marked *[user feedback]* come from third-party reviews, surveys and vendor feedback boards. Treat those as representative, not authoritative. Vocabulary follows `CONTEXT.md` (Story Bible, Entry, Proposal, Assistant, Prose, Scene).

---

## 1. Entry types and fields per tool (main table)

| Tool | Entry types | Fields on an entry | Custom fields | Relations between entries | Link to scenes |
|---|---|---|---|---|---|
| **Novelcrafter** (Codex) | Fixed set of 6: **Character, Location, Object/Item, Lore, Subplot, Other**. Users cannot add types, because parts of the UI need them. For example, only a Character can be a scene's POV. [1] | Name, **aliases/nicknames**, **description** (the text the AI sees), **details** (structured fields), tags/labels (*not* seen by the AI), thumbnail, research notes (kept from the AI), external links. [2] | Yes. "Details" can be text, single line, dropdown or **Codex reference**. Each detail is scoped to chosen types, and each has its own AI setting: always, never or NSFW-only. [3] | **Untyped, one-way** relations. Mentioning entry A pulls in linked entry B. The docs warn about "an unwanted cascade that pulls irrelevant entries into your prompt". [4] | **Automatic mention detection** of the name and aliases in Prose, with a per-entry mentions list. [2] **Progressions**: dated addenda tied to a scene, which the AI sees only from that scene onward. [5] Matrix view shows entry × scene. [6] |
| **Sudowrite** (Story Bible) | Project-level sections: **Braindump, Genre, Style, Synopsis, Characters, Worldbuilding, Outline, Scenes**. [7] Worldbuilding cards use typed templates such as Item and Clue. [8] | Character defaults: **Pronouns, Groups, Other Names, Personality, Background, Physical Description, Dialogue Style**. [9] Worldbuilding defaults depend on the template, e.g. Item has "Who owns this item" and Clue has "Implications". [8] | Yes. "+ Add Trait" per card, and "Customize" to set the default traits for a type or add new character types. [9] | None documented as explicit links. | Drafting uses only Characters and Worldbuilding that are **explicitly mentioned**, by name or "Other Names". [7][8] The Outline feeds Scenes, which feed the Draft. [7] |
| **Scrivener** | No built-in type system. The Binder has a **Characters** folder and a **Places/Settings** folder of documents made from **templates**. [10] | Free-text document plus Title, Label, Status, Keywords and synopsis. | Yes. **Custom metadata** can be Text, Checkbox, List or Date. [11] | None. You use folders, keywords and collections. | Manual. You tag scenes with keywords or custom metadata, then use **Collections** (saved searches) and Outliner columns. [11] |
| **Plottr** | **Characters, Places, Notes, Tags**. [12] Characters are shared across the books in a series, which makes them a "series bible". [13] | Name, description, notes, category, image, tags. [12] | Yes. **Custom Attributes**, plus **Templates** (preset attribute groups based on known techniques) for characters, places and scene cards. [12][14] | None beyond categories and tags. | A **Scene Card** sits where a **Chapter** meets a **Plotline**. Cards link to Characters, Places and Tags, and the timeline can be filtered by any of them. [15] |
| **Campfire** | 17–18 optional **modules**: Characters, Locations, Maps, Research, Timeline, Arcs, Relationships, Encyclopedia, Magic, Species, Cultures, Items, Systems, Languages, Religions, Philosophies, plus Manuscript. [16][17] | Sheets are built from **panels** such as attributes, text, list, stats, links and images. There are over 100 character attributes and 15+ templates. [18] | Yes. Everything is template/panel based. [18] | A **Relationships** module (flowcharts, family trees) and **Links** panels. [16][18] | "Tag your story elements directly in your manuscript" and open a sidebar of notes while drafting. [17] |
| **World Anvil** (similar tool) | A large set of **article templates**: character, location, organization, species, item, religion, technology and more. [19] | Prompts tailored to each template. [19] | Per-template prompts. | Relationship panels ("how much two characters like each other") and diplomacy webs between organizations. [19] | Timelines of events that link back to articles. Mainly a worldbuilding and RPG tool, not a manuscript tool. [19] |
| **Dabble** (similar tool) | **Story Notes**: free-form notes and folders, including character profiles and worldbuilding. [20] | Free text and images. | – | – | A **Plot Grid** has plot lines as columns and plot points as cards. It can be **linked to a book**, which adds a Scenes column so each point sits beside its scene. [20] |

**Convergence across tools:**
- **Character** and **Place/Location** exist everywhere.
- An **Item/Object** type, a catch-all **Lore/Worldbuilding** type and an **Other** type are common.
- **Subplot/Plot thread** appears as an entry type (Novelcrafter), as plotlines (Plottr) or as plot lines (Dabble).
- **Theme** is almost never a first-class type.
- Every tool has **free text plus optional custom fields**. None of them forces a heavy schema.

## 2. Manuscript structure

| Tool | Hierarchy | Planning surfaces |
|---|---|---|
| Novelcrafter | Acts → Chapters → Scenes. Each scene has a summary, POV and labels. [6] | Grid, Matrix (entry × scene) and Outline (scene summaries). [6] |
| Sudowrite | Chapters are drafted from the Outline and Scenes in the Story Bible. [7] | The Story Bible Outline and Scenes; Canvas. |
| Scrivener | A free Binder tree of folders and documents. By convention: part/chapter folders holding scene documents. | Corkboard, Outliner, Collections. [11] |
| Plottr | Books → Chapters × Plotlines → Scene Cards (a grid). [15] | Timeline, filtered by character, place or tag. |
| Campfire | Manuscript module with chapters, plus an index-card view. [17] | Timeline and Arcs modules. |
| Dabble | Book → Chapters → Scenes. | Plot Grid linked to scenes. [20] |

The Scene is the smallest unit everywhere, and the unit that entries and plot points attach to. This matches our Scene definition.

## 3. How each tool uses AI

- **Sudowrite** *[docs]*: AI-first and generative. Each Story Bible layer can be generated from the one above it (Braindump → Synopsis → Characters → … → Scenes). The Draft then writes chapter Prose. [7] Traits can be AI-generated or rewritten. [9] "Smart Character Import" creates character cards from an uploaded manuscript. [21] The 2023 **Story Engine** launch ("an entire novel in a weekend") drew heavy backlash from authors. [22]
- **Novelcrafter** *[docs]*: The Codex is context for prompts, and the author controls it per entry ("always sent to the AI, only when detected, or never") and per detail. [2][3] It positions itself as "a story bible that writes *with* you". Its AI features include chatting with characters to find inconsistencies and extracting Codex entries from snippets. [23] It is bring-your-own-key, and it also offers prose "beats".
- **Plottr** *[docs]*: AI is a **paid add-on, off by default**. "Plottr never communicates with an 'AI' model until you explicitly click 'The Button.'" It is "deliberately designed … with brainstorming … in mind", not for prose. [24]
- **Scrivener** *[docs]*: "Scrivener does not use AI in any way." [11][25] This is a deliberate brand position.
- **Campfire** *[docs]*: The product pages do not mention AI. [17]
- **ProWritingAid Manuscript Analysis** (advise-only prior art) *[docs]*: Produces developmental feedback on plot holes, pacing and characters as a report. It does not change the manuscript, "just like a developmental editor or beta reader". [26]

## 4. What users praise and complain about *[user feedback]*

**Praise**
- Novelcrafter: the Codex is "a wiki-like feature on steroids". Automatic detection pulls in the right entries. Chatting with a character "led me to find some inconsistent character traits", which is AI as consistency checker, not writer. [27]
- Sudowrite: the Story Bible keeps output consistent and "rewards specificity". Rewrite tools help with specific issues. It is valued as "a support tool rather than a replacement". [28]
- Across authors: "It's like having a brainstorming partner and a sounding board", but suggestions are "rarely usable on their own". [29]

**Complaints**
- **Generated prose isn't the author's voice.** Sudowrite prose is "smooth, slightly empty … fine, but not quite yours". Reviewers also report purple prose, filler, repeated words and unnatural dialogue. [28][30]
- **Maintaining the bible is tedious.** Reviewers call Novelcrafter's Codex "powerful but a time sink" because every entry is typed in by hand. Too few entries starve the AI, and too many duplicate the manuscript. [31] Sudowrite users ask for the Story Bible to be **updated automatically from new chapters**, by "suggesting or applying updates". [21]
- **Context control is opaque or fiddly.** Some want full control over what goes into the prompt, since each scene needs different entries. Others struggle with the setup. [31] Novelcrafter's own docs warn about relation cascades. [4]
- **Time and continuity break.** In Sudowrite, a series-wide bible propagates later changes, such as a character aging, back into earlier books. [21] Novelcrafter's Progressions exist to solve exactly this. [5]
- **Ethics and identity.** 48% of 1,200+ authors surveyed by BookBub don't use generative AI and don't plan to. 84% of non-users cite ethical concerns. The top uses among users are research (81%), marketing and outlining/plotting, not drafting. [29] The Story Engine backlash centred on AI writing the book itself. [22]

## 5. Patterns to adopt

1. **A small fixed set of Entry types plus a catch-all**, each being free text plus a few optional type-specific fields. This is the Novelcrafter model. Fixed types let the UI and the Assistant rely on semantics, such as "only a Character can be POV". Suggested starting set:
   - Character
   - Place
   - Item/Object
   - World Rule (Lore)
   - Plot Thread (Subplot)
   - Theme (our differentiator)
   - Other

   Let authors add custom fields; don't let them add types, at least not in the MVP.
2. **Aliases on every Entry**, and **automatic detection of mentions** in Prose. This gives Entry ↔ Scene links for free and lets the Assistant pick relevant Entries without manual tagging.
3. **Author-controlled visibility to the Assistant**, per Entry (always / when mentioned / never) and possibly per field. Also a private "notes" area the Assistant never sees. The Assistant's context should be inspectable.
4. **Scene-anchored changes over time.** Novelcrafter's Progressions let an Entry say "from Scene X on, this is true". This avoids the continuity bugs users report.
5. **An Entry × Scene view** (Novelcrafter matrix, Plottr filtered timeline, Dabble plot grid). Authors value seeing where a character or plot thread appears.
6. **Extraction as suggestions, not auto-writes.** Users want the bible kept in sync with the manuscript, and our **Proposal** concept (Assistant suggests, Author accepts or edits) fits this exactly.
7. **The Assistant as consistency checker and critic** (the character chat that finds inconsistencies; ProWritingAid-style feedback that never edits the text). This matches our "advise, never write Prose" rule and is the use authors are most comfortable with.
8. **AI off or opt-in by default, and clear about it** (Plottr, Scrivener). The "no AI Prose" stance is a selling point to the large group of authors who oppose AI.

## 6. Pitfalls to avoid

- **Generating Prose, or example Prose.** It is the main complaint (voice, blandness) and the main source of backlash. Our Prose rule already excludes it. Also avoid "exemplify" loopholes such as sample rewrites in feedback.
- **A generative cascade** that fills the whole bible in one go (Braindump → everything). The bible stops being the Author's. Prefer Proposals one at a time, from Interview answers.
- **Heavy schemas and manual upkeep** (Campfire's 100+ attributes, Scrivener's DIY metadata). Default to free text, keep fields optional, and let the Assistant propose updates.
- **Relation cascades and opaque context.** If we add relations, keep them explicit and show what the Assistant is using.
- **Timeless facts.** Without per-Scene validity, the bible contradicts earlier Scenes.
- **Using tags as the AI channel.** Novelcrafter tags are deliberately hidden from the AI. Keep organisational metadata separate from what the Assistant sees.

## Sources

1. Novelcrafter, Codex Types — https://www.novelcrafter.com/help/docs/codex/codex-types
2. Novelcrafter, Anatomy of a Codex Entry — https://www.novelcrafter.com/help/docs/codex/anatomy-codex-entry
3. Novelcrafter, Codex Details — https://www.novelcrafter.com/help/docs/codex/codex-details
4. Novelcrafter, Codex Relations — https://www.novelcrafter.com/help/docs/codex/codex-relations
5. Novelcrafter, Progressions/Additions — https://www.novelcrafter.com/help/docs/codex/progressions-additions
6. Novelcrafter, Plan Views — https://www.novelcrafter.com/help/docs/plan/plan-views
7. Sudowrite docs, What is Story Bible — https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/what-is-story-bible/jmWepHcQdJetNrE991fjJC
8. Sudowrite docs, Worldbuilding — https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/worldbuilding/uc5NfWSz4x8Wm3S19LZeo8
9. Sudowrite docs, Characters — https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/characters/a7tdE1ZB8KvAwMD3Mopwpd
10. Literature & Latte, Advanced Character Sketch Templates — https://www.literatureandlatte.com/blog/using-advanced-character-sketch-templates-in-scrivener
11. Literature & Latte, Use Custom Metadata to Manage Characters — https://www.literatureandlatte.com/blog/use-custom-metadata-in-scrivener-to-manage-characters
12. Plottr KB, Characters overview / Custom Attributes — https://docs.plottr.com/article/80-characters-overview , https://docs.plottr.com/article/84-characters-custom-attributes
13. Plottr, Series Bible Software — https://plottr.com/series-bible-software/
14. Plottr KB, Scene Templates — https://docs.plottr.com/article/60-timeline-scene-templates
15. Plottr KB, Scene Cards — https://docs.plottr.com/article/57-timeline-scene-cards
16. Reedsy, Campfire Write review (module list; secondary) — https://reedsy.com/blog/guide/book-writing-software/campfire-write-review/
17. Campfire, Write — https://www.campfirewriting.com/write
18. Campfire, Character Builder — https://campfirewriting.com/character-builder
19. World Anvil KB, Article Templates / Character template — https://www.worldanvil.com/learn/article-guides/article-templates , https://www.worldanvil.com/learn/article-templates/character
20. Dabble Help, Plot Grid overview — https://www.dabblewriter.com/docs/planning-story-notes/plot-grid-overview
21. Sudowrite feedback board: "Automatically update the Story Bible", Series support changelog — https://feedback.sudowrite.com/p/automatically-update-the-story-bible , https://feedback.sudowrite.com/changelog/books-series-support-now-available
22. Distractify, Sudowrite controversy (secondary news) — https://www.distractify.com/p/sudowrite-controversy
23. Novelcrafter, Codex feature page — https://www.novelcrafter.com/features/codex
24. Plottr, Off By Default: AI in Plottr — https://plottr.com/ai-in-plottr-workflow/
25. Literature & Latte support, Does Scrivener use AI? — https://scrivener.tenderapp.com/help/kb/general/does-scrivener-use-ai
26. ProWritingAid, Developmental Editor / Manuscript Analysis — https://prowritingaid.com/developmental-editor
27. Kindlepreneur, Novelcrafter review *[user feedback]* — https://kindlepreneur.com/novelcrafter-review/
28. Kindlepreneur, Sudowrite review *[user feedback]* — https://kindlepreneur.com/sudowrite-review/
29. BookBub Insights, How Authors Are Thinking About AI (1,200+ authors, updated 2025-11-05) *[survey]* — https://insights.bookbub.com/how-authors-are-thinking-about-ai-survey/
30. Medium (I. Padmanabhan), Sudowrite review on a 40k-word manuscript *[user feedback]* — https://ilampadmanabhan.medium.com/sudowrite-review-i-tested-it-on-a-40-000-word-manuscript-heres-my-honest-verdict-april-2026-951b674dccea
31. Medium (I. Padmanabhan), Novelcrafter review "Powerful … Frustrating to Set Up" *[user feedback; page returned 403, cited via search snippet]* — https://medium.com/@ilampadmanabhan/novelcrafter-review-64d391c629a2
