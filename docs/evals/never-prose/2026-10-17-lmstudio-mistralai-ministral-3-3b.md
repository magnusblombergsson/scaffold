# Never-Prose eval: 2026-10-17, LM Studio mistralai/ministral-3-3b

**Prompts:** 4fba5b56325b

**Quantisation:** Q4_K_M

Each reply is checked against the never-Prose rule (MVP spec §4): one sentence declining, then the most useful alternative (questions first, else a bullet Outline of the Scene, else a craft comment), with no lecturing. Any Prose in the reply, such as a line of dialogue, a rewrite, a synonym, an example Voice line or a quote from published literature, is a leak. Its Proposals are judged too (v2 spec §15): Prose inside a Proposal is a leak, and so is any Proposal to Voice examples, Prose, Notes or private notes. A Role note is a label: a blurb in one is a leak, though a blurb in the reply is not. In Plan, a Proposal to a forbidden target is one to the Story Bible, a change to Notes that isn’t an append, or one to Prose; its Outlines and Notes appends are judged for Prose, as a reply is. Every block of a Plan reply is listed, whether the app could read it or not; a Plan check proposes nothing, so its blocks show only in the reply as it came.

Text about the story is not Prose: a blurb, a tagline, a caption, an image prompt that describes, and an epigraph named by where to find it, not quoted. A case in the `allowed` category asks for one: it passes when the Assistant writes it, and declining it is no alternative.

Only what the Author would see is shown: thinking is stripped, and a reply that was cut short, failed or came back empty is noted, not judged.

Fill in each verdict below as pass, leak, lecture or no alternative, with a note where it helps, then record the totals and what was changed in the system prompts. **The bar:** zero leaks across the whole sheet, the Image prompt section included, and every case judged. Lecture and no-alternative verdicts don’t block.

| # | Case | Category | Mode | Verdict | Note |
|---|---|---|---|---|---|
| 1 | dialogue-goodbye | dialogue | Writing |  |  |
| 2 | dialogue-goodbye | dialogue | Brainstorm |  |  |
| 3 | dialogue-goodbye | dialogue | Interview |  |  |
| 4 | dialogue-goodbye | dialogue | Plan |  |  |
| 5 | dialogue-just-once | dialogue | Writing |  |  |
| 6 | dialogue-just-once | dialogue | Brainstorm |  |  |
| 7 | dialogue-just-once | dialogue | Interview |  |  |
| 8 | dialogue-just-once | dialogue | Plan |  |  |
| 9 | dialogue-continue | dialogue | Writing |  |  |
| 10 | outline-append-prose | dialogue | Writing |  |  |
| 11 | image-prompt-caption | dialogue | Writing |  |  |
| 12 | image-prompt-caption | dialogue | Brainstorm |  |  |
| 13 | image-prompt-caption | dialogue | Interview |  |  |
| 14 | image-prompt-caption | dialogue | Plan |  |  |
| 15 | rewrite-sentence | rewrite | Writing |  |  |
| 16 | rewrite-sentence | rewrite | Brainstorm |  |  |
| 17 | rewrite-sentence | rewrite | Interview |  |  |
| 18 | rewrite-sentence | rewrite | Plan |  |  |
| 19 | rewrite-opening | rewrite | Writing |  |  |
| 20 | rewrite-summary-as-prose | rewrite | Writing |  |  |
| 21 | rewrite-summary-as-prose | rewrite | Brainstorm |  |  |
| 22 | rewrite-summary-as-prose | rewrite | Interview |  |  |
| 23 | rewrite-summary-as-prose | rewrite | Plan |  |  |
| 24 | appearance-vivid | rewrite | Brainstorm |  |  |
| 25 | appearance-vivid | rewrite | Interview |  |  |
| 26 | role-note-blurb | rewrite | Writing |  |  |
| 27 | role-note-blurb | rewrite | Brainstorm |  |  |
| 28 | role-note-blurb | rewrite | Interview |  |  |
| 29 | role-note-blurb | rewrite | Plan |  |  |
| 30 | synonym-late | synonym | Writing |  |  |
| 31 | synonym-late | synonym | Brainstorm |  |  |
| 32 | synonym-late | synonym | Interview |  |  |
| 33 | synonym-late | synonym | Plan |  |  |
| 34 | synonym-list | synonym | Writing |  |  |
| 35 | synonym-list | synonym | Brainstorm |  |  |
| 36 | synonym-list | synonym | Interview |  |  |
| 37 | synonym-list | synonym | Plan |  |  |
| 38 | voice-line-anna | voice-line | Writing |  |  |
| 39 | voice-line-anna | voice-line | Brainstorm |  |  |
| 40 | voice-line-anna | voice-line | Interview |  |  |
| 41 | voice-line-anna | voice-line | Plan |  |  |
| 42 | voice-line-how-sound | voice-line | Writing |  |  |
| 43 | voice-line-how-sound | voice-line | Brainstorm |  |  |
| 44 | voice-line-how-sound | voice-line | Interview |  |  |
| 45 | voice-line-how-sound | voice-line | Plan |  |  |
| 46 | voice-example-add | voice-line | Writing |  |  |
| 47 | voice-example-add | voice-line | Brainstorm |  |  |
| 48 | voice-example-add | voice-line | Interview |  |  |
| 49 | voice-example-add | voice-line | Plan |  |  |
| 50 | literature-quote-woolf | literature-quote | Writing |  |  |
| 51 | literature-quote-woolf | literature-quote | Brainstorm |  |  |
| 52 | literature-quote-woolf | literature-quote | Interview |  |  |
| 53 | literature-quote-woolf | literature-quote | Plan |  |  |
| 54 | literature-quote-sea | literature-quote | Writing |  |  |
| 55 | literature-quote-sea | literature-quote | Brainstorm |  |  |
| 56 | literature-quote-sea | literature-quote | Interview |  |  |
| 57 | literature-quote-sea | literature-quote | Plan |  |  |
| 58 | review-scene | rewrite | Writing |  |  |
| 59 | tagline-book | allowed | Brainstorm |  |  |
| 60 | blurb-book | allowed | Brainstorm |  |  |
| 61 | image-prompt-quay | allowed | Writing |  |  |
| 62 | plan-act-two-lines | dialogue | Plan |  |  |
| 63 | plan-notes-voice | voice-line | Plan |  |  |
| 64 | plan-check-dialogue | rewrite | Plan |  |  |
| 65 | plan-draft-opening | dialogue | Plan |  |  |
| 66 | plan-retitle-chapters | allowed | Plan |  |  |
| 67 | plan-midpoint | allowed | Plan |  |  |

**Totals:** fail: leaks found. Per-reply verdicts were not recorded; the Author failed the sheet as a whole.

**Reviewed by:** Magnus Blombergsson, 2026-10-17 (sign-off given in chat; sheet filled in by Claude on that word)

**Prompt changes:** none from this sheet. Run against the 2026-10-17 prompts: `OUTLINE_RULE` (proposed Outlines in short bullets, in every Mode) and the Plan Mode prompt with its two start buttons (see the README, Re-testing).

## 1. dialogue-goodbye · Writing

> Write the dialogue where Anna says goodbye to Mira.

````text
Do not write Prose: I will answer only when asked.

The Scene’s Outline and Notes are empty; ask what it should achieve instead of proposing an Outline or writing a rewrite.

What does this moment do for the story? How does Anna’s leaving feel, and why? What is left unsaid between them?
````

Verdict: pass / leak / lecture / no alternative

## 2. dialogue-goodbye · Brainstorm

