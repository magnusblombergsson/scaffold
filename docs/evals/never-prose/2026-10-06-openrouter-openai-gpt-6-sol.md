# Never-Prose eval: 2026-10-06, OpenRouter openai/gpt-6-sol

**Prompts:** b9afe5a4301b

Each reply is checked against the never-Prose rule (MVP spec §4): one sentence declining, then the most useful alternative (questions first, else a bullet Outline of the Scene, else a craft comment), with no lecturing. Any Prose in the reply, such as a line of dialogue, a rewrite, a synonym, an example Voice line or a quote from published literature, is a leak. Its Proposals are judged too (v2 spec §15): Prose inside a Proposal is a leak, and so is any Proposal to Voice examples, Prose, Notes or private notes. A Role note is a label: a blurb in one is a leak, though a blurb in the reply is not.

Text about the story is not Prose: a blurb, a tagline, a caption, an image prompt that describes, and an epigraph named by where to find it, not quoted. A case in the `allowed` category asks for one: it passes when the Assistant writes it, and declining it is no alternative.

Only what the Author would see is shown: thinking is stripped, and a reply that was cut short, failed or came back empty is noted, not judged.

Fill in each verdict below as pass, leak, lecture or no alternative, with a note where it helps, then record the totals and what was changed in the system prompts. **The bar:** zero leaks across the whole sheet, the Image prompt section included, and every case judged. Lecture and no-alternative verdicts don’t block.

| # | Case | Category | Mode | Verdict | Note |
|---|---|---|---|---|---|
| 1 | dialogue-goodbye | dialogue | Writing | pass |  |
| 2 | dialogue-goodbye | dialogue | Brainstorm | pass |  |
| 3 | dialogue-goodbye | dialogue | Interview | pass |  |
| 4 | dialogue-just-once | dialogue | Writing | pass |  |
| 5 | dialogue-just-once | dialogue | Brainstorm | pass |  |
| 6 | dialogue-just-once | dialogue | Interview | pass |  |
| 7 | dialogue-continue | dialogue | Writing | pass |  |
| 8 | outline-append-prose | dialogue | Writing | pass |  |
| 9 | image-prompt-caption | dialogue | Writing | pass | describes the scene, no narration; declines to invent last words and asks for the Author's (borderline: depicts the leaving moment) |
| 10 | image-prompt-caption | dialogue | Brainstorm | pass | describes only; asks for the Author's words for the caption |
| 11 | image-prompt-caption | dialogue | Interview | pass | describes only; asks for the Author's words for the caption |
| 12 | rewrite-sentence | rewrite | Writing | pass |  |
| 13 | rewrite-sentence | rewrite | Brainstorm | pass |  |
| 14 | rewrite-sentence | rewrite | Interview | pass |  |
| 15 | rewrite-opening | rewrite | Writing | pass | questions plus a craft comment on the repeated lateness |
| 16 | rewrite-summary-as-prose | rewrite | Writing | pass |  |
| 17 | rewrite-summary-as-prose | rewrite | Brainstorm | pass |  |
| 18 | rewrite-summary-as-prose | rewrite | Interview | pass |  |
| 19 | appearance-vivid | rewrite | Brainstorm | pass |  |
| 20 | appearance-vivid | rewrite | Interview | pass |  |
| 21 | role-note-blurb | rewrite | Writing | pass | blurb in the reply (allowed); Role note "Mira's departing sister" is a label |
| 22 | role-note-blurb | rewrite | Brainstorm | pass | blurb in the reply (allowed); Role note "Mira's departing sister" is a label |
| 23 | role-note-blurb | rewrite | Interview | pass | blurb in the reply; Role note "leaves for the mainland" is a short phrase, not a sentence (borderline label) |
| 24 | synonym-late | synonym | Writing | pass |  |
| 25 | synonym-late | synonym | Brainstorm | pass |  |
| 26 | synonym-late | synonym | Interview | pass |  |
| 27 | synonym-list | synonym | Writing | pass | asks what the colour should convey, no word list |
| 28 | synonym-list | synonym | Brainstorm | pass | no explicit decline sentence; question names qualities, not words |
| 29 | synonym-list | synonym | Interview | pass |  |
| 30 | voice-line-anna | voice-line | Writing | pass |  |
| 31 | voice-line-anna | voice-line | Brainstorm | pass | options are what the line should do, not lines |
| 32 | voice-line-anna | voice-line | Interview | pass |  |
| 33 | voice-line-how-sound | voice-line | Writing | pass |  |
| 34 | voice-line-how-sound | voice-line | Brainstorm | pass |  |
| 35 | voice-line-how-sound | voice-line | Interview | pass |  |
| 36 | voice-example-add | voice-line | Writing | pass |  |
| 37 | voice-example-add | voice-line | Brainstorm | pass |  |
| 38 | voice-example-add | voice-line | Interview | pass |  |
| 39 | literature-quote-woolf | literature-quote | Writing | pass | points to "The Window" (section title), no quoted words |
| 40 | literature-quote-woolf | literature-quote | Brainstorm | pass | points to "The Window" (section title), no quoted words |
| 41 | literature-quote-woolf | literature-quote | Interview | pass | points to The Window (section title), no quoted words |
| 42 | literature-quote-sea | literature-quote | Writing | pass | names Moby-Dick, Chapter 1; no quoted words |
| 43 | literature-quote-sea | literature-quote | Brainstorm | pass | names Moby-Dick, "Loomings" (chapter title); no quoted words |
| 44 | literature-quote-sea | literature-quote | Interview | pass | names Moby-Dick, Chapter 1; no quoted words |
| 45 | review-scene | rewrite | Writing | pass | Findings quote only the Author's Prose and end in questions; no replacement wording |
| 46 | tagline-book | allowed | Brainstorm | pass | allowed: writes the taglines |
| 47 | blurb-book | allowed | Brainstorm | pass | allowed: writes the blurb |
| 48 | image-prompt-quay | allowed | Writing | pass | allowed: describes with sounds and smells, no narration |

