/**
 * Dev-only seed: populates a sensible starter catalog so the UI isn't empty
 * the first time `pnpm dev` is run. Idempotent — checks for existing rows.
 */
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log/main';
import { ensureBootstrapTenant } from './index';

interface Seed {
  kind: 'party_supply' | 'hearse';
  sku: string;
  name: string;
  description: string;
  daily_rate_pesewas: number;
  replacement_value_pesewas: number;
  total_quantity: number;
}

const ITEMS: Seed[] = [
  { kind: 'party_supply', sku: 'CHR-WHT-01', name: 'Tiffany chair, white',
    description: 'Resin frame, padded ivory cushion. Most-requested ceremony seating.',
    daily_rate_pesewas: 800, replacement_value_pesewas: 12000, total_quantity: 200 },
  { kind: 'party_supply', sku: 'CHR-GLD-01', name: 'Tiffany chair, gold',
    description: 'Gold-finish resin frame; ivory cushion.',
    daily_rate_pesewas: 1000, replacement_value_pesewas: 14000, total_quantity: 80 },
  { kind: 'party_supply', sku: 'TBL-RND-72', name: 'Round table, 72"',
    description: 'Seats 10. Nests for transport.',
    daily_rate_pesewas: 4500, replacement_value_pesewas: 38000, total_quantity: 24 },
  { kind: 'party_supply', sku: 'TNT-WHT-20', name: 'Canopy 20×30 ft, white',
    description: 'Aluminium frame, opaque vinyl roof, side walls included.',
    daily_rate_pesewas: 65000, replacement_value_pesewas: 480000, total_quantity: 4 },
  { kind: 'party_supply', sku: 'SND-PA-MID', name: 'Mid-size PA stack',
    description: '2× 12" tops, 1× 18" sub, mixer, two SM58s. Up to 200 guests.',
    daily_rate_pesewas: 80000, replacement_value_pesewas: 1200000, total_quantity: 2 },
  { kind: 'party_supply', sku: 'LIT-LED-PAR', name: 'LED par-can, RGBW (set of 8)',
    description: 'DMX-controllable. Includes T-bar stand and cabling.',
    daily_rate_pesewas: 25000, replacement_value_pesewas: 280000, total_quantity: 3 },
  { kind: 'party_supply', sku: 'DCR-DRP-WHT', name: 'White drape kit, 12 ft',
    description: 'Pipe-and-drape, single 12 ft section. White voile.',
    daily_rate_pesewas: 6000, replacement_value_pesewas: 32000, total_quantity: 30 },
  { kind: 'party_supply', sku: 'SOF-CHE-01', name: 'Chesterfield sofa, oxblood',
    description: 'Two-seat tufted leather sofa. Bridal-suite favourite.',
    daily_rate_pesewas: 18000, replacement_value_pesewas: 320000, total_quantity: 4 },

  { kind: 'hearse', sku: 'HRS-MERCEDES-E', name: 'Mercedes-Benz E-Class hearse',
    description: 'White, six-pall capacity. Climate-controlled cabin.',
    daily_rate_pesewas: 280000, replacement_value_pesewas: 18000000, total_quantity: 1 },
  { kind: 'hearse', sku: 'HRS-CADILLAC-XTS', name: 'Cadillac XTS hearse',
    description: 'Black with chrome rails. Long-distance preferred.',
    daily_rate_pesewas: 320000, replacement_value_pesewas: 22000000, total_quantity: 1 },
];

const CUSTOMERS = [
  { name: 'Akosua Mensah', phone: '+233 24 555 0011', email: 'akosua@example.com',
    id_type: 'ghana_card', id_number: 'GHA-123456789-0',
    address: '12 Cantonments Rd, Accra', notes: 'Repeat customer — annual fundraiser.' },
  { name: 'Kwame Asare', phone: '+233 20 444 7733', email: null,
    id_type: 'voter_id', id_number: 'V-887766554',
    address: 'Ring Road East, Osu', notes: 'Funeral planner — calls before noon.' },
  { name: 'Adwoa Boateng', phone: '+233 55 222 1100', email: 'adwoa.b@church.gh',
    id_type: null, id_number: null,
    address: 'East Legon', notes: null },
];

export function seedIfEmpty(db: Database): void {
  const tenantId = ensureBootstrapTenant(db);
  const existing = db.prepare('SELECT COUNT(*) as n FROM items').get() as { n: number };
  if (existing.n > 0) return;

  log.info('seeding starter catalog + customers');
  const now = new Date().toISOString();

  const insertItem = db.prepare(
    `INSERT INTO items (id, tenant_id, kind, sku, name, description,
       daily_rate_pesewas, replacement_value_pesewas, total_quantity,
       status, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)`,
  );
  const insertCustomer = db.prepare(
    `INSERT INTO customers (id, tenant_id, name, phone, email, id_type, id_number,
       address, notes, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  );

  const tx = db.transaction(() => {
    for (const it of ITEMS) {
      insertItem.run(
        uuidv4(), tenantId, it.kind, it.sku, it.name, it.description,
        it.daily_rate_pesewas, it.replacement_value_pesewas, it.total_quantity,
        now, now,
      );
    }
    for (const c of CUSTOMERS) {
      insertCustomer.run(
        uuidv4(), tenantId, c.name, c.phone, c.email, c.id_type, c.id_number,
        c.address, c.notes, now, now,
      );
    }
  });
  tx();
}