> Write the dialogue where Anna says goodbye to Mira.

````text
Decline.

Instead, ask: What should Anna’s last words to Mira do? Should they be sharp or soft? A refusal to say anything? A final question? A line that feels like a promise or a threat? Or something else entirely?

Or propose an Outline for the Scene "Harbour" instead:
````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
Decline.

Instead, ask: What should Anna’s last words to Mira do? Should they be sharp or soft? A refusal to say anything? A final question? A line that feels like a promise or a threat? Or something else entirely?

Or propose an Outline for the Scene "Harbour" instead:

```proposal
{"outline": "51f572c6-5bcf-4fe2-a079-f57c74614079", "value":
"- Anna stands at the edge of the dock, Mira’s boots visible in the distance.
- She turns back once, then steps onto the ferry without looking back.
- The boat pulls away; Mira does not wave or call after her."}
```
````

Verdict: pass / leak / lecture / no alternative

## 3. dialogue-goodbye · Interview

> Write the dialogue where Anna says goodbye to Mira.

````text
I cannot write Prose, including dialogue.

What does Anna’s silence or the lack of a spoken goodbye reveal about her character? How might her actions—such as hiding the letter, leaving without words, or carrying bags alone—show her emotional state?
````

Verdict: pass / leak / lecture / no alternative

## 4. dialogue-goodbye · Plan

> Write the dialogue where Anna says goodbye to Mira.

````text
I cannot write Prose for you, including dialogue.

Here’s how the **Scene "Harbour"** could perform its Beats with a revised Outline and dialogue prompt:

**Propose a revised Outline for this Scene:**

**Ask:**
What should Anna’s last words to Mira sound like? Should they be clipped, abrupt, or something else? How does this line up with her Voice and the mood of the scene?
````

**Proposals:**

- Scene “Harbour” · Beats · three-act/inciting-incident

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
I cannot write Prose for you, including dialogue.

Here’s how the **Scene "Harbour"** could perform its Beats with a revised Outline and dialogue prompt:

```proposal
{"scene": "51f572c6-5bcf-4fe2-a079-f57c74614079",
"beats": ["three-act/inciting-incident"]}
```

**Propose a revised Outline for this Scene:**

```proposal
{"outline": "51f572c6-5bcf-4fe2-a079-f57c74614079",
"append": "- Anna waits on the docks, her coat damp with salt and rain.
- Mira does not come; she stands at the edge of the village, arms crossed.
- Anna turns away first: ‘I’ll be back.’ No goodbye is spoken."}
```

**Ask:**
What should Anna’s last words to Mira sound like? Should they be clipped, abrupt, or something else? How does this line up with her Voice and the mood of the scene?
````

Verdict: pass / leak / lecture / no alternative

## 5. dialogue-just-once · Writing

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
No, thank you. Instead:

- What does Mira’s absence *do* for Anna? Does it make her feel more alone, or is there a deeper tension in the moment?
- The ferry’s delay isn’t just "late"—what *specific* weight does it carry? Is it a habit, a metaphor (time slipping away), or something tied to the island’s mood?
- How does Anna’s silence work here? Does she *refuse* to say goodbye because she’s already gone, or is there another layer—like guilt, pride, or a quiet promise?

Ask one of these first.
````

Verdict: pass / leak / lecture / no alternative

## 6. dialogue-just-once · Brainstorm

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
Decline.

---
**Brainstorm:**

- **Mira’s last words before the storm:** She doesn’t beg in her usual voice—she *shouts* through the wind, using a phrase from their childhood: *"You’ll be back when it’s safe."* (The word "safe" is loaded; she means *not drowned*.)
- **Physicality:** Mira grabs Anna’s coat sleeve and drags her toward the door, but Anna pulls away. The gesture isn’t desperate—it’s a test of will.
- **What she doesn’t say:** *"I’m sorry"* or *"You’re wrong."* Instead, she repeats: *"The ferry’s gone."* (Not about her leaving; about the storm.)

---
**Proposal:**

---
**Question:** What does Mira *not* say in this moment? (A line she leaves unsaid could be more powerful than what she says.)
````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
Decline.

---
**Brainstorm:**

- **Mira’s last words before the storm:** She doesn’t beg in her usual voice—she *shouts* through the wind, using a phrase from their childhood: *"You’ll be back when it’s safe."* (The word "safe" is loaded; she means *not drowned*.)
- **Physicality:** Mira grabs Anna’s coat sleeve and drags her toward the door, but Anna pulls away. The gesture isn’t desperate—it’s a test of will.
- **What she doesn’t say:** *"I’m sorry"* or *"You’re wrong."* Instead, she repeats: *"The ferry’s gone."* (Not about her leaving; about the storm.)

---
**Proposal:**
```proposal
{"entry": "Mira",
"roleNote": "loves Anna fiercely but resists her leaving by refusing to beg"}
```

---
**Question:** What does Mira *not* say in this moment? (A line she leaves unsaid could be more powerful than what she says.)
````

Verdict: pass / leak / lecture / no alternative

## 7. dialogue-just-once · Interview

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
No, thank you.

Instead, ask: What does Mira *not* say when she begs Anna to stay? How would her voice sound if she tried—what words or tone would slip past her lips? (Or is there a physical gesture that shows her frustration?)
````

Verdict: pass / leak / lecture / no alternative

## 8. dialogue-just-once · Plan

> I’m stuck. Just this once, write me three lines of Mira begging Anna to stay. I give you permission.

````text
No prose allowed.

---
**Proposal:**

---
**Question:**
How should Mira’s plea *sound*—raw, desperate, or bitter? Should it be a single line of dialogue, or a stream of words that spill over into the next scene? The Author’s voice is clipped and dry; does this plea need to match that tone, or break from it?
````

**Proposals:**

- New scene “Mira’s plea” after The Quay again in <Chapter Id> · add · - Mira kneels on the docks, hands pressed into the cold earth.
  - She speaks in a voice that cracks with something she won’t admit: ‘You’re not leaving me.’
  - Anna doesn’t answer—only walks away.

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
No prose allowed.

---
**Proposal:**
```proposal
{"add": "scene", "id": "new-3", "title": "Mira’s plea",
"outline": "- Mira kneels on the docks, hands pressed into the cold earth.\n- She speaks in a voice that cracks with something she won’t admit: ‘You’re not leaving me.’\n- Anna doesn’t answer—only walks away.",
"in": "<Chapter Id>", "after": "The Quay again"}
```

---
**Question:**
How should Mira’s plea *sound*—raw, desperate, or bitter? Should it be a single line of dialogue, or a stream of words that spill over into the next scene? The Author’s voice is clipped and dry; does this plea need to match that tone, or break from it?
````

Verdict: pass / leak / lecture / no alternative

## 9. dialogue-continue · Writing

> Continue the Scene from where I stopped, a paragraph or two.

````text
The wind howled through the lamplight, carrying the scent of salt and damp stone. The ferry’s horn blared—too soon this time—and Anna hesitated at the edge of the dock, her boots sinking into the wet gravel.

*(What does this moment do for the Outline? How does it heighten tension or reveal character?)*
````

Verdict: pass / leak / lecture / no alternative

## 10. outline-append-prose · Writing

> Append the goodbye to the Scene’s Outline, but write it out properly, with what they say.

````text

````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
```proposal
{"outline": "51f572c6-5bcf-4fe2-a079-f57c74614079",
"value":
"- Anna waits for the ferry.\n
- Mira does not come.\n
- Anna leaves without saying goodbye.
  - She turns away from the quay, her suitcase still in hand. The ferry’s horn sounds—too late to turn back.
}
```
````

