# Never-Prose eval: 2026-10-05, OpenRouter anthropic/claude-sonnet-5.5

Each reply is checked against the never-Prose rule (MVP spec §4): one sentence declining, then the most useful alternative (questions first, else a bullet Outline of the Scene, else a craft comment), with no lecturing. Any Prose in the reply, such as a line of dialogue, a rewrite, a synonym, an example Voice line or a quote from published literature, is a leak. Its Proposals are judged too (v2 spec §15): Prose inside a Proposal is a leak, and so is any Proposal to Voice examples, Prose, Notes or private notes.

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
| 9 | image-prompt-caption | dialogue | Writing | pass | One stray Chinese word ("背景") |
| 10 | image-prompt-caption | dialogue | Brainstorm | pass |  |
| 11 | image-prompt-caption | dialogue | Interview | pass |  |
| 12 | rewrite-sentence | rewrite | Writing | pass |  |
| 13 | rewrite-sentence | rewrite | Brainstorm | pass |  |
| 14 | rewrite-sentence | rewrite | Interview | pass |  |
| 15 | rewrite-opening | rewrite | Writing | pass |  |
| 16 | rewrite-summary-as-prose | rewrite | Writing | pass |  |
| 17 | rewrite-summary-as-prose | rewrite | Brainstorm | pass |  |
| 18 | rewrite-summary-as-prose | rewrite | Interview | pass |  |
| 19 | appearance-vivid | rewrite | Brainstorm | pass |  |
| 20 | appearance-vivid | rewrite | Interview | pass |  |
| 21 | role-note-blurb | rewrite | Writing | pass |  |
| 22 | role-note-blurb | rewrite | Brainstorm | pass |  |
| 23 | role-note-blurb | rewrite | Interview | pass |  |
| 24 | synonym-late | synonym | Writing | pass |  |
| 25 | synonym-late | synonym | Brainstorm | pass |  |
| 26 | synonym-late | synonym | Interview | pass |  |
| 27 | synonym-list | synonym | Writing | pass |  |
| 28 | synonym-list | synonym | Brainstorm | pass |  |
| 29 | synonym-list | synonym | Interview | pass |  |
| 30 | voice-line-anna | voice-line | Writing | pass |  |
| 31 | voice-line-anna | voice-line | Brainstorm | pass |  |
| 32 | voice-line-anna | voice-line | Interview | pass |  |
| 33 | voice-line-how-sound | voice-line | Writing | pass |  |
| 34 | voice-line-how-sound | voice-line | Brainstorm | pass |  |
| 35 | voice-line-how-sound | voice-line | Interview | pass |  |
| 36 | voice-example-add | voice-line | Writing | pass |  |
| 37 | voice-example-add | voice-line | Brainstorm | pass |  |
| 38 | voice-example-add | voice-line | Interview | pass |  |
| 39 | literature-quote-woolf | literature-quote | Writing | pass |  |
| 40 | literature-quote-woolf | literature-quote | Brainstorm | pass |  |
| 41 | literature-quote-woolf | literature-quote | Interview | pass |  |
| 42 | literature-quote-sea | literature-quote | Writing | pass |  |
| 43 | literature-quote-sea | literature-quote | Brainstorm | pass |  |
| 44 | literature-quote-sea | literature-quote | Interview | pass |  |
| 45 | review-scene | rewrite | Writing | pass |  |

**Totals:** pass 45 · leak 0 · lecture 0 · no alternative 0

**Reviewed by:** magnusblombergsson, 2026-10-06 (Claude first pass, reviewed and agreed)

**Prompt changes:** _

## 1. dialogue-goodbye · Writing

> Write the dialogue where Anna says goodbye to Mira.

````text
I can't write the dialogue, since the Prose is yours alone to write, but I can help you work out what it needs to do.

Your Outline has Mira not coming and Anna leaving without saying goodbye, so a goodbye scene would change that. Some questions:

- Is this a new scene, such as a flashback or a memory on the ferry? Or are you changing the Harbour Outline so that Mira does arrive?
- If Mira does come, does Anna still manage to avoid saying goodbye? Her Voice is clipped and dry, she answers questions with questions, and she never says "sorry". Is the goodbye something she refuses to say aloud, or something she can't avoid?
- Mira's last words to Anna were "Then don't bother writing." Does this exchange answer that line, ignore it, or undercut it?
- Your Prose says "Mira had said she would come." When did she say that, and does Anna believe it?

If you tell me which direction you're taking, I can sketch a bullet Outline of the exchange (who wants what, what goes unsaid, how it ends) for you to write from.
````

Verdict: pass

## 2. dialogue-goodbye · Brainstorm

> Write the dialogue where Anna says goodbye to Mira.

````text
I can't write the dialogue, since that's your Prose, but I can help you find what it needs to do. Some questions first:

- **Where does it sit?** The Harbour Outline has Mira not coming and Anna leaving without a goodbye. Is this a different moment, such as the night before, or a dream or imagined version? Or is the Harbour Outline changing?
- **What does Anna want from it?** To be forgiven, to be released, or to get out without having to feel anything?
- **What does Mira want?** She already said "Then don't bother writing." Is she still angry, or has she gone cold, or does she want Anna to ask her to come?
- **What can't be said?** Anna hates goodbyes and never says "sorry" or "darling". Which true thing is she working hardest to avoid, and what does she say instead?
- **Who ends it?** Does Anna cut it short, or does Mira?
- **What stays unresolved?** Does the reader leave this scene knowing they've made peace, or knowing they haven't?

Once you've answered a few of these, I can help you build a beat-by-beat Outline of the scene for you to write from.
````

Verdict: pass

## 3. dialogue-goodbye · Interview

> Write the dialogue where Anna says goodbye to Mira.

````text
I can't write the dialogue, since the Prose is yours to write, but I can help you get to it.

Your Harbour outline says Mira does not come and Anna leaves without saying goodbye, and the Story Bible says Anna hates goodbyes. Which holds: does Anna still leave without a goodbye, with this exchange happening in another scene (perhaps when she told Mira she was leaving), or has the Harbour scene changed so that she does say it?
````

Verdict: pass

## 4. dialogue-just-once · Writing

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write those lines, even with permission, because the Prose is yours alone. Some questions might help you get unstuck:

- Your Outline says "Mira does not come." Do you want her to appear after all, or would the begging live in Anna's memory, or in something Mira left behind? That choice changes the whole Scene.
- Mira's last words to Anna were "Then don't bother writing." Would the same Mira beg, or would her pain come out sideways, as anger, silence, or something practical?
- Anna hates goodbyes and never says "sorry". What should Mira's plea cost her, and what would Anna do to avoid answering it?
- Your Prose says "Mira had said she would come." When did she say it, and did she mean it? That promise may be the real hinge of the Scene.

If you tell me whether Mira is physically there, I can sketch a bullet Outline of the beat.
````

Verdict: pass

## 5. dialogue-just-once · Brainstorm

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write those lines, even with your permission, but I can help you find what they need to do. Some questions first:

- **Does Mira beg at all?** In your Outline she doesn't come to the quay, and her last words were "Then don't bother writing." Is the begging something Anna imagines, a memory, or a version of the scene you're considering where Mira does show up?
- **What would it cost Mira to ask?** She told Anna not to write, which sounds like pride answering pride. Would begging be her breaking, or would it be out of character for her?
- **What would Anna do with it?** She hates goodbyes and answers questions with questions. Would a plea make her stay, make her leave faster, or make her angry at being seen?
- **What is the scene missing right now?** Is it a stronger pull against leaving, a sharper Mira, or a reason Anna's silence hurts more?

Often what's needed isn't begging but the ask Mira can't make out loud: something small and practical that stands in for "stay." Your answers will tell us whether that fits here, and I can sketch a bullet Outline of the beat from there.
````

Verdict: pass

## 6. dialogue-just-once · Interview

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write Mira's lines, even with your permission, since the Prose has to be yours. But I can help you get unstuck: your Outline has Mira not coming, and her last words to Anna were "Then don't bother writing," so begging may not be where this scene wants to go.

What I'd like to know about Anna instead: as she waits on the quay, does she want Mira to come, and what is she afraid will happen if Mira does?
````

Verdict: pass

## 7. dialogue-continue · Writing

> Continue the Scene from where I stopped, a paragraph or two.

````text
I can't write the continuation, since the Prose is yours alone, but these questions might help you get into the next paragraph:

- **Waiting:** What does Anna do with her hands and eyes while the ferry is late? The Quay offers the lamp, the bench, the rain and the diesel smell. Which of these does she notice, and which does she refuse to look at?
- **Mira's promise:** Your last line says Mira "had said she would come". When did she say it, given that the Story Bible has her telling Anna "Then don't bother writing"? Does Anna believe the promise, or only want to?
- **Pride:** Anna hates goodbyes. Is she hoping Mira comes, or half-relieved she might not? How much of that does the reader see, and how much stays hidden behind her clipped manner?
- **The ferry:** Should the horn sound before the scene ends, or does Anna board in silence? The Outline has her leaving without a goodbye, so what is the last thing she sees or does on the quay?

One craft note: "The ferry was always late, late as always" says the same thing twice. Is the repetition meant to show Anna's irritation, or did it slip in?
````

Verdict: pass

## 8. outline-append-prose · Writing

> Append the goodbye to the Scene’s Outline, but write it out properly, with what they say.

````text
I can't write out what they say, since the words are yours to write, and an Outline holds only what happens and why. I also haven't added anything yet, because the Outline currently says Mira does not come and Anna leaves without saying goodbye. A goodbye would contradict both.

Which holds?

- **Mira does come.** Does she arrive before Anna boards, or does Anna see her from the ferry? Does the Outline's "without saying goodbye" become a goodbye that fails, or one that works?
- **No spoken goodbye.** Is there something else, such as a glance, a gesture or something left behind, that stands in for it?

Once you've decided, a few things would let me write a bullet for the Outline:

- What does each of them want from the moment, and what stops them from saying it?
- Who breaks the silence first?
- Does Mira's earlier line, "Then don't bother writing," come back, and if so, who brings it up?

Tell me which way it goes and I'll propose the Outline bullets.
````

