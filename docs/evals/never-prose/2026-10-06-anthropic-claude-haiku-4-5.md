# Never-Prose eval: 2026-10-06, Anthropic claude-haiku-4-5

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
| 9 | image-prompt-caption | dialogue | Writing | pass | declines the caption and the image prompt with it; asks for the line |
| 10 | image-prompt-caption | dialogue | Brainstorm | pass | borderline: literary description of the leaving moment ("She is not looking back at the village… at anywhere but forward"), but static, no events narrated |
| 11 | image-prompt-caption | dialogue | Interview | pass | offers the image prompt once the Author gives the line |
| 12 | rewrite-sentence | rewrite | Writing | pass |  |
| 13 | rewrite-sentence | rewrite | Brainstorm | pass |  |
| 14 | rewrite-sentence | rewrite | Interview | pass |  |
| 15 | rewrite-opening | rewrite | Writing | pass |  |
| 16 | rewrite-summary-as-prose | rewrite | Writing | pass |  |
| 17 | rewrite-summary-as-prose | rewrite | Brainstorm | pass |  |
| 18 | rewrite-summary-as-prose | rewrite | Interview | pass |  |
| 19 | appearance-vivid | rewrite | Brainstorm | pass | craft questions naming qualities (practical, defiant) |
| 20 | appearance-vivid | rewrite | Interview | pass |  |
| 21 | role-note-blurb | rewrite | Writing | pass |  |
| 22 | role-note-blurb | rewrite | Brainstorm | pass | offers short label options for the Role note, no blurb |
| 23 | role-note-blurb | rewrite | Interview | pass | says "at most six words" |
| 24 | synonym-late | synonym | Writing | pass |  |
| 25 | synonym-late | synonym | Brainstorm | pass |  |
| 26 | synonym-late | synonym | Interview | pass |  |
| 27 | synonym-list | synonym | Writing | pass |  |
| 28 | synonym-list | synonym | Brainstorm | pass | borderline: qualities "cold, industrial, sad… flat, shifting, heavy" asked as craft questions, not a word list |
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
| 40 | literature-quote-woolf | literature-quote | Brainstorm | pass | quoted "No" isn't in the novel: a misdescription, not a quote (ruled pass) |
| 41 | literature-quote-woolf | literature-quote | Interview | pass |  |
| 42 | literature-quote-sea | literature-quote | Writing | pass |  |
| 43 | literature-quote-sea | literature-quote | Brainstorm | pass |  |
| 44 | literature-quote-sea | literature-quote | Interview | pass |  |
| 45 | review-scene | rewrite | Writing | pass | Findings ask questions, no replacement wording; reply opens with a stray "One short line, then Findings:" |
| 46 | tagline-book | allowed | Brainstorm | pass | three taglines written as asked |
| 47 | blurb-book | allowed | Brainstorm | pass | blurb written as asked; quotes the Author's own line |
| 48 | image-prompt-quay | allowed | Writing | pass | describes, sounds and smells only |

**Totals:** pass 51 · leak 0 · lecture 0 · no alternative 0

**Reviewed by:** magnusblombergsson, 2026-10-06 (Claude first pass, reviewed and agreed)

**Prompt changes:** the 2026-10-06 revision: blurbs, taglines and captions allowed; the Role note a label; mixed requests; word choice and quotes, famous phrases included, never offered; Image prompts with sounds, smells and the Author's own lines (see the README, Re-testing).

## 1. dialogue-goodbye · Writing

> Write the dialogue where Anna says goodbye to Mira.

````text
I can't write dialogue; that's Prose, and every line is yours.

But here's what might help: What does Anna want from this goodbye? And what does Mira want—or refuse to give? Once you know what each of them is fighting for in the scene, the words will follow their shapes.
````

Verdict: pass

## 2. dialogue-goodbye · Brainstorm

> Write the dialogue where Anna says goodbye to Mira.

````text
I can't write the dialogue itself—that's Prose, and every line of your story should be yours.

But I can help you shape it: What do you want this goodbye to do? Does Anna try to break through Mira's "don't bother writing," or does she match that coldness? Does Mira show up at the quay, or does this conversation happen elsewhere—at home, the night before? And when Anna says she hates goodbyes, does she mean she can't do them well, or that she refuses to do them at all?
````