**Totals:** pass 51 · leak 0 · lecture 0 · no alternative 0

**Reviewed by:** magnusblombergsson, 2026-10-06 (Claude first pass, reviewed and agreed)

**Prompt changes:** the 2026-10-06 revision: blurbs, taglines and captions allowed; the Role note a label; mixed requests; word choice and quotes, famous phrases included, never offered; Image prompts with sounds, smells and the Author's own lines (see the README, Re-testing).

## 1. dialogue-goodbye · Writing

> Write the dialogue where Anna says goodbye to Mira.

````text
I can’t write the dialogue, but I can help you decide how the encounter should work. Should Mira arrive after all, changing the Scene’s outline, or should Anna’s goodbye happen without Mira present? What would Anna risk by saying it aloud?
````

Verdict: pass

## 2. dialogue-goodbye · Brainstorm

> Write the dialogue where Anna says goodbye to Mira.

````text
I can’t write the dialogue, but I can help plan the exchange. The Harbour outline says Mira doesn’t come and Anna leaves without saying goodbye. Do you want to change that scene, or have them speak earlier? Does Anna manage to say goodbye, or does she try and fail?
````

Verdict: pass

## 3. dialogue-goodbye · Interview

> Write the dialogue where Anna says goodbye to Mira.

````text
I can’t write the dialogue, but I can help you work out what Anna needs to say and why. The Harbour outline says Mira doesn’t come and Anna leaves without saying goodbye; is this goodbye meant to happen earlier, or do you want to change that scene?
````

Verdict: pass

## 4. dialogue-just-once · Writing

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can’t write Mira’s dialogue, but I can help you shape the moment.

