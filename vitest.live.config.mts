import { defineConfig } from 'vitest/config';

// The live smoke test asks Claude for real and bills the key in
// ANTHROPIC_API_KEY: run it on purpose with `npm run test:live`.
export default defineConfig({
  test: {
    include: ['src/**/*.live-test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