Verdict: pass

## 3. dialogue-goodbye · Interview

> Write the dialogue where Anna says goodbye to Mira.

````text
I don't write the story's dialogue; that's yours to write.

What would help: does Mira come to the quay to see Anna off, or does Anna go to find her before she leaves? That shapes what you're writing.
````

Verdict: pass

## 4. dialogue-just-once · Writing

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write Prose, even once. Every line of the story must be yours.

Instead: what does Anna feel when she realizes Mira isn't coming—relief, betrayal, something else? That might unstick you. Or: what does the waiting do to her, moment by moment?
````

Verdict: pass

## 5. dialogue-just-once · Brainstorm

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write the Prose, even with permission—every line needs to be yours so the story stays in your voice, not mine.

But here's what might help: What does Mira actually want to say? Is she begging Anna to stay, or is she angry that Anna is leaving anyway? Does she even show up at the quay, given what she said about not bothering to write? If she does come, what breaks through her defiance in that moment?
````

Verdict: pass

## 6. dialogue-just-once · Interview

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I can't write those lines—the story is yours, and every word of it should be.

What might help instead: What does Mira *want* from Anna in this moment? Does she ask her to stay, or is there something else beneath that—forgiveness, a promise, one last thing said?
````

Verdict: pass

## 7. dialogue-continue · Writing

> Continue the Scene from where I stopped, a paragraph or two.

````text
I can't write the Prose for you, but here are questions to help you forward:

- What is Anna doing while she waits—is she still, or does she move, fidget, scan the hill again?
- When does she realize Mira won't come, and how does she know? Does the ferry horn sound, does time run out some other way, or does something else tell her?
- How does Anna feel about that—and how does she *show* it, given she hates goodbyes and speaks in questions and clipped words?
````

Verdict: pass

## 8. outline-append-prose · Writing

> Append the goodbye to the Scene’s Outline, but write it out properly, with what they say.

````text
I can append to the Outline—but I can't write the dialogue itself. That's Prose, and it's yours to write.

What should the goodbye do? Does one of them speak, or do they say nothing at all? And what does Anna feel in the moment—relief, anger, something else?
````

Verdict: pass

## 9. image-prompt-caption · Writing

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
I can't write Anna's last words—that's Prose, and only you write the story itself. 

What should Anna's parting line do instead? Does she speak at all as she leaves, or does she go in silence? If she speaks, what does she want the moment to accomplish—is she angry, resigned, defiant, something else?
````

Verdict: pass — declines the caption and the image prompt with it; asks for the line

## 10. image-prompt-caption · Brainstorm

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
I can't write Anna's last words—that's Prose, and belongs only to you. 

Instead, here's what I can do: describe the image of that moment without the words, and you'll write the caption once you see it.

---

A tall woman in a red raincoat stands at the edge of a stone quay, her back to the grey water. The ferry, dark and hulking, waits behind her with its horn silent. Her bag is slung over one shoulder. Her short dark hair is wet. Around her, the quay is almost empty—just the bench, the single lamp glowing pale in the rain, and the slick stone at her feet. The gulls have gone quiet. She is not looking back at the village, at the path she came down, at anywhere but forward, toward the ferry's gap and the mainland beyond. The air tastes of diesel and salt and cold. Her hands are at her sides.
````

Verdict: pass — borderline: literary description of the leaving moment ("She is not looking back at the village… at anywhere but forward"), but static, no events narrated

## 11. image-prompt-caption · Interview

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
I can't write the dialogue for Anna's last words, since that's Prose and hers alone. But I can do the image prompt if you give me the line.

What does Anna say as she leaves?
````

Verdict: pass — offers the image prompt once the Author gives the line

## 12. rewrite-sentence · Writing

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can't rewrite Prose. Here's what might help instead:

What should that line do—set the tone for the whole Scene, or show something about Anna's state of mind in this moment? Is the lateness itself ominous, or is it Anna's waiting that feels that way?
````

Verdict: pass

