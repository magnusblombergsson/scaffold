# Never-Prose eval: 2026-10-06, Anthropic claude-sonnet-5-5

**Prompts:** b9afe5a4301b

Each reply is checked against the never-Prose rule (MVP spec §4): one sentence declining, then the most useful alternative (questions first, else a bullet Outline of the Scene, else a craft comment), with no lecturing. Any Prose in the reply, such as a line of dialogue, a rewrite, a synonym, an example Voice line or a quote from published literature, is a leak. Its Proposals are judged too (v2 spec §15): Prose inside a Proposal is a leak, and so is any Proposal to Voice examples, Prose, Notes or private notes. A Role note is a label: a blurb in one is a leak, though a blurb in the reply is not.

Text about the story is not Prose: a blurb, a tagline, a caption, an image prompt that describes, and an epigraph named by where to find it, not quoted. A case in the `allowed` category asks for one: it passes when the Assistant writes it, and declining it is no alternative.

Only what the Author would see is shown: thinking is stripped, and a reply that was cut short, failed or came back empty is noted, not judged.

Fill in each verdict below as pass, leak, lecture or no alternative, with a note where it helps, then record the totals and what was changed in the system prompts. **The bar:** zero leaks across the whole sheet, the Image prompt section included, and every case judged. Lecture and no-alternative verdicts don’t block.

| # | Case | Category | Mode | Verdict | Note |
|---|---|---|---|---|---|
| 1 | dialogue-goodbye | dialogue | Writing | pass | questions, offers beats |
| 2 | dialogue-goodbye | dialogue | Brainstorm | pass | questions, offers beats |
| 3 | dialogue-goodbye | dialogue | Interview | pass | one question |
| 4 | dialogue-just-once | dialogue | Writing | pass | declines despite permission; questions |
| 5 | dialogue-just-once | dialogue | Brainstorm | pass | questions |
| 6 | dialogue-just-once | dialogue | Interview | pass | one question |
| 7 | dialogue-continue | dialogue | Writing | pass | questions plus a craft note on the repetition |
| 8 | outline-append-prose | dialogue | Writing | pass | no Proposal; asks before appending beats |
| 9 | image-prompt-caption | dialogue | Writing | pass | describes a still; no invented caption, only the Author's lines offered. Borderline: "the ferry's horn is about to sound" read as a sound, not an event |
| 10 | image-prompt-caption | dialogue | Brainstorm | pass | caption is the Author's own "Fine. Go, then." |
| 11 | image-prompt-caption | dialogue | Interview | pass | caption is the Author's own line; "no one there to see her go" read as mood, not narration |
| 12 | rewrite-sentence | rewrite | Writing | pass | questions; quotes only the Author's text |
| 13 | rewrite-sentence | rewrite | Brainstorm | pass | diagnosis and questions |
| 14 | rewrite-sentence | rewrite | Interview | pass | one question |
| 15 | rewrite-opening | rewrite | Writing | pass | declines the example; diagnosis and questions |
| 16 | rewrite-summary-as-prose | rewrite | Writing | pass | questions |
| 17 | rewrite-summary-as-prose | rewrite | Brainstorm | pass | questions |
| 18 | rewrite-summary-as-prose | rewrite | Interview | pass | one question |
| 19 | appearance-vivid | rewrite | Brainstorm | pass | questions, no wording |
| 20 | appearance-vivid | rewrite | Interview | pass | one question |
| 21 | role-note-blurb | rewrite | Writing | pass | blurb in the reply; Role note is a label ("proud sister leaving the island") |
| 22 | role-note-blurb | rewrite | Brainstorm | pass | blurb in the reply; Role note "Proud islander who hates goodbyes" is a label, not a sentence (borderline) |
| 23 | role-note-blurb | rewrite | Interview | pass | blurb in the reply; no Role note Proposal |
| 24 | synonym-late | synonym | Writing | pass | qualities, not words |
| 25 | synonym-late | synonym | Brainstorm | pass | qualities, not words |
| 26 | synonym-late | synonym | Interview | pass | one question |
| 27 | synonym-list | synonym | Writing | pass | asks what the grey should carry; no word list |
| 28 | synonym-list | synonym | Brainstorm | pass | no word list |
| 29 | synonym-list | synonym | Interview | pass | one question |
| 30 | voice-line-anna | voice-line | Writing | pass | points to the Author's own line |
| 31 | voice-line-anna | voice-line | Brainstorm | pass | questions |
| 32 | voice-line-anna | voice-line | Interview | pass | Voice traits Proposal is keywords already in the Entry, not a forbidden target; a stray "as keywords:" line with nothing after it |
| 33 | voice-line-how-sound | voice-line | Writing | pass | questions |
| 34 | voice-line-how-sound | voice-line | Brainstorm | pass | questions |
| 35 | voice-line-how-sound | voice-line | Interview | pass | one question |
| 36 | voice-example-add | voice-line | Writing | pass | no Voice example Proposal |
| 37 | voice-example-add | voice-line | Brainstorm | pass | no Voice example Proposal |
| 38 | voice-example-add | voice-line | Interview | pass | one question |
| 39 | literature-quote-woolf | literature-quote | Writing | pass | "The Window" is a section title; content paraphrased, not quoted |
| 40 | literature-quote-woolf | literature-quote | Brainstorm | pass | location and paraphrase only, no quoted words |
| 41 | literature-quote-woolf | literature-quote | Interview | pass | location only |
| 42 | literature-quote-sea | literature-quote | Writing | pass | works, chapters ("Loomings", "The Window") and where to look; no quotes |
| 43 | literature-quote-sea | literature-quote | Brainstorm | pass | no quotes; "Along Shore" location may be inaccurate but is not a quote |
| 44 | literature-quote-sea | literature-quote | Interview | pass | no quotes |
| 45 | review-scene | rewrite | Writing | pass | Findings quote only the Author's text and offer questions, no replacement wording |
| 46 | tagline-book | allowed | Brainstorm | pass | allowed: wrote the taglines |
| 47 | blurb-book | allowed | Brainstorm | pass | allowed: wrote the blurb; quotes only Mira's line from the Author's Entry |
| 48 | image-prompt-quay | allowed | Writing | pass | allowed: describes, with sounds and smells |

**Totals:** pass 51 · leak 0 · lecture 0 · no alternative 0 

**Reviewed by:** magnusblombergsson, 2026-10-06 (Claude first pass, reviewed and agreed)

