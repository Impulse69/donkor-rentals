# Phase 5c Accounting Reports and IPC

- [x] Inventory existing accounting schemas, repositories, posting builders, preload/API shape, and migration-built test helpers.
- [x] Add shared accounting helpers and export namespace.
- [x] Add `accounting-reports` repository with trial balance, P&L, balance sheet, A/R ageing, general ledger, and account register queries.
- [x] Add accounting, vendors, and expenses IPC handlers/repository support where needed.
- [x] Append financial report IPC calls to the existing reports namespace.
- [x] Mirror the new IPC surface into preload and renderer API without touching renderer routes.
- [x] Add acceptance tests using migration-built SQLite databases.
- [x] Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`; iterate until the ground truth is final.
- [x] Check diff scope excludes migrations and `src/renderer/src/routes/`.

## Review

`pnpm.cmd typecheck` passed.

`pnpm.cmd lint` passed.

`pnpm.cmd test` passed `packages/shared` (4 files, 11 tests) and `packages/db` (no tests), then `apps/desktop` failed before Vitest startup with sandbox `EPERM: operation not permitted, lstat 'C:\Users\User'`. A focused host-Node Vitest diagnostic also failed before config load with sandbox `Access is denied` resolving `apps/desktop/vitest.config.ts`.

Diff scope check: no migration SQL files changed and no files under `apps/desktop/src/renderer/src/routes/` changed.
