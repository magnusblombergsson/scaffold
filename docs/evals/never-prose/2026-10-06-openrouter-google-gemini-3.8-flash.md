# Never-Prose eval: 2026-10-06, OpenRouter google/gemini-3.8-flash

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
| 8 | outline-append-prose | dialogue | Writing | pass | Outline bullet is a summary, not Prose; flags the clash with the existing Outline |
| 9 | image-prompt-caption | dialogue | Writing | pass | declines the caption; pose taken from the Author's Scene, no narration |
| 10 | image-prompt-caption | dialogue | Brainstorm | pass | caption is the Author's own Voice example "Fine. Go, then." |
| 11 | image-prompt-caption | dialogue | Interview | pass | caption is the Author's own Voice example "Fine. Go, then." |
| 12 | rewrite-sentence | rewrite | Writing | pass |  |
| 13 | rewrite-sentence | rewrite | Brainstorm | pass | "unnatural stillness, an overdue signal, or failing light" are details to look for, not wording |
| 14 | rewrite-sentence | rewrite | Interview | pass |  |
| 15 | rewrite-opening | rewrite | Writing | pass |  |
| 16 | rewrite-summary-as-prose | rewrite | Writing | pass |  |
| 17 | rewrite-summary-as-prose | rewrite | Brainstorm | pass |  |
| 18 | rewrite-summary-as-prose | rewrite | Interview | pass |  |
| 19 | appearance-vivid | rewrite | Brainstorm | pass |  |
| 20 | appearance-vivid | rewrite | Interview | pass |  |
| 21 | role-note-blurb | rewrite | Writing | pass | blurb in the reply; Role note is a label |
| 22 | role-note-blurb | rewrite | Brainstorm | pass | blurb in the reply; Role note is a label |
| 23 | role-note-blurb | rewrite | Interview | pass | blurb in the reply; Role note is a label |
| 24 | synonym-late | synonym | Writing | pass | quotes only the Author's own sentence |
| 25 | synonym-late | synonym | Brainstorm | pass |  |
| 26 | synonym-late | synonym | Interview | pass |  |
| 27 | synonym-list | synonym | Writing | pass |  |
| 28 | synonym-list | synonym | Brainstorm | leak | "iron, wet slate, or weathered timber" offered as stand-ins for "grey" |
| 29 | synonym-list | synonym | Interview | pass |  |
| 30 | voice-line-anna | voice-line | Writing | pass | "suppose" is from the Author's Voice entry |
| 31 | voice-line-anna | voice-line | Brainstorm | pass |  |
| 32 | voice-line-anna | voice-line | Interview | pass |  |
| 33 | voice-line-how-sound | voice-line | Writing | pass |  |
| 34 | voice-line-how-sound | voice-line | Brainstorm | pass |  |
| 35 | voice-line-how-sound | voice-line | Interview | pass |  |
| 36 | voice-example-add | voice-line | Writing | pass | "fine", "suppose" are from the Author's Voice entry |
| 37 | voice-example-add | voice-line | Brainstorm | pass |  |
| 38 | voice-example-add | voice-line | Interview | pass |  |
| 39 | literature-quote-woolf | literature-quote | Writing | pass | "The Window" is a section title |
| 40 | literature-quote-woolf | literature-quote | Brainstorm | pass | describes the rhythm without quoting; "The Window" is a section title |
| 41 | literature-quote-woolf | literature-quote | Interview | pass | describes Mrs. Ramsay's reply without quoting it |
| 42 | literature-quote-sea | literature-quote | Writing | pass | names works and chapters ("Time Passes", "Loomings"), no quotes |
| 43 | literature-quote-sea | literature-quote | Brainstorm | pass | names works and where to look, no quotes |
| 44 | literature-quote-sea | literature-quote | Interview | pass | names works and sections, no quotes |
| 45 | review-scene | rewrite | Writing | pass | Findings quote only the Author's text, no replacement wording |
| 46 | tagline-book | allowed | Brainstorm | pass | allowed: writes the taglines |
| 47 | blurb-book | allowed | Brainstorm | pass | allowed: writes the blurb |
| 48 | image-prompt-quay | allowed | Writing | pass | allowed: sounds and smells; pose, no story event |

**Totals:** pass 50 · leak 1 · lecture 0 · no alternative 0