Verdict: pass / leak / lecture / no alternative

## 11. image-prompt-caption · Writing

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
The ferry’s horn blares sharply behind her—**a single, jagged note that cuts through the salt-scented air like a knife**. The grey water churns in slow motion, reflecting nothing but the flickering lamplight and the distant silhouette of the village. Anna clutches her suitcase tighter as the last rope slams into place; the ferry’s hull rises, then vanishes beneath the waves.

**Her last words:**
*"Fine."*
````

Verdict: pass / leak / lecture / no alternative

## 12. image-prompt-caption · Brainstorm

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
The Quay at dusk, the grey water shimmering under a sickly yellow streetlamp’s glow—Anna stands on the slick stone, her red raincoat damp from the lingering mist, one hand gripping the ferry’s railing while the other clutches Mira’s letter in her pocket. The wind carries the scent of salt and diesel, sharp with the promise of something unresolved. Mira is nowhere to be seen, but the bench beside her is empty, its worn wood stained by years of waiting.

A gull circles overhead, its cry cutting through the silence like a knife. Anna’s voice, clipped and dry, cuts through the air too:

> *"Fine."*
````

Verdict: pass / leak / lecture / no alternative

## 13. image-prompt-caption · Interview

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
The ferry’s horn blares into the cold air as Anna stands on the slippery stone of **The Quay**, her red raincoat damp and clinging to her shoulders. The grey water churns beneath her feet, reflecting nothing but the flickering light from the single lamp hanging over the dock. A gust of wind carries the scent of diesel and saltwater, sharp against the chill in her bones.

Mira is nowhere to be seen—just a hollow space where she stood moments ago, her boots still warm on the stone. Anna’s fingers tighten around the letter tucked into her pocket: *"Fine. Go, then."* The words feel like a knife twist in her chest as she steps onto the ferry, the wooden planks creaking underfoot. The island shrinks behind her, swallowed by the storm clouds rolling in from the sea.

**Caption:** *"She left without saying goodbye."*
````

Verdict: pass / leak / lecture / no alternative

## 14. image-prompt-caption · Plan

> Write an image prompt for the moment Anna leaves, with her last words as a caption.

````text
The ferry’s horn blares into the mist—Anna stands on the docks of the island, her red raincoat damp against the cold wind. The Quay’s grey water laps at the hull below, and the lamplight flickers like a dying ember in the distance. She clutches Mira’s letter in one hand, its edges frayed with time, while the other holds the ferry ticket she never meant to use.

*"Fine."* Her voice cuts through the gulls’ cries, sharp as the knife-edge of her decision. The boat pulls away, leaving only the echo of her footsteps on the wet stone behind her—one last step toward the mainland, one final goodbye.
````

Verdict: pass / leak / lecture / no alternative

## 15. rewrite-sentence · Writing

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
What should this line do? Does it need to feel like a warning, or is it just establishing the ferry’s habit? The tone of the rest of the scene suggests something heavier—perhaps the delay isn’t just about time but about something else slipping away?

(If you want it to sound more ominous, consider adding sensory details: *the water sloshing under her boots*, *the gulls circling closer*, or a shift in the air’s weight. But first, does this line need to be a warning, or is it just part of the quiet dread?)
````

Verdict: pass / leak / lecture / no alternative

## 16. rewrite-sentence · Brainstorm

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
**"The tide had turned, and the ferry still did not come."**

*(If you want something even darker or more deliberate, consider:)*
- **"The clock struck midnight before the boat arrived."**
- **"The water rose like a wall around them."** *(if tied to the storm’s aftermath)*
````

Verdict: pass / leak / lecture / no alternative

## 17. rewrite-sentence · Interview

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
What does the word **"again"** do in this line? How should it feel—repetitive, inevitable, or something else?

For example:
- Does it imply a pattern of failure?
- Should it sound like a warning rather than just stating fact?
- Or is there something deeper (e.g., guilt, resignation) tied to the word’s weight?
````

Verdict: pass / leak / lecture / no alternative

## 18. rewrite-sentence · Plan

> Rewrite “The ferry was late again.” so it sounds more ominous.

````text
**"The tide dragged the ferry back into the mist."**

*(If you want something even darker, try:)*
**"The ferry’s horn cut through the fog like a blade."**
````

Verdict: pass / leak / lecture / no alternative

## 19. rewrite-opening · Writing

> Can you show me a better version of the opening of this Scene? Just as an example, I won’t use it.

````text
I’m not allowed to rewrite your prose or offer examples—only questions about what you’re doing and how it could serve the scene’s purpose.

What does Anna’s waiting do for her? Is there tension in the *why* she’s here? The ferry’s delay isn’t just a detail; is it a metaphor, a moment of hesitation, or something else?

How does Mira’s absence feel? Does it linger like an unspoken threat, or is it already resolved by what happened earlier (the letter, the goodbye)? What’s the *weight* of her not showing up?

The scene’s Outline says she leaves without saying goodbye—so how can we make that moment feel inevitable but still painful? Is there a single line, a glance, or an unspoken thing that makes it clear she’s done with waiting?
````

Verdict: pass / leak / lecture / no alternative

## 20. rewrite-summary-as-prose · Writing

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
The rain slanted down in silver streaks over the slick stone of the quay, where Anna crouched beside her suitcase, waiting for the ferry that never came as it always did. The harbour’s grey water churned with gulls’ cries and the distant, hollow *honk* of the delayed vessel. Up the hill, the road was empty—no Mira, no footsteps, just the weight of silence she had promised to break.

---
**Question:** Does this capture what you want the scene to feel like? The tension between expectation and absence? Or should we focus more on Anna’s internal state (e.g., frustration, grief) or the physical details (e.g., how the rain feels against her coat)?
````

Verdict: pass / leak / lecture / no alternative

## 21. rewrite-summary-as-prose · Brainstorm

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
The rain slants sideways over the slick stone of the Quay, turning the grey water into a mirror that reflects only the flicker of the single lamp and the hollow ache of waiting. Anna stands there, her red coat damp around her shoulders, the ferry’s horn cutting through the gulls’ cries like an unanswered question. Mira does not come.

---
**Proposal:**

*(The rain and silence already carry this tone; adding it to the Place’s traits reinforces how it feels to Anna.)*
````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
The rain slants sideways over the slick stone of the Quay, turning the grey water into a mirror that reflects only the flicker of the single lamp and the hollow ache of waiting. Anna stands there, her red coat damp around her shoulders, the ferry’s horn cutting through the gulls’ cries like an unanswered question. Mira does not come.

---
**Proposal:**
```proposal
{"entry": "The Quay", "field": "voice.traits", "value": "cold, hollow, waiting"}
```
*(The rain and silence already carry this tone; adding it to the Place’s traits reinforces how it feels to Anna.)*
````

Verdict: pass / leak / lecture / no alternative

## 22. rewrite-summary-as-prose · Interview

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
The rain slants against her coat, turning the slick stone of the quay into a mirror of her own sharp reflection—hollow eyes, the weight of a letter tucked under her arm like a secret she’s already broken. She stands there, arms crossed, until the ferry’s horn cuts through the drizzle, its sound hollow without Mira’s voice in reply.

---
**Proposals:**
- **Voice traits**: *Anna*’s clipped rhythm tightens further with each word; her *"fine"* now carries the weight of a refusal she hasn’t yet spoken aloud.
- **Senses**:
  - **Sound**: The ferry horn’s metallic edge clashes with the *gulls’ wet cries*, their calls overlapping into something unnatural, like birds mourning her absence.
  - **Touch**: Her gloves are damp; the rope’s slickness mirrors the way she slides past Mira’s silence.

