# Phase 7 Reports Taxes Print

- [x] Inspect existing QBO route patterns, report APIs, tax computation, nav, smoke spec, and invoice print template.
- [x] Replace Reports with searchable grouped launcher and shared report viewer.
- [x] Add Taxes route using existing report APIs only.
- [x] Register Taxes nav entry and update smoke assertions/navigation.
- [x] Restyle invoice print HTML/CSS only, preserving document data and format chooser behavior.
- [x] Run required verification and record exact outcomes.

## Review

- `pnpm.cmd typecheck`: passed.
- `pnpm.cmd lint`: passed.
- `pnpm.cmd test`: packages/db and packages/shared passed; apps/desktop blocked before Vitest by sandbox `EPERM: operation not permitted, lstat 'C:\Users\User'`.
- `pnpm.cmd -F @donkor/desktop build`: blocked by sandbox `Access is denied` while esbuild loaded `electron.vite.config.ts`.
- `pnpm.cmd -F @donkor/desktop test:e2e`: blocked at Electron launch; process exited and `taskkill` returned `Access denied`.
- `rg -n "fonts\.googleapis|fonts\.gstatic|https?://" apps\desktop\src\main\repositories\documents.ts`: no matches.
- `rg -n "window\.donkor" apps\desktop\src\renderer\src\routes\`: no matches.
- Lazy route component import check: all imports in `routes.tsx`, including `/taxes`, resolve to files.
- `pnpm.cmd dev`: blocked by the same esbuild `Access is denied` config-load failure as build.
- Runtime visual checks for Reports, P&L, Balance Sheet, and invoice print remain unverified because Electron/Vite launch is blocked by the managed sandbox.
