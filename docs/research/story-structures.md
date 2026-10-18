# Story structures by genre and format

Research for #294 (child of the map #292, "Map: Outline planner"). Researched 2026-10-16. Extended for #349 (child of #347) on 2026-10-18 with Story Circle (2.13), a TV-style act structure (2.14) and Booker's seven basic plots stage by stage (section 7).

**Question:** Which established story structures exist for Prose fiction, and what does each consist of? For each: its beats or stages, their usual positions, the genres and lengths it suits, and any genre-specific requirements (such as fair-play clue placement in mystery). How do structures map onto Parts (Acts), Chapters and Scenes, and what is known about Series-level arcs? The findings feed the decision on which structures ship in a built-in catalogue that the Assistant uses to suggest a structure and check an Outline against it.

**Sources.** Each structure is attributed to the book or author that defines it (numbered list at the end). Where the defining text is a book, the beat names and positions come from that book. Web pages that only summarise a book were used to confirm details, not as the authority. Positions are given as a **percentage of the whole story**, the way most of these sources state them. Everything is summarised in my own words. Vocabulary follows `CONTEXT.md`: Author, Assistant, Outline, Part, Chapter, Scene, Book, Series, Prose.

A section marked **[synthesis]** is my own reading across sources, not a claim any one source makes.

### Since this research: what the catalogue decided

Checked on 2026-10-18 against the catalogue as built (`src/shared/structure-catalogue.ts`), `CONTEXT.md` and ADR 0017. The findings below still hold as research. Where the catalogue chose differently, the catalogue wins:

- **Vocabulary.** This document says "spine" and "overlay". The glossary avoids both: a spine is a **Structure**, and a genre requirement or overlay is a **Genre convention**. A beat is a **Beat**. Sections 2.13, 2.14 and 7 use the glossary's words.
- **Formats.** The catalogue adds **Flash fiction** (under 1,000 words) below the short story, which starts at 1,000. A Series is not a Format, so the "Series" row in section 1 is a note, not a Format.
- **Genres.** The catalogue adds **Science fiction** and **Other** to the seven genres covered in section 3. Science fiction has no Genre convention of its own.
- **Which entries became what.**
  - Weiland and Brooks are one Structure, "Four-part (nine points)".
  - Hayes's romance beats and Carroll's horror stages are not Structures. They became the Beats of the Romance and Horror **Genre conventions**, cut down to the Scenes that must exist. Section 8, item 1, lists both among the spines.
  - Dent's pulp formula, Story Circle and the TV-style act structure were added by #352. The TV structure has four acts, as section 2.14 suggests, and fits per Part only. Its acts fall within one Part, so none is marked as opening a Part. Dent's quarters each open one.
  - Alison's patterns and the single effect or epiphany are not entries. **No set Structure** is the catalogue's "describe, don't prescribe" choice (section 8, item 4).
- **Fits differ in places.** The catalogue gives Freytag and the Fichtean curve short Formats only (flash fiction to novella). Section 4 also allows them for literary and thriller novels. Kishōtenketsu is likewise short Formats only in the catalogue, where section 4 also allows literary novels. Three-act starts at the novelette in the catalogue, where section 4 allows a compressed short story.
- **Where a Structure runs.** Section 6 suggests two kinds of recorded structure, one per Book and an optional one across the Series. ADR 0017 decided otherwise. A Book follows **one** Structure, over the whole Book or anew in every Part, as for Episodes. A season or Series arc is carried by the Outline and Plot Threads, not a second Structure. A Structure's fit therefore gains "per Part" beside "per Book" and "across a Series". `fits.across` lists any of `book`, `part` and `series` (#350).
- **Booker's plots.** Section 2.12 judges Booker's seven plots a typology, not a Structure. The glossary agrees and makes them the **Archetype**, a Book detail with no Beats. Section 7 now describes each plot's stages as the source for the Archetype catalogue.

---

## 1. Formats: how long is each

The most widely used length bands come from the SFWA's Nebula rules [1]. The Hugo Awards use the same bands. Publishers and other awards vary a little, but these are the reference points.

| Format      | Words            | Structural room                                                                      |
| ----------- | ---------------- | ------------------------------------------------------------------------------------ |
| Short story | under 7,500      | One effect, one turn. A handful of Scenes; rarely Chapters.                          |
| Novelette   | 7,500 to 17,499  | One plot line with a few complications; Chapters optional.                           |
| Novella     | 17,500 to 39,999 | One main plot line, few or no subplots; Chapters normal, Parts rare.                 |
| Novel       | 40,000 and up    | Full act structure, subplots, Parts optional. Genre novels commonly 70,000–100,000+. |
| Series      | several Books    | A structure per Book plus an arc across Books (section 6).                           |

McEwan's essay on the novella [24] makes the case that the form rewards a single, unbroken line of action. Poe's 1842 review of Hawthorne [17] is the classic statement that a short tale should be built backwards from one intended effect, readable in one sitting.

## 2. General-purpose structures (the "spines")

These are genre-agnostic. Each one divides a whole story into stages at roughly fixed positions.

### 2.1 Freytag's pyramid (five parts)

**Source:** Gustav Freytag, _Die Technik des Dramas_ (1863); English translation by MacEwan [2].

**Stages:** introduction (exposition), rising action, climax, falling action (return), catastrophe (or resolution). Freytag also names three linking moments: the exciting force (after the introduction), the tragic force (just after the climax) and the force of final suspense (a last moment of doubt before the end).

**Positions:** Symmetrical, with the climax at the centre. Freytag ties the five parts to the five acts of classical drama.

**Suits:** It was written about tragedy for the stage. It is still taught for literary fiction and short stories, especially stories where the turn comes in the middle and the second half follows its consequences. The centred climax fits most modern genre novels poorly, because they climax near the end.

### 2.2 Three-act structure

**Source:** It traces back to Aristotle's beginning, middle and end. The modern positions come from Syd Field's screenwriting books, and novel-writing guides took them over. For Prose, the clearest definers are Weiland [3] and Brooks [4] (sections 2.3 and 2.4). Ingermanson [5] gives a compact novelist's version: three disasters plus an ending.

**Stages:** Act I, setup, up to a first turning point that commits the protagonist. Act II, confrontation, with a midpoint reversal in the middle. Act III, climax and resolution.

**Positions:** about 25% / 50% / 25%. Turning points sit at about 25% and 75%, and the midpoint at 50%.

**Suits:** Every genre, from novelette up. In a short story the acts shrink to a Scene or two each. This is the common denominator most other spines refine.

**Ingermanson's variant:** In step 2 of the Snowflake Method, the Author writes a one-paragraph plot of five sentences: the setup, three disasters and the ending. The first disaster ends the beginning, the second falls at the midpoint and the third ends the middle [5]. It is a useful minimum check: can the Outline name its three disasters?

### 2.3 Weiland's structure (Structuring Your Novel)

**Source:** K.M. Weiland, _Structuring Your Novel_ (2013, rev. 2022) [3]. Her _Creating Character Arcs_ (2016) [6] pins a character arc to the same points.