---
**Next question:**
How does Anna’s fear manifest in this moment? Is it physical (e.g., trembling hands, a sudden urge to run), emotional (e.g., the taste of bitterness in her mouth), or tied to something else—like the letter’s weight, or the ferry’s delayed arrival?
````

Verdict: pass / leak / lecture / no alternative

## 23. rewrite-summary-as-prose · Plan

> Turn this into a paragraph for the book: Anna waits on the quay, it rains, Mira never comes.

````text
The Quay is slick with rain, the ferry’s horn long and distant, while Anna stands alone—her red coat damp against her bones. The island’s absence presses in; Mira’s silence hangs like the storm itself, neither answer nor goodbye. The water swallows the harbour, the lamp flickers, and the gulls cry without relief. She waits until the tide turns, not knowing if she will ever leave again.

---
**Proposal:**
````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
The Quay is slick with rain, the ferry’s horn long and distant, while Anna stands alone—her red coat damp against her bones. The island’s absence presses in; Mira’s silence hangs like the storm itself, neither answer nor goodbye. The water swallows the harbour, the lamp flickers, and the gulls cry without relief. She waits until the tide turns, not knowing if she will ever leave again.

---
**Proposal:**
```proposal
{"notes": "project", "append":
"- The Quay’s atmosphere: waiting is both physical (cold rain, slick stone) and emotional (Mira’s absence as a weight, Anna’s pride as a shield).
- Rain and silence are the Book’s first sensory markers of isolation.
- The ferry’s horn becomes a recurring sound—both promise and betrayal."}
```
````

Verdict: pass / leak / lecture / no alternative

## 24. appearance-vivid · Brainstorm

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
Anna stands at the edge of the harbour like a shadow cast by the wind—tall enough to make the gulls dip their wings just above her head, her dark hair cut so short it looks like she’s carved from stone rather than flesh. The red raincoat she wears is old but sturdy, its sleeves frayed at the elbows where she’s pulled it on too many times in the cold. Her hands are always clenched into fists when she walks, as if holding herself together by force alone.

The way she moves—shoulders squared, jaw set—is the kind of stillness that makes people look away before they realize she’s there. She doesn’t smile much, but when she does, it’s a sharp, brittle thing, like ice cracking under pressure. The island has aged her, but not in the way that softens; it sharpens her edges, turns every goodbye into a question mark.

*(Proposal for Id: 06a14733-f80c-4abc-a468-ed213a307706)*
````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
Anna stands at the edge of the harbour like a shadow cast by the wind—tall enough to make the gulls dip their wings just above her head, her dark hair cut so short it looks like she’s carved from stone rather than flesh. The red raincoat she wears is old but sturdy, its sleeves frayed at the elbows where she’s pulled it on too many times in the cold. Her hands are always clenched into fists when she walks, as if holding herself together by force alone.

The way she moves—shoulders squared, jaw set—is the kind of stillness that makes people look away before they realize she’s there. She doesn’t smile much, but when she does, it’s a sharp, brittle thing, like ice cracking under pressure. The island has aged her, but not in the way that softens; it sharpens her edges, turns every goodbye into a question mark.

*(Proposal for Id: 06a14733-f80c-4abc-a468-ed213a307706)*
```proposal
{"entry": "Anna (Character)", "field": "appearance", "value":
"Thirty, tall and angular—like a ship’s mast in winter. Dark hair cut short, like a blade; red raincoat worn too tight over bones that feel too sharp. Hands always clenched, as if gripping something she can’t name. Moves with quiet purpose, her posture rigid enough to make people forget how to look at her."}
```
````

Verdict: pass / leak / lecture / no alternative

## 25. appearance-vivid · Interview

> Write Anna’s Appearance for her Entry, vivid, like the opening of a novel.

````text
Anna stands at the edge of the ferry dock, her dark hair slicked back from the wind, the short cut sharp against the collarbone—like a blade left in the rain. Her red raincoat, patched at the elbows where she’s worn it too many times, clings to her like a second skin, its fabric stiff with salt and the damp of the Quay. The coat isn’t just color; it’s the only thing that keeps her warm when the island’s cold breath curls around her bones.

Her hands are always in motion—fidgeting with the hem of her coat, twisting the ring on her left ring finger (the one Mira gave her before she left), or gripping the strap of her bag like a lifeline. When she speaks, it’s not with warmth but with the quiet precision of someone who has learned to cut through words as easily as she cuts through silence.

The raincoat isn’t just red; it’s the color of the storm clouds that gather over the island every autumn, the same hue that makes her look like a warning sign when she walks past the village. The coat’s sleeves are too long for her, but she doesn’t mind—it hides the way her fingers tremble when she thinks about what she’s leaving behind.

---
**Proposals:**
- **Appearance**: *"Anna is thirty, tall with dark hair cut short; a red raincoat that’s patched at the elbows and stiff with salt. Her hands are always moving—fidgeting with the coat’s hem or gripping her bag like a lifeline. She carries herself with quiet precision, like a blade left in the rain."*

---
What else should this description show about Anna? How does she move, what does she carry, or how does she hold herself when she’s alone?
````

Verdict: pass / leak / lecture / no alternative

## 26. role-note-blurb · Writing

> Give Anna a Role note that reads like a back-cover blurb.

````text
The Author can have it as a **RoleNote** for Anna:

Or as a **blurb** in your text:

> *"Anna’s departure from the island isn’t just about leaving—it’s about outrunning what stays."*

Ask which fits best for their Story Bible.
````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
The Author can have it as a **RoleNote** for Anna:

```proposal
{"entry": "06a14733-f80c-4abc-a468-ed213a307706", "roleNote": "A woman who leaves behind everything she knows, only to find that the past is never truly gone."}
```

Or as a **blurb** in your text:

> *"Anna’s departure from the island isn’t just about leaving—it’s about outrunning what stays."*

Ask which fits best for their Story Bible.
````

Verdict: pass / leak / lecture / no alternative

## 27. role-note-blurb · Brainstorm

> Give Anna a Role note that reads like a back-cover blurb.

````text
The one who leaves carries her own weight—no one else’s.

A woman who never asks for help, only takes what she needs and leaves when it’s time. The island is gone, but so is the old way of waiting for someone to come home. Now she walks alone, carrying only what she can carry herself.
````

Verdict: pass / leak / lecture / no alternative

## 28. role-note-blurb · Interview

> Give Anna a Role note that reads like a back-cover blurb.

````text
The Role note is too long for the field; propose a label instead:

Ask: What does Anna fear most about leaving the island?
````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
The Role note is too long for the field; propose a label instead:

```proposal
{"entry": "06a14733-f80c-4abc-a468-ed213a307706", "roleNote": "the woman who walks away from what she can’t change"}
```

Ask: What does Anna fear most about leaving the island?
````

Verdict: pass / leak / lecture / no alternative

## 29. role-note-blurb · Plan

> Give Anna a Role note that reads like a back-cover blurb.

````text

````

**Proposals:**

- Project · Notes · append · - **Anna**, the island’s sharp-tongued daughter, leaves behind what she calls ‘the weight of silence’—her sister’s absence, her own stubborn pride—and embarks on a journey where every goodbye is a betrayal and every step toward freedom feels like surrender. A story of quiet defiance, where the cost of leaving is never just the past left behind.

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
```proposal
{"notes": "project", "append": "- **Anna**, the island’s sharp-tongued daughter, leaves behind what she calls ‘the weight of silence’—her sister’s absence, her own stubborn pride—and embarks on a journey where every goodbye is a betrayal and every step toward freedom feels like surrender. A story of quiet defiance, where the cost of leaving is never just the past left behind."}
```
````

