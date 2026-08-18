# Phase 5b Accounting Posting

- [x] Add accounting date helpers and tests.
- [x] Add pure posting builders, postOnce, reverseEntry, and health checks.
- [x] Add table-driven builder tests for every Task B event.
- [x] Add posting/idempotency/reversal/rounding tests using migration-built SQLite DBs.
- [x] Hook invoice issue, payments, payment voids, returns, and invoice voids into existing transactions.
- [x] Fix updateInvoice transaction/repricing guard and softDeleteInvoice draft-only guard.
- [x] Run `pnpm typecheck && pnpm lint && pnpm test` and record results.

## Review

`pnpm typecheck` and `pnpm lint` passed. `pnpm test` ran package tests, then the desktop Electron test runner failed before Vitest startup with sandbox `EPERM: operation not permitted, lstat 'C:\Users\User'`.
