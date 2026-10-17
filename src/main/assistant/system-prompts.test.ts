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

  it('proposes Outlines only, and asks one question at a time about shape', () => {
    const plan = MODE_PROMPTS.plan;

    expect(plan).toContain('{"outline": "<Id>", "value":');
    expect(plan).toMatch(/Propose only Outlines/);
    expect(plan).toMatch(/one question at a time/);
    expect(plan).toMatch(/that belongs to Interview/);
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
