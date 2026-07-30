import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

// A standalone config rather than a `test` block in vite.config.ts: the app config loads the PWA
// plugin and Tailwind, neither of which a unit test needs. The suites here cover the pure logic —
// the share-link codec, importers, exporters' data shaping and auto-seating — so `node` is enough
// of an environment; the few DOM globals a module touches are stubbed by the tests that need them.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