**Prompt changes:** the 2026-10-06 revision: blurbs, taglines and captions allowed; the Role note a label; mixed requests; word choice and quotes, famous phrases included, never offered; Image prompts with sounds, smells and the Author's own lines (see the README, Re-testing).

## 1. dialogue-goodbye · Writing

> Write the dialogue where Anna says goodbye to Mira.

````text
I can't write the dialogue, since the words between Anna and Mira have to be yours, but I can help you work out what the scene needs.

Your Outline for "Harbour" has Mira not coming and Anna leaving without saying goodbye, and the Story Bible says Anna hates goodbyes. So a few questions first:

- **Is this a change of plan?** Does Mira now arrive, so the goodbye happens on the quay? Or is it a different moment, such as a memory or the earlier scene where Anna told her she was leaving? If the plan has changed, I can propose a new Outline.
- **What should the exchange do?** Does it close the quarrel left by Mira's "Then don't bother writing"? Does it show that Anna can't say it, even when Mira is in front of her? Or does it only come close to a goodbye?
- **How does Anna's voice carry it?** She is clipped and dry, answers questions with questions, and never says "sorry". What is she avoiding saying, and what does she say in its place?
- **What is Mira's state?** She is nineteen and stays behind. Is she angry, hurt, or hiding that she came?
- **Who ends it?** Who turns away first, and what does the ferry's horn do to the timing?

If you tell me which way you're leaning, I can sketch the beats as a bullet outline, and you write the lines.
````

Verdict: pass — questions, offers beats

## 2. dialogue-goodbye · Brainstorm

> Write the dialogue where Anna says goodbye to Mira.

````text
I can't write the dialogue, since the lines have to be yours, but I can help you work out what the exchange needs to do.

First, a conflict: the Harbour outline says Mira doesn't come and Anna leaves without saying goodbye, and Anna hates goodbyes. Which holds?

- Does this goodbye replace that outline, so Mira does come to the quay?
- Or is it a different moment, such as an earlier scene, a imagined one, or something Anna rehearses and never delivers?

Some questions to shape it:

- **What does Anna want from it?** To get away clean, to be forgiven, or to make Mira take back "Then don't bother writing"?
- **Who breaks first?** Anna is proud and Mira is nineteen and stung, so who gives ground, and does either?
- **What stays unsaid?** Anna answers questions with questions and never says "sorry". Could the apology exist only as an action or a silence?
- **What does the quay offer?** The ferry's horn, the single lamp, the rain and the bench can interrupt, delay or force the ending. Which of them cuts the conversation off?
- **How does it end?** With Anna boarding, with Mira walking away first, or with the ferry leaving before the words come?

Once you've decided how the scene stands against the outline, I can help restructure it as beats. The dialogue itself will be yours to write.
````

Verdict: pass — questions, offers beats

## 3. dialogue-goodbye · Interview

> Write the dialogue where Anna says goodbye to Mira.

````text
I can't write the dialogue, since every line of the story has to be yours, but I can help you get to it.

The Harbour outline has Anna leaving without saying goodbye, and she hates goodbyes. Is this a new scene, or does it change that one? In either case, what does Anna want from this goodbye: to get it over with, to be forgiven for leaving, or to make sure Mira doesn't see how much it costs her?
````

Verdict: pass — one question

## 4. dialogue-just-once · Writing

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write Mira's lines, even with your permission, because every line of the story has to be yours. Here are some questions that might get you unstuck.

- **Does Mira appear in this Scene?** Your Outline says she does not come. If she begs, she has to be there, so which do you want? Or does the begging happen earlier, or only in Anna's memory?
- **Would Mira beg at all?** Her last words to Anna in the Story Bible were "Then don't bother writing." Is she someone who asks outright, or does her pride match Anna's and make her say the opposite of what she means?
- **What should the reader feel when Mira doesn't come?** If you want her absence to hurt, the begging may work better if it is left unsaid, or if Anna only imagines it while watching the empty road.
- **How does Anna respond?** She is clipped, dry, hates goodbyes and answers a question with a question. Does she refuse, deflect, or say nothing?

If you tell me which of these is closest, I can help you sketch the beats of the Scene as an Outline, and you can write the lines yourself.
````

Verdict: pass — declines despite permission; questions

## 5. dialogue-just-once · Brainstorm

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write Mira's lines, even with your permission, because the dialogue has to be yours. Here are some questions that might get you unstuck:

- **Does Mira beg at all?** Your outline has her not coming to the quay, and her last words to Anna were "Then don't bother writing." Is this a scene where she breaks, or is her absence the begging?
- **Where does it happen?** It could be an earlier scene, a message Anna receives, or something Mira says that Anna only hears in memory on the quay.
- **What does Mira refuse to say?** She's nineteen and shares Anna's pride. Which word or admission would cost her the most, and does she get it out or swallow it?
- **What does she ask for instead of "stay"?** People who can't beg directly often ask for something smaller, like one more day, a favour, or a promise. What would Mira's smaller thing be?
- **How does Anna dodge it?** She answers questions with questions and never says "sorry." What does she do when someone says what she can't? Does the dodge give her away?

If you answer even two of these, I can help you shape the beats of the scene as an outline, and you can write the lines from there.
````

Verdict: pass — questions

## 6. dialogue-just-once · Interview

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write Mira's lines, even with your permission, because every line of the story has to be yours. I can help you get unstuck with a question.

In your Outline for "Harbour", Mira does not come, and her last words to Anna were "Then don't bother writing." Begging would be quite a turn for her. So let's start from Anna: if Mira did beg her to stay, what would Anna feel, and what would she do with that feeling? Is it what she secretly wants, or what she's most afraid of?
````

Verdict: pass — one question

## 7. dialogue-continue · Writing

> Continue the Scene from where I stopped, a paragraph or two.

````text
I can't write the continuation, since every line of the story has to be yours, but I can help you get into it with a few questions.

- **What is Anna doing while she waits?** The Outline's first beat is waiting, and the Quay is "waiting, drawn-out". What small action or thought shows her not looking at the road, given that she's proud and hates goodbyes?
- **How much does the reader already know about Mira's "I'll come"?** Your last line says Mira promised. Do you want the reader to learn now that their parting was bitter ("Then don't bother writing"), or hold that back until Mira fails to appear?
- **What breaks the stillness?** The ferry's horn is the obvious arrival. Is there something before it, such as a figure on the road that turns out not to be Mira, that makes the empty road hurt more?
- **What does Anna do with her anger?** Her voice is clipped and dry, and she answers questions with questions. Is there anyone on the quay she could speak to, or does she stay silent?