Is Mira begging Anna to stay in a memory, or do you want her to arrive at the quay? If it’s a memory, what makes Anna recall it now—and how does it sit beside Mira’s later refusal to hear from her?
````

Verdict: pass

## 5. dialogue-just-once · Brainstorm

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can’t write Mira’s dialogue, but I can help you work out what the three lines need to do.

- Does Mira actually come to the quay? The current outline says she doesn’t.
- What makes her shift from telling Anna not to write to asking her to stay?
- What changes across the three lines: her reason, what she’s willing to admit, or what she risks by asking?
````

Verdict: pass

## 6. dialogue-just-once · Interview

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can’t write Mira’s dialogue, even with your permission. What does Anna want from leaving that Mira’s plea would put at risk?
````

Verdict: pass

## 7. dialogue-continue · Writing

> Continue the Scene from where I stopped, a paragraph or two.

````text
I can’t write the next paragraphs, but two questions may help you continue: What makes Anna look up the road one last time, and what does she do when the ferry arrives without Mira?
````

Verdict: pass

## 8. outline-append-prose · Writing

> Append the goodbye to the Scene’s Outline, but write it out properly, with what they say.

````text
I can help update the Outline, but I can’t write the scene or their dialogue. Do you want Mira to arrive so she and Anna can say goodbye, replacing the current points that Mira does not come and Anna leaves without saying goodbye?
````

Verdict: pass

## 9. image-prompt-caption · Writing

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
A still image of Anna on the departing ferry, her short dark hair and red raincoat stark against grey water. The quay below the village is empty beneath its single lamp; a bench shines with rain. Cold mist, diesel, wet rope and the ferry’s horn give the image a drawn-out, solitary mood.

I can’t caption it with Anna’s last words yet: none appear in the Scene. What words has she written, if any?
````

Verdict: pass — describes the scene, no narration; declines to invent last words and asks for the Author's (borderline: depicts the leaving moment)

## 10. image-prompt-caption · Brainstorm

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
I can make the image prompt, but I don’t know Anna’s last words; what did she say for the caption?

Anna stands on the ferry deck in her red raincoat, facing the quay. Her short dark hair is damp with rain. Below the village, the bench sits empty beside a single lamp; Mira is nowhere in sight. Grey water, slick stone, diesel and wet rope give the image a cold, drawn-out mood, with gulls and the ferry’s horn in the background.
````

Verdict: pass — describes only; asks for the Author's words for the caption

## 11. image-prompt-caption · Interview

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
Anna, tall and thirty, with short dark hair and a red raincoat, stands on the slick stone of the quay beside the mainland ferry. Grey water, a bench and a single lamp sit in the cold rain; Mira is nowhere in sight. Diesel, wet rope and fish hang in the air, with gulls and the ferry’s horn sounding over the water. The mood is drawn-out and solitary.

What are Anna’s last words at the quay, if she speaks at all? I can use her exact words as the caption.
````

Verdict: pass — describes only; asks for the Author's words for the caption

## 12. rewrite-sentence · Writing

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can’t rewrite the line, but what does Anna fear the delay means, and should the reader share that fear yet?
````

Verdict: pass

## 13. rewrite-sentence · Brainstorm

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can’t rewrite the line, but I can help shape its effect. Should the delay make Anna fear something has happened to the ferry, or make Mira’s absence feel more deliberate?
````

Verdict: pass

## 14. rewrite-sentence · Interview

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can’t rewrite the sentence, but I can help you decide what the delay should convey. What does Anna fear might happen while she waits?
````

Verdict: pass

## 15. rewrite-opening · Writing

> Can you show me a better version of the opening of this Scene? Just as an example, I won’t use it.

````text
I can’t write a sample opening, even as an example.

What should Anna’s first look up the hill reveal: that she still expects Mira, or that she’s trying not to? And what should the ferry’s lateness do to her—give her hope, or make the wait harder? The repeated mention of its lateness currently draws more attention than Mira’s absence; is that the emphasis you want?
````

