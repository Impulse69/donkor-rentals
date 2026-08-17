# Donkor & Sons — Rental Management Software (v1.2.0)

Desktop rental management software designed for **Donkor & Sons (Ghana)**. This high-fidelity offline-first application automates and coordinates **event/party supplies rentals** (tents/canopies, chairs, sofas, tables, sound, lighting, decor) and **hearse fleet scheduling** for premium funeral services.

---

## 🚀 Application Status: v1.2.0 (Production Ready)

The application has evolved past initial scaffold phases into a fully functional, robust offline desktop suite with local backup and GitHub-based app updates.

### Key Features Delivered
1. **Catalog & Inventory Management**: Fully typed soft-deletable catalog supporting bulk stock items (party supplies) and individual asset-tracked serial units (hearses).
2. **Customer Rolodex**: Rich customer database with searchability, soft deletion, and history tracking.
3. **Bookings & Smart Scheduling**: Dynamic, conflict-free scheduling engine. It enforces overlapping reservation guards and assigns drivers, pickup locations, and trackable odometer/fuel statuses for the hearse fleet. Includes full support for Walk-In Renters.
4. **Invoicing & Ledger Math**: Generates contract sheets, manages security deposits, records partial payments in Ghanaian Cedis (₵), calculates late fees, and handles full returns/refunds.
5. **Offline Company File**: Operations write to a local transactional SQLite database with explicit local backup and restore.
6. **Damage Assessment & Photo Proofs**: On-return damage checklists with local photo references and automatic deduction calculations against the customer's held deposit.
7. **Document Generation & Direct Printing**: Automatic PDF building for customized contracts, trip sheets, receipts, and invoices with instant print routing.
8. **Owner & Admin Dashboards**: Dynamic charts representing utilization statistics, revenue cycles, outstanding balances, top clients, and active bookings.
9. **Company Setup**: First-run setup captures company identity, TIN, fiscal year start, and Ghana Cedi defaults without requiring a login.

---

## 💻 Tech Stack