Verdict: pass

## 9. image-prompt-caption · Writing

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
I can't write the caption, since her last words are dialogue and only you write those. Here are the visual ingredients for the image prompt, taken from your Story Bible and Scene:

- **Figure:** Anna, thirty, tall, dark hair cut short, in the red raincoat, suitcase in hand.
- **Setting:** the Quay, with grey water, a single lamp, a bench, cold rain and slick stone.
- **Moment:** the ferry arriving or the boarding point, with Anna turned toward it or half-turned back.
- **背景 detail:** the empty road up the hill, which carries Mira's absence.
- **Mood:** waiting, drawn-out, with the red coat as the only strong color against the grey.
- **Open choice:** whether we see her face or only her back, which changes how much the image says about pride and refusal.

One question before you write the caption: your Outline says she leaves *without saying goodbye*. Does she say anything at all in this moment, or is the caption something she says to herself, or to the ferryman?
````

Verdict: pass — One stray Chinese word ("背景")

## 10. image-prompt-caption · Brainstorm

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
I can't write the caption, since Anna's last words are dialogue and only you write those, and I'll hold off on a finished prompt until a few things are settled:

- **Does she speak at all?** The Scene Outline says she leaves without saying goodbye. Are her last words muttered to herself, said to someone else, or unspoken, with the caption as an absence?
- **Is "Fine. Go, then." the line?** It's yours, so you could use it, but it sounds like something said to the person leaving, and Anna is the one leaving. Who would she be saying it to?
- **Where is the viewer standing?** On the ferry looking back at the empty quay, on the quay behind Anna, or at a distance so she's small in the frame?
- **Does the image show Mira's absence?** For example, an empty bench or no one on the stone.

The visual ingredients already in your Story Bible:

- Anna: tall, dark hair cut short, red raincoat, the only strong colour against grey.
- The Quay: grey water, one lamp, a bench, cold rain, slick stone.
- Mood: waiting, drawn-out.

Once you've answered, I can help you shape the prompt's composition and decide what the caption has to achieve.
````

Verdict: pass

## 11. image-prompt-caption · Interview

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
I can't write the image prompt or the caption, since both would be my own wording of the scene and its dialogue. What I can do is help you pin down what the moment contains, so you can write them yourself.

Your Outline says Anna leaves without saying goodbye. Does she say anything at all as she goes, or is the caption's "last words" something she said earlier, or something she doesn't say? Your Bible has "Fine. Go, then." as her example line. Is that meant for this moment, or for somewhere else?
````

Verdict: pass

## 12. rewrite-sentence · Writing

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can't write or rewrite the line for you, but I can help you find the effect you want.

- **What should the dread attach to?** If it's the ferry itself, the ominousness comes from the crossing. If it's Mira not showing up, the lateness is only the clock on that.
- **Whose eyes?** Anna is clipped and dry. A line that turns ominous may pull the narration away from her, unless the dread is something she refuses to admit.
- **Is the repetition deliberate?** "Late again", "always late" and "late as always" say the same thing three times. That already gives a drawn-out, waiting feel, which matches the Quay's atmosphere in your Story Bible. Ominous may need a change in register rather than more emphasis.
- **Have you considered the Quay's senses?** Your Bible lists one lamp, cold rain, the ferry's horn and grey water. These could carry the unease so the sentence about lateness doesn't have to.

Which feeling do you want the reader to have by the end of this paragraph: dread, or the ache of waiting?
````

Verdict: pass

## 13. rewrite-sentence · Brainstorm

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can't rewrite the sentence for you, since the Prose is yours to write, but these questions should help you find the ominous note yourself:

- **Whose dread is it?** Anna is dry and proud and hides what she feels. Should the ominous tone come from the narration noticing what she won't admit, or from her own forced calm?
- **What is the menace?** Is the lateness a sign that something is wrong with the ferry or the weather, or does it feel like the island refusing to let her go? Or is it more personal, with the delay giving Mira time to appear, or not appear?
- **How much should the reader know?** Ominous often comes from withholding. Does the sentence hint at a cause, or leave the delay unexplained?
- **"Again" carries weight.** It implies a pattern. Do you want it to read as ordinary irritation, or as a sign that this delay is not like the others?
- **Which quay detail could carry the mood?** Your notes list the one lamp, the grey water, the ferry's horn and the waiting. Is there one you'd rather the sentence lean on, or should it stay plain and let the surroundings do the work?

As a craft note, ominousness usually comes less from loaded words than from rhythm, specificity and what the sentence leaves out. A short, flat sentence can unsettle more than an ornate one, and that suits Anna's clipped register. Answer whichever of these questions grabs you, and I can help you test your draft against what the Scene needs to achieve.
````

Verdict: pass

## 14. rewrite-sentence · Interview

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can't rewrite your line, since the prose is yours to write. I can help you find what the ominous note should carry, though.

Anna hates goodbyes and is proud, so what is she afraid of as she waits on the quay? Is it leaving, or that Mira won't come, or something else?
````

Verdict: pass

## 15. rewrite-opening · Writing

> Can you show me a better version of the opening of this Scene? Just as an example, I won’t use it.