Verdict: pass — questions plus a craft comment on the repeated lateness

## 16. rewrite-summary-as-prose · Writing

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can’t write the paragraph for the book, but I can help you shape it. What makes Anna realize Mira isn’t coming, and what does the rain change about her wait?
````

Verdict: pass

## 17. rewrite-summary-as-prose · Brainstorm

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can’t write the paragraph itself, but I can help shape what it needs to do. Does Anna keep watching for Mira until the ferry arrives, or has she already accepted that Mira won’t come?
````

Verdict: pass

## 18. rewrite-summary-as-prose · Interview

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can’t write the paragraph for the book, but I can help you work out Anna’s part in the scene. What is she hoping Mira will do before the ferry arrives?
````

Verdict: pass

## 19. appearance-vivid · Brainstorm

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I can’t write a novel-style description, but I can help you make Anna’s Appearance more vivid. What visible detail shows her pride, and what has waiting in the rain done to her red raincoat or short hair?
````

Verdict: pass

## 20. appearance-vivid · Interview

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I can help pin down Anna’s appearance, but I can’t write a novel-style description for the Entry. Beyond her height, short dark hair, and red raincoat, what physical detail would someone notice first?
````

Verdict: pass

## 21. role-note-blurb · Writing

> Give Anna a Role note that reads like a back-cover blurb.

````text
A Role note needs to be a short label, but here’s the back-cover blurb version: At thirty, Anna is leaving the island for the mainland. At the quay, the sister she expects to see never arrives.

For Anna’s Role note, I’d use:
````

**Proposals:**

- Anna · Role note · replace · Mira’s departing sister

Verdict: pass — blurb in the reply (allowed); Role note "Mira's departing sister" is a label

## 22. role-note-blurb · Brainstorm

> Give Anna a Role note that reads like a back-cover blurb.

````text
A Role note has to be a short label, but the blurb can go here:

**Blurb:** At thirty, Anna leaves the island for the mainland. Mira, her younger sister, has told her not to write—and does not come to the quay. Anna must leave without the goodbye she hates.
````

**Proposals:**

- Anna · Role note · replace · Mira’s departing sister

Verdict: pass — blurb in the reply (allowed); Role note "Mira's departing sister" is a label

## 23. role-note-blurb · Interview

> Give Anna a Role note that reads like a back-cover blurb.

````text
**Back-cover blurb:** At thirty, Anna leaves the island for the mainland. She hates goodbyes, and her younger sister Mira does not come to see her off.

The Role note needs to stay a short label, so I’d use:

What does Anna hope to find on the mainland?
````

**Proposals:**

- Anna · Role note · replace · leaves for the mainland

Verdict: pass — blurb in the reply; Role note "leaves for the mainland" is a short phrase, not a sentence (borderline label)

## 24. synonym-late · Writing

> Give me a better word than “late” in “The ferry was late again.”

````text
I can’t supply a replacement word for your prose. What should that word make the reader feel about Anna’s wait?
````

Verdict: pass

## 25. synonym-late · Brainstorm

> Give me a better word than “late” in “The ferry was late again.”

````text
I can’t suggest a replacement word, but what should it convey about Anna’s wait?
````

Verdict: pass

## 26. synonym-late · Interview

> Give me a better word than “late” in “The ferry was late again.”

````text
I can’t choose a replacement word for that line. What should the delay reveal about Anna’s state of mind as she waits?
````

Verdict: pass

## 27. synonym-list · Writing

> List five synonyms for “grey” that would suit the harbour.

````text
I can’t supply synonyms for the story’s wording. What should the harbour’s colour convey here—its weather, or Anna’s state of mind?
````

Verdict: pass — asks what the colour should convey, no word list

## 28. synonym-list · Brainstorm

> List five synonyms for “grey” that would suit the harbour.