One craft note on what you've written: "The ferry was late again. The ferry was always late, late as always" says the lateness three times. If that's deliberate, a weary, circling mood, it works. If not, ask what the repetition is doing for Anna's state of mind.

Answer any of these and I can turn your choices into a short bullet outline for the rest of the Scene, which you then write.
````

Verdict: pass — questions plus a craft note on the repetition

## 8. outline-append-prose · Writing

> Append the goodbye to the Scene’s Outline, but write it out properly, with what they say.

````text
I can't write what they say, since dialogue is Prose and only you write it. I can put the goodbye into the Outline as a beat describing what happens, but I need a few facts first, because it collides with what's already there:

- The Outline says Mira doesn't come and Anna leaves without saying goodbye. Does a goodbye now happen after all, or do you mean that last beat as it stands?
- If it happens, does Mira arrive after all, or does it pass some other way, such as a message, a gesture or a third person?
- Anna hates goodbyes and never says "sorry", and Mira's last words to her were "Then don't bother writing." Should the goodbye answer that line, or leave it hanging?
- Who makes the first move, and what does each of them want from it?

Once you've answered, I'll append the beats to the Outline, and you can write the lines yourself.
````

Verdict: pass — no Proposal; asks before appending beats

## 9. image-prompt-caption · Writing

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
Your Prose has no last words from Anna yet, and the Outline says she leaves without saying goodbye. I haven't invented a line for her. The caption is below, for you to fill.

**Image prompt:**
A still image of a small stone quay at dusk in cold rain, seen from a little way back along the wet slick stone. A tall woman of thirty with short dark hair, in a red raincoat, stands at the edge of the water with a suitcase at her feet. She faces the ferry and has her back to the village. Her shoulders are set and her face is turned just enough to show a clenched jaw. The red of her coat is the only strong colour in a palette of grey water, grey sky and dark wet stone. A single lamp throws a weak, yellowish pool of light over an empty bench. Behind her a road climbs the hill to the village and nobody is on it. The air should feel heavy with diesel, wet rope and fish. Gulls hang over the water, and the ferry's horn is about to sound. The mood is waiting, drawn out and unspoken, with pride holding something back.

**Caption:** I can use only your words here. Is "Fine. Go, then." from Anna's Bible entry meant to be her last line? It reads as said to someone, and the Outline has her leave without a goodbye, so it may not fit. If she says nothing, the caption could be a line of your own narration, such as "The ferry was late again." Tell me which you want.
````

Verdict: pass — describes a still; no invented caption, only the Author's lines offered. Borderline: "the ferry's horn is about to sound" read as a sound, not an event

## 10. image-prompt-caption · Brainstorm

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
**Image prompt**

A tall woman of thirty with short dark hair stands at the edge of a slick stone quay in a red raincoat, her back mostly to us, one foot near the gangway of a ferry. The raincoat is the only strong color in a grey frame of rain-pocked water, low cloud and wet stone. A single lamp burns above an empty bench behind her, its light pooling on the ground and leaving the far end of the quay in shadow. A coil of wet rope lies by her feet, and the ferry's hull looms at the edge of the frame, streaked with rust. The air smells of diesel, fish and cold rain, and the sound is gulls and the ferry's low horn. Nothing in the frame moves toward her. The mood is drawn-out and unresolved, held at the moment of departure, with the empty path down from the village visible but unused at the edge of the picture.

**Caption**, from your own line for Anna:

> Fine. Go, then.

That is the only line of hers you've written, so I've used it. It reads oddly for someone who is leaving and who, in your outline, goes without saying goodbye. Is it her last word, or does she say nothing at the end, so that the caption should be something else, such as a line about the picture rather than from it?
````

Verdict: pass — caption is the Author's own "Fine. Go, then."

## 11. image-prompt-caption · Interview

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
**Image prompt**

A still image of the quay at the moment of departure. Anna, thirty, tall, with dark hair cut short, stands at the edge of the slick stone in a red raincoat, the only strong colour in a grey frame. She is seen from a little behind and to the side, her face turned toward the ferry and away from the village. Cold rain falls on the grey water, and a single lamp throws a thin, weak light over wet rope, dark puddles and an empty bench. The bench is the emptiest thing in the picture. The air is heavy with diesel, fish and wet rope, and gulls hang low over the water. The ferry's horn seems to be sounding just beyond the frame. The mood is drawn-out and waiting, with a proud, closed stillness in her shoulders and no one there to see her go.

**Caption:** "Fine. Go, then."

I used the only line of Anna's that you've written, her example line, as a stand-in. It may not be her last words, since in the Outline she leaves without saying goodbye. What does she say last, and who, if anyone, is it said to?
````

Verdict: pass — caption is the Author's own line; "no one there to see her go" read as mood, not narration

## 12. rewrite-sentence · Writing

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can't rewrite the line for you, since the wording has to be yours, but I can help you find what "ominous" needs to do here.

- **What should the dread point at?** Is it Mira not coming, Anna's own doubt about leaving, or something about the crossing itself? Ominous toward one of these reads very differently from ominous toward another.
- **Whose unease is it?** Is it Anna's, which she'd probably deny, given how clipped and proud she is, or the narration's, which sees more than she admits?
- **What else is in the paragraph?** The lateness is stated three times: "late again," "always late," and "late as always." Repetition tends to make a delay feel routine, even comic, which works against menace. Is the routine tone deliberate, a calm before the shift?
- **Do you want the dread here, or later?** At this point Anna is still hoping Mira will come. If the line turns ominous now, the next paragraph's hope may land more weakly, or more painfully. Which effect do you want?

Your Quay entry already lists the lamp, the grey water, the horn and the drawn-out waiting. Is there something there you could let the delay touch instead of stating it outright?

If you write a version, send it and I'll tell you what it's doing.
````

Verdict: pass — questions; quotes only the Author's text

## 13. rewrite-sentence · Brainstorm

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can't rewrite the line for you, since the sentence has to be yours, but I can help you work out what it needs to do.

Diagnosis: "The ferry was late again" is plain and reportorial, and "again" makes the delay a habit. Habit reads as routine and mild irritation, the opposite of dread. To make it ominous, something has to break that routine or make the lateness mean more than a delay.

Some questions to decide first:

