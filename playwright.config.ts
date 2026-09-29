import { defineConfig } from '@playwright/test';

// End-to-end tests drive the built app: run `npm run test:e2e`, which builds
// first.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
});
