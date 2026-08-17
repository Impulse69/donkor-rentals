# Phase 3 QBO Shell

## Plan
- [x] Update route nav metadata, catalog naming, and breadcrumb depth.
- [x] Add local inline sidebar icon map with no dependency changes.
- [x] Rework Shell sidebar/topbar and + New dropdown while preserving search and update restart behavior.
- [x] Restyle shell/sidebar/topbar/dropdowns using existing QBO tokens and keep print rules intact.
- [ ] Verify route links, numeric glyph removal, typecheck, lint, and tests.

## Review
- Implemented Tasks A-D in renderer scope only.
- `pnpm.cmd typecheck` passed.
- `pnpm.cmd lint` passed.
- `grep -rn "'0[0-9]'" apps/desktop/src/renderer/src/router/routes.tsx` returned no output.
- Static route check passed: requested sidebar routes and `+ New` targets exist in `routes.tsx`; forbidden future/admin nav labels are absent.
- `pnpm.cmd test` passed `packages/shared` (4 files, 11 tests) and `packages/db` (no test files), then failed before desktop Vitest loaded because Electron-as-Node hit `EPERM: operation not permitted, lstat 'C:\Users\User'` in the managed sandbox.
- `pnpm.cmd dev` failed before app render because esbuild could not read above the worktree while loading `apps/desktop/electron.vite.config.ts`: `Cannot read directory "../../../../../../..": Access is denied.`