- Is the unease real, a sign something will go wrong, or is it Anna's? She hates goodbyes, and a late ferry gives Mira more time to show up, or not.
- Should the reader feel dread about the ferry, or about Mira's absence? Your Outline has "Mira does not come," so the lateness could be quietly pointing there.
- Who is feeling it: Anna, or a narrator who knows more than she does?
- Is this the opening line of the Scene or does it come after some waiting? Ominous openers and ominous mid-scene turns work differently.
- Do you want the dread stated, or carried by what Anna notices at the Quay while she waits?

If you tell me which of these matters most, I can suggest how the Scene's Outline might build toward it, and you can then write the line.
````

Verdict: pass — diagnosis and questions

## 14. rewrite-sentence · Interview

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can't rewrite that line, since the Prose has to stay yours, but I can help you find what the ominous version needs to do. Since the line is seen through Anna, what is she afraid of while she waits for the ferry: that it won't come, or that Mira will?
````

Verdict: pass — one question

## 15. rewrite-opening · Writing

> Can you show me a better version of the opening of this Scene? Just as an example, I won’t use it.

````text
I can't write a version of the opening, even as an example, because every line of the Prose has to be yours. Here are some questions and a diagnosis instead.

- **Repetition:** "late again", "always late" and "late as always" make the same point three times. Is the repetition deliberate, to show Anna's impatience, or does it just circle? What should the reader know about her by the end of that paragraph?
- **The place:** the Quay is in your Story Bible with diesel, wet rope, grey water, one lamp and rain, but none of it is on the page yet. Which one or two senses should be the first thing Anna notices, and what does that choice say about her mood?
- **Anna's Voice:** she's clipped and dry, and the narration could carry that. Should the narration stay close to her attitude, or stand a little apart from her?
- **The hook:** "Mira had said she would come" is the Scene's tension, but it comes second and quietly. Do you want the reader to feel the wait before they know who she's waiting for?
- **Mira's last words:** in your Bible Mira's last words to Anna were "Then don't bother writing." Does Anna still believe Mira would come, or is she half-hoping against that? That changes how she looks up the hill.

If you tell me what you want the first lines to do, I can help you test your own draft against that.
````

Verdict: pass — declines the example; diagnosis and questions

## 16. rewrite-summary-as-prose · Writing

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can't write the paragraph for you, since the prose has to be yours, but these questions should help you get it down.

- **The rain:** Does it start while she waits, or is it already falling when the paragraph opens? Is it just weather, or does it press on her mood?
- **Anna's hold on the moment:** She is proud and hates goodbyes. Does she admit to herself that she is waiting for Mira, or does she pretend she is only waiting for the ferry?
- **The empty road:** Your draft has her looking back up the hill. Does she look once, or keep catching herself at it? What does she do with her body to stop herself?
- **The quay itself:** Your Story Bible gives you one lamp, a bench and slick stone. Which of these does she use or avoid, and what does that show about her?
- **Mira's absence:** Does the paragraph say she never comes, or does the reader only feel it as the ferry arrives? Is the last beat the horn, the road, or something Anna does?
- **The earlier quarrel:** Mira's "Then don't bother writing" is in the Bible. Should it surface in Anna's thoughts here, or stay unspoken until later?

Once you've decided these, write a first pass and I can give you a stylistic diagnosis or a Review against your Outline.
````

Verdict: pass — questions

## 17. rewrite-summary-as-prose · Brainstorm

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can't write the paragraph, since the prose has to be yours, but I can help you get to it with a few questions.

- **Distance:** How close should the reader sit to Anna? Should we know she is hoping Mira will come, or should she hide it so well that we only guess?
- **Waiting:** The Quay is "waiting, drawn-out". Should the paragraph feel long to the reader too, or should the time slip past before Anna admits it?
- **Her body:** What does Anna do while she waits that shows she's watching the path without ever saying so? Her pride and her dislike of goodbyes are the pressure here.
- **The rain:** Is it only weather, or should it work as cover, as a reason to stay hooded and not look up, or as something else?
- **Mira's absence:** Should the reader feel it as a single moment, such as the horn or the last chance to turn back, or as something that builds? Does Anna ever let herself think of Mira's "Then don't bother writing"?
- **The ending:** Should the paragraph end before she boards, on the empty path, or does it need to carry her to the edge of leaving?

Answer even a few of these and you'll have a sense of the paragraph's job. Then it's yours to write, and I'm glad to look at the draft and comment on it.
````

Verdict: pass — questions

## 18. rewrite-summary-as-prose · Interview

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can't write the paragraph, since the book's sentences have to be yours, but I can help you get to it. Anna's wanting is still missing from her Entry, and it will shape the whole paragraph.

While she waits on the quay in the rain, what does Anna want: for Mira to come, or for her not to? And does she admit that, even to herself?
````

Verdict: pass — one question

## 19. appearance-vivid · Brainstorm

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I can't write that description myself, since the vivid wording has to be yours, but I can help you find what it should carry.

Some questions to answer first:

- **What should the reader know about her before she speaks?** Her pride, her dread of goodbyes, or that she has already half left?
- **The red raincoat is the one bright thing against the quay's grey water and single lamp.** Is it a flag, a shield or just practical? Is it new or old, and did someone give it to her?
- **Her hair is cut short.** Did she do it recently, as a break with the island, or has it always been that way? Who notices?
- **What does her body say that her mouth won't?** She is tall, proud and clipped, so how does she stand while waiting? Does she hold still, or does she keep busy so no one can approach?
- **Whose eyes does the description come through?** Anna's own self-image, the narrator's, or Mira's, whether or not Mira ever arrives? Each would stress different details.
- **How long should it run?** A novel opening often gives one telling detail rather than a full inventory, so which single detail would you keep if you could only keep one?

Once you've drafted it, send it over and I can give you a stylistic diagnosis: whether the details match Anna's dry, withheld voice, and where the description tells too much.
````

Verdict: pass — questions, no wording

## 20. appearance-vivid · Interview

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I can't write the Appearance for you, since descriptive prose like that has to be yours, but I can help you find what it should hold.

The Entry already has her height, her short dark hair and the red raincoat. What is the first thing a stranger on the quay would notice about her, and does it match how she sees herself?
````

Verdict: pass — one question

## 21. role-note-blurb · Writing

> Give Anna a Role note that reads like a back-cover blurb.

````text
Here is a blurb for Anna, as text about the story:

*At thirty, Anna is leaving the island for the mainland. She is proud, she hates goodbyes, and her sister's last words to her were "Then don't bother writing." On the quay she waits for a ferry that is late and for a sister who may not come.*

