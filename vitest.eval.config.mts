import { defineConfig } from 'vitest/config';

// The eval sets ask a real Model many times, and bill its Provider's key
// (see docs/evals/never-prose/README.md): run them on purpose, as with
// `npm run eval:never-prose`.
export default defineConfig({
  test: {
    include: ['src/**/*.eval.ts'],
    environment: 'node',
    testTimeout: 30 * 60_000,
  },
});
