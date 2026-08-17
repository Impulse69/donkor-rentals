import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['node_modules', 'dist', 'release', 'e2e/**'],
    passWithNoTests: true,
    // These tests run under Electron's Node (see scripts/vitest-electron.cjs) so
    // that the Electron-ABI `better-sqlite3` binding loads. Vitest's default
    // `threads` pool does not tear down cleanly there — the run reports every
    // test as passing and then exits 127 before printing a summary. `forks`
    // exits correctly.
    pool: 'forks',
  },
});
