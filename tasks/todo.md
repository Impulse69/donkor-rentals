# Phase 5a Accounting Data Model

## Plan
- [x] Add `0002_accounting.sql` with accounting tables, constraints, indexes, and tenant-independent account templates.
- [x] Add shared accounting, journal, vendor, and expense schemas, plus `IsoDate`.
- [x] Add `ensureChartOfAccounts`, account resolution helpers, and bootstrap wiring.
- [x] Add an idempotency unit test that uses the real migration files.
- [x] Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`; confirm `0001_baseline.sql` is untouched.

## Review
- Added Phase 5a accounting migration as `0002_accounting.sql`; `0001_baseline.sql` was not modified.
- Added 52 tenant-independent account templates and 23 mapping-backed templates.
- Added shared schemas for accounts, journals, vendors, expenses, and `IsoDate`.
- Added chart bootstrap helper and called it from `ensureBootstrapTenant`.
- Added an idempotency test for `ensureChartOfAccounts`, but desktop Vitest did not load in this sandbox.
- `pnpm.cmd typecheck` passed.
- `pnpm.cmd lint` passed.
- `pnpm.cmd test` passed `packages/shared` (4 files, 11 tests) and `packages/db` (no test files), then failed before `apps/desktop` Vitest loaded with `EPERM: operation not permitted, lstat 'C:\Users\User'`.
- The dev database launch check was skipped because Electron test/dev startup is blocked by the same managed-sandbox access denial.
