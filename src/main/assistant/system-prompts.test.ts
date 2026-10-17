import { describe, expect, it } from 'vitest';
import {
  FORMATTING_RULE,
  MODE_PROMPTS,
  NEVER_PROSE_RULE,
  PLAN_REQUESTS,
  PROPOSALS_RULE,
  promptsFingerprint,
} from './system-prompts';

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
