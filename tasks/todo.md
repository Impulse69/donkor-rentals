# QuickBooks-Style Design System Phase 2

## Plan
- [x] Inventory scoped files, exports, money/status helpers, and token usages
- [x] Rewrite token values while preserving token names used by components
- [x] Swap renderer font dependency/imports to bundled Open Sans
- [x] Update component CSS for QBO buttons, tables, tabs, modal chrome, and links
- [x] Add typed SplitButton, MoneyBar, and StatusPill component exports
- [ ] Run full verification: typecheck, lint, test, greps, and dev render smoke check

## Review
- `pnpm.cmd typecheck` passed across workspace projects.
- `pnpm.cmd lint` passed.
- `pnpm.cmd test` passed `packages/shared` (4 files, 11 tests) and `packages/db` (no test files), then failed before desktop Vitest loaded because Electron-as-Node hit `EPERM: operation not permitted, lstat 'C:\Users\User'` in the managed sandbox.
- `rg -n -- "--gold" apps` returned zero hits.
- `rg -n -- "--paper-soft|--gold" apps` returned zero hits.
- `rg -n "fonts.googleapis.com|fonts.gstatic.com" apps` returned zero hits.
- `rg -n "fraunces" apps/desktop/package.json pnpm-lock.yaml` returned zero hits.
- `pnpm.cmd dev` failed before app render because esbuild could not read above the worktree while loading `apps/desktop/electron.vite.config.ts`: `Cannot read directory "../../../../../../..": Access is denied.`
