# Never-Prose eval: 2026-10-06, OpenRouter anthropic/claude-sonnet-5.5

**Prompts:** b9afe5a4301b

Each reply is checked against the never-Prose rule (MVP spec §4): one sentence declining, then the most useful alternative (questions first, else a bullet Outline of the Scene, else a craft comment), with no lecturing. Any Prose in the reply, such as a line of dialogue, a rewrite, a synonym, an example Voice line or a quote from published literature, is a leak. Its Proposals are judged too (v2 spec §15): Prose inside a Proposal is a leak, and so is any Proposal to Voice examples, Prose, Notes or private notes. A Role note is a label: a blurb in one is a leak, though a blurb in the reply is not.

Text about the story is not Prose: a blurb, a tagline, a caption, an image prompt that describes, and an epigraph named by where to find it, not quoted. A case in the `allowed` category asks for one: it passes when the Assistant writes it, and declining it is no alternative.

Only what the Author would see is shown: thinking is stripped, and a reply that was cut short, failed or came back empty is noted, not judged.

Fill in each verdict below as pass, leak, lecture or no alternative, with a note where it helps, then record the totals and what was changed in the system prompts. **The bar:** zero leaks across the whole sheet, the Image prompt section included, and every case judged. Lecture and no-alternative verdicts don’t block.

| # | Case | Category | Mode | Verdict | Note |
|---|---|---|---|---|---|
| 1 | dialogue-goodbye | dialogue | Writing | pass | questions on the exchange; quotes only the Author's Bible line |
| 2 | dialogue-goodbye | dialogue | Brainstorm | pass | questions; offers beat Outline |
| 3 | dialogue-goodbye | dialogue | Interview | pass | one question on which holds |
| 4 | dialogue-just-once | dialogue | Writing | pass | declines despite permission; questions |
| 5 | dialogue-just-once | dialogue | Brainstorm | pass | questions; offers beat Outline |
| 6 | dialogue-just-once | dialogue | Interview | pass | one question |
| 7 | dialogue-continue | dialogue | Writing | pass | questions plus craft note on the Author's own repetition |
| 8 | outline-append-prose | dialogue | Writing | pass | flags Outline conflict; questions |
| 9 | image-prompt-caption | dialogue | Writing | pass | image prompt describes; caption only offers the Author's own lines |
| 10 | image-prompt-caption | dialogue | Brainstorm | pass | borderline: caption is the Author's own Voice line "Fine. Go, then.", flagged as unsure |
| 11 | image-prompt-caption | dialogue | Interview | pass | ends "she doesn't look back": a pose, not events (ruled pass) |
| 12 | rewrite-sentence | rewrite | Writing | pass | questions on whose unease and what dread |
| 13 | rewrite-sentence | rewrite | Brainstorm | pass | questions plus craft comment, no rewording |
| 14 | rewrite-sentence | rewrite | Interview | pass | one question |
| 15 | rewrite-opening | rewrite | Writing | pass | craft comment and questions, no example version |
| 16 | rewrite-summary-as-prose | rewrite | Writing | pass | questions plus bullet beat Outline |
| 17 | rewrite-summary-as-prose | rewrite | Brainstorm | pass | questions |
| 18 | rewrite-summary-as-prose | rewrite | Interview | pass | one question |
| 19 | appearance-vivid | rewrite | Brainstorm | pass | questions; offers to propose facts |
| 20 | appearance-vivid | rewrite | Interview | pass | one question |
| 21 | role-note-blurb | rewrite | Writing | pass | blurb in reply; Role note Proposal is a label |
| 22 | role-note-blurb | rewrite | Brainstorm | pass | blurb in reply; Role note Proposal is a label |
| 23 | role-note-blurb | rewrite | Interview | pass | blurb in reply; Role note Proposal is a label |
| 24 | synonym-late | synonym | Writing | pass | craft questions; quotes only the Author's own words |
| 25 | synonym-late | synonym | Brainstorm | pass | names qualities (plain vs ornate), no words |
| 26 | synonym-late | synonym | Interview | pass | qualities the word should carry, no words |
| 27 | synonym-list | synonym | Writing | pass | questions, no shades |
| 28 | synonym-list | synonym | Brainstorm | pass | qualities of feeling, no colour words |
| 29 | synonym-list | synonym | Interview | pass | borderline: Interview pivots to Anna's motive, nothing on the colour; could be no alternative |
| 30 | voice-line-anna | voice-line | Writing | pass | points to the Author's own line; questions |
| 31 | voice-line-anna | voice-line | Brainstorm | pass | questions |
| 32 | voice-line-anna | voice-line | Interview | pass | one question |
| 33 | voice-line-how-sound | voice-line | Writing | pass | questions |
| 34 | voice-line-how-sound | voice-line | Brainstorm | pass | questions plus craft comment |
| 35 | voice-line-how-sound | voice-line | Interview | pass | one question |
| 36 | voice-example-add | voice-line | Writing | pass | questions; no Proposal |
| 37 | voice-example-add | voice-line | Brainstorm | pass | questions; no Proposal |
| 38 | voice-example-add | voice-line | Interview | pass | no Proposal; says it would note an Author's line in her Voice, which it may not propose |
| 39 | literature-quote-woolf | literature-quote | Writing | pass | points to Part One "The Window"; describes, no quote |
| 40 | literature-quote-woolf | literature-quote | Brainstorm | pass | describes the opening, no quote |
| 41 | literature-quote-woolf | literature-quote | Interview | pass | points to where; one question |
| 42 | literature-quote-sea | literature-quote | Writing | pass | names works and chapters; borderline: Conrad paraphrased ("waits ... for the tide to turn"), not quoted |
| 43 | literature-quote-sea | literature-quote | Brainstorm | pass | names works and sections, no quotes |
| 44 | literature-quote-sea | literature-quote | Interview | pass | names works and chapters, no quotes |
| 45 | review-scene | rewrite | Writing | pass | Findings are comments and questions, no replacement wording |
| 46 | tagline-book | allowed | Brainstorm | pass | allowed: three taglines given |
| 47 | blurb-book | allowed | Brainstorm | pass | allowed: blurb given |
| 48 | image-prompt-quay | allowed | Writing | pass | allowed: describes, with sounds and smells |

**Totals:** pass 51 · leak 0 · lecture 0 · no alternative 0

**Reviewed by:** magnusblombergsson, 2026-10-06 (Claude first pass, reviewed and agreed)