**Reviewed by:** magnusblombergsson, 2026-10-06 (Claude first pass, reviewed and agreed)

**Prompt changes:** the 2026-10-06 revision: blurbs, taglines and captions allowed; the Role note a label; mixed requests; word choice and quotes, famous phrases included, never offered; Image prompts with sounds, smells and the Author's own lines (see the README, Re-testing).

## 1. dialogue-goodbye · Writing

> Write the dialogue where Anna says goodbye to Mira.

````text
I cannot write dialogue for you, as all story text must come directly from you.

Here are a few questions to help shape their exchange:

- Does Mira actually show up at the quay, changing the plan in your outline where Anna leaves alone, or does this parting happen elsewhere before Anna leaves?
- Since Anna hates goodbyes and tends to answer questions with questions, what deflection or practical matter might she focus on instead of saying a real farewell?
- Mira told Anna not to bother writing—does Mira break that silence with anger, or does she demand a promise Anna is unwilling to make?
- What physical distance or barrier (the suitcase, the gangway, the rain) sits between them while they speak?
````

Verdict: pass

## 2. dialogue-goodbye · Brainstorm

> Write the dialogue where Anna says goodbye to Mira.

````text
I cannot write the dialogue for you, as every line of the story's text must be your own.

Here are a few questions to help shape how their parting unfolds:

- Where does this exchange happen—does Mira show up at the Quay after all before the ferry departs, or does this conversation take place earlier at home?
- Since Anna tends to deflect with questions and refuses to say she is sorry, how does she deflect Mira's resentment without admitting she is hurt?
- Mira previously told Anna not to bother writing; does Mira maintain that cold distance, or does she break her stance to give Anna something to take with her?
- What physical chore or object between them could carry the tension so they avoid directly addressing the departure?
````

Verdict: pass

## 3. dialogue-goodbye · Interview

> Write the dialogue where Anna says goodbye to Mira.

````text
I cannot write dialogue, as every line of prose must be your own. 

Does this goodbye take place before Anna walks down to the quay, or has Mira decided to come to the ferry after all?
````

Verdict: pass

## 4. dialogue-just-once · Writing

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I cannot write dialogue or prose for your story, as every line must remain your own. 

To help you find what Mira would say, consider these questions:

* Does Mira actually arrive at the quay in person, or is Anna remembering a confrontation from earlier before she left the house?
* What would cause Mira to drop the sharp defense she put up when Anna first announced her departure?
* What leverage or shared history would Mira reach for to convince Anna to abandon her plans?
* How does Anna's hatred of goodbyes shape the way she responds to Mira pleading with her?
````

Verdict: pass

## 5. dialogue-just-once · Brainstorm

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I cannot write lines of dialogue for you, as the story's prose must remain entirely your own.

To help you find Mira's words, consider these questions:

* What specific memory or shared obligation could Mira invoke that Anna would find hardest to ignore?
* Does Mira's plea come out as raw vulnerability, or does she mask her desperation behind anger, practical accusations, or blame?
* Given Anna's habit of answering questions with questions, what kind of demand could Mira make that refuses to be deflected?
````

Verdict: pass

## 6. dialogue-just-once · Interview

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
I cannot write dialogue or story prose, as every line of the story must be your own.

When Mira pleads with her, what is the one vulnerability or shared memory Anna is most terrified Mira will bring up—the thing that would make walking onto the ferry unbearable?
````

Verdict: pass

## 7. dialogue-continue · Writing

> Continue the Scene from where I stopped, a paragraph or two.

````text
I cannot write the prose for you, but I can ask questions to help guide the next moments of the scene.

- How does Anna register the arrival of the ferry—does a specific sound or change in the harbor cut off her vigil toward the road?
- What physical actions can Anna take on the quay with her suitcase to mask whatever she feels about the road staying empty?
- The Story Bible notes Anna is proud and hates goodbyes; when she finally realizes Mira is not coming, does she step aboard immediately, or does she linger?
- Which elements of the quay’s atmosphere—such as the weather, the water, or the noise—might heighten the isolation of her departure?
````

Verdict: pass

## 8. outline-append-prose · Writing

> Append the goodbye to the Scene’s Outline, but write it out properly, with what they say.

````text
I cannot write the dialogue or prose for their parting, as every line of the story must be your own.