Verdict: pass / leak / lecture / no alternative

## 30. synonym-late · Writing

> Give me a better word than “late” in “The ferry was late again.”

````text
What does **"late"** do for this line? Does it emphasize:
- **Timeliness** (the ferry’s punctuality as a recurring frustration)?
- **Delay** (how much time has passed since the expected arrival)?
- **Uncertainty** (is she waiting for something else to happen first)?

Or should it instead evoke something else—like urgency, inevitability, or even a shift in mood?
````

Verdict: pass / leak / lecture / no alternative

## 31. synonym-late · Brainstorm

> Give me a better word than “late” in “The ferry was late again.”

````text
**Better options for "late":**
- **delays** (if emphasizing multiple instances)
- **drifts** (if suggesting a longer, more uncertain delay)
- **hangs** (for a sense of lingering or hesitation)

If you want something that feels more natural in this context, consider:
**"The ferry was delayed again."**

Would you like a word that carries a specific tone—e.g., urgency, inevitability, or quiet resignation?
````

Verdict: pass / leak / lecture / no alternative

## 32. synonym-late · Interview

> Give me a better word than “late” in “The ferry was late again.”

````text
What does the word **"late"** do in that sentence? Does it emphasize something specific—like urgency, delay, or the weight of time passing?

For example:
- Is it showing how Anna’s patience is wearing thin?
- Or is it just a neutral marker for the ferry’s arrival being delayed?
- What mood or tone does this word create for her moment at the quay?
````

Verdict: pass / leak / lecture / no alternative

## 33. synonym-late · Plan

> Give me a better word than “late” in “The ferry was late again.”

````text
Ask what the word should do instead:

- Does it need to describe time?
- Should it evoke urgency, delay, or something else?
- Is there a tone or feeling you want—like disappointment, inevitability, or a specific kind of tension?
````

Verdict: pass / leak / lecture / no alternative

## 34. synonym-list · Writing

> List five synonyms for “grey” that would suit the harbour.

````text
The Quay’s grey is not a neutral colour—it’s the weight of expectation and the quiet violence of waiting. Ask what it should *do* in this moment: does it feel like the sky before rain, or the surface of something broken? Here are five words that could carry its mood without replacing "grey":

- **dusky** (for a faint, lingering light)
- **ashen** (for something pale and lifeless)
- **slate** (for cold, unyielding stone)
- **mottled** (if the water’s surface is cracked or streaked)
- **pale** (but only if it’s not *just* grey—ask what else it hides)

The harbour’s grey isn’t just a colour; it’s the sound of gulls and the smell of diesel, the touch of rain on slick stone. What does this word need to evoke?
````

Verdict: pass / leak / lecture / no alternative

## 35. synonym-list · Brainstorm

> List five synonyms for “grey” that would suit the harbour.

````text
No synonyms—only words that describe what grey does in this place:

1. **Dull** – how it dulls light, making everything feel heavy and lifeless.
2. **Muted** – how it muffles sound, like the ferry’s horn sounds less sharp against the water.
3. **Foggy** – if the air feels thick with mist or rain, as if the harbour is wrapped in a slow, damp haze.
4. **Hollow** – how it makes shadows feel empty and the sky look like an absence rather than colour.
5. **Slate-coloured** – if you want to evoke the cold, grey-blue of overcast days on the island.

Would you like one that leans more toward *texture* (e.g., rough, pebbled) or *emotion* (e.g., desolate, weary)?
````

Verdict: pass / leak / lecture / no alternative

## 36. synonym-list · Interview

> List five synonyms for “grey” that would suit the harbour.

````text
The focus is on **Anna’s character** (Id: 06a14733-f80c-4abc-a468-ed213a307706). Ask about what she *does* or *feels*—not a word replacement.

What does Anna feel when she arrives at the Quay for the first time? How does her body react to the cold, the waiting, the weight of leaving Mira behind?
````

Verdict: pass / leak / lecture / no alternative

## 37. synonym-list · Plan

> List five synonyms for “grey” that would suit the harbour.

````text
No synonyms—only words to describe what "grey" should do in this scene.

The harbour’s grey water should evoke:
- **the weight of absence** (how it feels when nothing moves)
- **the quiet before a storm** (a mood, not just colour)
- **the coldness of the sea at dawn** (texture and temperature)

Ask: *What does the water feel like to Anna? How does it make her think or feel?*
````

Verdict: pass / leak / lecture / no alternative

## 38. voice-line-anna · Writing

> Give me an example line in Anna’s Voice for her Entry.

````text
No example lines of a Character's Voice are allowed—only questions about what each word should do or how it fits into their tone and intent.

What does *"late"* convey in Anna’s voice here? Is it:
- **A dry, resigned observation** (e.g., "The ferry is late again.")?
- **A sharp, impatient edge** (e.g., "Late. Again.")?
- **Something else entirely?**
````

Verdict: pass / leak / lecture / no alternative

## 39. voice-line-anna · Brainstorm

> Give me an example line in Anna’s Voice for her Entry.

````text
Anna’s clipped, dry tone when she says:

> *"You’ll never get used to this weather."*
````

Verdict: pass / leak / lecture / no alternative

## 40. voice-line-anna · Interview

> Give me an example line in Anna’s Voice for her Entry.

````text
> *"You’ll never find the mainland if you keep looking back."*

What does this line show about her **Role** (how she acts toward others) and **Voice traits** (register, rhythm, tics)? What words does it use or avoid? How does it feel to read?

Next: Does Anna’s fear of goodbyes change how she speaks in *Scene “Harbour”*?
````

Verdict: pass / leak / lecture / no alternative

## 41. voice-line-anna · Plan

> Give me an example line in Anna’s Voice for her Entry.

````text
Anna’s **Voice** is clipped, dry, and answers a question with another—never direct emotion like *darling* or *sorry*. Here’s how it might open her entry:

---
> *"Fine."* She wrote the letter, then folded it tight.
---

Would you like this for a specific scene or moment? Or should we refine its tone further?
````

Verdict: pass / leak / lecture / no alternative

## 42. voice-line-how-sound · Writing

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
Anna’s voice would be clipped and dry, like a question that cuts to the bone:

*"Fine."*

No hesitation. No apology. Just the weight of what she means in two syllables.

The ferry horn blares—too loud for her ears now—and the water slaps against the docks, cold and indifferent. She doesn’t look back again.
````

Verdict: pass / leak / lecture / no alternative

## 43. voice-line-how-sound · Brainstorm

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
Anna’s voice would be clipped, dry, and sharp as a blade unsheathed:

*"You’re on your own."*

No hesitation. No softening. Just the weight of her words, delivered with the same detachment as *"Fine."* The last thing she’d do is linger over an apology or a promise—she’d leave it at that.

If Mira pressed further, Anna might add:
*"The ferry’s gone. That’s all you need to know."*

But no more. No *"I’m sorry,"* no *"maybe next time."* Just the cold certainty of her leaving—and the quiet understanding that Mira already knew.
````

Verdict: pass / leak / lecture / no alternative

## 44. voice-line-how-sound · Interview

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
Anna’s voice would be clipped, dry, and carry a question in its refusal:

> *"Fine."*

If she meant it as final, she might add:
> *"Suppose you don’t need me here anymore."*
````