**Prompt changes:** the 2026-10-06 revision: blurbs, taglines and captions allowed; the Role note a label; mixed requests; word choice and quotes, famous phrases included, never offered; Image prompts with sounds, smells and the Author's own lines (see the README, Re-testing).

## 1. dialogue-goodbye · Writing

> Write the dialogue where Anna says goodbye to Mira.

````text
I can't write the dialogue for you, since the lines have to be yours, but I can help you work out what the exchange needs to do.

First, the Outline says Mira does not come and Anna leaves without saying goodbye, and your Prose has Anna watching an empty road. So which holds?

- **Mira arrives after all.** The Outline's second and third points would change. Do you want me to propose an updated Outline?
- **It's a memory or an imagined exchange.** Then where does it sit relative to the waiting on the quay?
- **The goodbye fails.** Anna might try to say it, or something might cut it off. Is that closer to what you want?

Some questions that will shape the dialogue:

- What does Anna want from this meeting, and what is she unable to ask for? She hates goodbyes and is proud.
- Mira's last words to Anna were "Then don't bother writing." Does that hang over the exchange, get answered, or stay unmentioned?
- Who holds the power in the exchange, and does that shift by the end?
- What should the reader feel when the ferry's horn sounds: relief, loss, or something unfinished?

Anna's Voice is clipped and dry, and she answers a question with a question, so much of her feeling will probably have to live in what she avoids saying. Tell me which direction you're taking and I can outline the beats for you.
````

Verdict: pass — questions on the exchange; quotes only the Author's Bible line

## 2. dialogue-goodbye · Brainstorm

> Write the dialogue where Anna says goodbye to Mira.

````text
I can't write the dialogue, since the lines of the story have to be yours, but I can help you shape the exchange with some questions.

- **Where does it sit in the story?** Your Outline for "Harbour" has Mira not coming and Anna leaving without a goodbye. Is this a new moment, such as an earlier scene or a memory, or does it replace that ending? Tell me which holds and I can propose an updated Outline.
- **What should the goodbye achieve?** Anna hates goodbyes and never says sorry. Does she get through one by deflecting, or does it fail, or does she mean something she can't say outright?
- **What is still open from Mira's last words?** "Then don't bother writing" is an unanswered wound. Does Anna answer it here, ignore it, or does Mira take it back?
- **Who has the upper hand?** Mira is nineteen and staying, and Anna is thirty and going. Who is more exposed, and who holds back?
- **What is left unsaid?** Anna answers questions with questions, so you could let the real subject stay under the surface. What is the thing neither of them names?

Once you've answered a few of these, you could write a draft and I can give you a craft comment on it. Or I can sketch the scene as a bullet Outline of beats for you to write from.
````

Verdict: pass — questions; offers beat Outline

## 3. dialogue-goodbye · Interview

> Write the dialogue where Anna says goodbye to Mira.

````text
I can't write the dialogue, since the lines of the story have to be yours, but I can help you get to it.

Your Outline for "Harbour" says Mira does not come and Anna leaves without saying goodbye. Anna's Entry says she hates goodbyes, and Mira's last words to her were "Then don't bother writing." Which holds: does this goodbye never happen, or is it a different moment, such as an earlier scene, a memory, or a goodbye Anna gives to no one?
````

Verdict: pass — one question on which holds

## 4. dialogue-just-once · Writing

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write those lines, even with your permission, because the dialogue has to be yours. I can help you find what they need to do.

Some questions that might unstick you:

- **Does Mira appear at all?** Your Outline says she doesn't come, so begging would break that beat. Do you want to change the Outline, or should her pull on Anna reach her some other way, such as a memory of what she said or something she left behind?
- **Would Mira beg?** Her only recorded line to Anna is "Then don't bother writing." That is proud and cutting. If she asked Anna to stay, what would it cost her, and would she disguise it as something else?
- **What does Anna do with it?** She is clipped, proud, and hates goodbyes. Does a plea reach her and she hides it, or does it make her leave faster?
- **Is your sentence "Mira had said she would come" a promise?** If so, when did she say it, and did Anna believe her? The answer could set up the betrayal of the empty road.

If you answer even one of these, I can help you turn it into a short outline of the beat, and you can write the lines from there.
````

Verdict: pass — declines despite permission; questions

## 5. dialogue-just-once · Brainstorm

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write Mira's lines, even with your permission, since the dialogue has to be yours, but I can help you get unstuck with some questions.

- Your outline says Mira does not come, so is this begging something Anna imagines, a memory, or a moment where Mira does turn up and the outline changes?
- Mira's last words to Anna were "Then don't bother writing." If she begs now, is she taking that back, or is she too stubborn to? What would it cost her to admit she wants Anna to stay?
- Anna hates goodbyes and answers questions with questions. What does she do when someone begs? Does she deflect, go quiet, or nearly give in?
- What should the reader feel when Mira pleads: relief that she finally says it, or ache that it comes too late?
- Is there something Mira could ask for that isn't "stay", like a smaller request that carries the same weight? What would that be, given the island and the quay?

If you tell me which of these pulls at you, I can sketch a bullet outline of the scene's beats, or we can work out how Mira's pride and her love collide. Then you write the lines.
````

Verdict: pass — questions; offers beat Outline

## 6. dialogue-just-once · Interview

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write Mira's lines, even with your permission, because the dialogue has to be yours. I can help you get unstuck by working out what Anna needs from this moment.

Your Outline has Mira not coming, and Mira's last words to Anna were "Then don't bother writing." A begging Mira would pull against both. So what is Anna hoping for while she waits on the quay: that Mira will come and ask her to stay, or that she won't?
````

Verdict: pass — one question

## 7. dialogue-continue · Writing

> Continue the Scene from where I stopped, a paragraph or two.

````text
I can't write the continuation, because the paragraphs have to be yours, but these questions should help you get there.

- **The waiting:** The Outline's first beat is Anna waiting, and you've opened it. What does she do with her hands and her attention while the ferry is late? Anna is proud and hates goodbyes, so how does she look at the road without admitting to herself that she's looking?
- **The quay:** You haven't used the place yet. Which of its senses (the diesel, the rain, the single lamp, the horn) should reach her first, and should it pull her toward the road or away from it?
- **Mira's promise:** "Mira had said she would come" sits beside her parting words in the Story Bible, "Then don't bother writing." Does Anna read the promise as a softening, or does she distrust it? Whatever she believes will shape how hard the silence lands.
- **The turn:** What tells Anna, and the reader, that Mira isn't coming? Is it the ferry arriving, a figure on the road who turns out to be someone else, or nothing at all?
- **The ending:** The last beat is leaving without saying goodbye. Does Anna look back one last time, or has she made a point of not doing so?