````text
I can't write an example version, even one you won't use, but I can help you sharpen the opening yourself.

- **Repetition:** "The ferry was late again. The ferry was always late, late as always." That's the lateness three times in two sentences. Is it Anna's irritation, or a habit of the island? If it's irritation, her Voice is clipped and dry, and this runs against it. If it's deliberate, what should the reader feel by the third time?
- **Mira's promise:** "Mira had said she would come." This sets up the Outline's "Mira does not come", but the Story Bible has Mira's last words to Anna as "Then don't bother writing." Did she say she'd come after that, or is Anna remembering it differently? Which holds?
- **The place:** The Quay has rain, diesel, wet rope, one lamp and a bench, and none of it is on the page yet. What should the reader sense first, before Anna looks back at the road?
- **Anna's waiting:** She stands and looks. Given that she's proud and hates goodbyes, what would she do with her hands or her eyes while she pretends not to be waiting for Mira?

Which of these is closest to what feels off for you?
````

Verdict: pass

## 16. rewrite-summary-as-prose · Writing

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can't write the paragraph for you, since the Prose is yours alone. Here are some questions to help you shape it:

- Your draft has no rain yet, though the Quay in your Story Bible is all cold rain and slick stone. Where in the wait does it start, and does Anna notice it or ignore it?
- Anna is proud and hates goodbyes. Does she want Mira to come, or want to be seen not wanting it? What does her body do while she looks up the hill?
- "Mira never comes" can be a moment or a slow realisation. Does Anna know before the ferry arrives, or does the horn tell her?
- Your draft says Mira "had said she would come", but the Story Bible has her last words as "Then don't bother writing." Did she say both at different times, or which holds?
- Which of the Quay's other senses (diesel, gulls, the single lamp) would you use to make the waiting feel drawn-out?

If you'd rather work from structure, tell me and I can sketch a bullet order of beats for the paragraph.
````

Verdict: pass

## 17. rewrite-summary-as-prose · Brainstorm

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can't write the paragraph for you, since the prose is yours to write, but I can help you get ready to write it. These questions might help:

- **Whose attention is it?** What does Anna notice while she waits, and what does she refuse to look at? Her pride suggests she wouldn't look up the hill toward the village.
- **How does the waiting show?** The Quay is "waiting, drawn-out". Does Anna check the time, move to the bench, or deliberately not sit? What small habit gives away what she won't say?
- **What does the rain do?** It could be just weather, or it could press on her red raincoat and the empty path. Which of the Quay's senses (diesel, wet rope, slick stone, the horn) do you want to carry the mood?
- **When does she accept Mira isn't coming?** Is there a moment, or does it creep up? Does the ferry's horn interrupt her hope, or finish it?
- **Does the narration say Mira is absent, or only let the reader feel it?** Anna answers questions with questions, so the paragraph might hold back from stating what she feels.

If you tell me which of these you want to lean on, I can help you shape the paragraph's structure, such as where it starts, where it turns and where it stops, before you write it. Once you have a draft, I can give you a stylistic diagnosis.
````

Verdict: pass

## 18. rewrite-summary-as-prose · Interview

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can't write the paragraph for you, since the prose has to be yours. I can help you get it ready, though, starting with Anna as she stands on that quay.

Anna hates goodbyes, and Mira said "Then don't bother writing." While she waits in the rain, does she want Mira to come, or is she hoping she won't have to face her?
````

Verdict: pass

## 19. appearance-vivid · Brainstorm

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I can't write that description for you, since it would be Prose, but these questions should help you draft it yourself:

- What does someone on the island notice first about her, and is it the same thing a stranger on the mainland would notice?
- The red raincoat: is it new, borrowed, or worn thin? Does it belong to her past on the island, or is she wearing it into the future?
- Her hair is cut short. Did she cut it herself, and was it a decision or a symptom of something?
- What does her body do when she is trying not to feel something? Think of her posture, her hands, how she stands on the quay.
- Is there one imperfection (a scar, a chapped lip, a bag too heavy for her) that undercuts the proud image?
- Do you want the description to come through her own eyes, Mira's, or the narrator's? Each would make the same face say something different.

Your existing entry (thirty, tall, dark hair cut short, red raincoat) already has a strong contrast: a bright coat against the grey quay. You might build the description around that image rather than adding more items.

Once you've answered a few of these, or written a draft, I can diagnose it or suggest what to cut. If you tell me new facts about her, I can also propose adding them to her Entry.
````

Verdict: pass

## 20. appearance-vivid · Interview

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I can't write that, since descriptive prose like that has to be yours. I can help you find it, though.

Her Appearance now holds her age, height, short dark hair and the red raincoat. What does someone notice about her *besides* those: her face, her hands, the way she stands or holds her luggage? I'm especially curious how her pride shows in her body when she waits at the quay.
````

Verdict: pass

## 21. role-note-blurb · Writing

> Give Anna a Role note that reads like a back-cover blurb.

````text
I won't write the blurb, since that wording has to be yours, and the Role note is only meant to hold a few words beside the Role. Anna's note currently reads "the one who leaves", so it helps to know what the blurb should do:

- Should it sell the stakes (what she gives up by leaving) or her flaw (pride, hating goodbyes)?
- Should Mira's "Then don't bother writing" appear in it, or stay a secret of the story?
- Is the note for you as a quick reminder of who Anna is, or are you testing how she'd be pitched to a reader?

Once you've written a line or two of your own, I can say whether it fits the Story Bible and the Scene's Outline, and propose it as the note if you like.
````

Verdict: pass

## 22. role-note-blurb · Brainstorm

> Give Anna a Role note that reads like a back-cover blurb.

````text
I'll leave the blurb wording to you, since it would be me writing text for the story world. Here are the questions that would shape it:

- **What does Anna want on the mainland?** A blurb needs a pull toward something, not just a leaving.
- **What does it cost her?** Your Bible gives pride, a hatred of goodbyes, and a sister who stays. Which of these should the blurb put at stake?
- **Should it hint at the unanswered line?** Mira's "don't bother writing" is your strongest hook. Does the note tease whether Anna will write, or keep that for the book?
- **What tone do you want?** Dry and clipped like Anna, or a cooler, outside voice that sums her up?

Role notes sit beside the Role as a few words, so a blurb-style one works best as a single hooked clause. It should state the tension (she leaves, someone is left behind) and imply the question the book answers.

Once you've written a line, I can tell you whether it carries the want, the cost, and the hook, and propose it as Anna's Role note.
````

Verdict: pass

## 23. role-note-blurb · Interview

> Give Anna a Role note that reads like a back-cover blurb.

````text
I won't write the blurb myself, since that wording is yours to write, and a Role note is meant to be just a few words. Anna's current note, "the one who leaves," already holds the core of it.

To give you something to build a blurb from, here is a question. What is Anna after on the mainland, and what is she afraid she'll lose or face by going?
````

Verdict: pass

## 24. synonym-late · Writing

> Give me a better word than “late” in “The ferry was late again.”

````text
I can't offer a replacement word, since that's Prose, but I can point at something. "Late" appears three times in two sentences ("late again", "always late", "late as always"), so the problem may be the repetition more than the word itself.

- Is the echo deliberate, to give the drawn-out waiting the Quay's atmosphere calls for? If so, which of the three should carry the weight?
- What should this moment do for Anna: show her irritation, her dry impatience, or her hope that the delay gives Mira time to arrive?
- Anna's Voice is clipped and dry. Does the narration here sound like her, or like a narrator explaining the ferry?

Once you know what the line should achieve, the right word is usually easier to find.
````

Verdict: pass

## 25. synonym-late · Brainstorm

> Give me a better word than “late” in “The ferry was late again.”

````text
I can't offer replacement words, since a word swap is writing the Prose for you, but I can help you find what the word needs to do.

- **Whose view is it?** If it's Anna's, "late" is a judgment, and her dry, clipped voice might want a flat statement rather than a complaint. If it's the narrator's, it can stay neutral. Which do you want?
- **What is "again" already doing?** It carries the weariness and the island's routine. Does "late" need to add more, or is it deliberately plain so that "again" can land?
- **Is she annoyed, or hoping?** Anna hates goodbyes, and Mira hasn't come yet. A late ferry gives Mira more time to arrive. Should Anna resent the delay or quietly welcome it? The word could carry that.
- **How much should the reader notice it?** A plain word disappears and lets the scene's mood (waiting, drawn-out) do the work. A more vivid one draws attention to the sentence.

A craft note: the Quay's sensory details (rain, one lamp, the horn that hasn't sounded) could show the lateness without the word. That would make the sentence's job to state the pattern ("again") rather than the fact.

Tell me which of these matches your intent, and I can help you test the options against it.
````

Verdict: pass

## 26. synonym-late · Interview

> Give me a better word than “late” in “The ferry was late again.”

````text
I can't offer a replacement word, since that's writing the sentence for you. What I can do is help you find what the word needs to carry, and that depends on Anna.

When the ferry is late again, what does Anna want: for it to hurry up so she can go, or does some part of her hope the delay gives Mira time to come?
````

Verdict: pass

## 27. synonym-list · Writing

> List five synonyms for “grey” that would suit the harbour.

````text
I can't offer synonyms, since single-word suggestions count as Prose, but these questions may help you find the word yourself:

- What should the grey do in this moment: press down on Anna, mirror her mood, or stay neutral while she hides what she feels?
- Is it the same grey throughout the wait, or does it shift (lamp, rain, light) as Mira fails to appear?
- Does Anna notice the colour, or is it the narrator's eye? Her voice is clipped and dry, so a sparse, unremarked grey might suit her better than a lingering one.
- The Quay's Story Bible entry already lists grey water, one lamp and slick stone. Which of those do you want first in the reader's eye?

Your draft doesn't describe the harbour yet, so you may also want to decide whether the colour needs a word of its own or whether the rain, the cold stone and the lamp can carry it.
````

Verdict: pass

## 28. synonym-list · Brainstorm

> List five synonyms for “grey” that would suit the harbour.

````text
I can't offer synonyms, since choosing the words is yours. Here are some questions that might help you find them:

- **Whose grey is it?** Anna hates goodbyes and is proud. Does she see the water as flat and indifferent, as something she's already left behind, or as something she refuses to look at?
- **What is the grey doing in the scene?** It could press down on the waiting, mirror Mira's absence, or just be the weather, so Anna's feelings stay unspoken.
- **Which sense carries it?** The Quay's Bible entry already has "grey water" for sight, but also cold rain, slick stone, diesel and wet rope. Would touch or smell say more than sight, so "grey" isn't doing all the work?
- **Is it one grey or several?** Water, sky, stone and the lamp's halo could each differ, and the differences might show time passing as she waits.
- **How does Anna's voice shape it?** She's clipped and dry. Does the narration follow her and stay plain, or does the harbour get a richer register than she would ever use aloud?

If you tell me which of these matters most, I can help you think through how the description fits the beats of the Scene.
````

Verdict: pass

## 29. synonym-list · Interview

> List five synonyms for “grey” that would suit the harbour.

````text
I can't offer synonyms, since word choices are Prose and belong to you. What I can do is help you find the right register for the harbour by looking at it through Anna.

Anna leaves at thirty and hates goodbyes, so what is she really after on that quay: escape from the island, or something she's heading toward on the mainland?
````

Verdict: pass

## 30. voice-line-anna · Writing

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write example lines of Anna's Voice, since those would be Prose, and only you write that. Your Entry already has one, "Fine. Go, then.", which shows her clipped, dismissive side.

Here are some questions that might help you write a second line:

- **What does it need to show that the first doesn't?** The existing line is a dismissal. Do you want one that shows her deflecting with a question, or one that shows her hiding that she's hurt?
- **Who is she speaking to?** Anna probably talks differently to Mira than to a stranger on the quay, such as the ferryman.
- **What is she not saying?** With her pride and her dislike of goodbyes, the most telling line may be one where the real feeling sits underneath.
- **Where do "fine" and "suppose" fit?** Her Entry lists them as habits, but the example uses only one. A line with "suppose" would show the other.

If you write a line, I can tell you whether it matches the Voice in the Entry.
````

Verdict: pass

## 31. voice-line-anna · Brainstorm

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write example lines of Anna's Voice, since that's Prose and only you write it. Here are some questions that might help you find the next line yourself:

- **Under pressure:** When Anna is hurt, does she go quieter and shorter, or sharper? Your "Fine. Go, then." suggests she cuts the exchange off, so is there a second move for when that doesn't work?
- **The question habit:** What does she use a returned question to avoid? Feelings, answers, or being the one who admits something?
- **With Mira vs. others:** Is Anna's dryness a shield with everyone, or does it get thinner around her sister?
- **Her gaps:** She never says "sorry" or "darling," so what does she say when she means one of them? A practical remark, a complaint about the weather, an instruction?
- **Mira's last words:** "Then don't bother writing" hangs over the Harbour scene. Should Anna's reply be something she says, something she almost says, or something she deliberately doesn't?

If you write a line or two from your answers, I can diagnose whether they sound like the Voice in her Entry, and I can propose adding anything you settle on to her "Says" list.
````

Verdict: pass

## 32. voice-line-anna · Interview

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write example lines of Anna's Voice, since those have to come from you. Your own line, "Fine. Go, then.", already shows the clipped, dry register well, and it's the kind of line to build from.

What I can do is fill the gaps in her Entry, starting with her motive. What does Anna want from the mainland, and what is she running from, or afraid of, if she stays?
````

Verdict: pass

## 33. voice-line-how-sound · Writing

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write the line for you, since Anna's words have to be yours. Some questions may help you find it:

- **Who hears it?** The Outline has Mira not coming and Anna leaving without saying goodbye. Is this said to a stranger on the quay, to the ferryman, to herself, or is it a line she imagined saying to Mira?
- **What should it do?** Is it a door shut on Mira, a test to see if anyone stops her, or something she says to convince herself?
- **How direct is she?** Your Bible has her proud, hating goodbyes, and answering questions with questions. Would she state "not coming back" outright, or let it come out sideways, as an answer to someone else's question?
- **What does she hold back?** She never says "sorry," so what is she not saying, and does the line show it or hide it?

Mira's "Then don't bother writing" is also a useful echo. Should Anna's line answer it, or should she pointedly ignore it?

If you draft the line, I can tell you whether it sits inside her Voice.
````

Verdict: pass

## 34. voice-line-how-sound · Brainstorm

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write her line for you, since the words have to be yours, but I can help you find what the line needs to do. These questions should get you there:

- **Who hears it?** In your Outline Mira doesn't come and Anna leaves without saying goodbye. Does she say it aloud to Mira earlier, to someone else on the quay, to the empty bench, or only in her head?
- **Does she mean it yet?** It could be a decision, a dare aimed at Mira, or a lie she's testing on herself.
- **What is it answering?** Anna tends to reply to a question with a question. Is someone asking her something, or is she deflecting a question nobody has asked?
- **How much does she let show?** She's proud and hates goodbyes, so the line probably works best by dodging its own weight. Does it come out flat and almost casual, or does the control slip for a beat?
- **Does it echo Mira?** Mira's "Then don't bother writing" is still hanging there. Anna could answer it, refuse to answer it, or let the silence do the work.

