# Changelog

All notable changes to Donkor & Sons Rental Management Software.

## [1.2.0] — 2026-08-17

The app becomes **entirely offline for your data**, and the interface is
rebuilt to look and work like QuickBooks Online.

### The app no longer talks to the cloud

Everything now lives in a single company file on this machine.

- Removed Supabase sync, remote document storage, and cloud authentication.
  There is no outbox, no reconciliation queue, and no conflict resolution —
  those concepts are gone rather than disabled.
- **There is no login.** The app opens straight to your work. First run asks for
  your company details (name, address, phone, TIN, fiscal year start) instead of
  creating an owner account.
- Printed invoices no longer fetch fonts from the internet. That was a real
  offline bug: printing without a connection previously fell back mid-render.

**Automatic updates still work.** The app checks GitHub for new versions and
offers "Restart & install" exactly as before. That is the only outbound
connection, and none of your data is part of it.

### Back up your company file

With no cloud copy, backups matter. Settings now has **Back up company file**
and **Restore company file**.

- A backup is a complete copy of your database plus a manifest recording the app
  version, schema version, and row counts.
- Restoring validates the backup and runs an integrity check *before* touching
  your live data, and saves a `.pre-restore` snapshot of what it replaced.
- Backups taken in the same minute no longer overwrite each other.

### QuickBooks Online interface

If you have used QuickBooks Online, this should feel familiar.

- Intuit-green actions, blue links, charcoal text, and QBO's typography.
- Dark left navigation grouped the QBO way — Sales, Rentals, Reports — with a
  green indicator on the current page.
- QuickBooks' **+ New** button for creating invoices, customers, bookings,
  products and returns from anywhere.
- Settings moved behind the top-bar gear, where QuickBooks keeps it.
- "Catalog" is now called **Products and Services**.

### Notes for existing installations

This release replaces the database schema. Development databases from earlier
versions are not compatible and must be removed before first launch —
`%APPDATA%\@donkor\desktop\db\donkor.sqlite` along with its `-wal` and `-shm`
files. No production data existed at the time of this release.

---

## [1.1.1] — earlier

Invoice search by client name or number; invoice payments.