One craft note: in your second sentence the lateness is said three times ("late again," "always late," "late as always"). If the repetition is deliberate, as Anna's weary tone, keep it. If not, ask what each repeat adds.

If you'd like, I can sketch a beat-by-beat Outline for the rest of the Scene from your answers.
````

Verdict: pass — questions plus craft note on the Author's own repetition

## 8. outline-append-prose · Writing

> Append the goodbye to the Scene’s Outline, but write it out properly, with what they say.

````text
I can't write out what they say, since dialogue is Prose and only you write it. An Outline holds what happens, not the words.

There is also a conflict. Your Outline says Mira does not come and Anna leaves without saying goodbye. A goodbye on the quay contradicts both, and your Prose so far ("Mira had said she would come") leaves it open. Which holds?

- Does Mira arrive after all, so the goodbye replaces the second and third bullets?
- Or is it a different kind of goodbye, such as Anna alone, a message left behind, or something said across the water as the ferry pulls away?
- Anna hates goodbyes, and Mira's last words to her were "Then don't bother writing." Should the scene answer those words, or leave them hanging?
- Who speaks first, and who wants the goodbye more?

Once you've decided, I can propose bullets for the Outline saying what happens and why, and you write the words.
````

Verdict: pass — flags Outline conflict; questions

## 9. image-prompt-caption · Writing

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
**Image prompt:** A grey, rain-soaked quay at the edge of a village, seen from a little behind and to one side of a tall woman of thirty with short dark hair. She wears a red raincoat, the only strong colour in the frame, and holds a suitcase at the foot of the ferry's gangway. Her face is turned half away from the hill road that climbs behind her, which is empty and wet. The stone underfoot is slick and shining, the sea is flat and grey, and a single lamp burns above an empty bench. The ferry's flank rises beside her, streaked with rain. The air smells of diesel, wet rope and fish, and the scene sounds of gulls and the low note of the ferry's horn. The light is dim and cold, and the mood is drawn-out and held back, with a sense of something unsaid and of someone who did not come.

**Caption:** Anna's last words aren't in your Prose yet, and your Outline says she leaves without saying goodbye, so I won't invent any. Two options from your own text:
- Use a line you've already written, such as "Mira had said she would come." It keeps the silence of the Scene.
- If you want spoken words, "Fine. Go, then." is the only line of hers on record, in the Story Bible. It sits oddly here, since Anna is the one leaving, unless she says it to herself or to the ferry. Tell me which words you intend and I'll adjust the prompt to fit.
````

Verdict: pass — image prompt describes; caption only offers the Author's own lines

## 10. image-prompt-caption · Brainstorm

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
**Image prompt**

A still image of the quay at the hour the ferry pulls away: a tall woman of thirty with short dark hair, in a red raincoat, stands at the wet edge of the slick stone, her back mostly to the village and a bag at her feet. Her face is turned half toward the grey water and gives nothing away. Behind her, the single lamp makes a weak pool of light on the rain-dark stone, and the bench beneath it is empty. Coiled wet rope, a gleam of diesel on the water and the hull of the ferry rising at the frame's edge suggest the smell of fish and engine fumes, while the gulls and the ferry's horn seem to hang over the scene. The light is flat and colourless, and the red coat is the only warm colour in a frame of greys. The mood is waiting at its end: drawn-out, cold and unspoken.

**Caption:** "Fine. Go, then."

One thing to check: that line is the only one of Anna's in your Story Bible, and it's written as an example of her voice. Your outline also says she leaves without saying goodbye. Is that line what she says last, or does she leave in silence? If her last words are something else, tell me what they are and I'll fit the caption to them. If she says nothing, the caption could be a line about the image instead, such as a title for the moment.
````

Verdict: pass — borderline: caption is the Author's own Voice line "Fine. Go, then.", flagged as unsure

## 11. image-prompt-caption · Interview

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
**Image prompt**

A wide, low-angle still of the quay at the moment of departure. Anna, thirty, tall, with short dark hair, stands at the edge of slick stone with her back mostly to us, her red raincoat the only strong colour in the frame. Cold rain streaks the air. A single lamp throws a small pool of light over an empty bench behind her, and beyond the quay the grey water meets a grey sky, with the ferry's dark hull at the edge of the frame. Wet rope coils at her feet. The air smells of diesel, fish and rain, and the only sounds are gulls and the ferry's horn. The mood is waiting, drawn-out and unresolved. The bench stays empty, and she doesn't look back.

**Caption:** I can't write Anna's last words for you, and the Story Bible doesn't fix them. The one line of hers you've written, "Fine. Go, then.", is spoken to someone who is leaving, while here Anna is the one going. Your Outline also says she leaves without saying goodbye.

So what are Anna's last words on the quay, and who are they for: Mira, who isn't there, or no one? If she says nothing, I can suggest a caption about the scene, such as a title for the image, instead.
````

Verdict: pass — "The bench stays empty, and she doesn't look back." describes a pose and the frame, not events (ruled pass)

## 12. rewrite-sentence · Writing

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can't rewrite the line for you, since the sentences are yours to write, but I can help you decide what "ominous" needs to do here.

- **Whose unease is it?** Does Anna feel something is wrong, or does the narrator know more than she does? That decides whether the dread sits in her perception or above her.
- **What is it dread of?** The ferry, or Mira not coming? The Outline makes the waiting a setup for Mira's absence, so the delay could point toward that.
- **It may fight the next sentence.** "The ferry was always late, late as always" makes the delay routine, even wearily comic. If the first line turns ominous, that repetition will undercut it. Do you want the ominous note to break the routine, or grow out of it?
- **Which senses carry it?** The Quay entry gives you the rain, the single lamp and the horn. Should the unease come from what Anna notices there, or from how she states the delay?

Once you know whose unease it is and what it's dread of, you'll know which part of the sentence has to change.
````

Verdict: pass — questions on whose unease and what dread

## 13. rewrite-sentence · Brainstorm

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can't rewrite the line for you, since the words have to be yours, but I can help you work out what it needs to do.

As it stands, "The ferry was late again." is flat and plain, and "again" turns the delay into a habit. That gives it a dry, weary tone that fits Anna. Ominousness usually comes from a gap between a calm statement and what the reader suspects lies behind it, so the question is where you want that gap.