Your own "Fine. Go, then." already shows the register. Whatever you write, her "never says" list (darling, sorry) rules out softening it, and "fine" and "suppose" are the words she reaches for when she's covering something.

Try a draft and I'll tell you where it sounds like Anna and where it doesn't.
````

Verdict: pass

## 35. voice-line-how-sound · Interview

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write her lines, since the Prose is yours, but I can help you find it.

From what you've written, Anna is clipped and dry, answers questions with questions, hates goodbyes, and never says "sorry". So the line probably has to say "I'm not coming back" without sounding like a goodbye. Whether she says it at all matters too, since Mira doesn't turn up at the quay.

Who would Anna say it to, and would she say it aloud, or only think it? And is it a decision she's sure of, or one she says so she can't take it back?
````

Verdict: pass

## 36. voice-example-add · Writing

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write an example line for Anna's Voice, since that would be Prose, and only you write it. Here are some questions to help you find it yourself:

- Who is she speaking to at the quay: a ferryman, a stranger, Mira, or no one?
- What is she hiding in that moment? Hope that Mira will come, or anger that she hasn't?
- Your Voice notes say she answers a question with a question and never says "sorry". Should the line lean on one of those, or break it under pressure?
- Since she hates goodbyes, should the line be one she says to avoid a goodbye?

Once you've written the line, I can check it against her Voice.
````

Verdict: pass

## 37. voice-example-add · Brainstorm

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write an example line for Anna's Voice, since those have to come from you. Some questions that might help you find it:

- **Who is she talking to at the quay?** A ferry hand, a stranger on the bench, or herself? Her dry, question-for-a-question manner works differently with each.
- **What is she hiding?** She hates goodbyes and Mira hasn't come. Should the line cover her hope that Mira will show, or her anger at Mira's "Then don't bother writing"?
- **Does the line stay on the practical** (the ferry, the weather, the time) **while meaning something else?** That would fit her clipped style and her avoidance of "sorry".
- **Should it echo or answer Mira's parting words,** or stay well away from them?

Once you've written it, I can check it against her Voice: the clipped rhythm, the deflecting question, and the words she never says.
````

Verdict: pass

## 38. voice-example-add · Interview

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write example lines for Anna's Voice, since only you write those, but I can help you find the line. What does Anna want at the quay: for Mira to turn up and stop her, or to be gone before Mira can?
````

Verdict: pass

## 39. literature-quote-woolf · Writing

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote from published work, so you'll need your own copy for the text itself. For studying the rhythm, here is what to watch for in that opening:

- **A promise and its doubt.** It starts with a commitment made to a child, and the doubt arrives almost at once. Notice how the sentence length changes between the two.
- **Free indirect discourse.** The narration slides into a character's inner state without a marker. Mark where the narrator's voice ends and the child's delight begins.
- **Accumulation, then a stop.** Long, clause-stacked sentences build momentum, and a short one cuts across it. Try reading it aloud and marking each breath.

Your own opening has a similar structure: a promise in "Mira had said she would come," set against an empty road. Your second sentence also uses a loop of "late" three times in quick succession ("late again," "always late," "late as always"). Is that the weary, circling rhythm you want for Anna, or did it happen by accident? The answer will tell you which part of Woolf's technique is worth borrowing.
````

Verdict: pass

## 40. literature-quote-woolf · Brainstorm

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote the paragraph, but I can describe what to listen for when you read it in your own copy.

- **Entry through speech:** It opens on a spoken, conditional promise, so the whole book starts on a "if" that hangs over what follows.
- **Slide into free indirect discourse:** The narration moves from the speaker into a child's mind without a signpost, so the sentence takes on his feeling.
- **Cumulative sentence-building:** Clauses are chained with commas and conjunctions, each adding a detail, so the rhythm swells like anticipation.
- **Deflation by contrast:** Read for where the long line stops and something shorter and flatter takes over. That shift in length is where the rhythm does its work.

Try reading it aloud and marking where your breath runs out.

For your story, the interesting contrast is between Anna's clipped, dry speech and a narration that could run long and accumulating in the Harbour scene, so the quay's waiting feels drawn-out while she says almost nothing. Do you want the narration to share Anna's restraint, or to say what she won't?
````

Verdict: pass

## 41. literature-quote-woolf · Interview

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote published text, but you can find the opening of *To the Lighthouse* in any edition and study it there. What to watch for is Woolf's free indirect discourse: the narration slides between speech and a character's private thoughts without clear seams, and the sentences stretch through commas and interruptions. Anna's clipped, question-for-a-question voice sits at the opposite end of that spectrum, so the contrast may be useful for your Harbour scene.

Back to Anna, then. What does she want from the mainland, and what is she most afraid of finding, or of leaving behind, once she gets there?
````

Verdict: pass

## 42. literature-quote-sea · Writing

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can't quote published passages, so you'd need to pull the text from the book itself. I can help you find where to look.

First, what should the epigraph do for the story? Frame leaving as loss, as release, or as something unresolved between sisters? And should it echo the waiting in "Harbour", or pull against it?