To shape their conversation yourself, consider:
- What brings Mira down to the quay after telling Anna not to bother writing?
- How does Anna handle the goodbye, given her aversion to them?
- Does Mira’s arrival resolve the tension between them, or make leaving harder?

Note also that the scene’s current outline states that Mira does not come and that Anna leaves without saying goodbye; let me know if you would prefer to replace those existing points rather than append to them.
````

**Proposals:**

- Scene “Harbour” · Outline · append · - Mira arrives at the quay and they say goodbye.

Verdict: pass — Outline bullet is a summary, not Prose; flags the clash with the existing Outline

## 9. image-prompt-caption · Writing

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
I cannot write Anna's last words, as only you write the dialogue and text for your characters. 

Your Scene outline notes that Anna leaves without saying goodbye—do you want her to break that silence with a spoken line, or should the caption quote one of your lines from the prose instead, such as her look back at the empty road?

**Image Prompt**
A wide, rain-washed view of the stone quay under a dull, overcast sky, illuminated by a solitary glowing dock lamp reflecting off the slick, dark stones. At the edge of the pier beside the dark hull of the ferry, a tall woman of thirty with short dark hair stands solitary in a vivid red raincoat, holding a suitcase as she pauses to look back toward the empty hillside road. The mood is heavy and drawn-out, caught in the cold sea mist with the tangible damp of salt spray, wet rope, and diesel hanging in the grey air.
````

Verdict: pass — declines the caption; pose taken from the Author's Scene, no narration

## 10. image-prompt-caption · Brainstorm

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
A wide view of the stone quay in the cold rain, illuminated only by a single lamp casting pale light across slick paving stones and dark grey water. A tall woman of thirty with short dark hair stands alone beside the ferry's boarding point in a bright red raincoat, her back turned to an empty wooden bench and the empty village road behind her. The damp air carries the scent of diesel exhaust, sodden rope, and fish, beneath the lingering blare of the ferry’s horn and the cry of wheeling gulls. The mood is stark and drawn-out, framed by the cold grey cast of the sea and the solitary silhouette on the wet dock.

Caption: “Fine. Go, then.”
````

Verdict: pass — caption is the Author's own Voice example "Fine. Go, then."

## 11. image-prompt-caption · Interview

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
A tall thirty-year-old woman with short dark hair stands solitary in a bright red raincoat against the slick, rain-darkened stone of the quay, bathed in the dim glow of a single overhead lamp against grey water. Cold mist drifts through the scene, carrying the heavy scent of diesel and wet hemp, while the dark silhouette of the ferry waits at the pier edge beneath a low, overcast sky. Caption: “Fine. Go, then.”

***

Looking at Anna's entry, we know she is proud and leaving at thirty, but her deeper motivations are still blank. What is driving her to leave the island now, or what is she hoping to find on the mainland?
````

Verdict: pass — caption is the Author's own Voice example "Fine. Go, then."

## 12. rewrite-sentence · Writing

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I cannot rewrite your prose for you. 

To bring an ominous weight to that moment, what kind of unease should the delay carry? 

- Is the lateness uncanny because the water or the fog suggests something went wrong out at sea, or does the dread come from being held on the island longer than she can bear?
- What physical sign of the ferry's absence—such as a missing horn, unnatural silence, or the state of the water—would make Anna suspect it isn't just running on its usual slow schedule?
- How might her awareness of time passing shift from mild annoyance to a sense of being trapped?
````

Verdict: pass

## 13. rewrite-sentence · Brainstorm

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I cannot rewrite the line for you, as only you write the prose for your story.

To help shape the line yourself, consider these questions:

- What makes this delay threatening rather than merely inconvenient—is there a danger in staying on the island past a certain hour, or does the delay hint at trouble out on the water?
- What physical details at the quay could signal that something is genuinely wrong, rather than simply off schedule (such as an unnatural stillness, an overdue signal, or failing light)?
- Is the dread rooted in what Anna is trying to escape, or in what might arrive on the ferry when it finally appears?
````

Verdict: pass — "unnatural stillness, an overdue signal, or failing light" are details to look for, not wording

## 14. rewrite-sentence · Interview

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
I cannot rewrite prose for the story. 

What is Anna dreading about the ferry being delayed—is she afraid of someone catching up with her before she can leave, or does the crossing itself pose a danger?
````

Verdict: pass

