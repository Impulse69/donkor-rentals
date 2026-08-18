# Changelog

All notable changes to Donkor & Sons Rental Management Software.

## [1.3.1] — 2026-08-18

### Fixed: could not add items to a booking on a new installation

On a fresh install the catalogue starts empty, and the "Add item to booking"
dropdown gave no sign of it. It still showed the **Party supplies** and
**Hearses** headings, which look like choices but cannot be selected — so the
dropdown opened, nothing could be picked, and the booking could not be
completed at all.

The booking form now tells you the catalogue is empty and offers a button to
add your first product. Once you have products, the dropdown behaves normally,
and a heading only appears when there is something under it.

The form also distinguishes *still loading* from *nothing there*, so a slow
first open no longer looks like the same fault.

---

## [1.3.0] — 2026-08-18

Adds real double-entry bookkeeping and completes the QuickBooks Online
interface. Includes everything from 1.2.0, which was prepared but never
published separately.

### Your books, kept properly

The app now keeps a real general ledger behind the scenes. You do not have to
touch it — issuing an invoice, taking a payment or checking in a damaged item
writes the accounting entries for you.

- **Chart of Accounts** — 52 accounts set up for a Ghanaian rental business:
  cash, mobile money, bank, receivables, customer deposits held, NHIL, GETFund
  and VAT payable, rental and hearse income, fuel, driver wages, and the rest.
- **Reports** — Profit and Loss, Balance Sheet, Trial Balance, and A/R Ageing,
  alongside the existing utilization and top-customer reports.
- **Taxes** — NHIL, GETFund and VAT liability for any period.
- **Expenses, bills and vendors** — record what you spend, track what you owe.
- **Journal entries** — for anything the automatic postings do not cover.

Two controls worth knowing about. **Closing the books** through a date rejects
any later attempt to post into that period, so a filed return stays filed. And
an invoice that has been paid **cannot be voided** — refund the payments first.
Voiding would otherwise leave the receivable wrong with nothing to show why.

### The rest of the QuickBooks interface

Every screen now follows QBO: the invoice form with its balance-due header and
totals ladder, customers and products as tables, bookings, returns, and a
grouped reports hub.

### Smaller and adjustable

The interface now opens at 90% zoom, which fits more on screen. **Ctrl and +,
- or 0** makes it bigger, smaller, or back to normal.

### Fixes

- The **+ New** menu was cut off at the sidebar edge, hiding several items.
- Recording an expense with a tax amount failed if you are not VAT-registered.
- The printed invoice keeps its existing layout, unchanged.

---

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