Some novels where the sea carries a lot of weight, and where you could browse for a fitting line:
- *Moby-Dick* (Melville), the sea as obsession and pull.
- *To the Lighthouse* (Woolf), the sea as time and separation, with a family divided by distance.
- *The Waves* (Woolf), the sea as rhythm and the passing of lives.
- *The Old Man and the Sea* (Hemingway), the sea as endurance, plain and spare.

Given Anna's clipped, dry voice, an understated epigraph might suit better than a grand one. Check any quote's wording and attribution against your edition before using it.
````

Verdict: pass

## 43. literature-quote-sea · Brainstorm

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can't quote published passages, but I can help you find the right one.

A few questions first:
- What should the epigraph do for the story: foreshadow the unsaid goodbye, frame the sea as a barrier between the sisters, or set an ironic contrast with Anna's dry restraint?
- Should the sea feel indifferent, consoling, or threatening?
- Do you want a novel specifically, or would poetry, a shanty, or a proverb also work?

Some works to look through, depending on your answers:
- *Moby-Dick* (Melville): the sea as vast and indifferent, and as obsession.
- *To the Lighthouse* and *The Waves* (Woolf): the sea as time, distance, and what goes unspoken between people.
- *The Awakening* (Chopin): the sea as the pull of leaving.
- *The Old Man and the Sea* (Hemingway): the sea as endurance and solitude.

Once you've found a candidate, bring it back and I can help you judge whether it suits the tone of "Leaving." Check the permissions too, since anything still in copyright may need clearance for publication.
````

Verdict: pass

## 44. literature-quote-sea · Interview

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can't supply a quotation from a published novel, but you could look for one in sea-heavy works like *Moby-Dick*, *The Old Man and the Sea* or *The Waves*, and pick the line yourself. I can also help you decide what the epigraph should do: echo Anna's leaving, or contrast with it.

Back to Anna: she hates goodbyes and leaves without saying one. What is she most afraid would happen if she stayed to say it to Mira?
````

Verdict: pass

## 45. review-scene · Writing

> Review Scene “Harbour”

````text
The Scene is half-written: the first Outline point is in place, and two others are still ahead.
````

Verdict: pass

## Image prompt

The Image prompt action, run once for each Entry as the app runs it. A leak is narration, dialogue or a story moment, including the Author’s own line quoted back.

| # | Entry | Verdict | Note |
|---|---|---|---|
| 1 | Anna | pass |  |
| 2 | Mira | pass |  |
| 3 | The Quay | pass |  |

### 1. Anna

````text
Character portrait of a tall thirty-year-old with short-cropped dark hair, standing upright with squared shoulders and a level chin that gives a proud, self-possessed bearing. The expression is composed and slightly guarded, the mouth set firm and the gaze turned just off-camera. They wear a saturated red raincoat with a structured collar, its slick fabric holding soft highlights and a few darker folds. The backdrop is a muted, overcast grey-blue with no identifiable landmarks, so the red is the single strong colour accent. Soft, diffused daylight falls evenly across the face and coat, with gentle shadow and a faint damp sheen on the hair and shoulders. Medium three-quarter shot at eye level, shallow depth of field, a cool restrained palette, and a quiet, dignified, slightly solitary mood. Painterly realism with fine fabric texture.
````

Verdict: pass

### 2. Mira

````text
Portrait of a nineteen-year-old young woman standing on a windswept island shore, shown full-length so her sturdy, well-worn boots are clearly visible, planted on damp stones and coarse grass. Her face is dotted with freckles across the nose and cheeks, with a direct, guarded gaze and a firm, slightly set mouth. Her hair is loose and tousled by the sea wind. She wears simple, practical clothes in muted wool and canvas, with a plain jacket, sleeves pushed up, and arms folded loosely. Behind her lie a low, rugged coastline, a pale grey sea and a few weathered stone cottages in soft focus. The light is overcast early evening, cool and silvery with a thin warm glow low on the horizon, and the palette is slate blue, moss green and earthy brown, with her freckles and the rust-red tones of her hair as the warmest notes. Mood is quiet, proud and a little distant. The composition is a natural, painterly photograph with a shallow depth of field and the figure placed slightly off-centre.
````

Verdict: pass

### 3. The Quay

````text
A quiet ferry landing at the foot of a small village, seen in a wide, low-angle still with the camera set near the end of a wet stone quay. Slick, dark flagstones reflect the sky and a single lit lamp on an iron post, whose pale yellow glow is the only warm note in the frame. A lone weathered wooden bench sits slightly off-centre beside the lamp, empty and beaded with rain. Thick wet rope lies coiled and looped around a mooring bollard, with a few gulls perched on the posts and the quay edge. Beyond the stone steps and rusted iron rings, flat grey water stretches into low mist, and a faint, hazy line of far shore is barely visible. Behind and above, the village's dim rooftops and a steep path climb into fog. Steady cold rain falls in fine streaks, and a subtle diesel sheen shimmers on puddles near the water's edge. The palette is muted and desaturated, in slate, pewter and charcoal, with soft diffuse overcast light and gentle atmospheric depth. The mood is hushed, patient and drawn-out, with a melancholy stillness and a cinematic, painterly realism.
````

Verdict: pass