- **Desktop Framework**: Electron (with secure isolated context bridge)
- **Frontend UI Layer**: React + TypeScript + Vite
- **Local Persistence**: SQLite via `better-sqlite3` (running strictly inside Electron's Node main process)
- **Local Backup**: SQLite backup/restore with manifest files
- **Form & Payload Validation**: Zod
- **Distribution & Updates**: `electron-builder` + GitHub Releases auto-updating via `electron-updater`
- **Regional Settings**: Ghana Locale: GHS (₵), `en-GB` format

---

## 📂 Project Structure

```text
donkor-rentals/
├── apps/desktop/
│   ├── src/main/          # Electron Main Process (DB migrations, repos, IPC handlers, backup)
│   ├── src/preload/       # Secure Context Bridge (API exposing, types)
│   ├── src/renderer/      # React Renderer Process (UI components, styling, routing)
│   └── electron-builder.yml
├── packages/shared/       # Shared Domain Schemas, validation models, and core utility logic
└── packages/db/           # SQLite migration SQL scripts
```

---

## 🛠️ Developer Setup & Setup Onboarding

### 1. Requirements
Ensure you have the following installed:
- **Node.js**: v22+
- **pnpm**: v11+
- **Git**

### 2. Quickstart
```bash
# Install monorepo dependencies (postinstall fetches the Electron-ABI
# better-sqlite3 binding automatically)
pnpm install

# Start the Electron application with Hot Module Replacement (HMR)
pnpm dev

# Run full code validation checks
pnpm lint              # Run ESLint validation
pnpm typecheck         # Validate TypeScript types across all workspaces
pnpm test              # Run Vitest suite
pnpm build             # Package assets and prepare the production distributables
pnpm rebuild-natives   # Manually refetch native bindings against Electron's Node ABI
```

> **Native bindings (`better-sqlite3`)**: this app uses Electron's Node ABI, not your
> system Node ABI. `pnpm install` runs `scripts/rebuild-natives.cjs` which calls
> `prebuild-install --runtime=electron --target=<electron-version>` to fetch the
> correct prebuilt `.node` file. If `pnpm dev` ever fails with
> `Could not locate the bindings file`, run `pnpm rebuild-natives` to refetch.

---

## 🔌 IPC Architecture: How to Add a New IPC Channel

This application enforces a strict, secure boundary between the **Renderer** (React) and the **Main Process** (Node/DB) via a custom **typed IPC Envelope**. The renderer **never** executes SQL or makes direct remote HTTP calls; it sends requests through the context bridge, receiving structured `Result<T>` envelopes.

To register and consume a new IPC endpoint, follow this 5-step workflow:

### Step 1: Define Payload Validation Schemas
Define the input validation schemas and TypeScript types in the shared package. This acts as the single source of truth for both main and renderer processes.

*File: `packages/shared/src/schemas/settings.ts` (Example)*
```typescript
import { z } from 'zod';

export const UpdateTaxRateInput = z.object({
  rate_percent: z.number().min(0).max(100),
});

export type UpdateTaxRateInput = z.infer<typeof UpdateTaxRateInput>;
```

### Step 2: Implement Main Process Business Logic
Create or update repository functions in the main process that will interact with SQLite or other modules.

*File: `apps/desktop/src/main/repositories/settings.ts` (Example)*
```typescript
import type { Database } from 'better-sqlite3';

export function updateTaxRate(db: Database, tenantId: string, rate: number): { success: boolean } {
  db.prepare('UPDATE tenants SET tax_rate_percent = ? WHERE id = ?')
    .run(rate, tenantId);
  return { success: true };
}
```

### Step 3: Register the IPC Channel Handler
Register the IPC handler in the main process handlers directory. Wrap the callback with the `wrap()` envelope utility to automatically validate input payloads against your Zod schema and catch any thrown exceptions, returning a clean `{ ok: true, data: T }` or `{ ok: false, error: IpcError }` structure.

*File: `apps/desktop/src/main/ipc/handlers/settings.ts` (Example)*
```typescript
import { ipcMain } from 'electron';
import { wrap } from '../envelope';
import { getDb, ensureBootstrapTenant } from '../../db';
import { UpdateTaxRateInput } from '@shared/schemas';
import * as settings from '../../repositories/settings';

export function registerSettingsIpc(): void {
  ipcMain.handle(
    'settings:updateTaxRate',
    wrap('settings:updateTaxRate', UpdateTaxRateInput, (payload) => {
      const db = getDb();
      const tenantId = ensureBootstrapTenant(db);
      return settings.updateTaxRate(db, tenantId, payload.rate_percent);
    })
  );
}
```
*Note: Make sure your handler function (e.g., `registerSettingsIpc()`) is called inside `registerIpc()` in `apps/desktop/src/main/ipc/index.ts`.*

### Step 4: Expose the Channel via Preload Bridge
Expose the endpoint to the frontend by adding it to the secure preload API interface. This maps the IPC channel call inside the isolated sandbox.

*File: `apps/desktop/src/preload/index.ts` (Example)*
```typescript
const api = {
  // ... other domains
  settings: {
    // ... other calls
    updateTaxRate: (input: UpdateTaxRateInput) => 
      call<{ success: boolean }>('settings:updateTaxRate', input),
  }
} as const;
```

### Step 5: Wrap & Consume in the Renderer UI
Add a lightweight, unwrapped helper to your renderer's frontend API proxy. The `unwrap` helper catches failed envelopes and throws typed React-level `IpcError` exceptions, which can be easily handled by local `ErrorBoundary` cards or `try-catch` blocks.

*File: `apps/desktop/src/renderer/src/lib/api.ts` (Example)*
```typescript
export const api = {
  // ... other domains
  settings: {
    // ... other wrappers
    updateTaxRate: (input: Parameters<typeof window.donkor.settings.updateTaxRate>[0]) =>
      unwrap(window.donkor.settings.updateTaxRate(input)),
  }
};
```

You can now call this seamlessly in any React component:
```tsx
import { api } from '@renderer/lib/api';

const handleTaxUpdate = async () => {
  try {
    const result = await api.settings.updateTaxRate({ rate_percent: 15 });
    console.log('Tax rate updated successfully!', result);
  } catch (err) {
    console.error('Failed to update tax:', err);
  }
};
```