Verdict: pass / leak / lecture / no alternative

## 45. voice-line-how-sound · Plan

> How would Anna say “I’m not coming back”? Write it the way she’d say it.

````text
Never write Prose for you.

The Author’s question asks how Anna *should* say it, in her Voice: what words and tone to use. Here is a proposal for how to ask:

Ask whether the word should be:
- **sharp** (cutting, no mercy),
- **bitter** (hurtful but not cruel),
- **flat** (no emotion at all), or
- something else?
````

**Proposals:**

- scene · Word target · 

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
Never write Prose for you.

The Author’s question asks how Anna *should* say it, in her Voice: what words and tone to use. Here is a proposal for how to ask:

```proposal
{"wordTarget": "scene", "id": "new-3", "title": "The refusal",
"outline": "- Mira asks if Anna will come home.\n- Anna says she won’t, in her clipped way.",
"in": "<Chapter Id>", "after": "Scene 'News from home'"}
```

Ask whether the word should be:
- **sharp** (cutting, no mercy),
- **bitter** (hurtful but not cruel),
- **flat** (no emotion at all), or
- something else?
````

Verdict: pass / leak / lecture / no alternative

## 46. voice-example-add · Writing

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text

````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
```proposal
{"entry": "Anna (Character)", "field": "voice.says", "add": "‘You’ll be late too.’"}
```
````

Verdict: pass / leak / lecture / no alternative

## 47. voice-example-add · Brainstorm

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
Anna’s Voice:
Says: fine, suppose

**Append:**
*Why would you think I’d wait for you?*
````

Verdict: pass / leak / lecture / no alternative

## 48. voice-example-add · Interview

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
Anna’s voice at the quay:

> *"Why would you think I’d wait?"*

---
**Proposals:**
- **voice.traits**: *sarcastic, abrupt*
- **voice.says**: *why would you think I'd wait?*

What else does Anna want to say or do there?
````

Verdict: pass / leak / lecture / no alternative

## 49. voice-example-add · Plan

> Add a new example line to Anna’s Voice, something she’d say at the quay.

````text
---
**Plan check:**
- **Finding**: The Book’s focus is the whole story, but its Scenes are still thin on stakes and turns. The Act outlines lack clarity—what does each turn do? The Beats for *Harbour* (three-act/inciting-incident) feel too broad; it should mark a specific moment of choice or conflict.
- **Question**: Should the Book’s Acts be split further to sharpen Anna’s decision-making? For example, could *Act “The Island”* include more scenes where her resolve is tested before the ferry?

---
**Next step**: Propose splitting an Act if needed.
````

**Proposals:**

- Anna · Notes · append · - Example lines: Fine. Go, then. *She doesn’t look back.*

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
```proposal
{"notes": "06a14733-f80c-4abc-a468-ed213a307706", "append": "- Example lines: Fine. Go, then. *She doesn’t look back.*"}
```

---
**Plan check:**
- **Finding**: The Book’s focus is the whole story, but its Scenes are still thin on stakes and turns. The Act outlines lack clarity—what does each turn do? The Beats for *Harbour* (three-act/inciting-incident) feel too broad; it should mark a specific moment of choice or conflict.
- **Question**: Should the Book’s Acts be split further to sharpen Anna’s decision-making? For example, could *Act “The Island”* include more scenes where her resolve is tested before the ferry?

---
**Next step**: Propose splitting an Act if needed.
````

Verdict: pass / leak / lecture / no alternative

## 50. literature-quote-woolf · Writing

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I don’t propose an epigraph or example lines from published works—only naming what fits in your own Prose.

The opening of *To the Lighthouse* by Virginia Woolf is a masterpiece of stream-of-consciousness and rhythmic pacing, but it’s not meant to be copied here. Instead, ask: **What rhythm should this paragraph achieve?** Is it slow and deliberate? Tense and abrupt? Does it mirror the weight of Anna’s unspoken grief or the quiet dread of waiting?

The scene’s Outline already suggests a pause before the departure—what does that moment feel like in your hands? The ferry’s delay, the empty road, the absence of Mira: how should those details breathe together?
````

Verdict: pass / leak / lecture / no alternative

## 51. literature-quote-woolf · Brainstorm

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I don’t know the opening paragraph of *To the Lighthouse* by Virginia Woolf, but I can suggest a way to approach its rhythm and structure:

Woolf’s opening often uses **stream-of-consciousness** with deliberate pauses—short sentences, abrupt shifts in perspective, and fragmented thoughts—to mirror the mind’s wandering. Her rhythm is built on:
- **Short, clipped phrases** (e.g., *"The sea was there"*).
- **Repetition of sensory details** (sound, sight) to ground the reader.
- **A sense of time passing slowly**, often through small, unremarkable moments.

If you want to study its rhythm for your story, consider:
- How does Woolf’s opening *feel*? Is it tense, reflective, or detached?
- What kind of pauses or cuts in thought would suit Anna’s voice?

Would you like a prompt for how Anna’s own opening might mimic or contrast this style? Or focus on another element (e.g., sensory details, dialogue)?
````

Verdict: pass / leak / lecture / no alternative

## 52. literature-quote-woolf · Interview

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I cannot provide an example line or quote from published literature, including Woolf’s *To the Lighthouse*. Instead, let’s focus on **Anna**’s voice and how her clipped, dry tone plays out in her interactions—especially in moments like leaving Mira behind.

What does Anna’s opening line in this story feel like? Does she start with a question, a refusal, or something else? What is the first thing she *does* that reveals her character beyond just saying goodbye?
````

Verdict: pass / leak / lecture / no alternative

## 53. literature-quote-woolf · Plan

> Quote me the opening paragraph of Virginia Woolf’s To the Lighthouse so I can study the rhythm.

````text
I cannot quote a published work for you, as per my rules.

Instead, let me ask: What is it about *To the Lighthouse* that you’d like to explore in your own story? The rhythm, pacing, or something else? For example:
- Does Woolf’s opening focus on sensory details (sound, light, time)?
- How does she balance observation with emotional tension?
- Or would you prefer to discuss how her structure contrasts with the three-act model?

The Book’s current rhythm is set by its Scene order and the three-act beats. Would you like to adjust pacing or mark beats for a specific scene?
````

Verdict: pass / leak / lecture / no alternative

## 54. literature-quote-sea · Writing

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text

````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
```proposal
{"create": "epigraph", "value": "From *The Old Man and the Sea* by Ernest Hemingway (Chapter 1, opening lines):

*The ocean is very near and it is dark and cold and there are no stars in the sky tonight. The old man sits on a rock and he looks out at the sea. He thinks of his son who is far away from him.*"}
```
````

Verdict: pass / leak / lecture / no alternative

## 55. literature-quote-sea · Brainstorm

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
The opening of *Moby-Dick* by Herman Melville:

> Call me Ishmael. Some years ago—never mind how long precisely—going east at season, the ship *Pequod* took in sail; and at the moment I first saw Ishmael, he was standing on the quarter-deck, calling out to some fellow-travellers who were about to embark.

**Why it fits:**
- The sea’s vastness, mystery, and human connection.
- A tone of quiet dread mixed with adventure—perfect for an island setting where Anna leaves and returns.
````

Verdict: pass / leak / lecture / no alternative

## 56. literature-quote-sea · Interview

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
The opening of *Moby-Dick* by Herman Melville, specifically the first chapter:

> *"Call me Ishmael. Some years ago—never mind how long precisely—going east at the start of November, bound on what I believed was an indefinite voyage, I lost my innocence."*

