# Feature Plan: Mid-Rental Additions ("Add-on Items")

## Overview
A frequent operational scenario occurs when a customer has an active booking (`out` status) but realizes they need additional inventory. This document outlines the proposed solution for handling these "Add-on Items" without disrupting existing accounting, invoices, or inventory conflict checks.

## The Challenges
Handling mid-rental additions gracefully requires balancing three systems:
1. **Inventory Conflicts**: The system must verify if the extra items are actually available for the remaining duration.
2. **Accounting/Invoicing**: The original invoice has already been generated and potentially paid. Changing the original booking lines retroactively desynchronizes the booking from its generated invoice, throwing off the balance due.
3. **Logistics**: The extra items are leaving the shop *now*, meaning their physical movement is separate from the original items.

---

## Proposed Architecture: The "Add-On Booking" Workflow
Instead of allowing structural modifications to an `out` booking, the system will support a streamlined workflow for creating a **Linked Add-On Booking**. 

This means creating a *brand new booking* specifically for the additional items, which overlaps the same dates and links back to the original context.

### 1. Developer Implementation Plan
- **UI Addition**: Add a button on the Booking Detail page called **"+ Add-On Items"**.
- **Action**: Clicking it navigates to the New Booking page, but *pre-fills* the Customer, Start Date, End Date, and Location. This can be handled by passing URL search parameters (e.g., `?clone=123`).
- **Result**: The staff only needs to add the new line items (e.g., "50 chairs") and click save.

### 2. Operational Benefits
- **Zero Schema Changes**: The database and backend logic require absolutely no changes.
- **Perfect Accounting**: The new booking generates its own separate Invoice and Receipt. The accounting stays crystal clear (Invoice 1 = Original, Invoice 2 = Add-on).
- **Inventory Safety**: The standard conflict engine automatically checks if the new inventory is available, treating it as a new transaction block.
- **Independent Returns**: When the event ends, the staff can perform a "Return" for the main booking, and a "Return" for the add-on booking. If a truck brings back the extra items early or separately, it's easily isolated and processed.

> **Note on Alternatives**: Alternative approaches like "Supplemental Invoices" or "Line-Item Revisions" were explored but discarded due to high architectural complexity (e.g., retroactively amending signed contracts, deposit deductions, and highly complex delta-conflict calculations).

---

## Next Steps for Future Implementation
When ready to ship this feature:
1. Update `routes/bookings/Detail.tsx` to include the **+ Add-On Items** action button when a booking is `out`.
2. Update `routes/bookings/Form.tsx` to parse `?clone=[id]` search parameters to instantly prepopulate the `FormState` with the target booking's metadata.
