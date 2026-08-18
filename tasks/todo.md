# Phase 6 Accounting And Expenses

- [x] Inspect existing invoice/customer routes and current API/type contracts.
- [x] Add Chart of Accounts and account register screens.
- [x] Add Journal Entries list/detail/new screens.
- [x] Add Expenses list/form screens and Vendors list/detail/form screens.
- [x] Wire route definitions, nav icons, breadcrumbs, and + New entries.
- [x] Update smoke e2e coverage for new links and destinations.
- [x] Run verification in order: typecheck, lint, test, desktop build, desktop e2e, dev launch.

## Review

- `pnpm.cmd typecheck`: passed.
- `pnpm.cmd lint`: passed.
- `pnpm.cmd test`: packages/db and packages/shared passed; apps/desktop blocked before Vitest by sandbox `EPERM: operation not permitted, lstat 'C:\Users\User'`.
- `pnpm.cmd -F @donkor/desktop build`: blocked by sandbox `Access is denied` while esbuild loaded `electron.vite.config.ts`.
- `pnpm.cmd -F @donkor/desktop test:e2e`: blocked at Electron launch; process exited and `taskkill` returned `Access denied`.
- `pnpm.cmd dev`: blocked by the same esbuild `Access is denied` config-load failure as build.
- `rg -n "window\.donkor" apps\desktop\src\renderer\src\routes`: no matches.
- No changed tracked files under `apps/desktop/src/main`, `apps/desktop/src/preload`, `packages`, or `packages/db`.