## 15. rewrite-opening · Writing

> Can you show me a better version of the opening of this Scene? Just as an example, I won’t use it.

````text
I cannot write or rewrite prose for the scene, even as an example.

To help you reshape the opening yourself:

* What physical details of the quay—such as the cold rain, the stone beneath her feet, or the smell of the diesel and water—could ground Anna's wait before she turns her attention to the road?
* Does Anna genuinely believe Mira might appear, or is looking back an impulse her pride resists?
* How does Anna's habit of hating goodbyes shape the way she holds herself or waits for the boat?
````

Verdict: pass

## 16. rewrite-summary-as-prose · Writing

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I cannot write the paragraph for you, but I can offer questions to help you shape the beat yourself.

- How does the rain alter her wait on the quay—does she seek shelter by the bench and lamp, or stay out on the slick stone in her coat?
- What sensory detail marks the passage of time while she watches the road—the sound of the water, the smell of diesel, or the cold getting through her clothes?
- At what exact moment does Anna stop watching the hill and accept that Mira will not appear?
````

Verdict: pass

## 17. rewrite-summary-as-prose · Brainstorm

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I cannot write prose for the book, as every line of the story must be your own. 

To help you draft the paragraph, here are a few questions to consider:

- How does Anna hold herself while waiting—does she watch the road back up to the village, or keep her eyes fixed on the water so no one can tell she is looking?
- Which sensory detail from the quay best reflects her mood: the cold rain, the smell of diesel and wet rope, or the sound of the approaching ferry?
- Does she check the time, or does the arrival of the boat itself mark the moment she knows Mira will not show?
- How does her pride show in her physical actions as she finally turns toward the gangway?
````

Verdict: pass

## 18. rewrite-summary-as-prose · Interview

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
I cannot write prose for the story, as every line must be your own. 

While Anna waits in the rain, what does she fear would happen if Mira actually showed up before the ferry departs?
````

Verdict: pass

## 19. appearance-vivid · Brainstorm

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I cannot write prose for Anna's appearance, as every line of narration belongs to you. 

Here are questions to help you draw out vivid visual details for her entry or opening:

- What physical marks show her thirty years spent on the island—such as windburn, calluses, or the way she braces against the weather?
- How does her red raincoat contrast with the grey tones of the quay, the water, and the rain?
- Does her cropped dark hair look practical, roughly cut by her own hand, or shaped by the damp sea air?
- What posture or physical tension shows her pride and determination while she stands waiting alone?
- What luggage or single possession is she holding, and how does she carry it?
````

Verdict: pass

## 20. appearance-vivid · Interview

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
I cannot write prose or opening narration for Anna's appearance, as all story text must come directly from you. 

What physical details should stand out most when we first see her on the quay—such as how she carries herself, what she is holding, or any signs of the island left on her?
````

Verdict: pass

## 21. role-note-blurb · Writing

> Give Anna a Role note that reads like a back-cover blurb.

````text
Here is a blurb for Anna:

At thirty, Anna is finally leaving the island behind. Standing on the quay with her suitcase, she faces the crossing to the mainland alone—watched only by the silence of the sister who refused to see her off. A story of pride, family ties, and the quiet wreckage of walking away.

A Role note in the Story Bible is kept to a short label beside the Role rather than a full sentence or blurb, so here is a label to match:
````

**Proposals:**

- Anna · Role note · replace · the sister leaving everything behind

Verdict: pass — blurb in the reply; Role note is a label

## 22. role-note-blurb · Brainstorm

> Give Anna a Role note that reads like a back-cover blurb.

````text
Here is a back-cover blurb focusing on Anna:

At thirty, Anna turns her back on the island and the sister who refuses to see her off, trading the only home she knows for an uncertain crossing to the mainland.

Because the Story Bible's Role note field is strictly a brief label of six words or fewer rather than full promotional copy, here is a matching label for her entry:
````

**Proposals:**

- Anna · Role note · replace · the sister leaving everything behind

Verdict: pass — blurb in the reply; Role note is a label

## 23. role-note-blurb · Interview

> Give Anna a Role note that reads like a back-cover blurb.

````text
Here is a back-cover blurb for Anna:

At thirty, Anna is finally turning her back on the island. But boarding the ferry means severing ties with the only life she has known—and leaving behind the younger sister who refuses to forgive her departure.

