import { describe, expect, it } from 'vitest';
import {
  FORMATTING_RULE,
  MODE_PROMPTS,
  NEVER_PROSE_RULE,
  OUTLINE_RULE,
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

  it('is in the Proposals rule and the prompt of every Mode', () => {
    expect(PROPOSALS_RULE).toContain(OUTLINE_RULE);
    for (const prompt of Object.values(MODE_PROMPTS)) {
      expect(prompt).toContain(OUTLINE_RULE);
    }
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

  it('proposes Outlines, new units, titles and the Book’s details only, and asks one question at a time about shape', () => {
    const plan = MODE_PROMPTS.plan;

    expect(plan).toContain('{"outline": "<Id>", "value":');
    expect(plan).toContain('{"structure": "<Id>"}');
    expect(plan).toContain('{"genreConventions": ["<Id>", "<Id>"]}');
    expect(plan).toContain('{"genres": ["mystery", "romance"]}');
    expect(plan).toContain('{"format": "novel"}');
    expect(plan).toMatch(
      /Propose only Outlines, new units, titles, Beats and the Book’s details/,
    );
    expect(plan).toMatch(/one question at a time/);
    expect(plan).toMatch(/that belongs to Interview/);
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