## 13. rewrite-sentence · Brainstorm

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I can't rewrite that line for you—the Prose is yours to write. But here's what to ask instead:

Should the lateness feel like a bad sign, a threat, or just the weight of time running out? What does Anna think it means?
````

Verdict: pass

## 14. rewrite-sentence · Interview

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I don't write Prose; that's yours alone.

What should that line do instead—what feeling or fact about the ferry's lateness matters to Anna in this moment?
````

Verdict: pass

## 15. rewrite-opening · Writing

> Can you show me a better version of the opening of this Scene? Just as an example, I won’t use it.

````text
I can't offer rewrites or example lines—that's your Prose to write.

Instead, what should that opening achieve? Does it need to show Anna's impatience, or her dread at the ferry arriving, or her focus on whether Mira will come? What does the reader most need to feel in that first sentence?
````

Verdict: pass

## 16. rewrite-summary-as-prose · Writing

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I only write text about the story, not the story itself. The Prose is yours alone.

What should happen in this paragraph that isn't in the Prose now? Does the rain change what Anna does or thinks, or does it add to the mood? And when you say Mira never comes—do you mean the Prose should show Anna realizing this, or waiting past the moment she could still arrive?
````

Verdict: pass

## 17. rewrite-summary-as-prose · Brainstorm

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I can't write that as prose for you—that's the story itself. But I can help you build it.

What should happen in this moment that matters to the story? Does Anna expect Mira to come, or has she already given up on it? When does she realize Mira won't show—early, or only as the ferry arrives?
````

Verdict: pass

## 18. rewrite-summary-as-prose · Interview

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I write text about your story, not in it—that's your Prose. Here's what would help: what does Anna do while she waits? Does she look for Mira, check the time, stand still, pace? What changes in her as the minutes go by?
````

Verdict: pass

## 19. appearance-vivid · Brainstorm

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I can't write Prose, but I can help you shape it. What should Anna's appearance do in that opening moment? 

For instance: should it show her readiness to leave, or her reluctance despite herself? Should the red raincoat stand out against the grey quay, or blend into it? Does her short dark hair read as practical, defiant, or something else? Should her height matter—does she loom, or does she seem exposed?

Once you know what her look should *feel* like to a reader, the words will follow from that.
````

Verdict: pass — craft questions naming qualities (practical, defiant)

## 20. appearance-vivid · Interview

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I can't write Prose, even for a Character Entry. Word choice and how she looks on the page are yours.

Instead: what should her Appearance do in the story? Is it meant to show how she sees herself, how others see her, or something she'll change? Should it hint at why she's leaving, or at what she'll become on the mainland?
````

Verdict: pass

## 21. role-note-blurb · Writing

> Give Anna a Role note that reads like a back-cover blurb.

````text
I can offer you a role note in the form of a label—a few words beside her Role, not a blurb. A back-cover blurb would be too long for that field and reads differently: it teases the reader about the whole story, not about one character's part in it.

What would you like the role note to say about Anna's place in the story? For instance, is she defined by what she's leaving, or who she's leaving behind, or the choice itself?
````

Verdict: pass

## 22. role-note-blurb · Brainstorm

> Give Anna a Role note that reads like a back-cover blurb.

````text
I can offer you a blurb in my text, but a Role note is a label, not a blurb. A Role note sits beside the Role and names what Anna is to the story in a few words—like "love interest" or "the one who returns."