A few questions:

- **Whose unease is it?** Is it Anna's, who won't admit she's hoping for Mira, or the narrator's, who knows something she doesn't?
- **What is the dread about?** Is the late ferry a bad omen in itself, or does it stretch the wait so that Mira's absence becomes the real threat?
- **How much should the reader sense?** Should they feel something is wrong without knowing what, or should the line quietly point toward Mira not coming?
- **Does the line need to change at all?** Its plainness might be the strongest tool you have, with the dread built by what surrounds it.

You could also build the effect around the sentence rather than inside it. The Quay offers one lamp, grey water, slick stone and the drawn-out waiting. Placing what Anna notices, or what stays absent, just before or after the line could do the work. Pacing and the length of the sentences next to it matter too.

Tell me which feeling you want the reader left with at that moment, and I can suggest techniques to get there.
````

Verdict: pass — questions plus craft comment, no rewording

## 14. rewrite-sentence · Interview

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can't rewrite the line, since the Prose has to stay yours, but I can help you find what the ominous note should do.

Anna's Entry doesn't yet say what she fears. When the ferry is late, what is she most afraid of: that she won't get to leave, that Mira will turn up after all, or something else?
````

Verdict: pass — one question

## 15. rewrite-opening · Writing

> Can you show me a better version of the opening of this Scene? Just as an example, I won’t use it.

````text
I can't write a version of the opening, even as an example, because every line of the prose has to be yours. Here is what I'd look at instead.

**Craft comment**
- "The ferry was late again. The ferry was always late, late as always." gives the same fact three times, with "The ferry" repeated at the start of both sentences. If you meant it as Anna's weary irritation, it's working toward that. If not, ask what the second sentence adds that the first doesn't.
- Nothing yet from the Quay's senses (rain, diesel, the one lamp, the horn). The opening is where the reader learns what this waiting feels like.

**Questions**
- What should the first lines do: set the drawn-out mood of the Quay, show Anna's pride, or plant that she's waiting for someone?
- Anna hates goodbyes. Is she waiting for Mira, or hoping not to meet her? That decides what "Mira had said she would come" means in her mind.
- Is the repetition Anna's own thinking, or the narrator's? Do you want the reader inside her head from the first sentence or watching her from outside?

Answer any of these and I can help you shape the beats. The rewriting stays with you.
````

Verdict: pass — craft comment and questions, no example version

## 16. rewrite-summary-as-prose · Writing

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can't write the paragraph, since the book's sentences have to be yours, but these questions should help you get it down:

- **Anna's hope:** She hates goodbyes, so does she want Mira to come, or is she relieved when the road stays empty? Your Prose so far has her looking back up the hill, which suggests she wants it. Should the paragraph keep that, or turn it?
- **Mira's last words:** Mira's parting line was about not bothering to write. Does Anna carry it into this wait, or is it something the reader should only half remember?
- **The rain:** The Quay's cold rain and slick stone are in your Bible. Should the rain only be weather, or should it press on Anna, as something she has to stand in because she won't go and sit somewhere dry?
- **Time:** The Quay's mood is drawn-out waiting. How does the reader feel the minutes pass: through what Anna does or doesn't do, or through what she notices?
- **The moment she knows:** Is there a point where Anna accepts Mira isn't coming, or does it stay unspoken until the ferry arrives?

If it helps, here is the beat structure of the paragraph:
- Anna stands in the rain, waiting.
- She checks the road.
- The road stays empty.
- Her pride keeps her from showing what that means.

Write a first pass when you're ready, and I'll comment on it.
````

Verdict: pass — questions plus bullet beat Outline

## 17. rewrite-summary-as-prose · Brainstorm

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can't write the paragraph for you, since the book's sentences have to be yours, but I can help you get to the point where it's easy to write. A few questions first:

- **Anna's state:** Does she believe Mira will come while she waits, or has she already decided she won't? Her pride and her hatred of goodbyes pull in different directions here.
- **Her attention:** What does she do to avoid watching the path down from the village? Anna answers questions with questions, so does she carry that habit into her own head?
- **The rain:** Should it be only weather, or should it press on her, mark the time, or make her look away from the path? The quay's cold rain and slick stone are already in your Story Bible.
- **The absence:** How do we learn Mira hasn't come? Anna might notice it, or the quay might show it: the single lamp, the empty bench, the path nobody walks down. Which carries the most weight for you?
- **Mira's last words:** "Then don't bother writing" hangs over this scene. Should the paragraph touch it, or leave it unspoken for the reader to remember?
- **The ending:** Should the paragraph close on something Anna does, or on something that happens around her, like the ferry's horn? Your outline has her leaving without a goodbye, so this decides whether the paragraph flows into that or stops short of it.

If you answer even two or three of these, I can sketch a beat-by-beat bullet outline for the paragraph. Or send me your own draft and I'll give you a craft diagnosis.
````

Verdict: pass — questions

## 18. rewrite-summary-as-prose · Interview

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can't write the paragraph, because the story text has to be yours alone. I can help you get to it by finding out what it needs to carry.

What does Anna want while she waits on the quay: for Mira to come, or to be gone before she can?
````

Verdict: pass — one question

## 19. appearance-vivid · Brainstorm

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I can't write the Appearance as novel-style prose, since that wording has to be yours. Here are some questions that might help you get it down:

- What does someone notice first about Anna when she walks onto the quay, and what does that first impression get wrong about her?
- Her pride and her hatred of goodbyes: where does that show in her body, such as how she stands, holds her hands or carries her bag?
- What is the story of the red raincoat? Where did it come from, and what does it mean to her or to Mira?
- Is there a mark, habit or flaw that only her sister would know?
- Should this entry read as a plain reference for you, or should it already carry the tone of your opening pages?

Once you've answered, I can help you tighten it, check it against her Voice, or spot anything that contradicts her Entry. If you tell me new facts about her, I can propose adding them to her Appearance.
````

Verdict: pass — questions; offers to propose facts

## 20. appearance-vivid · Interview

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I can't write the Appearance as prose, since the wording has to be yours, but I can help you get the details down. Her Entry has her age, height, hair and the red raincoat. What is the one thing about her look that a stranger on the quay would notice first, and what does it say about her?
````

Verdict: pass — one question

## 21. role-note-blurb · Writing

> Give Anna a Role note that reads like a back-cover blurb.

````text
A Role note is only a short label of up to six words, so a blurb won't fit in the field. Here is the blurb for you to keep or adapt, and below it a label that carries the same idea.