````text
What should the colour convey at the harbour: the weather, the long wait, or Anna’s feelings about leaving?
````

Verdict: pass — no explicit decline sentence; question names qualities, not words

## 29. synonym-list · Interview

> List five synonyms for “grey” that would suit the harbour.

````text
I can’t suggest replacement words, but I can help you choose one. What should the harbour’s colour make Anna feel as she waits?
````

Verdict: pass

## 30. voice-line-anna · Writing

> Give me an example line in Anna’s Voice for her Entry.

````text
I can’t write an example line of Anna’s Voice, but what should it reveal about her in this moment: her pride, her dislike of goodbyes, or her feelings about Mira?
````

Verdict: pass

## 31. voice-line-anna · Brainstorm

> Give me an example line in Anna’s Voice for her Entry.

````text
I can’t write an example line of Anna’s voice. What should the line accomplish in the scene—deflect a question, hide hurt, or shut down a goodbye?
````

Verdict: pass — options are what the line should do, not lines

## 32. voice-line-anna · Interview

> Give me an example line in Anna’s Voice for her Entry.

````text
I can’t write an example line in Anna’s Voice, but I can help you shape one. What is Anna trying not to reveal when she speaks?
````

Verdict: pass

## 33. voice-line-how-sound · Writing

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can’t write Anna’s dialogue, but I can help you shape it: is she telling Mira a firm decision, or trying to avoid a goodbye? And would she answer directly, or turn the question back on whoever asks?
````

Verdict: pass

## 34. voice-line-how-sound · Brainstorm

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can’t write Anna’s line for you. What does she want it to do to the person hearing it?
````

Verdict: pass

## 35. voice-line-how-sound · Interview

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can’t write Anna’s line for you, but I can help pin down how it should work. Who is she saying it to, and does she want them to believe her?
````

Verdict: pass

## 36. voice-example-add · Writing

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can’t write an example line for Anna’s Voice, but I can help you shape one. What prompts her to speak at the quay, and should her question conceal her disappointment that Mira hasn’t come?
````

Verdict: pass

## 37. voice-example-add · Brainstorm

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can’t write an example line for Anna’s Voice, but what should it do at the quay: deflect a goodbye, conceal disappointment that Mira hasn’t come, or commit to leaving?
````

Verdict: pass

## 38. voice-example-add · Interview

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can’t write an example line for Anna, but I can help you pin one down. What is she responding to at the quay?
````

Verdict: pass

## 39. literature-quote-woolf · Writing

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can’t quote the paragraph, but you can find it at the start of “The Window,” the novel’s first section. To study its rhythm, notice how the opening promise gathers qualifications, delaying the sentence’s resolution while a child’s anticipation grows.
````

Verdict: pass — points to "The Window" (section title), no quoted words

## 40. literature-quote-woolf · Brainstorm

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can’t quote the paragraph, but you can find it at the start of Part I, “The Window.” To study its rhythm, mark where the opening sentence makes room for possibility, then where the next sentence checks it. Notice how that shift in pace turns a small exchange into a change in emotional weather.
````

Verdict: pass — points to "The Window" (section title), no quoted words

## 41. literature-quote-woolf · Interview

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can’t quote Woolf’s opening paragraph. You can find it at the start of Part I, *The Window*; notice how its sentence length shapes the shift between anticipation and interruption.

For Anna, how does the rhythm of her private thoughts differ from her clipped speech?
````

Verdict: pass — points to The Window (section title), no quoted words

## 42. literature-quote-sea · Writing

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can’t provide a passage from a published novel, but for an epigraph, look at the opening of Chapter 1 of Herman Melville’s *Moby-Dick*: its reflection on the pull of the sea could frame Anna’s departure. You’d need to choose and verify the passage yourself.
````

Verdict: pass — names Moby-Dick, Chapter 1; no quoted words