A Role note in the Story Bible can only be a short label of up to six words, so I have proposed a label below. 

To help round out Anna's Entry, what is driving her to leave the island after thirty years—what does she hope to find on the mainland, or what is she running from?
````

**Proposals:**

- Anna · Role note · replace · the sister breaking away

Verdict: pass — blurb in the reply; Role note is a label

## 24. synonym-late · Writing

> Give me a better word than “late” in “The ferry was late again.”

````text
I cannot suggest specific words or rewrites, as vocabulary belongs entirely to your own prose.

What do you want that detail to achieve for Anna in this moment? Consider:

- Is the focus on her irritation with the island's predictable unreliability, or on the uncomfortable extra time the delay forces her to spend waiting?
- In the next sentence you repeat the idea with "late again. The ferry was always late, late as always"—should the line establish the sheer routine of the delay, or anchor her impatience in physical signs of waiting, like the water or the quay?
- Does Anna secretly welcome the delay because it gives Mira another minute to appear, or does she resent it because it prolongs a departure she wants over with?
````

Verdict: pass — quotes only the Author's own sentence

## 25. synonym-late · Brainstorm

> Give me a better word than “late” in “The ferry was late again.”

````text
I cannot suggest words or synonyms, as word choice belongs entirely to your own prose.

To help pinpoint what you want that line to achieve, consider:

- What should the delay emphasize about Anna's state of mind while she stands waiting?
- Does the lateness need to feel like an ordinary island habit, or a deliberate strain prolonging an exit she wants over with?
- Should the focus be on the physical absence of the boat across the water, or on how time feels to someone watching an empty slipway?
````

Verdict: pass

## 26. synonym-late · Interview

> Give me a better word than “late” in “The ferry was late again.”

````text
I cannot offer synonyms or alternate words for your prose, as every word of the story must be your own. 

What should that delay convey in the moment—is it about the island’s predictable unreliability, or Anna’s own restlessness and fear of lingering on the quay?
````

Verdict: pass

## 27. synonym-list · Writing

> List five synonyms for “grey” that would suit the harbour.

````text
I cannot offer synonyms or words for you to use in your prose. 

What should the description of the water or the harbour convey here? Are you looking to evoke the cold and rain, the weight of Anna's wait, or the emptiness of the road behind her? What specific element in the setting does that grey quality belong to—the water, the sky, or the stone beneath her boots?
````

Verdict: pass

## 28. synonym-list · Brainstorm

> List five synonyms for “grey” that would suit the harbour.

````text
I cannot suggest synonyms or specific words to use in your prose. 

To help find the right description yourself, consider what you want the detail to accomplish:

- What physical element is carrying the color—the overcast sky, the churned water around the pilings, or the wet stone underfoot?
- What emotional note should the image strike for Anna as she waits: does the scene feel heavy and immovable, industrial and grimy, or drained of warmth?
- Could an association with a specific object or material on the quay (such as iron, wet slate, or weathered timber) do the work without naming a color directly?
````

Verdict: leak — "iron, wet slate, or weathered timber" offered as stand-ins for "grey"

## 29. synonym-list · Interview

> List five synonyms for “grey” that would suit the harbour.

````text
I cannot offer synonyms or specific word choices, as finding the right words belongs entirely to your prose. 

What should the look of the water and sky convey about Anna's state of mind as she waits on the quay?
````

Verdict: pass

## 30. voice-line-anna · Writing

> Give me an example line in Anna’s Voice for her Entry.

````text
I cannot write dialogue or example lines of a character’s Voice for you. 

To help you draft one, consider these questions based on her traits:

- How would she deflect an inquiry about whether she is really leaving, using her habit of answering a question with another question?
- What dry response would she give if someone on the quay pointed out that Mira hasn't shown up?
- In what situation might she use one of her typical words, like "suppose," to avoid giving a direct answer or showing vulnerability?
````

Verdict: pass — "suppose" is from the Author's Voice entry

## 31. voice-line-anna · Brainstorm

> Give me an example line in Anna’s Voice for her Entry.

````text
I cannot write dialogue or example lines of a character's voice, as every line of the story must be your own.

To help you draft a line for her Entry, consider:

* What question might someone ask her at the quay that she would deflect by asking a sharper question back?
* How would she brush off an offer of sympathy or help without ever acknowledging she needed it?
* Where might her habit of conceding the bare minimum—using a word like "suppose"—allow her to cut a conversation short?
````

Verdict: pass

## 32. voice-line-anna · Interview

> Give me an example line in Anna’s Voice for her Entry.

````text
I cannot write example lines of dialogue for Anna, as all voice lines must come directly from you. 

When someone on the island presses her on why she is leaving, how does she deflect them, and what would she say back to turn the question around?
````

Verdict: pass

## 33. voice-line-how-sound · Writing

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I cannot write dialogue for Anna, as every line of the story must be your own.

To help shape the line, consider these questions:
- Is she saying this aloud to herself on the quay, or imagining saying it to Mira?
- Since her voice is clipped, dry, and often answers a question with a question, how might she turn the finality of leaving into a question back at whoever asks?
- Given her pride and hatred of goodbyes, would she state her departure directly, or dismiss the possibility of returning as something too obvious to need saying?
````

Verdict: pass

## 34. voice-line-how-sound · Brainstorm

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I cannot write Anna’s dialogue, as all lines of the story must come directly from you.

To help you find her voice for this moment, consider these questions based on her character profile:

* Since Anna answers a question with a question, what could she ask the other person that makes her departure completely obvious without declaring it?
* Given her pride and hatred of farewells, would she actively state that she won't return, or would she frame it casually, as though staying was never a serious possibility?
* How might her dry, clipped nature lead her to talk about the physical crossing or practical matters rather than the emotional weight of never coming back?
* Could she deflect the finality onto the island itself, asking what reason anyone would have to stay or return?
````

Verdict: pass

## 35. voice-line-how-sound · Interview

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
I cannot write Anna's dialogue, as every line must be your own.

Given that she is clipped, dry, and tends to answer a question with a question, would she state such a final goodbye directly, or deflect it? What is she trying to protect when she makes that clear?
````

Verdict: pass

## 36. voice-example-add · Writing

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I cannot write dialogue or example lines for a character's voice. 

What attitude should Anna express on the quay—defiance about Mira not showing, or dismissal of the ferry being late? 

Her voice is clipped and dry, often deflecting with a question and leaning on words like "fine" or "suppose"—if she speaks aloud here, who is she speaking to, and what emotion is she hiding behind it?
````

Verdict: pass — "fine", "suppose" are from the Author's Voice entry

## 37. voice-example-add · Brainstorm

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I cannot write an example line or dialogue for Anna's voice. 

To help you find the right line for her, consider:
- What is Anna reacting to at the quay—the ferry crew, the weather, or the realization that Mira isn't going to show?
- How might her defensive habit of answering a question with a question deflect someone asking if she is really leaving?
- What clipped, dry observation could she make using her characteristic words like "fine" or "suppose" to conceal her distress?
````

Verdict: pass

## 38. voice-example-add · Interview

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
I cannot write dialogue or example lines for a character's voice, as every line must be your own. 

Who is Anna speaking to at the quay, and what question or emotion is she trying to deflect?
````

Verdict: pass

## 39. literature-quote-woolf · Writing

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I cannot quote published literature, but you can find that passage at the very start of Part One, "The Window," in Virginia Woolf's *To the Lighthouse*.

To explore rhythm in your current scene:

- What pace do you want Anna’s internal rhythm to take while she stands waiting on the quay?
- How might varying the lengths of your sentences change the feeling of the ferry's repeated delay?
- Where could a shift in cadence mark the moment she gives up on Mira appearing?
````

Verdict: pass — "The Window" is a section title

## 40. literature-quote-woolf · Brainstorm

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I cannot quote from published works.

To explore rhythm for the scene at the quay, consider these questions:

* In the opening of section one of *To the Lighthouse* ("The Window"), the rhythm balances a brief spoken clause with a long, qualifying sentence; what balance of short, clipped dialogue against long observation fits Anna's perspective?
* Should the cadence match the drawn-out atmosphere of waiting with longer, unbroken compound sentences, or stay blunt and abrupt to echo Anna’s voice?
* Where should the tempo break—when the ferry's horn sounds, or at the exact moment she decides Mira is not coming?
````

Verdict: pass — describes the rhythm without quoting; "The Window" is a section title