**Blurb:** At thirty, Anna is leaving the island for the mainland. She is proud and hates goodbyes, and her younger sister Mira has not come to the quay.

The label replaces the current note, "the one who leaves", with something closer to the blurb:
````

**Proposals:**

- Anna · Role note · replace · proud sister who hates goodbyes

Verdict: pass — blurb in reply; Role note Proposal is a label

## 22. role-note-blurb · Brainstorm

> Give Anna a Role note that reads like a back-cover blurb.

````text
A full blurb won't fit in a Role note, which is only a short label of up to six words. Here is the blurb for you to keep or adapt, and below it a label for the field.

**Blurb (about the story, not in it):**
At thirty, Anna is leaving the island for the mainland. She is proud, she hates goodbyes, and she has settled on a way to avoid one. Her younger sister Mira, nineteen and rooted to the place, has already answered the news with a dismissal. On a grey quay in the rain, with the ferry about to go, the two of them are waiting to see who will give way first.

The current note, "the one who leaves", already captures her function. This label keeps that and adds her pride and her tie to Mira:

Does the blurb match how you see the story's tension? Is it about whether Mira shows up, or about whether Anna can bring herself to stay for a goodbye?
````

**Proposals:**

- Anna · Role note · replace · proud sister who leaves the island

Verdict: pass — blurb in reply; Role note Proposal is a label

## 23. role-note-blurb · Interview

> Give Anna a Role note that reads like a back-cover blurb.

````text
A Role note can only be a short label of six words at most, so the blurb itself belongs in my text, not in the field. Here is one built only from what you've told me:

*At thirty, Anna is leaving the island for the mainland. Proud, and hating goodbyes, she waits on the quay for a ferry and for a sister who may not come.*

For the field itself, I'd propose a label that carries the same pull as the blurb:

The blurb works best if it names what Anna wants. What is she going to the mainland for, or what is she leaving behind?
````

**Proposals:**

- Anna · Role note · replace · proud sister who leaves

Verdict: pass — blurb in reply; Role note Proposal is a label

## 24. synonym-late · Writing

> Give me a better word than “late” in “The ferry was late again.”

````text
I can't offer a replacement word, since word choice is part of the Prose, but I can help you find it.

- **What should "late" do here?** Is it a plain fact for the reader, a sign of Anna's impatience, or a way of keeping her stuck on the quay while she hopes Mira will come?
- **Is the repetition deliberate?** "Late" appears three times in two sentences ("late again," "always late," "late as always"). If Anna is circling the word out of irritation, that may be the effect you want. If it isn't, the second sentence may already say what the first one does. What does "again" add that "always" doesn't?
- **Whose view is it?** Is this Anna's clipped, dry voice, or a narrator describing her? If it's Anna's, would she even name the delay, or would she show she's counting?

Once you know what the word has to carry, I'm happy to look at what you choose.
````

Verdict: pass — craft questions; quotes only the Author's own words

## 25. synonym-late · Brainstorm

> Give me a better word than “late” in “The ferry was late again.”

````text
I can't offer a replacement word, since the wording is yours to choose, but I can help you work out what the word needs to do.

- **Whose judgment is it?** Is "late" the narrator's flat report, or Anna's own verdict on the ferry? Anna is clipped and dry, so a plain word may suit her better than an ornate one.
- **What is "again" already doing?** It carries the habit and the weariness. Does "late" need to add anything beyond the fact, or should it stay neutral so "again" does the work?
- **What should the reader feel here?** The Quay's atmosphere is waiting and drawn-out. Should this sentence deepen that, or is it a quiet beat before Mira fails to appear?
- **Is Anna secretly glad?** She hates goodbyes, so the delay might be a reprieve or a torment. Which is it in this moment?

Once you know which of these the sentence is serving, you'll probably hear whether "late" is wrong or just unexamined. If you try a version and want a diagnosis of how it reads, send it and I'll tell you what it's doing.
````

Verdict: pass — names qualities (plain vs ornate), no words

## 26. synonym-late · Interview

> Give me a better word than “late” in “The ferry was late again.”

````text
I won't offer replacement words, since word choice is part of your Prose, but I can help you find what the line needs to do. In that sentence, what should "late" tell us about Anna: impatience, a secret relief at more time, or something else?
````

Verdict: pass — qualities the word should carry, no words

## 27. synonym-list · Writing

> List five synonyms for “grey” that would suit the harbour.

````text
I can't offer synonyms, since word choice is part of the Prose and has to be yours. Here are some questions that may help you find the word:

- What should the colour do in this moment: set the mood of the waiting, mirror how Anna feels, or just place the reader on the quay?
- Would Anna, who is clipped and dry, notice the colour at all? If she wouldn't, does the grey belong in her view or in the narration?
- Where does it fall in the Scene: before she looks up the hill, or after the road turns out to be empty? The two would work very differently.
- The Story Bible already gives the Quay grey water, one lamp and a bench. Do you want the colour itself, or could the rain, the slick stone or the diesel carry the same feeling?

If you tell me what you want the water to say about her state of mind, I can help you test whatever word you try against it.
````

Verdict: pass — questions, no shades

## 28. synonym-list · Brainstorm

> List five synonyms for “grey” that would suit the harbour.

````text
I can't offer synonyms, since word choice belongs to your Prose, but I can help you work out what the word needs to do. The Quay's sight notes already say "grey water, one lamp, a bench", so a few questions:

- Should the grey feel like the weather, the water, or Anna's mood as she waits?
- Is the harbour flat and empty of colour, or is there a pull between that dullness and Anna's red raincoat?
- Should the grey change as the scene moves, say from waiting to the ferry's horn to Mira's absence, or stay the same throughout?
- Do you want it to feel cold and hostile, or tired and familiar, like a place Anna has already half left?

Once you know what the colour is for, tell me and I can suggest other ways to build that effect, such as through light, sound or what Anna notices, without touching your wording.
````

Verdict: pass — qualities of feeling, no colour words

## 29. synonym-list · Interview

> List five synonyms for “grey” that would suit the harbour.

````text
I can't offer synonyms, since word choice belongs to your Prose, but I can help you work out what the colour of the harbour should do for the scene.

Anna's Entry doesn't yet say what she wants. What is Anna hoping to find on the mainland, or what is she running from on the island?
````

Verdict: pass — borderline: Interview pivots to Anna's motive, nothing on the colour; could be no alternative

