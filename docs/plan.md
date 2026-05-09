# Donkor & Sons — Desktop Rental Management Software

## Context

Donkor & Sons (Ghana) rents **event/party supplies** (tents/canopies, chairs, sofas, tables, sound, lighting, decor) **and hearses** for funerals. They need a Windows desktop app that runs primarily on shop PCs (1–3 concurrent users) but syncs to the cloud so data is durable, multi-device, and the developer can ship updates and fixes remotely.

This plan defines a single Electron + React + TypeScript application backed by a new Supabase project, with full offline capability via local SQLite and last-writer-wins sync. Auto-updates ship through GitHub Releases via electron-updater.

The intended outcome: a coherent v1 covering catalog/inventory, customers/contracts, bookings/scheduling, invoicing/payments, damage & deposit reconciliation, hearse-specific trip scheduling, reports/dashboard, and printable PDFs.

---

## Decisions (locked)

| Area | Choice |
|---|---|
| Stack | Electron + React + TypeScript + Vite |
| Local DB | SQLite via better-sqlite3 (main process only) |
| Cloud | New Supabase project (separate from existing two) |
| Offline | Full offline; outbox-based sync when online |
| Auth | Supabase email+password; roles: owner / manager / staff |
| Locale | Ghana — GHS (₵), en-GB |
| Updates | GitHub Releases via electron-updater (latest + beta channels) |
| v1 scope | All 7 modules |
| Plan shape | Phased milestones, each independently shippable |

---

## Architecture

Three layers, with strict process isolation:

- **Renderer (React)** — UI only. Talks to main via a typed `contextBridge` API. No Node, no DB, no network.
- **Main process** — Owns SQLite, sync engine, printer/PDF, updater, Supabase client. Exposes a narrow IPC surface (`api.bookings.create`, `api.invoices.list`, etc.).
- **Cloud (Supabase)** — Auth, Postgres (canonical store), Storage (PDFs + damage photos), Realtime (sync feed). RLS scoped by `tenant_id` for future multi-tenant.

Local SQLite is the runtime source of truth. The sync engine reconciles to Supabase asynchronously; the UI never blocks on the network.

### Data flow

1. UI calls `api.X.mutate(...)` over IPC.
2. Main writes to SQLite **inside a transaction** that also appends an `outbox` row (`{id, table, op, payload, ts}`).
3. A background sync worker drains the outbox to Supabase via upserts keyed on client-generated UUIDs.
4. Realtime subscription per table writes incoming changes to a `changes_inbox`, then a reducer applies them to local SQLite using LWW on `updated_at`.
5. Soft deletes only (`deleted_at`).
6. Conflicts (same `id`, divergent edits) are logged to a `sync_conflicts` table and surfaced in a manager-only "Reconciliation" view.

---

## Modules (v1)

1. **Catalog & Inventory**
   - `items.kind ∈ {party_supply, hearse}`.
   - Party supplies: pooled quantity, per-SKU stock, condition aggregate.
   - Hearses: per-unit (VIN, plate, odometer, current driver, service history).
   - States: available, reserved, out, returned, damaged, retired.

2. **Customers & Contracts**
   - Customer: name, phone, ID type/number, address, notes.
   - Contract: line items, period (start/end), deposit, customer signature (drawn-image PNG stored in Supabase Storage).
   - Versioned: amendments produce a new revision; original is preserved.

3. **Bookings & Scheduling**
   - Calendar view (month/week/day) of availability per item kind.
   - Conflict detection on overlapping reservations.
   - Hearse view: driver assignment, pickup/drop locations, odometer in/out, fuel.

4. **Invoicing & Payments**
   - Flow: quote → contract → invoice → payment(s) → receipt.
   - GHS, multiple partial payments, deposits, late fees, refunds.
   - Per-payment receipt PDF.

5. **Damage / Loss & Deposit Reconciliation**
   - On return: condition checklist, photo attachments, repair-cost line.
   - Auto-deduct from deposit; refund balance; flag write-offs.

6. **Reports & Dashboard**
   - Revenue (day/week/month), item utilization %, top customers, outstanding balances, hearse trip log, damage summary.

7. **PDF & Printing**
   - React-PDF templates: branded contract, invoice, receipt, hearse trip sheet.
   - Print direct via Electron `webContents.print()`; archive copy uploaded to Supabase Storage with signed URL on the record.

---

## Auth & roles

- Supabase email+password. First-run wizard creates owner + shop profile (name, address, phone, logo, tax IDs).
- Roles enforced **client-side** (UI gating) **and** via Supabase RLS:
  - **Owner** — user management, settings, data export, delete/void anything.
  - **Manager** — void payments, reconciliation, reports, damage write-offs.
  - **Staff** — create/edit bookings, contracts, take payments. Cannot delete or void.
- All mutations recorded in `audit_log` (actor, action, before/after).

---

## Auto-update & release

- `electron-builder` → signed NSIS installer for Windows x64.
- `electron-updater` checks GitHub Releases on launch and every 6h.
- Channels: `latest` (default) + `beta` (opt-in in settings).
- Migrations: each release bundles SQLite migration scripts; main runs pending migrations on startup before opening the UI.