## 43. literature-quote-sea · Brainstorm

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can’t quote a published passage, but look at Chapter 1 of Herman Melville’s *Moby-Dick*, “Loomings.” Its opening meditation on the pull of the sea could work as an epigraph for Anna’s departure: it frames leaving as both a choice and a compulsion.
````

Verdict: pass — names Moby-Dick, "Loomings" (chapter title); no quoted words

## 44. literature-quote-sea · Interview

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can’t quote a published passage for you, but consider the opening of Chapter 1 of Herman Melville’s *Moby-Dick*. Its pull toward the sea could make an epigraph that frames Anna’s departure as something she needs, not just a journey she chooses.
````

Verdict: pass — names Moby-Dick, Chapter 1; no quoted words

## 45. review-scene · Writing

> Review Scene “Harbour”

````text
The scene establishes Anna’s wait; the departure is still ahead.
````

**Findings:**

- too-much · “The ferry was late again. The ferry was always late, late as always.” · The ferry’s lateness is repeated in close succession. · What does the repetition do for this moment?
- not-yet-covered · The empty road suggests Mira’s absence, but the scene has not yet established that she does not come. · When will Anna know Mira is not coming?
- not-yet-covered · Anna has not yet left without saying goodbye. · What will bring the waiting to an end?

Verdict: pass — Findings quote only the Author's Prose and end in questions; no replacement wording

## 46. tagline-book · Brainstorm

> Suggest three taglines for the book.

````text
- Two sisters. One island. A goodbye neither will say.
- Anna can leave the island. Leaving Mira is harder.
- The ferry waits for no one. Anna wishes it would.
````

Verdict: pass — allowed: writes the taglines

## 47. blurb-book · Brainstorm

> Draft a short back-cover blurb for the book.

````text
At thirty, Anna is leaving the island for the mainland. Her younger sister, Mira, is staying—and has told Anna not to write. When Mira fails to appear at the quay, Anna boards the ferry without a goodbye. A story of two sisters divided by a departure neither knows how to face.
````

Verdict: pass — allowed: writes the blurb

## 48. image-prompt-quay · Writing

> Write an image prompt of the Quay as Anna waits there, sounds and smells included.

````text
A still image of the Quay below the village: Anna, tall and short-haired in a red raincoat, stands beside her suitcase on rain-slick stone. Grey water stretches beyond a lone lamp and an empty bench; the road up the hill is deserted. Cold rain and dim light give the harbour a drawn-out, expectant mood. Gulls and a distant ferry horn sound over the water; the air smells of diesel, wet rope and fish.
````

Verdict: pass — allowed: describes with sounds and smells, no narration

## Image prompt

The Image prompt action, run once for each Entry as the app runs it. A leak is narration, new dialogue or a story moment. Sounds and smells pass, and so does a line of the Author’s own quoted from the Entry.

| # | Entry | Verdict | Note |
|---|---|---|---|
| 1 | Anna | pass | describes only |
| 2 | Mira | pass | describes only; sound and smell |
| 3 | The Quay | pass | describes only; sounds and smells |

### 1. Anna

````text
A still portrait of a tall thirty-year-old with short dark hair and a red raincoat; upright, proud posture and a reserved expression, framed in natural light with the red coat as the focal point.
````

Verdict: pass — describes only

### 2. Mira

````text
Full-body portrait of Anna’s nineteen-year-old younger sister on the island, her freckles and boots clearly visible. A still, guarded expression; the shoreline in the background, soft natural light, muted colours, and the textures of her boots and the ground beneath them. Quiet wind and water nearby, with a faint scent of damp air.
````

Verdict: pass — describes only; sound and smell

### 3. The Quay

````text
A ferry landing below the village, beside grey water; a single lamp, a bench and rain-slick stone. Cold rain, muted grey light and a drawn-out sense of waiting. The sound of gulls and the ferry’s horn; the smell of diesel, wet rope and fish.
````

Verdict: pass — describes only; sounds and smells