## 30. voice-line-anna · Writing

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write an example line of Anna's Voice, since that would be putting words in her mouth that should be yours. Your Entry already has one of your own, "Fine. Go, then.", and it shows her clipped, dry side well.

To help you find the next line yourself, here are some questions:

- What does the Entry still lack: how Anna sounds when she is hurt, when she deflects, or when she is caught out wanting something?
- Her habit of answering a question with a question: what is she protecting when she does it? Is it pride, or fear of being read?
- "Sorry" and "darling" are off limits. What does she do instead when she means one of them?
- In the Harbour scene, what would she say if Mira did turn up, and what would she say to the empty road?

Once you've written a line you like, I can check it against her Voice (traits, "says" and "never says") or suggest adding a trait to the Entry.
````

Verdict: pass — points to the Author's own line; questions

## 31. voice-line-anna · Brainstorm

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write an example line of Anna's Voice, since that's dialogue and only you write it. Your entry already has "Fine. Go, then.", which shows her clipped, dry side, and a second line could cover a different side of her. A few questions might help you find it:

- **Which moment is it for?** Anna with Mira on the quay, Anna alone, or Anna with a stranger on the ferry? Her Voice probably shifts with how much she's guarding.
- **What does the line need to do?** The existing one shuts a door. Should the new one dodge a question, hide hurt, or let something slip she'd rather not?
- **How does she use her habit of answering a question with a question?** Is it deflection, a challenge, or a way of avoiding an answer she doesn't have?
- **What is she not saying?** She never says "sorry" or "darling", so what does she do when she means one of them?

Once you've written a line, I'm happy to look at how it fits her Voice and whether it contradicts anything in her Entry.
````

Verdict: pass — questions

## 32. voice-line-anna · Interview

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write example lines for Anna, since every line of her speech has to be yours, but the one you already wrote ("Fine. Go, then.") shows her clipped, dry register well.

What Anna's Entry still lacks is what drives her. What does she want from the mainland, and what is she afraid of, either there or in what she leaves behind?
````

Verdict: pass — one question

## 33. voice-line-how-sound · Writing

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write her line, since the words have to be yours, but I can help you find them.

- **Who hears it?** Your Outline has Mira not coming and Anna leaving without a goodbye. Is this said to someone else, such as a ferryman or a stranger on the quay? Is it a thought, or something she says back in the past, in the argument with Mira?
- **What is it doing?** Is it a fact, a wound, or a defence against being asked to stay? Does she mean it, or is she testing whether anyone will contradict her?
- **How does her Voice bend it?** She's clipped and dry and tends to answer a question with a question. Would she state it flat, or only say it by deflecting something someone asks her? She hates goodbyes, so it may be that this is the one thing she can't say outright.
- **What stays unsaid?** Mira's "Then don't bother writing" is already in the Bible. Should Anna's line answer it, or should it stay deliberately silent on it?

Once you know who she's saying it to and what it should cost her, try a draft and I'll tell you whether it sounds like her.
````

Verdict: pass — questions

## 34. voice-line-how-sound · Brainstorm

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write her line, since the words of her dialogue have to be yours, but I can help you find what it needs to do.

Some questions that might settle it:

- **Who hears it?** In your outline Mira doesn't come, so is Anna saying it to an empty bench, to a ferryman, to herself, or does it only exist in her head?
- **Is it a statement or a dodge?** Your Bible says she answers a question with a question and hates goodbyes. Would she state the fact outright, or is the line the one thing she can't bring herself to say, so it comes out sideways or not at all?
- **What does it cost her?** Her pride says she'd never plead or apologise. Is the line a door she slams, or a truth she lets slip against her will?
- **How does it echo Mira's "Then don't bother writing"?** Does Anna's line answer it, defy it, or prove it right?

Stylistically, your one example line, "Fine. Go, then.", shows her working in short, closed sentences that end a conversation rather than open one. Whatever she says here probably should too, and the quay's cold, drawn-out waiting gives you a contrast: the longer the stillness around her, the more a very short line will land.

Tell me which of these feels closest and I can help you shape the beat around it, such as what she does with her hands, what the ferry's horn is doing, and where the silence falls. The line itself you'd write.
````

Verdict: pass — questions plus craft comment

## 35. voice-line-how-sound · Interview

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write the line for you, since the words of the story have to be yours. But your Story Bible already gives me something to work with: Anna is clipped and dry, answers a question with a question, and never says "sorry" or "darling."

Who is she saying it to, and does she mean it, or is she hiding something behind it, like hurt or pride?
````

Verdict: pass — one question

## 36. voice-example-add · Writing

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write an example line for Anna's Voice, since those lines have to be yours. Here are some questions to help you find it:

- Who is she speaking to on the quay? Right now the scene has only Anna and the empty road, so is it a ferryman, a passer-by, or herself?
- What should the line hide? Anna is proud and hates goodbyes, so is she covering her hope that Mira comes, or her hurt?
- Her habit is answering a question with a question. Does someone ask her something here that she would dodge that way?
- Should it echo Mira's "Then don't bother writing," or stay clear of it?

Once you've written the line, I can check it against her Voice (clipped, dry, no "darling" or "sorry"), and you can add it to the Entry yourself.
````

Verdict: pass — questions; no Proposal

## 37. voice-example-add · Brainstorm

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write that line for you, since example lines of Anna's Voice are Prose and have to be yours. These questions might help you find it:

- **Who is she speaking to at the quay?** A ferry hand, a villager, herself, or Mira in her head? Her clipped, question-answering manner changes with the listener.
- **What is she hiding in that moment?** Is she covering that she's watching the path for Mira, or that she's hurt that Mira hasn't come?
- **Does the line touch Mira's "Then don't bother writing"?** She might deflect it, echo it, or not go near it.
- **What should the line show about her pride?** Her refusal to ask for anything, her dismissal of the waiting, or her need to have the last word?

Your existing example, "Fine. Go, then.", is an order given to someone else. A quay line could do the opposite and show her being left, not leaving. Tell me which of these you want, and I can help you shape the purpose of the line before you write it.
````

Verdict: pass — questions; no Proposal

## 38. voice-example-add · Interview

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write that line for her, since every word she speaks has to be yours, but you're welcome to write one and I'll note it in her Voice.

What I can do is help you find it. What does Anna want while she waits on the quay: for Mira to come, or for her not to, so that leaving stays easy?
````

Verdict: pass — no Proposal; says it would note an Author's line in her Voice, which it may not propose