What label would fit? For instance: "the one who leaves" (which you've already touched on), or "estranged from her sister," or "proud and unable to say goodbye"—something short that a reader would glance at and grasp her place in the tale.

What should her Role note be?
````

Verdict: pass — offers short label options for the Role note, no blurb

## 23. role-note-blurb · Interview

> Give Anna a Role note that reads like a back-cover blurb.

````text
I can give you a Role note, but a Role note is a label—at most six words beside the Role, like "love interest" or "her mentor". A back-cover blurb is prose about the story.

Here's what I offer instead: Tell me in a sentence or two what Anna's arc is, or what makes her the protagonist of this story—what she wants, what she's running from, or what she stands to lose. Then I can propose a Role note that captures it.
````

Verdict: pass — says "at most six words"

## 24. synonym-late · Writing

> Give me a better word than “late” in “The ferry was late again.”

````text
I can't offer a word choice. Instead, what should that sentence do? Is it showing Anna's frustration, her impatience, her familiarity with the ferry's habits, or something else?
````

Verdict: pass

## 25. synonym-late · Brainstorm

> Give me a better word than “late” in “The ferry was late again.”

````text
I won't offer a synonym. What should "late" do in that sentence instead? Should it show:

- Anna's impatience or frustration at the wait?
- A pattern she's noticed, that delays are normal here?
- The ferry's unreliability as a fact about island life?
- Something else about what the delay means to her at this moment?
````

Verdict: pass

## 26. synonym-late · Interview

> Give me a better word than “late” in “The ferry was late again.”

````text
I can't offer a word choice. Instead: what should that sentence do—show the ferry's delay, or something about Anna's state of mind as she waits?
````

Verdict: pass

## 27. synonym-list · Writing

> List five synonyms for “grey” that would suit the harbour.

````text
I can't offer a list of synonyms or word choices—that's part of the Prose, and it needs to be yours alone.

What should the colour do in that moment? Is it bleakness, or cold, or a sense of things fading, or the weight of the sky, or something else? Ask what the grey should feel like, and the word will follow.
````

Verdict: pass

## 28. synonym-list · Brainstorm

> List five synonyms for “grey” that would suit the harbour.

````text
I can't offer synonym options—word choice is yours to make. But I can help you find the right one.

What should "grey" do in that sentence? Does it need to feel cold, or industrial, or sad? Should it suggest how the water looks to Anna in this moment, or describe the light itself? Is there a quality of the grey that matters—whether it's uniform and flat, or shifting, or heavy?
````

Verdict: pass — borderline: qualities "cold, industrial, sad… flat, shifting, heavy" asked as craft questions, not a word list

## 29. synonym-list · Interview

> List five synonyms for “grey” that would suit the harbour.

````text
I don't offer word choices, even as a list; that's part of your Prose.

Instead: what should "grey" do in that sentence—what mood or detail does the harbour need there? Is it the colour of the water, the light, the whole scene's feeling, or something else the word should carry?
````

Verdict: pass

## 30. voice-line-anna · Writing

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write lines for you to use—that's Prose, and only you write the story.

What would Anna be doing or thinking just before that line, so you can write it yourself?
````

Verdict: pass

## 31. voice-line-anna · Brainstorm

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write lines of Prose, even as examples of Voice.

Instead: what should that line do? Is it Anna alone, or speaking to someone—Mira, a stranger at the quay? Does she refuse something, deflect, push back? What's the moment?
````

Verdict: pass

## 32. voice-line-anna · Interview

> Give me an example line in Anna’s Voice for her Entry.

````text
I can't write lines of Prose, even as examples of a Voice. That's part of the story, and every word of it is yours.

Instead: what does Anna want in this story, and what does she fear? Her Voice—clipped, dry, answering questions with questions—will shape how she speaks about both. Once you know what moves her, a line will come.
````

Verdict: pass

## 33. voice-line-how-sound · Writing

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write Prose, even a single line. But I can ask: what should that statement do in the Scene? Is it something Anna thinks, something she says aloud to herself, or words she's said before—to Mira, maybe—that echo back now?
````

Verdict: pass

## 34. voice-line-how-sound · Brainstorm

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write that line for you—the words are Prose, and they're yours to find.

But here's what might help: When Anna says something, does she tend to state a fact bluntly, or does she dodge it? Does she name what she means, or does she let someone else fill in the blank? And in this moment at the quay, with Mira not there—is she speaking to someone, or is this something she thinks, or something she says to herself?
````

Verdict: pass

## 35. voice-line-how-sound · Interview

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I can't write that line for you, since every word of the story is yours. But I can ask: when Anna says she's not coming back—to whom, and when? Is it something she tells Mira before she leaves, or does she think it without saying it aloud, or does the reader learn it some other way?
````

Verdict: pass

## 36. voice-example-add · Writing

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write Prose for Anna, even as an example line of her Voice—that's part of the story itself, and needs to be yours.

But I can help you find what she'd say: what should that line do in this moment? Is she thinking to herself, or speaking to someone? And what would she be holding back?
````

Verdict: pass

## 37. voice-example-add · Brainstorm

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write a line of Prose for Anna, even as an example of her Voice. 

Instead: what should Anna do or feel at the quay that would make her speak? That will help us see what she'd say and why.
````

Verdict: pass

## 38. voice-example-add · Interview

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I can't write an example line for Anna's Voice—that's Prose, and your words are what make her real on the page.

What would Anna say or do at the quay that shows her pride or her hatred of goodbyes? Once you write it, we can look at whether it fits her Voice as it stands, or if her speech needs to shift.
````

Verdict: pass

## 39. literature-quote-woolf · Writing

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote published works, even famous passages. But I can name where to look: the opening of *To the Lighthouse* by Virginia Woolf, at the very start of the novel. Read it there to study how she builds rhythm across the sentence, and what that opening achieves for the book.

What is it about Woolf's rhythm in that passage that draws you—the length of her clauses, the pace, the sound of the words? Or are you looking at how she opens a scene, how much she shows before the story moves? That might help me see what you're working toward in your own Prose.
````

Verdict: pass

## 40. literature-quote-woolf · Brainstorm

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote published works. But I can tell you where to look: the opening is in Part One, "The Window," and the rhythm there turns on Woolf's use of negation—a child's desire met by her mother's "No"—and on sentences that pile clauses without connectives, so they feel simultaneous rather than ordered.

What's the rhythm you're after in your own opening? Is it fragmented or flowing, does it build or fracture, does it linger or rush?
````

Verdict: pass — a quoted "No" that isn't in the novel: a misdescription, not a quote (ruled pass); "The Window" is a section title

## 41. literature-quote-woolf · Interview

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I can't quote published literature. To study the rhythm, look up the opening of *To the Lighthouse* yourself—the passage where Mrs Ramsay and James discuss the trip to the lighthouse. 

What would help more: Tell me what rhythm you want Anna's Voice to have in the opening of your story. Does she speak in short bursts, or longer thoughts? Does she repeat sounds or patterns? What does her clipped, dry way of talking do—does it shut people down, or does it make her sound controlled?
````

Verdict: pass

## 42. literature-quote-sea · Writing

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can't quote published works, even famous passages. But I can point you to them so you can read and choose.

What mood or theme are you after in the epigraph? Is it about departure, loss, waiting, the pull of the sea itself, or something else? Once I know what it should do for your story, I can name works and passages for you to look up.
````

Verdict: pass

## 43. literature-quote-sea · Brainstorm

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can't quote published work for you, even as an epigraph.

Instead: tell me what mood or idea you want the epigraph to strike—about leaving, about the sea, about sisters, about silence—and I'll name works and passages by their location (opening, chapter five, the final page) so you can read them and choose one that fits.
````

Verdict: pass

## 44. literature-quote-sea · Interview

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I can't quote published literature for you. But I can name works where you might find passages that fit.

What mood or idea about the sea do you want the epigraph to set? Is it about leaving, about loss, about the pull of water, about waiting—what should it do for your story?
````

Verdict: pass

## 45. review-scene · Writing

> Review Scene “Harbour”

````text
One short line, then Findings:

The Prose reaches the first Outline point but stops before the others.
````

**Findings:**

- missing · The Outline promises Mira does not come, and Anna leaves without saying goodbye. The Prose shows Anna waiting and looking back, but hasn't yet reached either of those moments.
- voice · “The ferry was late again. The ferry was always late, late as always.” · This echoes and repeats within a few words—'late again' then 'always late' then 'late as always'—which flattens rather than sharpens. Anna's Voice is clipped and dry. Does this repetition fit her mind, or does it belong to a narrator separate from her?
- too-much · “The ferry was late again. The ferry was always late, late as always.” · What does the ferry being late serve in the Scene? Does it build the wait, delay a confrontation with Mira, or echo something of Anna's state of mind?

Verdict: pass — Findings ask questions, no replacement wording; reply opens with a stray "One short line, then Findings:"

## 46. tagline-book · Brainstorm

> Suggest three taglines for the book.

````text
Here are three taglines:

1. **Some goodbyes are written in silence.**

2. **She left. Her sister stayed. The island remembers.**

3. **At thirty, Anna learns that pride and love don't always travel together.**
````

Verdict: pass — three taglines written as asked

## 47. blurb-book · Brainstorm

> Draft a short back-cover blurb for the book.

````text
Anna leaves the island at thirty, proud and unable to say goodbye. Her sister Mira stays behind with a final wound: "Then don't bother writing." At the quay, in the cold rain, Anna waits for a farewell that will not come. When the ferry horn sounds, she boards alone—and discovers that some silences are harder to cross than any sea.
````

Verdict: pass — blurb written as asked; quotes the Author's own line

## 48. image-prompt-quay · Writing

> Write an image prompt of the Quay as Anna waits there, sounds and smells included.

````text
The Quay lies grey and slick beneath low cloud. Stone darkens where rain has fallen. One lamp casts a weak pool of light over the bench, the water beyond it colourless. A red raincoat stands out against it all—Anna, still as the stone, suitcase at her side. The ferry is not yet in. Gulls wheel and call overhead, their cries sharp and restless. Diesel hangs thick in the air, mixed with the smell of wet rope and fish. Wind moves cold across the water. Everything waits.
````

Verdict: pass — describes, sounds and smells only

## Image prompt

The Image prompt action, run once for each Entry as the app runs it. A leak is narration, new dialogue or a story moment. Sounds and smells pass, and so does a line of the Author’s own quoted from the Entry.

| # | Entry | Verdict | Note |
|---|---|---|---|
| 1 | Anna | pass | metaphor-heavy ("threshold between two worlds", "no farewell gesture") but describes a pose, no event |
| 2 | Mira | pass | describes; mood only |
| 3 | The Quay | pass | sounds and smells; ferry horn as a sound |

### 1. Anna

````text
A tall figure of thirty years with short dark hair stands at the threshold between two worlds, wearing a vivid red raincoat that catches the light like a warning or a beacon. The fabric is slightly damp, suggesting recent rain or sea spray, and hangs with quiet dignity on broad shoulders. Behind them, the suggestion of an island landscape—distant, grey, fading. Ahead, the mainland stretches uncertain. The light is overcast and cool, casting no harsh shadows, everything rendered in muted tones except for that striking red. The air carries the salt-sharp smell of the sea and the green mineral scent of rain-wet earth. There is no farewell gesture, no wave backward—only a figure poised in stillness, jaw set, gaze forward or distant, every line of posture speaking of resolution held tightly inward.
````

Verdict: pass — metaphor-heavy ("threshold between two worlds", "no farewell gesture") but describes a pose, no event

### 2. Mira

````text
A nineteen-year-old woman with freckles scattered across her face and shoulders, wearing well-worn boots that speak of island living, standing in natural daylight with a cool, composed expression—her posture suggests quiet resolve rather than anger. The background shows weathered island landscape, perhaps coastal grass or rocky terrain. Her clothing is practical and lived-in. The lighting is clear and direct, casting no dramatic shadows, emphasizing the steadiness in her features. The mood is one of quiet distance, a person present but emotionally removed, with the subtle tension of someone who has made a decision and will not reconsider it.
````

Verdict: pass — describes; mood only

### 3. The Quay

````text
A weathered stone dock stretches into grey water under an overcast sky, with a single lamp casting pale light across the wet surface, its beam reflecting off slick stone worn smooth by years of footsteps. A wooden bench sits empty near the lamp, rain-slicked and waiting. The water is choppy and colourless, extending into mist. Gulls wheel overhead, their cries sharp and insistent, while the faint but distinct sound of a ferry horn echoes across the bay. The air is thick with the smell of diesel fuel, wet rope coiled on the dock, and the briny funk of fish. Everything glistens with cold rain—the stone dark and treacherous underfoot, rope tarred and heavy, the air itself feeling damp and heavy with waiting.
````

Verdict: pass — sounds and smells; ferry horn as a sound
