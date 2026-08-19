# Changelog

All notable changes to Donkor & Sons Rental Management Software.

## [1.5.0-beta.4] - 2026-08-19 (BETA)

### Take payment at the counter - no invoice screen

Small rentals do not need invoicing. They need the money taken and a receipt
handed over. So:

- **Rent now** saves the booking and opens the payment sheet straight away:
  fill the lines, press Rent now, take the money, the receipt prints. The whole
  walk-in in one pass.
- On any booking that still owes money, the green button is **Take payment**.
  Amount is filled in for you, method defaults to cash, one press.
- Once paid, the green button becomes **Record return** (while the kit is out)
  or **Print receipt** (once it is back). Pay first, then the rest.
- **Create invoice** stays one step down in the menu, for the big jobs that
  want terms, deposits or payment in stages.

This is what QuickBooks calls a Sales Receipt as distinct from an Invoice. An
invoice still exists underneath - it has to, because it is what records the
sale - but it is raised and settled for you, and you never have to open it.
It shows in the Invoices list already marked paid.

Two guarantees worth knowing:

- Taking payment lands on exactly the same total as creating the invoice by
  hand and accepting the defaults. Which button you press cannot change the
  books.
- If a booking already has an invoice, Take payment pays that one. It never
  raises a second.

**On tax:** the quick path includes NHIL, GETFund and VAT, matching the New
Invoice form's default. The sheet says so. If you are not VAT-registered and
want a rental without them, use Create invoice and switch the format off.

### Fixed: a field could stop showing its real value

An amount box that was focused before its figure arrived kept showing 0.00 even
after the real figure was in place. A focused box now shows an outside change
unless you have actually typed into it.

---

## [1.5.0-beta.3] - 2026-08-19 (BETA)

### Fixed: pop-up messages were covering the buttons underneath them

The little confirmation messages ("Invoice issued", "Payment recorded") appear
in the bottom-right corner - which is exactly where the green button and its
arrow sit. Each message parked itself on top of them and, because it was
treated as something clickable despite having nothing to click, it swallowed
the press.

That is why the arrow seemed to disappear after a couple of actions: every
action raises a message, and each message landed on top of the arrow for a few
seconds.

Messages now stack above the bottom bar instead of over it, and they no longer
absorb clicks meant for anything behind them.

---

## [1.5.0-beta.2] - 2026-08-19 (BETA)

### Fixed: adding the same item twice made two lines instead of two of it

Picking a product that was already on the booking added a second row of
quantity 1, rather than raising the quantity on the row already there. A
booking could end up reading:

    White drape kit, 12 ft    QTY 1
    Tiffany chair, white      QTY 1
    White drape kit, 12 ft    QTY 1

The totals were right, but the duplicate carried through to the customer: the
invoice printed the same item on two lines, and the check-in sheet asked
whoever received the kit to inspect it twice.

Picking the same thing again now raises the quantity, and says so.

**Hearses are deliberately exempt.** Each hearse line stands for one vehicle
and its registration is chosen after the line exists, so adding the same hearse
twice still gives two lines - otherwise a two-hearse funeral could not be
booked.

---

## [1.5.0-beta.1] - 2026-08-19 (BETA)

Released on the **Beta** channel only. Machines set to Latest stay on 1.4.0 and
are not offered this build. To try it: gear icon > Settings > Update channel >
Beta.

### The bottom bar is no longer a wall of buttons

An invoice showed five buttons across the bottom and a booking showed as many as
eight, two of them coloured. There was no way to tell at a glance which one to
press.

Each screen now shows **one green button - the next step in the job** - with a
small arrow beside it holding everything else.

**Bookings** now read: Back ... Edit, and one green action.

- While the kit is out, the green button is **Record return** - the check-in
  that reconciles the deposit and records damage.
- **Mark returned**, which only flips the status and skips the money entirely,
  has moved into the menu. It previously sat next to Record return wearing the
  green, so the wrong one was the obvious one.