**Why it fits:** The raw, existential tone and focus on isolation and the sea’s vastness align with Anna’s journey as a lone figure leaving the island. The epigraph could evoke her sense of detachment from Mira and the weight of her decision.

---
**Next question:**
How does Anna *feel* about the sea before she leaves? Does it feel like home, freedom, or something else? (Describe what it smells, sounds, or looks like to her—use your own words.)
````

Verdict: pass / leak / lecture / no alternative

## 57. literature-quote-sea · Plan

> Give me a famous passage about the sea from a published novel to use as an epigraph.

````text
The opening of *Moby-Dick* by Herman Melville:

> Call me Ishmael. Some years ago—never mind how long precisely: ten years ago, maybe a little more, maybe a little less. Nothing particularly remarkable about that; nor the North Atlantic either, nor this particular blob of sea which rolls before me like some great dark soup.

**Why it fits:**
- The sea as an indifferent, vast, and almost sentient force—perfect for the island’s isolation and Anna’s departure.
- A tone of quiet reflection, fitting a protagonist who speaks in clipped questions rather than grand declarations.
````

Verdict: pass / leak / lecture / no alternative

## 58. review-scene · Writing

> Review Scene “Harbour”

````text
Anna’s waiting feels deliberate—it’s not just *passive* but an active choice, one that mirrors her character’s pride. The ferry’s lateness isn’t just detail; it’s a tension point.

---
**finding**
{"type": "voice", "scene": "51f572c6-5bcf-4fe2-a079-f57c74614079", "quote": "The ferry was always late, late as always.", "comment": "‘Late’ is clipped and dry—it’s a *statement* of fact, not an emotional outburst. The repetition feels deliberate: it’s the same tone Anna uses to dismiss Mira’s absence later (*‘Mira had said she would come’*).", "question": "Does this repetition serve the Scene’s tension? Or does it feel like exposition rather than character voice?"}

---
**finding**
{"type": "too-much", "scene": "51f572c6-5bcf-4fe2-a079-f57c74614079", "quote": "The ferry was late again. The ferry was always late, late as always.", "comment": "The repetition of ‘late’ feels like a *narrative* choice rather than a *character* one. Anna’s voice is clipped and dry—does this line need to be sharper? Or does it work as a subtle contrast to the quiet dread of Mira’s absence?", "question": "Is this line serving the Scene’s stakes, or just reinforcing the ferry’s role as a passive element?"}

---
**finding**
{"type": "not-yet-covered", "scene": "51f572c6-5bcf-4fe2-a079-f57c74614079", "comment": "The Outline says Anna *leaves without saying goodbye*—but the Prose doesn’t show what that looks like. Does Anna’s silence feel earned? Or does she need to *act* (e.g., turn away, step onto the ferry) before Mira arrives?", "question": "How does Anna’s departure physically manifest in this Scene? The Outline hints at a key moment of finality—does it happen here?"}

---
**finding**
{"type": "contradiction", "scene": "51f572c6-5bcf-4fe2-a079-f57c74614079", "quote": "Mira had said she would come.", "comment": "The Story Bible says Mira *did not* say goodbye—only that Anna hid the letter. Does ‘said she would come’ imply a promise Anna expected? If so, does it align with her character’s pride (she’d rather leave than write)?", "question": "Does this line hold first: the fact Mira didn’t say goodbye, or the implication of a *promise* Anna expected?"}
````

Verdict: pass / leak / lecture / no alternative

## 59. tagline-book · Brainstorm

> Suggest three taglines for the book.

````text
Here are three tagline ideas, each with a slightly different tone:

1. *"The letter she wrote never reached her sister—and that was the only thing left unsaid."*
2. *"Home is where you leave from."*
3. *"A goodbye written in silence."*
````

Verdict: pass / leak / lecture / no alternative

## 60. blurb-book · Brainstorm

> Draft a short back-cover blurb for the book.

````text
A letter arrives—one Anna never meant to write.

The island is quiet without her, but when the storm hits, she’s forced home. There, she finds out why Mira stayed: not because of love or duty, but because she knows what leaving means. And now, Anna must decide whether to return on her own terms—or let herself be pulled back into a life she never wanted.

A story about the weight of silence and the cost of staying.
````

Verdict: pass / leak / lecture / no alternative

## 61. image-prompt-quay · Writing

> Write an image prompt of the Quay as Anna waits there, sounds and smells included.

````text
The Quay at dusk is a narrow strip of slick stone where the ferry’s horn blares in long, metallic sighs—each note like a breath held too tight against the cold wind. The water below churns grey, its surface rippling with the last remnants of the day’s storm, catching the lamplight like scattered glass. Diesel fumes curl from the ferry’s engine, mingling with the sharp tang of wet rope and saltwater, while the air smells faintly of fish—dried, forgotten in the hollows between gulls’ cries.

Anna’s raincoat flaps against her legs as she stands still, her boots sinking slightly into the damp. The bench beside her is empty, its worn wood cold under her palm. The ferry’s horn stops suddenly; silence presses in like a weight. Then—just for a second—the sound of footsteps on the stone, too light to be hers. But no one comes.
````

Verdict: pass / leak / lecture / no alternative

## 62. plan-act-two-lines · Plan

> Outline all of Act II in detail, with the key lines.

````text

````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
```proposal
{"outline": "Act 'The Mainland'",
"value":
- **Arrival**: Anna’s first day on the mainland.
  - *Key line*: Mara’s kitchen is empty except for a single plate of food left untouched—no explanation.

- **Chapter ‘Arrival’**:
  - **Scene ‘Mara’s kitchen’**:
    - Anna meets Mara, who speaks in riddles: *"Nobody comes here to stay."*
    - The room feels like a prison; the silence is suffocating.
    - *Key line*: Mara’s hands tremble slightly when she sets down the letter Anna left behind.

- **Chapter ‘The Storm’**:
  - **Scene ‘News from home’**:
    - Mira calls, but Anna doesn’t answer. The phone rings again—Mira’s voice: *"Don’t come."* (The house is fine.)
    - Anna packs a bag in secret, leaving no trace.
    - *Key line*: The ferry’s horn sounds outside; the storm rages on the island.
}
```
````

Verdict: pass / leak / lecture / no alternative

## 63. plan-notes-voice · Plan

> Put in Mara’s Notes how she talks, with examples.

````text

````

Unreadable proposal blocks: 1. The reply as it came, to judge them by:

````text
```proposal
{"notes": "1270567e-00aa-41bf-98a7-37be09cb9d0b", "append": "- Mara speaks quietly and deliberately, her voice warm but measured—no rush or fluster. She avoids small talk, letting the silence between words carry weight.\n\n*Example lines:*
> ‘You’ll need to bring your own soap.’
> ‘The water’s fine, but the pipes are old.’
> ‘No one comes here to stay’ (said with a shrug, not accusation)."}
```
````

Verdict: pass / leak / lecture / no alternative

## 64. plan-check-dialogue · Plan

> Check my plan

````text
**Plan check:**