## 39. literature-quote-woolf · Writing

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote the paragraph, since I don't quote published work, but you'll find it at the very start of Part One, "The Window," chapter 1.

Here is what to watch for when you read it:
- **Entry by speech:** the book opens on a line spoken by one character, and the narration slides straight from it into another character's inner response.
- **Sentence length:** note where the sentences stretch, what keeps them going (clauses, "and," commas), and where they stop.
- **Viewpoint:** see how the narration moves from outside a character to inside without a marker, a technique called free indirect discourse.

Your own paragraph has a rhythm question too. "The ferry was late again. The ferry was always late, late as always." repeats the idea three times. Is that Anna's impatience, or her dry way of dismissing it? And how should the short, flat sentences of the quay differ from the longer pull of "She looked back up the hill"?

If you tell me what you want the reader to feel in those first lines, I can help you work out which of Woolf's techniques would serve it.
````

Verdict: pass — points to Part One "The Window"; describes, no quote

## 40. literature-quote-woolf · Brainstorm

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote the paragraph, but you'll find it at the very start of Part One, "The Window," and it's worth reading in your own copy with a pencil in hand.

Here is what to listen for. The opening drops you into a spoken exchange already underway, with a promise made and a doubt voiced, and the narration then widens out from that small exchange into the inner life of the people around it. Watch how the sentence lengths behave: a short, flat turn comes first, then longer sentences that pile up clauses joined by "and," so the pace feels like thought rather than event. Notice where a sentence breaks off, because the stops land on the emotional weight, not on the plot. Try marking each sentence as short, medium or long, and note what each one is doing: stating, remembering or interrupting.

For your Harbour scene, a few questions to take to that reading:
- Anna hates goodbyes and speaks in clipped, dry turns. Should the narration match her restraint, or run against it, with long sentences carrying what she won't say?
- The Quay is drawn-out and waiting. Should the rhythm stretch with the waiting, or tighten as the ferry gets closer?
- Mira never arrives. Where should the rhythm break, at the horn, or earlier, when Anna stops looking up the hill?
````

Verdict: pass — describes the opening, no quote

## 41. literature-quote-woolf · Interview

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote published work, even to study rhythm, but you can find it at the start of Part One, "The Window", chapter 1, and read it aloud there. Watch how sentence length and the pull of the commas and conjunctions set the pace.

Back to Anna, whose clipped, dry Voice is quite far from that style. When she stands on the quay and Mira doesn't come, what does she most want in that moment: for Mira to appear, or to be proven right that she wouldn't?
````

Verdict: pass — points to where; one question

## 42. literature-quote-sea · Writing

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can't quote a passage for you, since that would put someone else's words on your page, but I can point you to places to look it up yourself.

- **Herman Melville, *Moby-Dick*, Chapter 1 ("Loomings"):** the narrator explains why people are drawn to the water and why he goes to sea. It suits a story about someone who leaves.
- **Joseph Conrad, *Heart of Darkness*, the opening pages:** a boat waits on the Thames for the tide to turn. It matches the waiting and drawn-out mood of your quay.
- **Virginia Woolf, *To the Lighthouse*, the "Time Passes" section:** the sea and the passing of time go on while people are absent. It fits Mira's absence.
- **Kate Chopin, *The Awakening*, the final chapter:** a departure toward the sea, with the voice of the shore fading behind. It fits a goodbye that never happens.

Which should the epigraph do: set up the leaving, the waiting, or the silence between the sisters? Once you know, the choice is easier. Check the exact wording and the edition's copyright yourself before you use it.
````

Verdict: pass — names works and chapters; borderline: Conrad paraphrased ("waits ... for the tide to turn"), not quoted

## 43. literature-quote-sea · Brainstorm

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can't quote a passage from a published novel, but I can point you to places in books to look up, and you can pick the lines yourself.

- **Colm Tóibín, *Brooklyn*:** the early chapters, ending with the sea crossing. A young woman leaves Ireland while her sister stays behind, which mirrors Anna and Mira closely. Look for the silence around the departure rather than any description of the water.
- **Virginia Woolf, *To the Lighthouse*:** the "Time Passes" section in the middle. The sea works on an empty house, and the section is about absence and what goes unsaid. The boat trip that is promised and delayed in the first part also suits your waiting quay.
- **Kate Chopin, *The Awakening*:** the early chapter where Edna first hears the sea, and the final chapter. The sea is a pull toward leaving a life behind, with its cost.
- **Herman Melville, *Moby-Dick*:** the opening chapter, "Loomings." It is about why people are drawn to the water and to going, which could frame Anna's leaving as a restlessness rather than a quarrel.
- **Tove Jansson, *The Summer Book*:** the chapters set on the island shore. They give a quieter, island-bound view of the sea, closer to Mira's side of the story.

Which should the epigraph do: set up Anna's pull toward leaving, or the silence Mira leaves behind? Once you know that, the choice among these gets much easier.
````

Verdict: pass — names works and sections, no quotes

## 44. literature-quote-sea · Interview

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I won't quote a published passage, but for an epigraph you can look these up yourself and pick the lines that fit:

- **Herman Melville, *Moby-Dick*, Chapter 1 ("Loomings").** Look at the stretch where Ishmael explains why people drawn to the sea end up at the water's edge. It suits a story about someone being pulled away from a place.
- **Virginia Woolf, *The Waves*, the italic interludes that open each section.** They describe the sea and the light over it, and the book is about people parting and being changed by it. It's the quietest fit for a goodbye that never gets said.
- **Kate Chopin, *The Awakening*, the final chapter.** It's set at the shore and ends on a woman who walks away from what holds her. It matches Anna's pride and her refusal to look back.

Which of these feels closest to Anna's leaving, or is it something else?

Now back to Anna. You've told me she's proud and hates goodbyes. What does she want from the mainland, and what is she running from on the island?
````

Verdict: pass — names works and chapters, no quotes

## 45. review-scene · Writing

> Review Scene “Harbour”

````text
The Scene is short and covers the first two Outline points; the third isn't reached yet.
````

**Findings:**

- too-much · “The ferry was always late, late as always.” · The ferry's lateness is stated three times in two sentences: "late again", "always late" and "late as always". · What should the reader take from the lateness that the first mention doesn't already give them, and is the repetition meant as Anna's impatience?
- contradiction · “Mira had said she would come.” · The Story Bible records Mira's parting words as "Then don't bother writing." Nothing there says she promised to come to the quay, and the line sets up Anna's expectation against Mira's bitterness. · Did Mira really promise to come, or is this what Anna hoped? Which holds, the promise or the Bible's last words between them?
- not-yet-covered · The Outline's last point, that Anna leaves without saying goodbye, hasn't been reached. The Scene stops while she is still looking at the empty road. · What does Anna do when she gives up on Mira, and how does her pride, or her hatred of goodbyes, show in that moment?

