import { describe, expect, it } from 'vitest';
import { MODE_PROMPTS, OUTLINE_RULE, PROPOSALS_RULE } from './system-prompts';

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
