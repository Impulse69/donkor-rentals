import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the alias in electron.vite.config.ts. Without it only the
      // subpaths listed in packages/shared/package.json "exports" resolve, so
      // `@shared/schemas` worked while `@shared/returns` and `@shared/reports`
      // failed to load — and only inside tests, which is a confusing place to
      // discover it.
      '@shared': resolve(__dirname, '../../packages/shared/src'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
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