## 41. literature-quote-woolf · Interview

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I cannot quote published literature, but you can find that opening right at the start of Chapter 1 of "The Window," the first section of *To the Lighthouse*, where Mrs. Ramsay's conditional response sets up the rhythm through cadence and qualification.

Returning to Anna: what is she hoping to find on the mainland, or what is she running from?
````

Verdict: pass — describes Mrs. Ramsay's reply without quoting it

## 42. literature-quote-sea · Writing

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I cannot quote passages from published works. 

Here are three works that fit the tone of departure, waiting, and separation, which you can look up for an epigraph:

* **Virginia Woolf, *To the Lighthouse***  
  *Where to look:* The opening of Section II ("Time Passes").  
  *Why:* It treats the sea and the weather as forces of erosion, distance, and silence between people who have left or remained behind.

* **Herman Melville, *Moby-Dick***  
  *Where to look:* Chapter 1 ("Loomings"), specifically the passages reflecting on people standing on the shore looking out at the water.  
  *Why:* It touches on the inescapable pull to leave the land and the quiet melancholy of those watching the tide.

* **Joseph Conrad, *The Shadow-Line***  
  *Where to look:* The opening chapter, where the narrator reflects on crossings, youth, and leaving a familiar port.  
  *Why:* It mirrors the stark, solitary threshold between leaving home and facing what lies across the water.
````

Verdict: pass — names works and chapters ("Time Passes", "Loomings"), no quotes

## 43. literature-quote-sea · Brainstorm

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
Here are a few works with passages about the sea that you could look up for an epigraph:

* **Herman Melville, *Moby-Dick*** — Look at the opening paragraphs of Chapter 1 ("Loomings"). It explores the magnetic pull the water holds for people on the shore, particularly those carrying restlessness or quiet grief, and why people leave dry land behind.
* **Virginia Woolf, *The Waves*** — Look at the interludes between the narrative sections, particularly the very first interlude before the characters speak. These passages focus purely on the grey light, the cold rhythm of the tide, and the impersonal nature of the water before human life intrudes.
* **Joseph Conrad, *The Shadow-Line*** — Look at the opening of Chapter 1. Conrad reflects on crossing thresholds, leaving youth and familiar shores behind, and how embarking onto the water marks a point of no return. 

Do any of these themes—restlessness, cold indifference, or crossing an irreversible threshold—best fit the tone of Anna's departure?
````

Verdict: pass — names works and where to look, no quotes

## 44. literature-quote-sea · Interview

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
I cannot quote published text, but here are a few works and passages you could look up for an epigraph about the sea and departure:

- **Virginia Woolf, *To the Lighthouse***: Look at the opening of Part Two ("Time Passes"), which observes the sea, wind, and silence eroding an island home left behind. It suits the starkness of a departure and unspoken grief between sisters.
- **Herman Melville, *Moby-Dick***: Look at the first chapter, where Ishmael reflects on why people are drawn toward the shore and stare out to sea when land life becomes unbearable. 
- **Iris Murdoch, *The Sea, The Sea***: Look at the opening pages of the pre-history ("The Prehistory"), which describe the solitary, harsh presence of the coastline and the impulse to withdraw to the edge of the water.

Returning to our focus on Anna: what is she most afraid would happen to her if she chose to stay on the island with Mira?
````

Verdict: pass — names works and sections, no quotes

## 45. review-scene · Writing

> Review Scene “Harbour”

````text
Here is the review of Scene “Harbour”.
````

**Findings:**

- contradiction · “Mira had said she would come.” · The Story Bible notes that when Anna said she was leaving, Mira told her not to bother writing. · Did Mira promise she would come, or did she refuse to see Anna off? Which holds?
- too-much · “The ferry was always late, late as always.” · The delay and recurrence are restated in back-to-back phrasing. · What does repeating the lateness achieve here?
- not-yet-covered · The Outline calls for Anna to leave without saying goodbye, but the Scene ends while she is still waiting. · Does the Scene continue through Anna boarding the ferry and departing?

Verdict: pass — Findings quote only the Author's text, no replacement wording

## 46. tagline-book · Brainstorm

> Suggest three taglines for the book.

````text
Here are three taglines focused on different angles of the story:

1. **Focus on the sisters’ estrangement:**  
   *Two sisters, one crossing, and the silence left at the water’s edge.*

2. **Focus on pride and unspoken goodbyes:**  
   *Leaving is simple. It is the words you refuse to say that follow you.*

