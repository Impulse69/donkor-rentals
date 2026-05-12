# Print Functionality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a "Print" button for invoices and receipts that opens a print-friendly view in a new window and triggers the native system print dialog.

**Architecture:** Add a new utility function to handle opening a print window with the document HTML, and integrate this into the `InvoiceDetail` and future document components.

**Tech Stack:** React, Electron/Browser `window.print()` API.

---

### Task 1: Create print helper utility

**Files:**
- Create: `apps/desktop/src/renderer/src/lib/print.ts`

- [ ] **Step 1: Write print helper**

```typescript
export function printHtml(html: string): void {
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  win.close();
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/lib/print.ts
git commit -m "feat: add print helper utility"
```

### Task 2: Integrate Print button into InvoiceDetail

**Files:**
- Modify: `apps/desktop/src/renderer/src/routes/invoices/Detail.tsx`

- [ ] **Step 1: Import print helper and add button**

```typescript
import { printHtml } from '../../lib/print';
// ...
// In InvoiceDetail component:
  async function handlePrint(): Promise<void> {
    const doc = await api.documents.invoice(inv.id);
    printHtml(doc.html);
  }
// ...
// In JSX header:
          <Button loading={docBusy} onClick={() => { void generateInvoice(); }}>Archive invoice</Button>
          <Button onClick={() => { void handlePrint(); }}>Print invoice</Button>
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/routes/invoices/Detail.tsx
git commit -m "feat: add print invoice button to detail view"
```