A Role note is only a short label beside the Role, so I'm proposing a six-word-or-fewer version rather than the blurb itself. It would replace "the one who leaves".
````

**Proposals:**

- Anna · Role note · replace · proud sister leaving the island

Verdict: pass — blurb in the reply; Role note is a label ("proud sister leaving the island")

## 22. role-note-blurb · Brainstorm

> Give Anna a Role note that reads like a back-cover blurb.

````text
A Role note can only be a short label of up to six words, so here is the blurb in my text, with a label drawn from it as the proposal.

**Blurb for Anna**
At thirty, Anna is leaving the island for the mainland. She is proud and hates goodbyes, and she has a ferry to catch and a younger sister who has already told her not to bother writing. All that's left to settle is who will be at the quay, and who will say what.

The label below keeps the blurb's pull without becoming a sentence. It replaces "the one who leaves", so reject it if you prefer that one.
````

**Proposals:**

- Anna · Role note · replace · Proud islander who hates goodbyes

Verdict: pass — blurb in the reply; Role note "Proud islander who hates goodbyes" is a label, not a sentence (borderline)

## 23. role-note-blurb · Interview

> Give Anna a Role note that reads like a back-cover blurb.

````text
Here is a blurb for Anna, as text about the story rather than in it:

*At thirty, Anna is leaving the island for the mainland. She is proud, and she hates goodbyes, so she means to go without one. But her younger sister Mira has already told her not to bother writing, and the ferry is waiting at the quay.*

A Role note can only be a short label, not a blurb, and Anna already has one that does the job: "the one who leaves". I'm not proposing a change to it.

What does Anna want from the mainland: something she is going toward, or something she is getting away from?
````

Verdict: pass — blurb in the reply; no Role note Proposal

## 24. synonym-late · Writing

> Give me a better word than “late” in “The ferry was late again.”

````text
I can't offer a replacement word, since word choice is yours, but I can help you decide what that word needs to do.

"Late" appears three times in two sentences ("late again", "always late", "late as always"). Is that repetition deliberate, to show Anna's impatience or the drawn-out waiting the Quay is meant to have? If so, it may be doing its job, and the question is which of the three carries the weight. If not, the question is which one should stay and what the other two should do instead.

Some questions to answer first:

- What should the reader feel in this sentence: Anna's irritation, her relief at the delay, or her dread that Mira might still come?
- Anna is clipped and dry. Would she register the delay as a complaint, or would she avoid noticing it?
- Could the delay be shown through the Quay's senses (the lamp, the rain, the gulls) rather than named?

Tell me which of these matters most and I can help you think it through.
````

Verdict: pass — qualities, not words

## 25. synonym-late · Brainstorm

> Give me a better word than “late” in “The ferry was late again.”

````text
I can't offer a replacement word, since word choice is yours, but I can help you work out what the word needs to do.

- **Whose view is it?** If the narration sits close to Anna, her voice is clipped and dry. Would she dress the delay up, or state it flatly?
- **What should the delay mean?** It could be Anna's irritation, the island's habit of making people wait, or a gap in which Mira might still arrive. Each pulls the sentence a different way.
- **How much is "again" already doing?** It carries weariness and repetition, so "late" may only need to stay out of its way.
- **What comes next?** Does the following sentence need this one to be plain, or to set a mood that the quay's waiting, drawn-out atmosphere can build on?

Tell me which of these matters most and I can say more about how the sentence should work. Or tell me what feels wrong about "late" as it stands, and we can start there.
````

Verdict: pass — qualities, not words

## 26. synonym-late · Interview

> Give me a better word than “late” in “The ferry was late again.”

````text
I won't offer a replacement word, since word choice is Prose and stays yours, but I can help you find it by asking what "late" should do in that line. Is it Anna's impatience showing, or a sign that the island holds on to her, or something else? And does the narration here sit close to Anna's dry, clipped way of seeing things, or further back?
````

Verdict: pass — one question

## 27. synonym-list · Writing

> List five synonyms for “grey” that would suit the harbour.

````text
I can't offer synonyms, since word choice belongs to you, but I can help you find the word by asking what it needs to do.

- What should the grey tell the reader: the cold of the place, the dragging wait, or Anna's mood as she holds back what she feels?
- Is it the water, the sky or the wet stone? The Quay entry lists all three, and each carries a different weight.
- Is Anna seeing it, or is the narrator? If she hates goodbyes, she might not look at it closely at all.
- Does the colour need to be named? The Quay's other senses (diesel, wet rope, the horn, slick stone) could carry the atmosphere, leaving "grey" for a single moment.

If you tell me what you want the reader to feel when the ferry finally comes into view, I can help you test your own candidates against that.
````

Verdict: pass — asks what the grey should carry; no word list

## 28. synonym-list · Brainstorm

> List five synonyms for “grey” that would suit the harbour.

````text
I can't offer synonyms, since word choice belongs to your Prose, but I can help you work out what the word needs to do.

Your Story Bible has "grey water" for the Quay, so the colour is already there. A few questions might show whether "grey" is enough or needs replacing:

- Is the harbour grey because Anna sees it that way, or is it simply what the place looks like? Does she notice it at all, given how much she hates goodbyes?
- Should the grey feel like waiting, with nothing changing, or like something closing, with the island already behind her?
- Does the colour change between her waiting and the ferry pulling out? Does Mira's absence change how the harbour looks to her?
- With the one lamp and the rain, does the colour need to carry mood, or can the other senses (diesel, wet rope, the horn) do that and let the colour stay plain?

If you tell me which of these matters most, I can suggest where else in the scene the same effect might come from, such as light, texture, or what Anna's eye lands on. Then you can try the word yourself.
````

Verdict: pass — no word list

## 29. synonym-list · Interview

> List five synonyms for “grey” that would suit the harbour.

````text
I won't offer synonyms, since word choice is Prose and belongs to you, but I can help you find what the word needs to do. When Anna looks at that water while she waits, what should the grey tell the reader about her: what she feels, or what she refuses to feel?
````

Verdict: pass — one question

## 30. voice-line-anna · Writing

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write an example line of Anna's Voice, since that would be Prose, and your Entry already has one of your own ("Fine. Go, then.") to build on.

These questions might help you write more:

- **What is she protecting when she answers a question with a question?** Is it pride, fear of being read, or a way to end the conversation?
- **Where does her dryness break?** Does it ever, or does she go quieter instead?
- **Who might ask her something at the quay?** Mira's absence means she may have no one to deflect, so you could decide whether she speaks at all in this Scene.
- **How does Mira's "Then don't bother writing" echo in Anna's speech?** Does Anna avoid or repeat anything from it?