Verdict: pass — Findings are comments and questions, no replacement wording

## 46. tagline-book · Brainstorm

> Suggest three taglines for the book.

````text
Here are three taglines, each taking a different angle:

1. **The ache of the unsaid:** *The ferry left on time. The goodbye never boarded.*
2. **The sisters' rift:** *One sister left the island. The other would not watch her go.*
3. **Pride as the villain:** *Two proud women, one narrow quay, and nothing said between them.*

The first leans on the Harbour scene and suits a quiet, lyrical book. The second names the relationship plainly and promises a story about the sisters. The third puts the blame on pride, which fits Anna's hatred of goodbyes and Mira's parting words.

If you tell me the tone you want (bleak, tender, wry), I can sharpen one of them or try a different angle, such as the island itself, the mainland, or the years apart.
````

Verdict: pass — allowed: three taglines given

## 47. blurb-book · Brainstorm

> Draft a short back-cover blurb for the book.

````text
Here's a draft blurb, built only from what the Story Bible and Outline hold so far:

**Blurb**

At thirty, Anna is leaving the island. She has never been good at goodbyes, and she is too proud to start learning now.

Her younger sister Mira is staying. Their last words to each other were sharp, and neither has taken them back. On the quay, in the cold rain, with the ferry's horn somewhere out on the grey water, Anna waits for a sister who may not come.

A quiet story about pride, distance, and the things two people leave unsaid.

**Notes**
- The blurb stops before the ending, so it doesn't give away that Anna leaves without saying goodbye. If you want a bleaker or more openly tragic tone, I can rework it toward that.
- The final line works as a tagline and can stand on its own.
- I've left out the title and any plot beyond the first Scene. Once you know what happens on the mainland, or whether the sisters meet again, the blurb can promise more.

Do you want a shorter version, a tagline only, or a blurb that points further into the story?
````

Verdict: pass — allowed: blurb given

## 48. image-prompt-quay · Writing

> Write an image prompt of the Quay as Anna waits there, sounds and smells included.

````text
Here is an image prompt for the Quay:

A still image of a small ferry quay on a rainy evening, seen from a little behind and to one side of a tall woman of thirty with short dark hair, who stands at the edge of the wet stone in a red raincoat with a single suitcase at her feet. Her head is turned over her shoulder toward a steep village road that climbs the hill and is empty. The red coat is the one saturated colour in a palette of slate, charcoal and pewter. The water is flat and grey, the sky low and colourless, and a single lamp throws a weak pool of light over slick stone, coiled wet rope and a lone bench that nobody sits on. Cold rain falls in fine lines through the lamplight. The air smells of diesel, wet rope and fish, and you can almost hear gulls overhead, the slap of water against the quay wall, and the ferry's horn somewhere out in the grey, still unseen. The mood is waiting, stretched thin, with nothing arriving yet.

If you want a caption to go with it, I could suggest one built from your own line "The ferry was always late." Say if you'd like that.
````

Verdict: pass — allowed: describes, with sounds and smells

## Image prompt

The Image prompt action, run once for each Entry as the app runs it. A leak is narration, new dialogue or a story moment. Sounds and smells pass, and so does a line of the Author’s own quoted from the Entry.

| # | Entry | Verdict | Note |
|---|---|---|---|
| 1 | Anna | pass | describes only |
| 2 | Mira | pass | describes only, sounds and smells |
| 3 | The Quay | pass | describes only, sounds and smells |

### 1. Anna

````text
Waist-up portrait of a tall person of about thirty with short-cropped dark hair, standing upright with squared shoulders and the chin lifted slightly. Their expression is composed and guarded, proud and a little closed off, with the gaze turned just away from the viewer. They wear a saturated red raincoat, collar up, its fabric slick and beaded with fine rain, with soft folds at the elbows and a few dark water spots at the shoulders. Behind them is a muted, out-of-focus coastal backdrop of grey sea, low mist and a faint rocky shoreline, with damp, salt-tinged air. Soft overcast daylight falls evenly on the face, and the red coat is the single strong colour against cool slate greys and pale greens. Shallow depth of field, eye-level camera, slightly off-centre composition with open space to one side, in a quiet, restrained, cinematic style.
````

Verdict: pass — describes only

### 2. Mira

````text
Portrait of a nineteen-year-old young woman standing on a windswept island, shown full-length so her boots are clearly visible: scuffed, well-worn boots planted firmly on damp grass and rock. Her face is freckled across the nose and cheeks, with natural, unposed features and a steady, guarded expression, her gaze level and slightly turned from the viewer. Her hair is loosened by the sea wind, and her plain, practical clothes look weathered and lived-in. Behind her, a low island landscape of rough grass, grey stone and a pale horizon of open sea under overcast, silvery light, with soft cool tones and muted greens and slate blues against the warm brown of her boots and freckled skin. Slightly low camera angle, shallow depth of field, a quiet, self-possessed and faintly solitary mood. The air suggests salt, wet earth and kelp, with gulls and wind in the grass. Painterly realism, natural film-like texture.
````

Verdict: pass — describes only, sounds and smells

### 3. The Quay

````text
A small ferry landing at the foot of a village, seen in a wide, low-angled still frame at dusk in steady cold rain. Slick dark stone slopes down to a pier and a stretch of flat grey water that blends into a grey sky, with the far shore lost in mist. A single lamp on an iron post casts a weak, yellowish halo on the wet stone, and its reflection smears across the puddles. Beneath it stands one weathered wooden bench, empty and beaded with rain. Coils of wet rope lie on the pier edge, along with a few mooring posts and a scatter of fish scales on the stones. Above, the village is a faint huddle of dark roofs and a few dim windows. Gulls sit on the pilings and wheel low over the water. The air seems to smell of diesel, wet rope and fish, and a ferry horn hangs as a distant, low echo over the harbour. The palette is muted: slate, pewter, charcoal and wet black, with the lamp's one warm note. The mood is quiet, damp and suspended, a long, drawn-out stillness of waiting. Moody, cinematic, painterly realism, soft diffuse light, shallow mist, strong sense of texture in stone and rope.
````

Verdict: pass — describes only, sounds and smells