- **Remove booking** has moved into the menu, at the bottom, in red. A
  destructive action should not sit beside the button pressed every time.

**Invoices** now read: Cancel ... Print, and one green action. Void has moved
into the menu for the same reason.

---

## [1.4.0] - 2026-08-19

### Buttons look like buttons

Across the whole app, the quieter buttons had no border and no fill - they read
as plain grey text until you happened to hover over one. That hid real actions:
**Void**, **Remove**, **Clear**, **Cancel** and most of the buttons inside table
rows. They now have a visible outline at rest, while staying quieter than the
green primary button so it is still obvious what the main action is.

### The invoice screen tells you what comes next

The buttons on an invoice now follow the job: raise it, issue it, take the
money, hand over a receipt. Exactly one button is green - whatever the next step
is.

- Once nothing is owed, **Record payment** is replaced by **Print receipt**.
- **Print receipt** now appears as soon as any payment has been recorded,
  instead of only after the invoice was marked paid.
- **Print** (the invoice itself) stays available at every stage.

Previously both of those keyed off the invoice being marked "Paid", which only
happens when a payment settles an invoice that has already been issued. If you
took the money before issuing the invoice - which is normal for a walk-in - the
screen kept asking for another payment and refused to print the receipt for the
money already in hand.

---

## [1.3.12] - 2026-08-19

### Fixed: date filters could not be cleared

On Journal Entries, clearing a date filter to retype it made the field jump
straight back to the start of the month. On an account register it was worse —
clearing the date replaced the page with an error. Both can now be cleared and
retyped normally.

### Fixed: "today" meant different things in different places

Three parts of the app worked out today's date separately, and two of them used
UTC rather than your local time. In Ghana those are the same, so nothing showed;
on a machine set to any other timezone an expense dated "today" could be filed
to the wrong day, into the wrong month for VAT, or into a period already closed.
There is now one definition, used everywhere.

### Fixed: a double-click could act twice

The confirm button on "Remove this booking" stayed live while the request was in
flight, so an impatient double-click sent it twice. The same omission on
"Void by reversal" would have posted the reversal twice, which is the version
that would actually have damaged the books. Both now refuse the second click.

---

## [1.3.11] - 2026-08-19

### Fixed: bills could be overpaid, and paid bills could be voided

Money going out had none of the protections money coming in already had:

- A bill could be paid for **more than it was for**, which left the supplier
  account showing that the mechanic owed *you* money.
- A **cash expense** could take a "bill payment", inventing a debt that never
  existed.
- A bill could be **voided after it had been paid**, cancelling the bill but not
  the payment.
- A **draft** bill could be paid before it was even approved.

Each of these is now refused with an explanation of what to do instead.

### Fixed: approving an expense could leave it approved with nothing in the books

If the books were closed for the period, approving a draft expense marked it
approved and then failed to record it — money spent, books silent. The two now
succeed or fail together.

### Fixed: voiding a deposit that had already been applied

Once an invoice is issued, any deposit held against it moves across to what the
customer owes. Voiding the deposit after that point only undid half of it. It is
now refused, with a pointer to record a refund instead.

### Fixed: a discount bigger than the invoice

Entering one saved a broken invoice that could never be issued, with an error
that blamed the wrong thing. It is now refused when you enter it.

### Fixed: Utilization under-counted every part-day rental

A hire spanning a day and a half was charged as two days but counted as one, so
Utilization and Revenue could never be reconciled. Both now count the same way.

### Fixed: the Record payment button did not record a payment

On an unpaid bill it opened a read-only page instead. It now opens the payment
window, as the label always promised.

### Fixed: the report date range was still being dropped

The date range added to Top Customers and the Trip Log in 1.3.10 was discarded
one layer below the screen, so those reports were still showing all-time
figures. They now genuinely honour the period you pick.

---

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