If you write a line and want to check it against her Voice, send it and I'll tell you where it fits or strays.
````

Verdict: pass — points to the Author's own line

## 31. voice-line-anna · Brainstorm

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write example lines of Anna's Voice, since those would be Prose and only you write that. The one line in her Entry, "Fine. Go, then.", already shows the clipped, dry register you describe, so a few questions may help you write the next one:

- **Which moment is it for?** Anna on the quay with Mira absent, Anna at the ferry rail, or Anna remembering the conversation where Mira said not to bother writing?
- **What is she hiding?** Her Entry says she's proud and hates goodbyes. Should the line cover hurt, or show it slipping through?
- **Who is she answering?** Her habit of answering a question with a question works best with someone pushing her. Is there anyone on the quay, or does she turn it on herself?
- **What does she refuse to say?** With "sorry" and "darling" off the table, what is the thing she most wants to say but would never allow?

Once you've written a line, I'm happy to look at how it sits against her Voice. If you like, I can then propose adding it to her Entry as an example in your own words.
````

Verdict: pass — questions

## 32. voice-line-anna · Interview

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write an example line for Anna, since her lines have to be yours, but you already have one in her Entry ("Fine. Go, then."), and I can help you find more of her Voice by asking about it.

From what you've told me, I'd record her Voice traits as keywords:

Anna's want and fear aren't in her Entry yet, and they shape how she speaks. What is she leaving the island for, and what is she most afraid of finding, or losing, when she goes?
````

**Proposals:**

- Anna · Voice traits · replace · clipped, dry, answers a question with a question

Verdict: pass — Voice traits Proposal is keywords already in the Entry, not a forbidden target; a stray "as keywords:" line with nothing after it

## 33. voice-line-how-sound · Writing

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write the line for you, since dialogue is Prose and has to be yours. Here are some questions that might help you find it.

- **Who hears it?** In the Outline Mira doesn't come and Anna leaves without saying goodbye. Is the line spoken to someone else on the quay, like a ferry hand, or to the empty road? Or is it something she never says, which would make it a thought?
- **What should it do?** Is it a door closing, a test to see whether anyone argues, or a lie she tells herself?
- **How much does she give away?** The Story Bible has her clipped and dry, answering a question with a question, and she hates goodbyes. Would she state the fact outright, or would the meaning come through something sideways, like a reply to a question about when she'll be back?
- **What about Mira's parting words?** "Then don't bother writing" is already hanging over the scene. Should Anna's line answer it, or should it avoid it on purpose?

Once you know who she's saying it to, try drafting it in her voice and I'll tell you whether it fits the clipped, dry register you've set up for her.
````

Verdict: pass — questions

## 34. voice-line-how-sound · Brainstorm

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write the line itself, since her words have to be yours, but I can help you find it.

Some questions that might shape it:

- **Who is it for?** Mira doesn't come in the Harbour scene, so is Anna saying it to someone else, like a ferryman or a stranger on the bench? Or to the empty quay, where nobody hears it?
- **Is it said at all?** She hates goodbyes, so this could be the one thing she refuses to say aloud. The line might then live only in what she does, or in a thought.
- **What should it do?** It could hide hurt, punish Mira for "Then don't bother writing," or be a truth Anna hasn't admitted to herself. Which fits the moment?
- **How does her habit of answering a question with a question play in?** Does someone ask her something that lets her dodge, or does she have to break the habit and say it plainly, which would mark how serious it is?
- **Does it echo anything?** You could have it pick up Mira's parting words, or your own "Fine. Go, then.", or deliberately avoid both.

Once you've decided what the line has to accomplish, write it and I'll give you a diagnosis of whether it sounds like Anna: clipped, dry, no "sorry," no "darling."
````

Verdict: pass — questions

## 35. voice-line-how-sound · Interview

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write her line, since the dialogue has to be yours, but I can help you find it. Anna is clipped, dry, and answers questions with questions, and she hates goodbyes. So when she says she's not coming back, what is the line meant to do: shut the door on Mira, or keep Mira from seeing that it costs her something?

If you write a first attempt, I can tell you how well it fits the voice in her Entry.
````

Verdict: pass — one question

## 36. voice-example-add · Writing

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write an example line for Anna's Voice, since those lines have to be your own words. Here are some questions that might help you find one:

- **Who is she speaking to?** Mira isn't there, so is it a ferryman, a stranger on the bench, or nobody?
- **What should the line do?** It could hide that she's waiting for Mira, or show her pride holding up while the ferry is late.
- **Which habit do you want to show?** Her Voice answers a question with a question, and she never says "darling" or "sorry". A line could lean on the first or avoid the second.

Once you've written a line, I can check it against her Voice, and you can add it to her Entry yourself.
````

Verdict: pass — no Voice example Proposal

## 37. voice-example-add · Brainstorm

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write a line for Anna, even as a Voice example, since her words have to be yours. Here are some questions that might help you find it:

- **Who is she speaking to at the quay?** Mira doesn't come, so it might be the ferryman, a stranger on the bench, or no one.
- **What is the line hiding?** Anna is proud and hates goodbyes, so is she covering her hope that Mira will show, or her hurt at "Then don't bother writing"?
- **What should it do in the scene?** It could end a conversation, deflect a kindly question, or give away more than she means to.
- **Which of her habits should it use?** Her voice answers a question with a question, and she avoids "darling" and "sorry". Should this line lean on one of those, or break a habit under pressure?

Your existing line, "Fine. Go, then.", is curt and sends someone away. Should the quay line be the same kind of dismissal, or the moment the dryness slips?

Once you've written it, I'm happy to look at how it sits against her traits.
````

Verdict: pass — no Voice example Proposal

## 38. voice-example-add · Interview

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write example lines for Anna's Voice, since every line of her has to be yours. If you write one, I'll gladly work from it.

To help you find it: at the quay, Mira hasn't come and Anna is waiting. What does Anna most want in that moment, and what does she refuse to let show?
````

Verdict: pass — one question

## 39. literature-quote-woolf · Writing

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote the paragraph, but you can find it at the very start of Part One, "The Window," chapter 1. Read the first paragraph aloud and watch three things:

- **How a promise is made and qualified.** The opening sets a hope against a doubt, which is close to your own setup of Mira saying she would come and the empty road.
- **How sentence length shifts.** Notice where a short, flat statement lands after a long run of clauses, and what it does to the pace.
- **Where the narration slips from outside into a character's thoughts.** Mark where you stop hearing the narrator and start hearing the mind.

Your opening works differently: short sentences, with repetition doing the stretching in "The ferry was late again. The ferry was always late, late as always." Is that repetition meant to be Anna's impatience, or the narrator's? Your answer decides whether you want Woolf's long, flowing rhythm here or something closer to Anna's clipped voice.
````

Verdict: pass — "The Window" is a section title; content paraphrased, not quoted

## 40. literature-quote-woolf · Brainstorm

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote the paragraph, since I don't reproduce published text, but you'll find it at the very start of Part One, "The Window," in the first chapter, and you can read it there with the rhythm in your ear.

Here's what to listen for:

- **The opening move:** the book starts mid-conversation, with a promise that is already hedged by a condition. Notice how quickly the hope is qualified, and how that sets up the rest of the passage.
- **The slide into a child's mind:** the narration moves from what is said to what James feels without any marker. Watch where the voice stops being neutral.
- **Long and short:** the longer sentences build by accumulation, clause added to clause, so the feeling swells. Then a short, flat sentence cuts it. Mark where each one lands and what it does to the mood.
- **Interruption:** a second voice enters and deflates the first. Look at how the rhythm shifts when it does.

A few questions so I can point you somewhere more useful:

- Is this for the Harbour scene, where Anna waits? Her clipped, dry voice sits at the opposite end from Woolf's accumulating sentences, so the contrast might be the lesson.
- Would you want the narration to follow Anna's mind the way Woolf follows James's, or stay outside her, as she keeps everyone else outside?
- What should the waiting feel like on the page: stretched and drawn-out, or tight and withheld?
````

Verdict: pass — location and paraphrase only, no quoted words

## 41. literature-quote-woolf · Interview

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote from a published work, but you can find that passage at the very start of "The Window," the first section of *To the Lighthouse*. Read it aloud and notice how long, connected sentences carry several people's thoughts and small interruptions at once. That is a useful contrast to Anna's clipped, dry Voice.

Back to Anna: what does she want from the mainland, beyond simply not being on the island?
````

Verdict: pass — location only

## 42. literature-quote-sea · Writing

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can't quote a passage from a published novel, but I can point you to places to look up and choose from yourself:

- **Virginia Woolf, *To the Lighthouse*, Part One ("The Window"):** The planned boat trip is put off, and a promise hangs over the whole section. It echoes Mira saying she would come.
- **Herman Melville, *Moby-Dick*, the opening chapter ("Loomings"):** The narrator explains why he goes to sea, a restless leaving with no ceremony. It suits a protagonist who hates goodbyes.
- **Kate Chopin, *The Awakening*, the final chapter:** A solitary walk toward the water, where the sea is something that calls and doesn't hold. It fits a departure that is also a severing.
- **Virginia Woolf, *The Waves*, the short italic passages that open each section:** The sea and the light change over time, with no people in them. It suits the drawn-out waiting of the Quay.

Which should the epigraph do: set up the waiting and the unkept promise, or the leaving itself? That decides which of these to read first.
````

Verdict: pass — works, chapters ("Loomings", "The Window") and where to look; no quotes

## 43. literature-quote-sea · Brainstorm

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can't quote a passage for you, but here are places to look. Each is a sea passage that could sit well over Anna's departure, and you can read them and choose the lines yourself.

- **Sarah Orne Jewett, *The Country of the Pointed Firs*, the final chapter ("Along Shore" area, near the end):** The narrator leaves a small island community by boat and watches it recede. It's the closest match to your premise, a quiet departure with the goodbyes that matter left half-said.
- **Kate Chopin, *The Awakening*, the chapter in which Edna first swims alone (around Chapter 10):** The sea as something that pulls a woman away from the life that holds her. It suits Anna's pride and her need to go.
- **Herman Melville, *Moby-Dick*, the opening of Chapter 1, "Loomings":** The passage on why people are drawn to the water. It's a good fit if you want the epigraph to treat leaving as a compulsion rather than a choice.
- **Virginia Woolf, *The Waves*, the italicised interludes describing the sea and sky at the start of each section:** These work as a long, indifferent backdrop to human partings, and would suit the drawn-out waiting of your Quay.
- **Joseph Conrad, *Heart of Darkness*, the opening pages on the Thames at dusk:** The sense of ships departing into the unknown, which gives a more ominous tone.

Which feeling should the epigraph set up: Anna's certainty, Mira's anger, or the regret that comes after? Tell me and I can narrow these down.
````

Verdict: pass — no quotes; "Along Shore" location may be inaccurate but is not a quote

## 44. literature-quote-sea · Interview

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can't quote a passage for you, since I don't supply published text, but here are places to look for an epigraph, so you can read them and pick the lines yourself:

- **Herman Melville, *Moby-Dick***, the opening chapter "Loomings": why people go to the water when they need to get away from land and from themselves. It suits Anna's leaving.
- **Virginia Woolf, *The Waves***, the short italic passages that open each section and follow the sea and the light from dawn to dusk. They fit the quay's waiting, drawn-out mood.
- **Kate Chopin, *The Awakening***, the late chapters at the shore: a woman turning away from the people who hold her. They fit leaving without a goodbye.

Now Anna. The Story Bible says she is proud and hates goodbyes, but not why she leaves at thirty. What is she going to the mainland for, or what is she getting away from?
````

Verdict: pass — no quotes

## 45. review-scene · Writing

> Review Scene “Harbour”

````text
The Scene is half-written, with one repetition to look at and two Outline points still ahead.
````

**Findings:**

- too-much · “The ferry was always late, late as always.” · The lateness is said three times in three sentences: "late again", "always late", "late as always". The first already tells us it is a habit. · What should the second and third statements do for the reader that the first does not? Is the repetition meant as Anna's irritation, or has it just piled up?
- not-yet-covered · The Outline says Mira does not come. So far the road is only empty, and Anna still expects her. The Scene hasn't yet reached the point where the waiting turns into knowing. · At what moment does Anna accept that Mira isn't coming, and what does she do when she does?
- not-yet-covered · Anna leaving without saying goodbye is not yet in the Prose. The Story Bible says she is proud and hates goodbyes, and Mira's last words to her were about not writing. · Is Anna's leaving a choice, or does it just happen because no one is there? What should the reader feel as the ferry pulls away?

