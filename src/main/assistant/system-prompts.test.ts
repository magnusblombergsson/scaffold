import { describe, expect, it } from 'vitest';
import {
  FORMATTING_RULE,
  MODE_PROMPTS,
  NEVER_PROSE_RULE,
  OUTLINE_RULE,
  PLAN_CHECK_RULE,
  PLAN_REQUESTS,
  PROPOSALS_RULE,
  promptsFingerprint,
} from './system-prompts';

describe('the Outline rule', () => {
  it('limits proposed Outlines to short bullets, never Prose', () => {
    expect(OUTLINE_RULE).toMatch(/bullets only/i);
    expect(OUTLINE_RULE).toMatch(/at most 6 bullets/);
    expect(OUTLINE_RULE).toMatch(/20 words or fewer/);
    expect(OUTLINE_RULE).toMatch(/turns and threads/);
    expect(OUTLINE_RULE).toMatch(/quoted speech/);
    expect(OUTLINE_RULE).toMatch(/sensory description/);
    expect(OUTLINE_RULE).toMatch(/the story's voice/);
  });

  it('is in the Proposals rule and the prompt of every Mode that proposes Outlines', () => {
    expect(PROPOSALS_RULE).toContain(OUTLINE_RULE);
    const { research, ...outlining } = MODE_PROMPTS;
    for (const prompt of Object.values(outlining)) {
      expect(prompt).toContain(OUTLINE_RULE);
    }
    expect(research).not.toContain(OUTLINE_RULE);
  });
});

describe('the Research prompt', () => {
  it('holds the shared Never-Prose and Formatting rules unchanged, and proposes Facts only', () => {
    const research = MODE_PROMPTS.research;

    expect(research).toContain(NEVER_PROSE_RULE);
    expect(research).toContain(FORMATTING_RULE);
    expect(research).not.toContain(PROPOSALS_RULE);
    expect(research).toContain('"create": "fact"');
    expect(research).not.toMatch(/"outline":|"from":/);
    expect(research).toContain('Never propose whether a Fact is Checked');
  });
});

describe('the Plan prompt', () => {
  it('holds the shared Never-Prose and Formatting rules unchanged, but not the Story Bible’s Proposals rule', () => {
    const plan = MODE_PROMPTS.plan;

    expect(plan).toContain(NEVER_PROSE_RULE);
    expect(plan).toContain(FORMATTING_RULE);
    expect(plan).not.toContain(PROPOSALS_RULE);
    expect(plan).not.toMatch(/"create":|"entry":/);
  });

  it('proposes Outlines, new units, titles, moves, Trash, Word targets, Notes appends and the Book’s details only, and asks one question at a time about shape', () => {
    const plan = MODE_PROMPTS.plan;

    expect(plan).toContain('{"outline": "<Id>", "value":');
    expect(plan).toContain('{"structure": "<Id>"}');
    expect(plan).toContain('{"genreConventions": ["<Id>", "<Id>"]}');
    expect(plan).toContain('{"genres": ["mystery", "romance"]}');
    expect(plan).toContain('{"format": "novel"}');
    expect(plan).toContain('{"move": "<Scene Id>", "in": "<Chapter Id>"');
    expect(plan).toContain('{"trash": "<Id>"}');
    expect(plan).toContain('{"wordTarget": "<Id>", "words": 2000}');
    expect(plan).toContain('{"wordTarget": "<Id>", "words": null}');
    expect(plan).toContain('{"notes": "<Id>", "append":');
    expect(plan).toMatch(/"wordTarget": 1500, "in"/);
    expect(plan).toMatch(
      /Propose only Outlines, new units, titles, moves, Trash, Word targets, Notes appends, Beats and the Book’s details/,
    );
    expect(plan).toMatch(/one question at a time/);
    expect(plan).toMatch(/that belongs to Interview/);
  });

  it('says appended Notes are bullets recording only what the Author said or agreed, never the Assistant’s ideas or Prose', () => {
    const plan = MODE_PROMPTS.plan;

    expect(plan).toMatch(
      /Notes are the Author’s: append only bullets that record what the Author said or agreed in this Conversation/,
    );
    expect(plan).toMatch(/never your own ideas, and never Prose/);
  });

  it('makes a rough length the Author gives the Manuscript’s Word target, and points out when it disagrees with the Format', () => {
    const plan = MODE_PROMPTS.plan;

    expect(plan).toMatch(
      /When the Author gives the Book’s rough length, propose it as the Word target of the Manuscript/,
    );
    expect(plan).toMatch(/disagrees with its Format/);
  });

  it('is the only prompt to mention Word targets or appending to Notes', () => {
    for (const [mode, prompt] of Object.entries(MODE_PROMPTS)) {
      if (mode === 'plan') continue;
      expect(prompt).not.toMatch(/Word target|"wordTarget"|"notes":/);
    }
  });

  it('proposes a Scene’s whole list of Beats, one Proposal per Scene, and an added Scene’s with its Add; marks for a new Structure after a switch', () => {
    const plan = MODE_PROMPTS.plan;

    expect(plan).toContain('{"scene": "<Scene Id>", "beats": ["<Beat Id>"');
    expect(plan).toMatch(/"add": "scene".*"beats": \[/);
    expect(plan).toMatch(/one Proposal per Scene/);
    expect(plan).toMatch(/After the Book switches to another Structure/);
  });

  it('is the only prompt that tells how to propose Beats', () => {
    for (const mode of ['brainstorm', 'interview', 'writing'] as const) {
      expect(MODE_PROMPTS[mode]).not.toMatch(/"beats"/);
    }
  });

  it('names every Genre and Format by its Id', () => {
    const plan = MODE_PROMPTS.plan;

    for (const id of ['science-fiction', 'literary', 'other']) {
      expect(plan).toContain(id);
    }
    expect(plan).toContain('flash-fiction (under 1,000 words)');
    expect(plan).toContain('novel (40,000+ words)');
  });

  it('recommends one Structure from the catalogue with its Genre conventions and reasons, names alternatives, and proposes the pick', () => {
    const plan = MODE_PROMPTS.plan;

    expect(plan).toMatch(/recommend one Structure from the catalogue/);
    expect(plan).toMatch(/one or two alternatives/);
    expect(plan).toMatch(/Offer to find a Structure only when none is chosen/);
  });

  it('answers a Plan check with a line naming the measure, then at most 7 Findings naming their units, most consequential first, and no Proposals', () => {
    const plan = MODE_PROMPTS.plan;

    expect(plan).toContain(PLAN_CHECK_RULE);
    expect(PLAN_CHECK_RULE).toContain(
      '{"kind": "gap", "units": ["<Id>", "<Id>"], "quote":',
    );
    for (const kind of ['beat', 'convention', 'contradiction', 'gap', 'idle']) {
      expect(PLAN_CHECK_RULE).toContain(`- "${kind}": `);
    }
    expect(PLAN_CHECK_RULE).toMatch(
      /one line naming how where a Scene falls is measured/,
    );
    expect(PLAN_CHECK_RULE).toMatch(
      /at most 7 Findings, most consequential first/,
    );
    expect(PLAN_CHECK_RULE).toMatch(
      /If there are more than 7, say so in your opening line/,
    );
    expect(PLAN_CHECK_RULE).toMatch(/only from an Outline or Notes/);
    expect(PLAN_CHECK_RULE).toMatch(/never more than a sentence/);
    expect(PLAN_CHECK_RULE).toMatch(/quote them, never fault them/);
    expect(PLAN_CHECK_RULE).toMatch(/A Plan check holds no Proposals/);
  });

  it('checks no Beats with no Structure chosen and offers to find one; reads Beats from Outlines on unmarked Scenes and offers marks; never nudges No set Structure', () => {
    expect(PLAN_CHECK_RULE).toMatch(
      /With no Structure chosen, write no "beat" Findings, and end by offering to find a structure/,
    );
    expect(PLAN_CHECK_RULE).toMatch(
      /carry none of its Beats, read from their Outlines where the Beats seem to fall.*offering to propose the marks, one Proposal per Scene/,
    );
    expect(PLAN_CHECK_RULE).toMatch(
      /With No set Structure, write no "beat" Findings and never nudge the Book toward a Structure/,
    );
  });

  it('is the only prompt with a Plan check', () => {
    for (const mode of ['brainstorm', 'interview', 'writing'] as const) {
      expect(MODE_PROMPTS[mode]).not.toContain('Plan check');
    }
  });
});

describe('promptsFingerprint', () => {
  it('changes with what a Plan start button asks', () => {
    const before = promptsFingerprint();
    const asked = PLAN_REQUESTS['check-plan'];
    try {
      PLAN_REQUESTS['check-plan'] = `${asked} More.`;
      expect(promptsFingerprint()).not.toBe(before);
    } finally {
      PLAN_REQUESTS['check-plan'] = asked;
    }
    expect(promptsFingerprint()).toBe(before);
  });
});
