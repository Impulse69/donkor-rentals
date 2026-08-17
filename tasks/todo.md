# Offline Redesign Todo

## Plan
- [x] Inventory migrations, auth/sync surfaces, and offline-related entry points
- [x] Rewrite SQLite baseline and remove dead DB exports
- [x] Delete cloud sync code and references while preserving updater path
- [x] Remove authentication and repurpose first-run company setup
- [x] Add local backup/restore repository, IPC, preload/api, and Settings UI
- [ ] Refresh dependencies and run full verification loop plus grep checks

## Review
- `pnpm.cmd install --ignore-scripts` refreshed `pnpm-lock.yaml` after normal `pnpm.cmd install` failed on a native `better-sqlite3` rebuild due missing Python under Node 25.
- `pnpm.cmd typecheck` passed.
- `pnpm.cmd lint` passed.
- `pnpm.cmd test` is blocked in `@donkor/desktop` before test execution because esbuild cannot read above the worktree and cannot resolve `apps/desktop/vitest.config.ts` from the sandbox path.
