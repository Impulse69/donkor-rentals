# Donkor & Sons — Rental Management

Desktop rental management software for Donkor & Sons (Ghana): party-supplies (tents, chairs, sofas, tables, sound, lighting, decor) **and** hearses for funeral services.

## Stack

- **Desktop**: Electron + React + TypeScript + Vite
- **Local DB**: SQLite (better-sqlite3)
- **Cloud**: Supabase (Postgres + Auth + Storage + Realtime)
- **Updates**: GitHub Releases via electron-updater
- **Locale**: Ghana — GHS (₵), en-GB

## Layout

```
apps/desktop/      Electron app (main, preload, renderer)
packages/shared/   Domain types + zod schemas (shared main↔renderer)
packages/db/       SQLite + Supabase migrations (mirrored)
supabase/          Supabase project (config, migrations, RLS)
```

## Develop

```sh
pnpm install
pnpm dev          # boots Electron with HMR
pnpm typecheck
pnpm lint
pnpm test
```

## Phase plan

See `docs/plan.md` (mirrors the brainstorm output). Phase 0 = scaffold (this commit).

## Status

Phase 0 — initial scaffold.
