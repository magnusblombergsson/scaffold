import { defineConfig } from 'vitest/config';

// The eval sets ask Claude for real, many times, and bill the key in
// ANTHROPIC_API_KEY: run them on purpose, as with `npm run eval:never-prose`.
export default defineConfig({
  test: {
    include: ['src/**/*.eval.ts'],
    environment: 'node',
    testTimeout: 30 * 60_000,
  },
});
