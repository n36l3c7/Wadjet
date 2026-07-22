import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * Tests run in a Node environment. `tests/setup.ts` installs `fake-indexeddb`
 * so the IndexedDB-backed stores can be exercised without a browser.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/background/index.ts', 'src/sidebar/index.ts'],
    },
  },
});
