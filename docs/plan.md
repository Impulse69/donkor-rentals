# Donkor & Sons Offline Architecture

Donkor & Sons is now an offline Windows desktop application. The app stores business data in a local SQLite company file through the Electron main process and continues to receive app updates from GitHub Releases through `electron-updater`.

## Locked Decisions

| Area | Choice |
|---|---|
| Stack | Electron + React + TypeScript + Vite |
| Local DB | SQLite via better-sqlite3 in the main process |
| Data network | No network calls for business data |
| Setup | First-run company profile wizard |
| Locale | Ghana, GHS, en-GB |
| Updates | GitHub Releases via electron-updater |
| Backup | Local SQLite backup with JSON manifest |

## Architecture

- **Renderer**: React UI only. It talks to main through the typed context bridge.
- **Preload**: Exposes the narrow `window.donkor` API.
- **Main process**: Owns SQLite, repositories, migrations, printing, local backup/restore, and app updates.
- **Database**: A single local SQLite file in Electron user data. Migrations are bundled from `packages/db/sqlite/migrations`.

## Offline Data Model

The local baseline includes company profile, catalog, item units, customers, bookings, booking lines, invoices, invoice lines, invoice sequences, payments, returns, damage records, documents, app settings, and audit log.

All money remains integer pesewas. Soft deletes remain `deleted_at` based. Audit rows keep a nullable actor column because there is no user login.

## Backup And Restore

Backups are created with SQLite's backup API after a WAL checkpoint. Each backup writes:

- `donkor-backup-YYYY-MM-DD-HHmm.db`
- a sibling JSON manifest containing app version, migration schema version, and row counts

Restore validates the manifest and schema version, snapshots the current company file to a `.pre-restore` file, swaps in the selected backup, and relaunches the app.

## Updates

Business data is offline, but software updates still use GitHub Releases. Renderer CSP does not control the updater because `electron-updater` runs in the main process over Node networking.