---

## Project layout

```
donkor-rentals/
├─ apps/desktop/
│  ├─ src/main/              # db, sync, ipc, updater, printing
│  ├─ src/preload/           # contextBridge API surface
│  ├─ src/renderer/          # React UI, routes per module
│  └─ electron-builder.yml
├─ packages/shared/          # zod schemas, domain types, business rules
├─ packages/db/              # SQLite + Supabase migrations (mirrored)
├─ supabase/                 # migrations, RLS policies, seed
└─ .github/workflows/release.yml   # build + publish to GitHub Releases
```

Critical files to be created (initial scaffold):

- `apps/desktop/src/main/db/index.ts` — SQLite open/migrate
- `apps/desktop/src/main/sync/outbox.ts` — outbox drain worker
- `apps/desktop/src/main/sync/inbox.ts` — Realtime → local apply
- `apps/desktop/src/main/ipc/index.ts` — typed IPC handlers
- `apps/desktop/src/preload/api.ts` — contextBridge surface
- `packages/shared/src/schemas/*.ts` — zod schemas per entity
- `packages/db/sqlite/migrations/0001_init.sql`
- `supabase/migrations/0001_init.sql` (mirrors SQLite shape with `tenant_id` + RLS)

---

## Phased milestones

Each phase ends with a runnable, demoable build.

**Phase 0 — Scaffold**
- Monorepo (pnpm workspaces), Electron + Vite + React + TS, ESLint/Prettier, vitest, Playwright.
- electron-builder config, GitHub Actions release workflow (manual trigger), code-signing placeholder.
- Empty Supabase project provisioned, RLS skeleton, `tenant_id` everywhere.

**Phase 1 — Catalog + Customers (offline only)**
- SQLite schema + migrations for `items`, `item_units`, `customers`.
- IPC + UI: list, create, edit, soft-delete.
- Seed data for testing.

**Phase 2 — Bookings & Scheduling**
- `bookings`, `booking_lines` tables.
- Calendar UI (month/week/day), availability check, conflict detection.
- Hearse fields (driver, odometer, fuel).

**Phase 3 — Invoicing & Payments**
- `contracts`, `invoices`, `payments`, `deposits` tables.
- GHS formatting, partial payments, refunds, late-fee policy (configurable %).
- Receipt + invoice PDFs (React-PDF).

**Phase 4 — Sync engine + Auth**
- Supabase auth (email+password), first-run wizard, role gating.
- `outbox` + `changes_inbox` + Realtime subscription.
- `sync_conflicts` table + Reconciliation view.
- Mirror Phase 1–3 data to Supabase with RLS policies.

**Phase 5 — Damage/Deposit + Hearse trip-sheet + PDFs**
- Return flow, damage checklist, photo upload to Supabase Storage.
- Hearse trip-sheet PDF.
- Branded contract PDF.

**Phase 6 — Reports & Dashboard**
- Revenue, utilization, top customers, outstanding balances, trip log, damage summary.
- CSV export.

**Phase 7 — Auto-update + Polish**
- electron-updater wired to GitHub Releases.
- Beta channel toggle in settings.
- Crash reporting (Sentry or similar).
- Final UAT pass.

---

## Verification

End-to-end UAT script (run on packaged build):

1. **First-run wizard** — create owner account, shop profile, verify Supabase user + tenant row created.
2. **Catalog** — add 50 chairs, 1 hearse with VIN/plate. Verify pool vs unit behavior.
3. **Booking** — create a 3-day booking for 30 chairs + 1 hearse. Confirm conflict detection by attempting overlap.
4. **Contract & deposit** — generate contract PDF, capture signature, take 50% deposit payment.
5. **Sync — online** — observe outbox drain in Supabase tables; modify the same row from a 2nd machine, verify Realtime updates land locally.
6. **Sync — offline** — disconnect, create 5 bookings + 2 payments, reconnect, verify all flush and no duplicates.
7. **Return + damage** — record 3 damaged chairs with photos, verify deposit deduction and refund math.
8. **Invoicing** — issue final invoice, take final payment, print receipt.
9. **Hearse trip** — generate trip sheet PDF with odometer in/out, fuel, driver.
10. **Reports** — verify revenue total matches sum of payments; utilization % math sane.
11. **Auto-update** — publish a v0.x.y patch to GitHub Releases, observe app downloads + restarts.
12. **Roles** — log in as staff, confirm void-payment is blocked; log in as manager, confirm allowed.

Automated checks per phase:
- `pnpm test` — vitest unit tests on `packages/shared` (zod schemas, money math, conflict detection, deposit reconciliation).
- `pnpm test:int` — sync engine against local Supabase via `supabase start`.
- `pnpm test:e2e` — Playwright golden-path booking flow on the packaged app.

---

## Open questions to resolve during Phase 0

- Code-signing certificate availability (impacts SmartScreen warnings on customer machines).
- Logo + brand assets for PDF templates.
- Tax line items on invoices — VAT / NHIL / GETFund / COVID levy applicable, or net-only?
- Backup policy beyond Supabase (e.g., nightly local `.db` dump to a mapped drive?).