**Beats and positions:**

| Beat                         | Position                      |
| ---------------------------- | ----------------------------- |
| Hook                         | first lines and first chapter |
| Inciting event               | about 12%                     |
| First plot point             | 25%                           |
| First pinch point            | about 37%                     |
| Midpoint ("moment of truth") | 50%                           |
| Second pinch point           | about 62%                     |
| Third plot point             | 75%                           |
| Climax                       | about 88% to 98%              |
| Resolution                   | the last few percent          |

The pinch points show the antagonistic force's power. At the midpoint the protagonist turns from reacting to acting.

**Suits:** Novels in any genre. It is detailed enough to check positions in an Outline.

### 2.4 Brooks's four parts (Story Engineering)

**Source:** Larry Brooks, _Story Engineering_ (2011) [4].

**Parts:** Four parts of about 25% each: setup, response, attack and resolution. They are separated by the first plot point (20–25%), the midpoint (50%) and the second plot point (75%), with pinch points at about 37.5% and 62.5%. The positions are the same as Weiland's. What Brooks adds is a name for what the protagonist does in each quarter: the hero reacts in part two and takes charge in part three.

**Suits:** Novels. It is useful for showing a Project as four Parts.

### 2.5 Save the Cat! (15 beats)

**Source:** Blake Snyder, _Save the Cat!_ (2005), written for screenplays. Adapted for novels by Jessica Brody in _Save the Cat! Writes a Novel_ (2018) [7][8].

