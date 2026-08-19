# Changelog

All notable changes to Donkor & Sons Rental Management Software.

## [1.3.10] - 2026-08-19

### Fixed: booking and return lines showed a code instead of the item

Booking lines and the return inspection checklist named each item with a
fragment of its internal id - "a1b2c3d4" - so nobody could tell what was being
collected or inspected. They now show the item's name.

### Fixed: the Returns list went nowhere

Every row on the Returns screen led to "Return already recorded" with no way
through, because it pointed at the form for recording a *new* return. Rows now
open the booking, where the charges, deposit and refund actually are.

### Fixed: Top Customers and Trip Log ignored the date range

Both screens offered a date range and then showed all-time figures regardless -
so "This quarter" was a heading over numbers that had nothing to do with the
quarter. They now report the period you pick.

**Revenue** and **Open Invoices** no longer offer a date range at all: both
always describe the current position, and the picker implied otherwise.

---

## [1.3.9] — 2026-08-19

### Fixed: editing a booking erased the driver, pickup and drop-off

Opening an existing hearse booking to change something small — a date, a note —
and pressing Save wiped the driver's name, the pickup point and the drop-off
point. It happened whenever the vehicle had since been retired from the
catalogue, and could also happen on any booking saved before the item list had
finished loading.

### Fixed: an invoice paid straight from draft recorded no income

If a deposit covered the whole invoice, marking it Paid skipped the step that
records the sale. The invoice showed as paid while the books showed no income
and no VAT owed — so both the Profit and Loss and the Taxes page understated
the truth.

### Fixed: refunding a deposit before the invoice was issued

The refund was taken out of "money customers owe you" instead of out of the
deposit being returned. That invented a receivable that did not exist and left
the deposit sitting on the books as though it were still held.

### Smaller fixes

- **Clear** on the Customers, Products and Vendors lists now empties the search
  box, instead of resetting the results while leaving the old text behind.
- The bill payment window no longer opens pre-filled with the last bill's
  amount and reference.

---

## [1.3.8] — 2026-08-19

### Fixed: quantity and amount boxes could not be edited

Reported from the field: the quantity on a booking line could not be cleared,
so you could only add digits onto the "1" already sitting there — typing 5 gave
you 15.

Every number and money box in the app now behaves the way you expect: click it
and the contents are selected, so typing replaces. You can clear it, backspace
through it, and type a decimal. Money boxes were affected worst — typing 25.50
over an existing 10.00 used to leave you with 10.02.

### Fixed: clearing a date closed the page

Clearing the pickup date on a booking, or the start date on the Taxes page, to
retype it replaced the whole screen with an error — losing everything else you
had entered. Dates can now be cleared and retyped normally. A date that does not
exist (31 February) is refused instead of silently becoming a different day.

### Fixed: the A/R Ageing report said everything was 90+ days overdue

Every unpaid invoice landed in the "90+ days" column no matter when it was due,
and the days-overdue figure was blank. The report now ages invoices correctly,
so Current / 1-30 / 31-60 / 61-90 mean what they say.

### Fixed: two ways to overbook

Both let you commit more stock than you own — the one thing the app exists to
prevent.

- Adding the **same item twice on one booking** was allowed past the limit: 40
  chairs plus another 40 out of a pool of 50 went through, because each line was
  checked on its own without counting the other.
- **Reviving a cancelled booking** was allowed even after its stock had been
  re-let to someone else, committing the same chairs to two customers.

---

## [1.3.7] — 2026-08-19

### A backup is now one file you can share

A backup used to be two files: the `.db` and a small `.json` beside it. Send
someone just the `.db` — which is what everyone naturally does — and their
machine said **"backup manifest missing"** and refused to restore it.

The details that were in the `.json` now travel *inside* the `.db` itself. One
file, self-contained. Email it, WhatsApp it, put it on a USB stick — it
restores on any machine with the app.

Older backups that still have the `.json` beside them keep working exactly as
before.

---

## [1.3.6] — 2026-08-18

### Fixed: clicking a Chart of Accounts row did nothing

The pointer changed to a hand over every row, and every other list in the app
opens the row you click — but the Chart of Accounts just sat there. Clicking a
row now opens that account's register (the same place **Run report** goes).

On the register itself, each line is a single posting with nothing further to
open, so the hand pointer no longer appears there.

---

## [1.3.5] — 2026-08-18

### Fixed: two sidebar items lit up at once

Clicking **Vendors** also highlighted **Expenses**, and clicking **Calendar**
also highlighted **Bookings**. The sidebar was matching on the start of the web
address rather than the whole thing. Every item now matches exactly, so only the
page you are on is highlighted.

---

## [1.3.4] — 2026-08-18

### Walk-in customers can leave a phone number

A walk-in booking has no customer file, which meant no way to reach the person
at all — no number to call when the hearse is ready or the chairs are due back.
The booking form now asks for a phone number on walk-ins, and it shows on the
booking page.

It is optional on purpose. If someone does not want to give a number, the
booking still goes through.

### Booking page tidy-up (for real this time)

Honest note: the 1.3.2 notes promised this tidy-up, but the change was lost in
the build and never actually shipped. It is really in now:

- Pickup, Drop-off and Driver only appear when they are filled in — no more
  rows of dashes on a party-supplies booking.
- A walk-in booking no longer says "Walk-in rental" twice.

---

## [1.3.3] — 2026-08-18

### Fixed: row menus were cut off

The **View / Edit / Create invoice** menu on a list row was sliced off at the
bottom edge of the table, so options like "Record return" could not be reached
at all. Menus now sit above everything and stay on screen.

### Fixed: the button bar at the bottom of a page

On booking and invoice pages the bar of actions (Mark returned, Print contract,
Edit and so on) sat in the wrong place, left a gap beneath itself, and let the
page show through it when scrolled. It is now pinned flush across the bottom and
stays put while you scroll.

---

## [1.3.2] — 2026-08-18

### Simpler navigation

- **Back and forward buttons** at the top left, like a browser. They replace the
  breadcrumb trail ("Donkor & Sons / Bookings / New booking"), which spent three
  levels telling you where you already were.
- **The search bar is gone.** Whatever you typed, it only ever searched the
  products list — a customer name or booking landed you on Products and
  Services with no matches. Each list screen has its own search that works.

### Booking page tidy-up

- Pickup, Drop-off and Driver only appear when they are filled in. They are
  mostly used for hearse jobs; on a party-supplies booking they showed three
  rows of dashes that read like missing data rather than data that does not
  apply.
- A walk-in booking no longer says "Walk-in rental" twice in the customer box.

---

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