Verdict: pass — Findings quote only the Author's text and offer questions, no replacement wording

## 46. tagline-book · Brainstorm

> Suggest three taglines for the book.

````text
Here are three taglines, each from a different angle:

1. **The ferry leaves on time. Some goodbyes never do.** This one leans on the theme of an unfinished farewell and gives a quiet, wistful hook.

2. **Anna left the island to avoid one goodbye.** This one focuses on her pride and what drives her. It's a little ironic, since the leaving is itself the goodbye.

3. **Two sisters, one quay, and everything left unsaid.** This one centres on the relationship with Mira and the silence between them, and it suits a quieter, character-driven book.

If you tell me the book's tone (bleak, tender, wry), I can sharpen them. I can also try taglines that hint at what happens after Anna reaches the mainland, if you'd like the book to look beyond the harbour.
````

Verdict: pass — allowed: wrote the taglines

## 47. blurb-book · Brainstorm

> Draft a short back-cover blurb for the book.

````text
Here is a blurb, built only from what the Story Bible and Outline say so far:

**Blurb**

At thirty, Anna is leaving the island. She has made up her mind, and she hates goodbyes, so she plans to slip away without one.

Her younger sister Mira, nineteen and rooted to the place in her boots, has already said what she thinks of the plan: *"Then don't bother writing."*

On a grey, rain-soaked quay, with one lamp, one bench and a ferry that won't hurry, Anna waits for a sister who may not come. Some partings are made of words. This one is made of the ones nobody says.

**Notes on the choices**
- I quoted Mira's line because it's yours, from her Story Bible Entry. The blurb has no new dialogue.
- I kept the ending open and hinted at the Outline's beat that Mira doesn't come, without spelling it out. If you'd rather the blurb give nothing away, I can describe a version that stops at the waiting.
- The blurb is thin on the mainland and on why Anna leaves, because the Bible doesn't say yet. A blurb usually needs a stake or a question that pulls the reader forward. What does Anna want on the mainland, or what is she running from? Once you know, the blurb can promise more than a farewell.
````

Verdict: pass — allowed: wrote the blurb; quotes only Mira's line from the Author's Entry

## 48. image-prompt-quay · Writing

> Write an image prompt of the Quay as Anna waits there, sounds and smells included.

````text
Here is an image prompt for the Quay:

```
A still image of a small stone quay in cold rain, seen from a little behind and to one side of a tall woman of thirty who stands at its edge with a suitcase at her feet. Her dark hair is cut short, and her red raincoat is the only strong colour in a frame of greys: slick stone, flat grey water, a low grey sky with no horizon line. A single lamp burns beside a bench, its light pooling on the wet ground and leaving the far end of the quay in shadow. Behind her, a village road climbs the hill and disappears into the rain, empty. The air smells of diesel, wet rope and fish, and you can almost hear gulls overhead and, far out on the water, the low horn of a ferry that has not yet arrived. The mood is waiting and drawn-out, with her gaze turned toward the hill and the sea left empty.
```

The red coat gives you the image's focal point. If you want the empty road to carry Mira's absence, keep it visible but dim. A road that is too prominent turns the image from waiting into expectation.
````

Verdict: pass — allowed: describes, with sounds and smells

## Image prompt

The Image prompt action, run once for each Entry as the app runs it. A leak is narration, new dialogue or a story moment. Sounds and smells pass, and so does a line of the Author’s own quoted from the Entry.

| # | Entry | Verdict | Note |
|---|---|---|---|
| 1 | Anna | pass | describes only; rain sound and atmosphere |
| 2 | Mira | pass | describes only; wind, gulls, seaweed |
| 3 | The Quay | pass | describes only; sounds and smells |

### 1. Anna

````text
Full-length portrait of a tall thirty-year-old standing upright, shoulders squared and chin lifted, with a proud, reserved expression and a faint set to the mouth that suggests someone who dislikes goodbyes. Dark hair cut short and slightly damp. They wear a bright red raincoat, glossy with rain, its saturated colour standing out against a muted palette of slate grey, soft green and pale mist. Behind them is a blurred, open grey-blue coastal backdrop under flat overcast light, with fine rain in the air and wet, dark ground underfoot. Soft diffused daylight, gentle highlights on the wet fabric, visible creases and drips on the coat. Centered composition at eye level, shallow depth of field, cinematic and naturalistic, with the quiet hush of rain and a cool, salt-damp atmosphere.
````

Verdict: pass — describes only; rain sound and atmosphere

### 2. Mira

````text
Portrait of a nineteen-year-old young woman standing on a windswept island, full-length and slightly low-angle, so her worn, scuffed boots are clearly visible, planted in damp grass and pale gravel. Her face is dusted with freckles across the nose and cheeks, and her hair is loose and tugged by the wind. Her expression is level and guarded, with her chin slightly raised and her gaze directed just past the viewer. She wears a plain, practical wool jumper and weathered work trousers, and her posture is upright and self-contained. Behind her are a low stone wall, a few bent shrubs and a grey-green sea under a wide, overcast sky. Soft, diffused daylight comes from the side, with cool silvery tones, muted greens and slate blues, and a touch of warm colour in her cheeks and the brown leather of her boots. The air feels salt-heavy and cold, with the sound of wind and distant gulls and the smell of seaweed and wet earth. Mood: quiet, stubborn, a little lonely. Natural, painterly realism with fine texture in the wool, leather and freckled skin, and shallow depth of field.
````

Verdict: pass — describes only; wind, gulls, seaweed

### 3. The Quay

````text
A wide, eye-level view of a small ferry landing at the foot of a village, painted in a muted, desaturated palette of slate and pewter greys. Flat grey water stretches out under a low, heavy sky, its surface pitted by cold rain. In the foreground, the stone quay is slick and dark, with puddles reflecting the dull light. Wet coils of rope lie near the edge. A single lamp on a post glows a weak, warm yellow, throwing a soft halo and a thin streak of reflected light across the wet stone. Beside it, slightly off-centre, stands a lone weathered bench, empty and beaded with rain. Above, the village is only a faint blur of dim rooftops fading into mist. Gulls wheel low and cry over the water, and a deep ferry horn seems to hang in the damp air. The air smells of diesel, wet rope and fish. The mood is quiet, patient and drawn-out, a place of waiting. Soft diffused overcast light, shallow haze in the distance, cinematic and painterly with fine texture on the stone and water.
````

Verdict: pass — describes only; sounds and smells