**Beats and positions (Brody's novel version):**

| #   | Beat                   | Position | Single or multi-Scene    |
| --- | ---------------------- | -------- | ------------------------ |
| 1   | Opening Image          | 0–1%     | single                   |
| 2   | Theme Stated           | ~5%      | single                   |
| 3   | Setup                  | 1–10%    | multi                    |
| 4   | Catalyst               | 10%      | single                   |
| 5   | Debate                 | 10–20%   | multi                    |
| 6   | Break Into 2           | 20%      | single                   |
| 7   | B Story                | ~22%     | single                   |
| 8   | Fun and Games          | 20–50%   | multi                    |
| 9   | Midpoint               | 50%      | single                   |
| 10  | Bad Guys Close In      | 50–75%   | multi                    |
| 11  | All Is Lost            | 75%      | single                   |
| 12  | Dark Night of the Soul | 75–80%   | multi                    |
| 13  | Break Into 3           | 80%      | single                   |
| 14  | Finale                 | 80–99%   | multi, in five sub-steps |
| 15  | Final Image            | 99–100%  | single                   |

**Story genres:** Brody also sorts stories into ten "story genres": Monster in the House, Golden Fleece, Out of the Bottle, Dude with a Problem, Rites of Passage, Buddy Love, Whydunit, Fool Triumphant, Institutionalized and Superhero. Each has three or four required ingredients. These cut across bookstore genres: Whydunit fits mystery and crime, Monster in the House fits horror, Buddy Love fits romance, and Golden Fleece fits quest fantasy.

**Suits:** Commercial novels of every genre. It is the most precise of the spines, which makes it the easiest to check. Brody explicitly marks some beats as a single Scene and others as a run of Scenes, so it maps directly onto Scenes and Chapters.

### 2.6 Seven-point story structure

**Source:** Dan Wells, in a 2010 lecture series; also Writing Excuses episode 7.41 [9]. Wells credits a role-playing game manual.

**Points:** Hook, Plot Turn 1, Pinch 1, Midpoint, Pinch 2, Plot Turn 2, Resolution. Wells advises designing from the ends: settle the resolution, then make the hook its opposite state, then fill the middle. He applies the seven points to each subplot and character arc separately, not only to the main plot.

**Positions:** Wells gives no percentages. The points sit in the same order as the three-act turning points.

**Suits:** Novels with several interleaved plot lines, notably fantasy and science fiction. It is a light checklist for a novella.

### 2.7 The Hero's Journey

**Source:** Joseph Campbell, _The Hero with a Thousand Faces_ (1949), a comparative study of myth with 17 stages. Christopher Vogler's _The Writer's Journey_ (1992, 25th anniversary ed. 2020) [10] reduced it to 12 stages for storytellers.

**Vogler's 12 stages:** Ordinary World, Call to Adventure, Refusal of the Call, Meeting with the Mentor, Crossing the First Threshold, Tests/Allies/Enemies, Approach to the Inmost Cave, the Ordeal, Reward, the Road Back, Resurrection, Return with the Elixir. Vogler lays them over three acts. Act I runs to the first threshold, Act II to the Road Back, with the Ordeal near the middle, and Act III is the rest. He says the stages may be reordered, merged or skipped.

**Archetypes:** Vogler pairs the stages with character roles: Hero, Mentor, Threshold Guardian, Herald, Shapeshifter, Shadow, Ally and Trickster. A catalogue could check these against the Story Bible's characters.

**Suits:** Quest and portal fantasy, adventure, coming-of-age. It also works across a trilogy (section 6). It fits literary fiction, cozy mystery and most romance poorly.

**Related:** Maureen Murdock's _The Heroine's Journey_ (1990) is a psychological counterpart. Gail Carriger's _The Heroine's Journey_ (2020) [11] contrasts the two for genre fiction. In her model the protagonist succeeds by building a network of connections rather than by winning alone. She points to romance and cozy fiction as natural fits.

### 2.8 Fichtean curve

**Source:** John Gardner, _The Art of Fiction_ (1983) [12]. Gardner names the shape after the philosopher Fichte.

**Shape:** No long setup. The story opens in or near a crisis and runs through a rising series of crises, each worse than the last, up to the climax, followed by a short falling action. Backstory is fed in during the crises rather than in an opening exposition.

**Suits:** Short stories, thrillers, and pulp and adventure fiction. It is a loose shape, with no fixed positions to check beyond "rising crises" and "a short ending".

### 2.9 Lester Dent's master plot (pulp formula)

**Source:** Lester Dent, the "Lester Dent Pulp Paper Master Fiction Plot" (written around 1936). It is reproduced in Cannaday's biography and in a University of Iowa transcription [13].

**Shape:** A 6,000-word story in four quarters of about 1,500 words each:

1. Hero, menace and problem, ending in a physical clash and a twist.
2. More trouble, another clash and twist.
3. The hero is pushed toward defeat.
4. The hero wins through his own skill, every thread is tied up, and there is a final twist.

Dent also asks for a distinctive murder method, villain motive, setting and menace.

**Suits:** Short action, crime and adventure stories. It is the only spine here that is defined for the short story itself. Scaled up, it is essentially the four-part structure.

**Fit** (added for #352) [synthesis]: Genres: Thriller, Crime, Mystery, Fantasy, Science fiction and Other, where the story turns on action and a physical menace. Formats: Short story, best at about 6,000 words, as Dent wrote it [13]; a novelette if each quarter grows. Per Book. Each quarter's closing twist makes Dent's plan a natural fit for four Parts, but he wrote it for one whole story, not to repeat.

### 2.10 Kishōtenketsu (four parts, no conflict required)

**Source:** It comes from the four-line Chinese verse form _qi-cheng-zhuan-he_ and was carried into Japanese and Korean composition [14]. Its origins and dates are disputed, and no single craft book defines it for Prose.

**Stages:**

- **Ki:** introduction.
- **Shō:** development.
- **Ten:** a twist, often an unrelated element whose connection is not yet clear.
- **Ketsu:** reconciliation, where the reader sees how the twist relates to the rest.

Roughly a quarter each.

**Suits:** Literary short fiction, slice-of-life and quiet fantasy. It is the main established alternative to conflict-driven structure, which matters for literary work. Ursula K. Le Guin's _Steering the Craft_ [15] argues the same point from Western craft: a story is about change, and conflict is only one way to show change.

### 2.11 Non-arc patterns (literary)

**Source:** Jane Alison, _Meander, Spiral, Explode: Design and Pattern in Narrative_ (2019) [16].

**Patterns:** Alison catalogues shapes other than the dramatic arc, drawn from patterns in nature:

- **Wave and wavelet:** symmetry, with the end mirroring the beginning.
- **Meander:** digression.
- **Spiral:** moves forward while circling back.
- **Radial or explosion:** everything points at a centre, or flies from it.

Other patterns in the book, such as network, cell and braid, I could not confirm from available sources.

**Suits:** Literary novels and story collections. These patterns are descriptive, not prescriptive. They give the Assistant language to recognise a deliberate non-arc Outline rather than "fix" it into three acts. There are no positions to check.

### 2.12 Empirical arcs (for reference)

**Sources:** Kurt Vonnegut's "shapes of stories" lecture sketched stories as fortune curves. Reagan et al. (2016) [18] tested this by computer on 1,300+ Project Gutenberg books and found six core emotional arcs:

- Rags to riches (steady rise)
- Riches to rags, or Tragedy (steady fall)
- Man in a hole (fall, then rise)
- Icarus (rise, then fall)
- Cinderella (rise, fall, rise)
- Oedipus (fall, rise, fall)

Christopher Booker's _The Seven Basic Plots_ (2004) is a typology of plot _kinds_, not of stages, so it is not a structure for this catalogue. It became the **Archetype**; section 7 sets out its plots stage by stage and cross-references these arcs.

**Use:** These arcs describe the protagonist's fortune, not beats. They could label the overall shape of an Outline (for example "this is a man-in-a-hole story") but are too coarse to check against.

### 2.13 Story Circle (eight steps)

**Source:** Dan Harmon, in a series of essays on story structure he wrote for the Channel 101 wiki, starting with "Story Structure 101" [33]. He presents the circle as a simplification of Campbell's monomyth, for writers of short films and TV episodes who said they could not plot [40]. A _Wired_ profile in 2011 [34] describes him using the circles, which he calls "embryos", to break episodes of _Community_. The step names commonly used (You, Need, Go, Search, Find, Take, Return, Change) are Harmon's one-word labels for the steps.

**Steps:** Harmon draws a circle cut by a horizontal line and a vertical line, which gives eight equal segments, run clockwise from the top. The upper half is the protagonist's familiar world, which he loosely calls order, and the lower half the unfamiliar one, chaos.

| #   | Step   | What it does                             | Where on the circle           | Rough position [synthesis] |
| --- | ------ | ---------------------------------------- | ----------------------------- | -------------------------- |
| 1   | You    | The protagonist in their comfort zone.   | top                           | 0–12.5%                    |
| 2   | Need   | They want something they lack.           | upper right                   | about 12%                  |
| 3   | Go     | They cross into an unfamiliar situation. | right, on the horizontal line | about 25%                  |
| 4   | Search | They adapt to it, and are tested.        | lower right                   | 25–50%                     |
| 5   | Find   | They get what they wanted.               | bottom                        | about 50%                  |
| 6   | Take   | They pay a heavy price for it.           | lower left                    | 50–75%                     |
| 7   | Return | They go back to the familiar situation.  | left, on the horizontal line  | about 75%                  |
| 8   | Change | They have changed, for good or ill.      | upper left                    | 87.5–100%                  |

Harmon gives no percentages. The positions above follow from the circle's eight equal segments, so they are as approximate as the circle. On those positions, the steps line up with the three-act turning points [synthesis]: Go is the first turning point, Find the midpoint and Return the second turning point.

**Scales:** Harmon applies the circle at every scale, from a whole film down to a single scene, and nests circles inside each other [33][34]. For the catalogue this means it can describe one Episode or one short story, and not only a whole Book.

**Fit** [synthesis]:

- **Genres:** All. It asks that the protagonist changes, so it suits character-driven stories best, and literary fiction where the change is the point. It suits a mystery series less well, because its detective usually comes back unchanged.
- **Formats:** Short story, novelette and novella. Flash fiction can carry it with one Scene per step or less. In a novel, eight steps are too coarse to check positions, though they still name the overall shape.
- **Per Book or per Part:** Both. It works per Book in a short Format, and per Part when every Episode runs its own circle, which is how Harmon uses it on TV. Across a Series, Harmon's nested circles would make a season arc. ADR 0017 leaves that arc to the Outline and Plot Threads.

**Credit:** "Story Circle, after Dan Harmon, from Joseph Campbell's hero's journey." Harmon's essays are his text, so the catalogue should paraphrase the steps, as the table does.

### 2.14 TV-style act structure (teaser, four acts, tag)

**Source:** This is an industry convention of US commercial broadcast television, not the invention of one writer. The act breaks exist because the network places its commercial breaks there, so each act must end on a turn strong enough to bring the viewer back [35][36]. The clearest descriptions come from working TV writers and teaching texts: Larry Brody's teleplay notes [35], a common script-format guide [36], and Pamela Douglas's _Writing the TV Drama Series_ [37]. There is no single source to credit. The catalogue should credit it as "the act structure of US network television".

**Parts of one Episode (one-hour drama):**

| Part               | What it does                                                        | Usual length [36] | Rough share of the Episode [synthesis] |
| ------------------ | ------------------------------------------------------------------- | ----------------- | -------------------------------------- |
| Teaser (cold open) | Sets up the week's problem and ends on a hook, before the titles.   | 2–4 pages         | 0–5%                                   |
| Act One            | Responds to the teaser and ends on a turn: the act-out.             | 14–15 pages       | 5–28%                                  |
| Act Two            | Ends with major trouble for a regular, usually the lead.            | 14–15 pages       | 28–51%                                 |
| Act Three          | Gets the lead out of trouble; ends with the pieces coming together. | 14–15 pages       | 51–74%                                 |
| Act Four           | The crisis and climax.                                              | 14–15 pages       | 74–97%                                 |
| Tag                | A short coda after the climax, often lighter.                       | 1–2 pages         | 97–100%                                |

The "what it does" column follows Brody's act-by-act description [35], condensed from his five acts to four. Each act ends on an **act-out**: a cliffhanger, reversal or revelation. Shares come from a script of about 60 pages.

**Variants:**

- **Five or six acts.** Networks have split acts to add breaks, so many broadcast dramas run five or six acts [35][37]. Brody describes five acts plus teaser and tag as his standard [35]. Each act then takes about a fifth or sixth of the Episode.
- **Half-hour comedy.** A cold open, two acts (or three) and a tag [36].
- **Cable and streaming.** These run without commercial breaks, but keep the same build of turns [35]. Writers often still mark the act-outs.

**In Prose** [synthesis]: In an episodic novel or a web serial, each Episode is a Part, as the glossary says. The teaser is an opening Scene, and each act is a run of Scenes, often one Chapter. An act-out is a Chapter's last Scene, which matches the turning point on a Chapter boundary in section 5.

**Fit** [synthesis]:

- **Genres:** All. Procedural crime and mystery, medical and legal drama, thriller, fantasy and science fiction use it most on TV.
- **Formats:** It describes one Episode, not a whole Book, so a Book's Format says little about it. The Book's Format is the total of its Episodes, typically a novella or novel; those two are the natural list where the catalogue needs one.
- **Per Book or per Part:** **Per Part only.** It runs anew in every Episode. A Book of one Episode runs it once, which ADR 0017 already treats as the whole Book. It is not a Series structure: the season arc runs through Plot Threads (ADR 0017).
- **Count of acts.** The catalogue should pick one form. Four acts is the clearest. Five acts, as Brody describes them [35], are common on broadcast TV today.

## 3. Genre requirements and genre-specific structures

Genre adds **requirements** on top of a spine: scenes that must exist, things that must happen before others, and endings that are owed. Shawn Coyne's _The Story Grid_ (2015) [19] gives this its clearest general form:

- **Conventions** are settings, cast roles and devices a genre's readers expect.
- **Obligatory scenes** are the events a genre's readers expect to see on the page.
- **The "core event"** is the one scene the whole book builds to.

Coyne also divides a whole novel into Beginning Hook, Middle Build and Ending Payoff, at about 25/50/25. Below, each genre lists its requirements, its native structure where one exists, and the spines that suit it.

### 3.1 Mystery (whodunit, detective)

**Native shape** (Golden Age practice; codified by the rule-makers below):

1. A crime, almost always a murder, discovered early. Van Dine insists on a corpse.
2. The investigation: interviews, clues and red herrings, often with a second crime around the middle that raises the stakes.
3. A false solution or reversal.
4. The detective's private realisation.
5. The reveal, where the detective explains the solution and the reasoning to the cast.
6. A short aftermath.

On a three-act spine, the crime belongs at or before the first plot point, and the reveal in the climax.

**Fair-play requirements.** These are the most checkable genre rules in this survey:

- **Every clue the solution relies on must be shown to the reader before the reveal.** The detective may not use evidence the reader never saw. This is Van Dine's rule 1 and rule 2 [20], and Knox's rule 8 [21]. The Detection Club oath of 1930 commits members to the same [22]. Ellery Queen made this literal with a "Challenge to the Reader" page inserted just before the solution.
- **The culprit must appear early and play a real part.** Knox's rule 1 says the culprit must be mentioned in the early part of the story. Van Dine says the culprit must be a character of some prominence.
- **No solution by accident, coincidence, intuition, confession out of nowhere or the supernatural.** Knox rules 2 and 6; Van Dine rules 5 and 8; the Detection Club oath.
- **No hidden POV deceit.** The culprit must not be a character whose thoughts the reader has followed (Knox rule 1). The Watson figure must not hide his thoughts (Knox rule 9).
- **The detective must not be the culprit** (Van Dine rule 4; Knox rule 7). **There must be only one culprit**, or one mind behind the crime (Van Dine rule 12).

Knox wrote partly tongue-in-cheek, and one of his ten rules reflects the prejudices of its time and should not be carried forward. Modern mysteries break individual rules on purpose, Christie's _The Murder of Roger Ackroyd_ most famously. The **clue-before-reveal ordering** and **culprit-introduced-early** rules are still what readers mean by "fair".

**What the Assistant can check in an Outline** [synthesis]:

- For each clue, the Scene where it is planted comes before the reveal Scene.
- The culprit appears in the first act.
- The solution uses no information that first appears in the reveal.

This needs clues and the culprit to be markable in the Outline or Story Bible, for example through Tags.

**Spines that suit it:** three-act or four-part. Save the Cat's Whydunit [7] adds a required "dark turn", where the investigation changes the detective. For short fiction, the classic Holmes and Father Brown shape fits: problem, investigation, solution.

### 3.2 Crime (other than the whodunit)

**Variants** [synthesis from genre practice]:

- **The inverted detective story** (howcatchem). R. Austin Freeman's _The Singing Bone_ (1912) introduced it. The crime is shown first from the criminal's side, then the investigation. Suspense comes from _how_ the criminal will be caught, so the fair-play obligation becomes "the slip that convicts them must be shown".
- **The caper or heist:** plan, team, execution, complication, twist.
- **The criminal-protagonist novel** (Highsmith): often a negative character arc in Weiland's terms [6].
- **The police procedural:** a mystery spine with institutional conventions such as procedure, the team and the chain of command.

**Story Grid conventions for crime** [19]: an inciting crime early, a master detective or investigator, clues and red herrings, a ticking clock, and the exposure of the criminal as the core event. Some sources add a "speech in praise of the villain" (strictly a thriller convention in Story Grid) and a false ending.

### 3.3 Thriller

**Required scenes** [19][23]: Coyne's thriller list is the clearest:

- An inciting crime that signals a larger threat.
- The hero's life or someone dear put at stake: the hero becomes the target or victim.
- A "speech in praise of the villain" that shows the antagonist's power.
- A MacGuffin the villain wants.
- Red herrings.
- A ticking clock.
- The **hero at the mercy of the villain** (the core event, at the All Is Lost point), where the hero turns the tables through their particular gift.
- A false ending.

**Spines that suit it:**

- Three-act and four-part, which handle pinch points well.
- Save the Cat's Dude with a Problem [7].
- The Fichtean curve [12], for fast openings.
- James Scott Bell's _Plot & Structure_ (2004) [25]. His LOCK system is Lead, Objective, Confrontation, Knockout ending. He calls the two act-turns "doorways of no return", and puts the first before about a fifth of the way in.

### 3.4 Horror

**Native shape:** Noël Carroll, _The Philosophy of Horror_ (1990) [26], identifies the **complex discovery plot**:

1. **Onset:** the monster's presence is shown, to the reader at least.
2. **Discovery:** characters learn of it.
3. **Confirmation:** they must convince others, often authorities, who do not believe.
4. **Confrontation:** humans against monster, usually in more than one round.

Carroll notes that stages may be dropped, doubled or combined. He also describes an **overreacher plot**: someone pursues forbidden knowledge (the Frankenstein pattern), then sees it go wrong, then confronts what they made.

**Required scenes** [19]: Story Grid's horror list includes:

- An inciting attack by the monster.
- A speech in praise of the monster.
- The victim's discovery and denial, mirroring Carroll's confirmation.
- The **victim at the mercy of the monster** (the core event).
- A false ending, where the monster returns.

**Spines that suit it:** three-act, with Carroll's stages laid over it. Save the Cat's Monster in the House [7] requires a monster, a confined space (the "house") and a sin that brought the monster in. For short horror, the Fichtean curve [12] or Poe's single effect [17].

### 3.5 Fantasy

There is no single native beat sheet. Fantasy borrows spines and adds expectations about the world.

- **Hero's Journey** [10]: the classic fit for quest and portal fantasy.
- **Sanderson's promises, progress and payoff** [27]. The opening makes promises about the kind of story and what will be resolved. The middle must show visible progress on them. The ending pays them off. He separates the overarching conflict ("big P" plot) from smaller plots that feed it. His essays also argue that a magic system can only solve problems in the climax to the degree the reader understands it. That is a fair-play rule for magic, analogous to the mystery one.
- **Seven-point** [9]: popular among fantasy writers for multi-thread books.
- **Mendlesohn's modes of fantasy**: Farah Mendlesohn, _Rhetorics of Fantasy_ (2008) [28], classifies fantasy by how the fantastic enters the story:
  - **Portal-quest:** the protagonist enters another world. This suits the Hero's Journey.
  - **Immersive:** the story is set wholly in the other world.
  - **Intrusion:** the fantastic breaks into our world. This structurally resembles horror, so Carroll's stages apply.
  - **Liminal:** the fantastic stays uncertain.

  These modes are not beat sheets, but they help pick a fitting spine.

**What the Assistant can check in an Outline** [synthesis]:

- Promises made in the first act get paid off in the Outline's last act.
- A problem the climax solves with magic or a world rule is set up in an earlier Scene or in the Story Bible.

### 3.6 Romance

**Genre definition.** Romance Writers of America defines the genre by two elements [29]:

- **A central love story**, whose conflict and climax concern the relationship.
- **An emotionally satisfying, optimistic ending.** In genre usage this is "happily ever after" (HEA) or "happy for now" (HFN).

The ending is a hard requirement. A story without it is fiction with romantic elements, not romance.

**Native beat sheet:** Gwen Hayes, _Romancing the Beat_ (2016) [30], in four phases of about a quarter each:

1. **Setup:** introduce each lead and what is missing in them; the meet-cute; "no way" (reasons it can't work); an adhesion that forces them together.
2. **Falling in love:** no way, but…; deepening desire; maybe this could work; the midpoint of love, a first real intimacy or acknowledgement.
3. **Retreating from love:** inkling of doubt; deepening doubt; retreat; the shields go up; the break-up (the low point, around 75%).
4. **Fighting for love:** dark night; the wake-up; the grand gesture; whole-hearted; the epilogue or HEA.

Hayes's beats track the relationship arc. She expects an external plot alongside, which any other spine can supply.

**Other conventions** [synthesis from genre practice]:

- Dual POV, often alternating by Chapter.
- Tropes (enemies-to-lovers, second chance, fake relationship) that set reader expectations.
- Heat level as a declared Project-level fact.

Save the Cat's Buddy Love [7] covers the romance genre's love-story requirements in its own terms: an incomplete hero, a counterpart and a complication that keeps them apart. Carriger's Heroine's Journey [11] fits as an alternative spine.

**What the Assistant can check in an Outline** [synthesis]:

- The leads meet in the first quarter.
- A break-up or dark moment comes at about 75%.
- A grand gesture and reconciliation precede the end.
- The ending is HEA or HFN.

### 3.7 Literary fiction

Literary fiction has **no required beats**. Fitting tools are:

- **Freytag** [2] and the **Fichtean curve** [12] for conventional arcs.
- **Kishōtenketsu** [14] and **Alison's patterns** [16] for non-conflict or non-arc shapes.
- **Le Guin's view of story as change** [15].
- **The epiphany ending.** A short story that ends on a moment of realisation is a convention of literary short fiction since Joyce's _Dubliners_. Charles Baxter's _Burning Down the House_ (1997) [31] criticises its overuse.

**Consequence for the planner** [synthesis]: for literary fiction the planner should mostly **describe** the shape an Outline already has, and check only internal consistency, such as whether set-ups are paid off. It should not push a beat sheet.

### 3.8 Genre × structure fit (summary)

| Genre    | Native structure                                       | Required scenes or rules                                                                                               | Spines that also suit                                                |
| -------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Mystery  | crime, investigation, false solution, reveal           | fair-play clue placement; culprit early; no coincidence or supernatural; detective not culprit                         | three-act, four-part, Save the Cat (Whydunit)                        |
| Crime    | inverted, caper, procedural variants                   | inciting crime; investigator; clues and red herrings; exposure of criminal                                             | three-act, four-part, Weiland negative arc                           |
| Thriller | –                                                      | inciting crime; hero becomes victim; villain praised; MacGuffin; ticking clock; hero at mercy of villain; false ending | four-part, Save the Cat (Dude with a Problem), Fichtean, Bell's LOCK |
| Horror   | Carroll: onset, discovery, confirmation, confrontation | monster attack; denial; victim at mercy of monster; false ending                                                       | three-act, Save the Cat (Monster in the House), Fichtean (short)     |
| Fantasy  | –                                                      | promises, progress and payoff; magic that solves problems must be set up                                               | Hero's Journey, seven-point, Save the Cat (Golden Fleece)            |
| Romance  | Hayes: 4 phases, 20 beats                              | central love story; HEA or HFN ending; break-up around 75%; grand gesture                                              | three-act, Save the Cat (Buddy Love), Heroine's Journey              |
| Literary | –                                                      | none                                                                                                                   | Freytag, Fichtean, kishōtenketsu, Alison's patterns, epiphany        |

## 4. Format × structure fit

[synthesis, from the sources' own scope statements]

| Structure                                    | Short story            | Novelette | Novella   | Novel         | Per Book, Part or Series                       |
| -------------------------------------------- | ---------------------- | --------- | --------- | ------------- | ---------------------------------------------- |
| Freytag (5)                                  | yes                    | yes       | yes       | literary only | –                                              |
| Fichtean curve                               | **best**               | yes       | yes       | thriller      | –                                              |
| Single effect or epiphany (Poe, Joyce)       | **best**               | yes       | –         | –             | –                                              |
| Kishōtenketsu (4)                            | **best**               | yes       | yes       | literary      | –                                              |
| Dent master plot (4 quarters)                | **best** (6,000 words) | yes       | –         | –             | –                                              |
| Three-act, or three disasters (Ingermanson)  | compressed             | yes       | **best**  | yes           | per Book                                       |
| Seven-point                                  | –                      | yes       | yes       | yes           | per thread and per Book                        |
| Weiland or Brooks (9 points, 4 parts)        | –                      | –         | yes       | **best**      | per Book and across Books (Weiland [6])        |
| Save the Cat (15)                            | –                      | –         | condensed | **best**      | per Book                                       |
| Hero's Journey (12)                          | –                      | –         | condensed | yes           | across a trilogy                               |
| Hayes, Romancing the Beat (20)               | –                      | –         | yes       | **best**      | per couple                                     |
| Carroll (4 stages)                           | yes                    | yes       | yes       | yes           | –                                              |
| Story Circle (8)                             | **best**               | yes       | yes       | coarse        | per Book, or per Part (one circle per Episode) |
| TV-style act structure (teaser, 4 acts, tag) | –                      | –         | –         | –             | **per Part only** (one per Episode)            |

The last two rows were added for #349 (sections 2.13 and 2.14).

The rule of thumb: **the shorter the work, the fewer beats it can carry**. A short story has room for one turn (single effect, epiphany, ten) or one rising line (Fichtean). Detailed beat sheets (Save the Cat, Hayes, Weiland) are written for novels and must be condensed below about 40,000 words.

## 5. Mapping structures onto Parts, Chapters and Scenes

What the sources say about the smallest unit:

- **Scene level.** Dwight Swain, _Techniques of the Selling Writer_ (1965) [32], defines two units:
  - The **scene**: goal, conflict, disaster.
  - The **sequel**: reaction, dilemma, decision.

  Each decision sets the next scene's goal. Coyne's Five Commandments [19] apply to every Scene, every sequence, every act and the whole story: inciting incident, progressive complication with a turning point, crisis, climax and resolution. Weiland [3] uses Swain's pair as well. So a Scene's Outline can be checked for "does something turn here?" independently of where the Scene sits in the whole.

- **Beat to Scene or run of Scenes.** Brody [8] marks each Save the Cat beat as **single-Scene** (Catalyst, Midpoint, All Is Lost…) or **multi-Scene** (Setup, Fun and Games, Bad Guys Close In…). That is the most direct mapping in the literature: a single-Scene beat is one Scene, and a multi-Scene beat is a run of Scenes, often one or more Chapters. Hayes's romance beats [30] work the same way.

- **Act to Part.** Three-act, four-part and Freytag's five parts map naturally onto Parts labelled "Act", which `CONTEXT.md` already allows as the Part label. Coyne's Beginning Hook, Middle Build and Ending Payoff [19] do too. Brooks's four parts [4] suggest four Parts. A common practical split is Act II as two Parts at the midpoint, giving four Parts.

- **Positions are by length.** Every percentage above is a share of the **whole story's length**. In Scaffold, an Outline-only Project has no Prose to measure [synthesis]. The Assistant would locate a beat by one of:
  - the **Word targets** of the Scenes, Chapters and Parts before it, when set;
  - otherwise **Scene count**;
  - otherwise **Chapter count**.

  It should report positions as approximate. The sources themselves treat the percentages as guides, not rules.

- **Turning points on boundaries.** Turning points (Catalyst, plot points, midpoint, All Is Lost) are conventionally placed at the end of a Chapter or Part, so the turn is the page-turn [synthesis; consistent with Dent's twist at the end of each quarter [13] and Swain's disaster closing each scene [32]].

- **Several structures at once.** Wells applies the seven points per subplot [9]. Hayes runs the romance beats beside an external plot [30]. Coyne layers an external genre and an internal genre [19]. A Project may need **one main structure plus one or more overlays**, for example Save the Cat as the spine with mystery fair-play rules on top, or Hayes's romance beats beside a fantasy quest.

## 6. Series-level arcs

The sources say less here, and practice varies more.

- **Each Book is complete.** Most genre series give each Book its own full spine and resolved main plot, and run a smaller arc across Books. Sanderson's "big P" plot [27] and Weiland's overarching character arcs [6] describe this.
  - In **mystery and crime series**, each Book is a closed case, and the detective's personal life is the series arc.
  - In **romance series**, each Book usually gives a new couple their own full Hayes arc and HEA [30], with shared setting and cast as the link.
- **The trilogy as one story.** In epic fantasy, three Books often act as the three acts of one large structure, or as one Hero's Journey [10]. Book 1 ends at a first-plot-point-sized turn, Book 2 often at an All Is Lost-sized low, and Book 3 carries the climax [synthesis; this is the pattern of the Star Wars trilogy that Vogler analyses].
- **Promises across Books.** Sanderson's promises, progress and payoff [27] scale up. The first Book makes the series promises, and each later Book must show progress on them. This is checkable from Outlines alone [synthesis].
- **Mapping to Scaffold** [synthesis]: the series structure belongs in the **Series Outline**, and each Book's structure in that **Book's Outline**. The map already lists "Planning a Series" as not yet specified. These findings suggest it needs two kinds of recorded structure: one per Book and an optional one across the Series.

## 7. Booker's seven basic plots (the Archetypes)

**Source:** Christopher Booker, _The Seven Basic Plots: Why We Tell Stories_ (Continuum, 2004) [38]. He reads hundreds of stories, from myth to film, as variations on seven plots. Booker also discusses two more plots beyond the seven, Rebellion Against "The One" and Mystery [38]. The glossary's Archetype covers only the seven.

**What it is, and is not.** A plot in Booker's sense is a kind of story with a typical rise and fall of fortune. It has no positions, and its stages are not Beats: a Rags to riches story may follow Three-act, Story Circle or no set Structure. So an Archetype says what _happens_ to the protagonist's fortune, and the Structure says _where_ the turns fall. This section documents the shape of each plot, not Beat positions.

**A common pattern.** Booker finds one underlying pattern in five stages behind most of the plots [38][39]:

1. **Anticipation:** the hero is called to the adventure.
2. **Dream:** early success; all seems possible.
3. **Frustration:** the hero meets the opposing power, and things go wrong.
4. **Nightmare:** at the climax, hope seems lost.
5. **Resolution:** the hero wins through against the odds, or, in a tragedy, is destroyed.

Each plot gives these stages its own names and weight. Comedy is the exception, with three stages.

**Reagan et al.'s arcs** [18] measure the same rise and fall from the text of books. The cross-references below are my own reading [synthesis]. Reagan et al. do not map their arcs to Booker. Note the clash of names: Booker's _Rags to riches_ includes a fall in the middle, so it matches Reagan's _Cinderella_, not Reagan's _Rags to riches_ (a steady rise).

### 7.1 The seven plots, stage by stage

Stage names below follow the book [38] as I know it, in my own words. Confirm them against the book before the catalogue ships (see the verification notes).

**Overcoming the monster.** A community or a hero is threatened by a monstrous power, and the hero sets out to destroy it.

1. Anticipation and the call: the threat is learned of, and the hero is called.
2. Dream: preparations go well; the monster is still far off.
3. Frustration: the hero faces the monster's full power.
4. Nightmare: the final ordeal; the hero seems about to lose.
5. A thrilling escape and the death of the monster, often with a prize won.

_Rise and fall:_ a low under the threat, a brief rise, a deep fall, then a sharp rise at the end. Closest to **Man in a hole** (fall, then rise).

**Rags to riches.** A humble or overlooked hero rises, loses everything, and wins it back in full, having grown.

1. Initial wretchedness at home, and the call.
2. Out into the world: early success.
3. The central crisis: everything goes wrong.
4. Independence and the final ordeal: the hero, alone, proves equal to it.
5. Final union, completion and fulfilment.

_Rise and fall:_ rise, fall, rise. Closest to **Cinderella** (rise, fall, rise).

**The quest.** The hero, usually with companions, sets out for a distant goal and gets there after a long journey.

1. The call: life at home can no longer go on.
2. The journey: hardships and temptations on the way.
3. Arrival and frustration: at or near the goal, new obstacles.
4. The final ordeals: a last series of tests.
5. The goal: it is won.

_Rise and fall:_ a long run of falls and recoveries, ending high. Closest to **Man in a hole** over the whole, with several smaller holes on the journey.

**Voyage and return.** The hero travels out of the ordinary world into a strange one, and returns home changed.

1. Anticipation, and the "fall" into the other world.
2. Initial fascination, or dream stage: the new world is wonderful.
3. Frustration: it turns strange and threatening.
4. Nightmare: the threat closes in.
5. A thrilling escape and the return home.

_Rise and fall:_ rise, fall, rise. Closest to **Cinderella**.

**Comedy.** People are trapped in a tangle of confusion and misunderstanding. When it is unknotted, they come together, often in marriage. Booker means comedy as a plot, not as humour.

1. A shadow of confusion, uncertainty and frustration falls over a little world.
2. The confusion grows until the pressure is at its height.
3. Things are brought to light: perceptions change, and the ending unites those kept apart.

_Rise and fall:_ a deepening fall, then a quick rise at the end. Closest to **Man in a hole**.

**Tragedy.** The hero is tempted into a course of action, at first succeeds, and is then destroyed by it.

1. Anticipation: the hero is unfulfilled and fixes on a goal or a temptation.
2. Dream: the hero commits, and things go well.
3. Frustration: things begin to go wrong, and the hero goes further to hold on.
4. Nightmare: the hero loses control; the forces against them close in.
5. Destruction or death-wish: the hero is destroyed.

_Rise and fall:_ rise, then fall. Closest to **Icarus** (rise, then fall); a story that begins high is **Riches to rags** (steady fall).

**Rebirth.** The hero falls under a dark spell or power, and is freed by a redeeming act, often by another character.

1. The hero falls under the shadow of a dark power.
2. For a while all seems well; the threat seems to recede.
3. The threat returns in full, and the hero is trapped in a living death.
4. The trap holds a long time; the dark power seems to have won.
5. A miraculous redemption frees the hero.

_Rise and fall:_ fall, a false rise, a deep fall, then a rise. Closest to **Man in a hole**.

### 7.2 For the Archetype catalogue

[synthesis, input for #351, not a decision]

- **Name and credit.** Each Archetype keeps Booker's plot name and credits "Christopher Booker, _The Seven Basic Plots_ (2004)". The descriptions above are already in our own words.
- **What a description holds.** One line on the kind of story, and one on its rise and fall. The five stages are background for Plan, not a checklist: Archetypes have no Beats.
- **What Plan can check.** Only coarse things. Does the Outline's turn of fortune match the Archetype? Does a Tragedy end in a fall, or a Rags to riches end high after a central crisis? The Structure's Beats carry the positions.
- **Blends.** Booker says many stories combine plots [38]. The glossary leaves a blend to the Book's Notes.
- **Critics.** Reviewers fault Booker for judging stories by how well they fit his plots [39]. That is one more reason to treat an Archetype as description and advice, never a limit, as the glossary does for Structure.

## 8. Observations for the catalogue decision

[synthesis, input for #296, not a decision]

1. **There are two kinds of entry.**
   - **Spines** are positional beat lists: Three-act, Weiland or Brooks four-part, Save the Cat 15, Seven-point, Hero's Journey 12, Freytag 5, Fichtean, Kishōtenketsu, Dent, Hayes 20, Carroll 4.
   - **Genre requirements** are presence and ordering rules: mystery fair play, the romance HEA, the thriller and horror core events, and fantasy promises and magic set-up.

   A Project would choose one spine and may have overlays. The overlays are where most of the _checking_ value is, because they are crisp. "Every clue appears before the reveal" can be checked; "the midpoint should fall at 50%" can only be approximated.

2. **Three kinds of check:**
   - **Position:** is beat X near position Y?
   - **Presence:** does an obligatory scene exist?
   - **Order:** clue before reveal, set-up before payoff, culprit before the end of Act I.

   Order and presence checks need the Outline to mark the relevant Scenes and Entries, through Tags, Key fields or the Story Bible.

3. **The most-cited structures with the clearest definitions** for novels are Save the Cat (Brody), Weiland's, the Hero's Journey (Vogler), Hayes for romance, and the three-act or three-disasters minimum. For short fiction they are Fichtean, single effect or epiphany, Kishōtenketsu and Freytag.
4. **Literary work needs a "describe, don't prescribe" mode**, with non-arc shapes (Alison, kishōtenketsu) treated as valid choices.
5. **Licensing.** The structure ideas are free to describe. The beat _names_ of Save the Cat, Romancing the Beat and The Story Grid come from commercial books. "Save the Cat!" is a registered trademark. Naming the structure and its author in the catalogue with attribution is ordinary practice. Copying the books' explanatory text into a system prompt is not. Any catalogue entry should paraphrase.

---

## Sources

1. SFWA, _Nebula Rules_: category word counts. https://nebulas.sfwa.org/nebula-rules/ (also https://www.sfwa.org/nebula-awards/rules/)
2. Gustav Freytag, _Freytag's Technique of the Drama_, tr. Elias J. MacEwan (3rd ed., Scott, Foresman, 1900). https://archive.org/details/freytagstechniqu00freyuoft
3. K.M. Weiland, _Structuring Your Novel_ (PenForASword, 2013; rev. 2022). Author site: https://www.helpingwritersbecomeauthors.com/
4. Larry Brooks, _Story Engineering_ (Writer's Digest Books, 2011).
5. Randy Ingermanson, "Making Sense of Story Structure" and the Snowflake Method, Advanced Fiction Writing (author's site). https://www.advancedfictionwriting.com/blog/2010/09/08/making-sense-of-story-structure/
6. K.M. Weiland, _Creating Character Arcs_ (PenForASword, 2016).
7. Jessica Brody, _Save the Cat! Writes a Novel_ (Ten Speed Press, 2018).
8. Save the Cat!, beat sheets (publisher site). https://savethecat.com/beat-sheets
9. Writing Excuses 7.41, "Seven-Point Story Structure" (Dan Wells with Brandon Sanderson, Mary Robinette Kowal, Howard Tayler). https://writingexcuses.com/?p=2371
10. Christopher Vogler, _The Writer's Journey: Mythic Structure for Writers_ (Michael Wiese Productions, 25th anniversary ed., 2020); Joseph Campbell, _The Hero with a Thousand Faces_ (1949).
11. Gail Carriger, _The Heroine's Journey: For Writers, Readers, and Fans of Pop Culture_ (GAIL CARRIGER LLC, 2020); Maureen Murdock, _The Heroine's Journey_ (Shambhala, 1990).
12. John Gardner, _The Art of Fiction: Notes on Craft for Young Writers_ (Knopf, 1983).
13. Lester Dent, "The Lester Dent Pulp Paper Master Fiction Plot" (ca. 1936), transcription. https://myweb.uiowa.edu/jwolcott/Doc/pulp_plot.htm
14. Kishōtenketsu: origins and stages (overview; origins disputed). https://en.wikipedia.org/wiki/Kish%C5%8Dtenketsu
15. Ursula K. Le Guin, _Steering the Craft_ (Mariner, rev. 2015).
16. Jane Alison, _Meander, Spiral, Explode: Design and Pattern in Narrative_ (Catapult, 2019). Publisher listing: https://www.publishersweekly.com/9781948226134
17. Edgar Allan Poe, review of Hawthorne's _Twice-Told Tales_, _Graham's Magazine_, May 1842. https://www.bostonliteraryhistory.com/node/32.html
18. Andrew J. Reagan et al., "The emotional arcs of stories are dominated by six basic shapes", _EPJ Data Science_ 5:31 (2016). https://doi.org/10.1140/epjds/s13688-016-0093-1
19. Shawn Coyne, _The Story Grid: What Good Editors Know_ (Black Irish, 2015); Story Grid site (Five Commandments, genre analyses). https://storygrid.com/five-commandments-of-storytelling/; thriller cheat sheet: https://store.storygrid.com/wp-content/uploads/sites/3/2017/09/Thriller-Story-Cheat-Sheet.pdf; horror: https://storygrid.com/?p=131886
20. S.S. Van Dine, "Twenty Rules for Writing Detective Stories", _The American Magazine_, September 1928. https://www.umsl.edu/~gradyf/film/vandinerules.htm
21. Ronald Knox, preface to _The Best Detective Stories of 1928_ (1929), the "Decalogue". Discussion: https://www.open.edu/openlearn/history-the-arts/agatha-christie-and-the-golden-age-detective-fiction/content-section-5.1
22. The Detection Club oath (1930), as described in the same OpenLearn unit and in Martin Edwards, _The Golden Age of Murder_ (HarperCollins, 2015).
23. Story Grid analysis of _Primal Fear_ (thriller obligatory scenes). https://storygrid.com/primal-fear/
24. Ian McEwan, "Some Notes on the Novella", _The New Yorker_, 29 October 2012. https://www.newyorker.com/books/page-turner/some-notes-on-the-novella
25. James Scott Bell, _Plot & Structure_ (Writer's Digest Books, 2004).
26. Noël Carroll, _The Philosophy of Horror, or Paradoxes of the Heart_ (Routledge, 1990). https://www.routledge.com/products/9780203361894
27. Brandon Sanderson, BYU lecture recaps on plot and structure (author's site). https://www.brandonsanderson.com/blogs/blog/brandon-sandersons-2025-guide-to-plot-lecture-2 and https://brandonsanderson.com/blogs/blog/brandon-sandersons-2025-overview-of-story-structure-lecture-3; "Sanderson's First Law" essay on the same site.
28. Farah Mendlesohn, _Rhetorics of Fantasy_ (Wesleyan University Press, 2008).
29. Romance Writers of America, definition of the romance genre (two elements: central love story, emotionally satisfying and optimistic ending). Summary: https://en.wikipedia.org/wiki/Romance_novel
30. Gwen Hayes, _Romancing the Beat: Story Structure for Romance Novels_ (2016).
31. Charles Baxter, _Burning Down the House: Essays on Fiction_ (Graywolf, 1997), "Against Epiphanies".
32. Dwight V. Swain, _Techniques of the Selling Writer_ (University of Oklahoma Press, 1965).
33. Dan Harmon, "Story Structure 101: Super Basic Shit" and the essays that follow it, such as "Story Structure 104: The Juicy Details", Channel 101 wiki. https://channel101.fandom.com/wiki/Story_Structure_101:_Super_Basic_Shit
34. Brian Raftery, "How Dan Harmon Drives Himself Crazy Making _Community_", _Wired_, September 2011.
35. Larry Brody, "TV Writing Tips & Tricks #19: One-Hour Teleplay Construction", TVWriter.com, 6 April 2021. https://tvwriter.com/larry-brodys-tv-writing-tips-tricks-19-1-hour-teleplay-construction/
36. "Television Script Format", MovieOutline (page counts per teaser, act and tag for one-hour drama and half-hour comedy). https://www.movieoutline.com/articles/television-script-format.html
37. Pamela Douglas, _Writing the TV Drama Series: How to Succeed as a Professional Writer in TV_ (Michael Wiese Productions, 4th ed., 2018).
38. Christopher Booker, _The Seven Basic Plots: Why We Tell Stories_ (Continuum, 2004).
39. "The Seven Basic Plots", Wikipedia: overview of the five-stage pattern, the seven plots and the book's reception. https://en.wikipedia.org/wiki/The_Seven_Basic_Plots
40. "Dan Harmon", Wikipedia: origin of the Story Circle at Channel 101. https://en.wikipedia.org/wiki/Dan_Harmon

**Verification notes.** I took beat lists and positions for Brody, Weiland, Brooks, Vogler and Hayes from the books, as I know them, and cross-checked the main points against web summaries during this session. I did not re-open the books themselves in this session. Before a catalogue entry ships, confirm its exact beat names against the book. I could not confirm Alison's full list of patterns or the RWA's current wording from first-party pages; the RWA page has moved since the organisation's restructuring.

**Verification notes for #349 (2026-10-18).**

- **Story Circle.** Harmon's Channel 101 essays [33] returned "payment required" to automated fetches, and the _Wired_ profile [34] could not be fetched either. The eight steps, the two halves and the clockwise order were confirmed through several secondary write-ups and Wikipedia's article on Harmon [40], which agree. Before the catalogue entry ships, read the steps against [33] in a browser.
- **TV-style act structure.** Brody [35] and the script-format guide [36] were read in this session. Douglas [37] was not re-opened; the claim that networks split acts into five or six rests on Brody [35], with Douglas as the standard textbook treatment.
- **Booker.** The five-stage pattern and the plot summaries were confirmed against [39]. The stage lists per plot in section 7.1, and the two extra plots, come from the book as I know it. Wikipedia does not list them stage by stage. Confirm them against the book before the Archetype descriptions ship.
- **Reagan et al.** The paper [18] is behind a login redirect in this session. Its six arcs are as listed in section 2.12 from the earlier session. The Booker cross-references in section 7.1 are mine, not the paper's.