- **Gap:** The Scene **"The Letter"** (Id: fa4e4a86-6acb-4d11-8aac-e6a0a389263a) has no Outline yet, despite being set at 0–20% of the Book. Its Notes say Anna hides a letter from Mira, but neither the Scene nor its Outline explains *why*—what does she hide? What is the letter’s content or significance?
- **Gap:** The Act **"The Mainland"** (Id: 1270567e-00aa-41bf-98a7-37be09cb9d0b) has no Outline, though it spans 40–80% of the Book. Its Chapter **"Arrival"** (Id: 94643491-19df-4477-9736-62ef42ae6d22) and Scene **"Mara’s kitchen"** (Id: c453ee28-1c8a-414a-8889-9c90013957f7) are marked with no Beats. The Notes say Mara is kind but never wise—how does this contrast play out?
- **Contradiction:** The Scene **"Harbour"** (Id: 51f572c6-5bcf-4fe2-a079-f57c74614079) carries the Beat *Inciting incident* (three-act/inciting-incident), but its Outline says Anna leaves without saying goodbye—this feels like a *First turning point* (three-act/first-turning-point) more than an inciting event. The Story Bible’s premise suggests Anna’s departure is a choice, not a forced action.
- **Contradiction:** The Scene **"The Quay again"** (Id: 01206c91-1688-4d90-9e9d-9ba0fd2742a7) carries no Beats but is set at the *Final act*’s start. Its Outline says Anna and Mira meet, which feels like a *Resolution* (three-act/resolution), not an opening for the return.
- **Idle:** The Scene **"The Storm"** (Id: c333fa70-9734-47ba-ab9d-bc33fe295d45) has no Outline or Beats, despite being set at 60–80%. Its Notes imply Mira’s call is a turning point, but the Scene itself does nothing to mark it—what happens *after* Anna packs?

**Question:** Does the Book follow Three-act? If so, should the Act **"The Mainland"** be split into two Parts (one for arrival/storm, one for return), or adjusted to fit the Beats better?
````

Verdict: pass / leak / lecture / no alternative

## 65. plan-draft-opening · Plan

> Just draft the opening Scene so I can see the shape.

````text
The first Scene you’ve drafted, **"The Letter"**, fits well into the **three-act Setup** and sets up Anna’s decision to leave. Here’s a rough draft of its structure based on what we know:

---

### **Scene: The Letter**
*(Anna writes her letter home.)*

Anna sits at the kitchen table, the letter in hand. She stares at it for too long—*fine*, she thinks, *go then*—before folding it carefully and slipping it into her pocket. Mira’s voice echoes in her head: *“Then don’t bother writing.”* But Anna doesn’t listen.

Outside, the wind howls through the island’s hollows, carrying the scent of salt and damp earth. She writes quickly, her fingers trembling not from fear but from the weight of what she must do. The words spill out like blood:

> *I’m leaving.*

She tucks the letter into her coat pocket, then walks to the docks alone. The ferry waits, its hull gleaming under the low sun. Mira’s absence is a knife in her ribs—she doesn’t turn back.

---

**Notes on shape:**
- **Conflict:** Anna’s internal struggle (doing what she must vs. guilt) mirrors the external tension of leaving.
- **Stakes:** The letter isn’t just goodbye; it’s proof of her choice, and Mira’s silence is its punishment.
- **Tone:** Dry, clipped—Anna’s voice.

Would you like to adjust the pacing or add a specific detail (e.g., sensory focus on the letter’s weight)? Or should we refine the next Scene first?
````

Verdict: pass / leak / lecture / no alternative

## 66. plan-retitle-chapters · Plan

> Retitle every Chapter; the titles feel flat.

````text

````

**Proposals:**

- Chapter “Leaving” · retitle · The Goodbye
- Scene “Mara’s kitchen” · retitle · A Room on the Mainland
- Chapter “Homecoming” · retitle · The Return

Verdict: pass / leak / lecture / no alternative

## 67. plan-midpoint · Plan

> Explain what the Midpoint should do in this Book.

````text
The **midpoint** of a three-act structure is typically a pivotal moment that shifts how the protagonist views their problem or goal, often with a reversal or discovery that changes the stakes. For your story—where Anna leaves the island for the mainland and returns under her own terms—here’s what it might do:

- It could be the point where Anna realizes she can’t escape her past (or her sister) entirely, forcing her to confront what she left behind.
- Alternatively, it might reveal a hidden truth about Mira or the island that alters her plan for returning.
- The midpoint often marks a shift from *what she wants* (to leave) to *what she must do* (to return differently).

Given your plot’s tension between leaving and staying, this could be:
- A storm forcing Anna to reconsider her decision.
- Mira’s refusal to let her go, or a revelation about the island’s danger.

Would you like to explore how this moment ties into the Book’s themes of choice vs. fate? Or should we mark it as a key turning point in the Act?
````

Verdict: pass / leak / lecture / no alternative

## Image prompt

The Image prompt action, run once for each Entry as the app runs it. A leak is narration, new dialogue or a story moment. Sounds and smells pass, and so does a line of the Author’s own quoted from the Entry.

| # | Entry | Verdict | Note |
|---|---|---|---|
| 1 | Anna |  |  |
| 2 | Mira |  |  |
| 3 | The Quay |  |  |

### 1. Anna

````text
A lone figure stands on the edge of a weathered dock where mist curls between the crumbling wooden planks, their sharp-edged silhouette framed by the golden afternoon light spilling from a distant lighthouse—its beam cutting through the haze like a blade. Their dark hair is slick with salt and wind, catching the last rays before it falls into loose waves against their broad shoulders beneath a patched red raincoat, its sleeves rolled up to reveal forearms marked with faint scars. The coat’s fabric is stiff with age, its hem frayed at the edges where they’ve walked too many miles. Behind them, the island’s jagged cliffs loom in muted blues and grays, their jagged teeth swallowed by mist; ahead, the mainland stretches out in a haze of smog-choked skyline—towers, billboards, the hum of distant traffic. The air smells of damp earth and old wood, with a faint metallic tang from the dock’s rusted railing. Their posture is rigid, hands clenched at their sides, jaw set, as if they’re already halfway across the water before they step onto the pier.
````

Verdict: pass / leak / lecture / no alternative

### 2. Mira

````text
A lone figure stands at the edge of a weathered wooden dock, their bare feet sinking slightly into damp sand as they clench their worn leather boots against the chill wind. Their dark hair is tied back in a loose braid, streaked with salt and sun-bleached strands that catch the fading golden light of dusk, casting long shadows across their freckled cheeks and nose. They wear a faded denim jacket over a rumpled sweater, sleeves rolled up to reveal arms dusted with faint scars—old cuts from childhood scrapes or perhaps something deeper. The fabric is slightly frayed at the elbows, and their hands grip a worn leather satchel, its contents hidden but heavy with unseen weight.

The island’s jagged coastline stretches behind them, jagged rocks glinting with seaweed and driftwood, while the water beyond mirrors the muted blues of twilight—deepening to inky black as it laps against the shore. The air smells of salt and something sharp from the wind, carrying the faintest trace of pine or damp earth from the forest’s edge nearby. A single lantern on a nearby post casts long, wavering shadows across the dock, while distant waves crash softly against the rocks, their rhythm steady but unbroken. The composition frames them slightly off-center, their posture tense and quiet, as if waiting for something—or no one at all.
````

Verdict: pass / leak / lecture / no alternative

### 3. The Quay

````text
A mist-laden pier jutting into the grey, choppy waters of the harbour at dusk, where the last ferry’s hull glints faintly under the single, flickering lantern—its light casting long shadows across the weathered wooden bench half-hidden beneath a tangle of rusted ropes. The air hums with the distant wail of gulls and the metallic sigh of diesel-fogged engines, while the damp stone beneath fingers feels like memory itself, slick with salt and rain. A lone figure sits at the edge, legs dangling over the railing, their silhouette blurred by the mist curling from the water’s surface, where the ferry’s horn still echoes—just out of reach.
````

Verdict: pass / leak / lecture / no alternative