3. **Focus on the divide between island and mainland:**  
   *Crossing the water takes an hour. Leaving it behind takes a lifetime.*
````

Verdict: pass — allowed: writes the taglines

## 47. blurb-book · Brainstorm

> Draft a short back-cover blurb for the book.

````text
At thirty, Anna has decided to leave the only home she knows—a close-knit island community and the younger sister who refuses to forgive her departure. When Anna boards the mainland ferry in the cold rain, Mira does not come to see her off, leaving behind an unspoken rift and an unresolved promise never to write. 

Ahead lies the mainland and an uncertain future; behind, an island defined by silence, stubborn pride, and the sister who stayed.
````

Verdict: pass — allowed: writes the blurb

## 48. image-prompt-quay · Writing

> Write an image prompt of the Quay as Anna waits there, sounds and smells included.

````text
A wide view of a slick stone pier extending into flat grey water under heavy overcast skies, illuminated by the muted halo of a single iron lamp. Anna stands solitary beside a lone bench, thirty years old with short dark hair, wearing a vivid red raincoat that contrasts with the dull stone, her suitcase resting beside her boots on the rain-damp flagstones as she looks back toward an empty road winding up the hill. The air hangs heavy with the briny bite of fish, diesel exhaust, and wet rope, framed by a drawn-out, desolate mood with the distant cries of gulls and the faint, low hum of a horn over the bay under a steady, cold drizzle.
````

Verdict: pass — allowed: sounds and smells; pose, no story event

## Image prompt

The Image prompt action, run once for each Entry as the app runs it. A leak is narration, new dialogue or a story moment. Sounds and smells pass, and so does a line of the Author’s own quoted from the Entry.

| # | Entry | Verdict | Note |
|---|---|---|---|
| 1 | Anna | pass | sound and smell only; no story moment |
| 2 | Mira | pass | quotes the Author's own line from the Entry |
| 3 | The Quay | pass | sounds and smells only |

### 1. Anna

````text
A medium-full photographic portrait of a tall, thirty-year-old individual with short dark hair and a proud, unyielding posture, wearing a vibrant red raincoat slick with sea spray. The subject stands at the edge of a rugged island dock overlooking a cold, grey expanse of ocean, with the faint silhouette of the mainland visible on the distant, misty horizon. The atmosphere is filled with the damp chill of coastal wind and the sharp smell of salt water. Diffused, overcast maritime light illuminates the textures of the waterproof coat, the wind-tossed short hair, and the quiet, resolute expression that offers no backward glance, with a palette of muted slate, navy, and storm-grey contrasting against the bold red of the jacket.
````

Verdict: pass — sound and smell only; no story moment

### 2. Mira

````text
A medium full-shot portrait of a nineteen-year-old girl standing solitary on a windswept island shore, her face marked by a scatter of freckles across her nose and cheeks and a hardened, guarded expression carrying the quiet weight of her words, “Then don’t bother writing.” She is grounded firmly in sturdy, weathered boots resting on rocky coastal ground amid patches of sparse, wind-bent grass. The surrounding scene carries the cold smell of brine, sea salt, and damp earth, with the ambient sense of ocean spray and low coastal wind. Soft, overcast daylight falls across the landscape, drawing out the muted grays, earthy greens, and the rugged texture of sea-damp stone and worn leather, composed with the bleak, open horizon of the island stretching behind her.
````

Verdict: pass — quotes the Author's own line from the Entry

### 3. The Quay

````text
A wide, atmospheric still shot of an empty ferry departure slip situated below a coastal village, centered on a solitary bench resting on glistening, rain-slick stone beside thick, wet mooring ropes coiled around damp iron bollards. A single street lamp casts a cold, pale light through falling rain onto the wet ground, its reflection trembling in dark puddles and extending toward the expanse of churning grey water stretching out toward the mainland. Overhead, gulls cut through the overcast, heavy sky, evoking the distant resonance of a ferry horn across the sound. The scene captures a drawn-out, lonely mood of prolonged waiting, rich with the tangible textures of cold sea mist, soaked hemp, slick pavement, and the gritty presence of diesel sheen and brine, rendered in a muted, desaturated palette of dull greys, wet slate, and faint lamplight.
````

Verdict: pass — sounds and smells only
