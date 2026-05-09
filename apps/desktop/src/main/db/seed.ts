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

  log.info('seeding starter catalog + customers + sample bookings');
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

  const insertBooking = db.prepare(
    `INSERT INTO bookings (id, tenant_id, customer_id, status, starts_at, ends_at,
       pickup_location, dropoff_location, driver_name, notes, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  );
  const insertLine = db.prepare(
    `INSERT INTO booking_lines (id, tenant_id, booking_id, item_id, item_unit_id, quantity,
       daily_rate_pesewas, odometer_start_km, odometer_end_km, fuel_litres_start, fuel_litres_end,
       notes, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  );

  const itemIdsBySku = new Map<string, string>();
  const customerIdsByName = new Map<string, string>();

  const tx = db.transaction(() => {
    for (const it of ITEMS) {
      const id = uuidv4();
      itemIdsBySku.set(it.sku, id);
      insertItem.run(
        id, tenantId, it.kind, it.sku, it.name, it.description,
        it.daily_rate_pesewas, it.replacement_value_pesewas, it.total_quantity,
        now, now,
      );
    }
    for (const c of CUSTOMERS) {
      const id = uuidv4();
      customerIdsByName.set(c.name, id);
      insertCustomer.run(
        id, tenantId, c.name, c.phone, c.email, c.id_type, c.id_number,
        c.address, c.notes, now, now,
      );
    }

    // Two illustrative bookings so the calendar has something to show.
    const inDays = (n: number, hours = 8): string => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      d.setHours(hours, 0, 0, 0);
      return d.toISOString();
    };

    const booking1 = uuidv4();
    insertBooking.run(
      booking1, tenantId,
      customerIdsByName.get('Akosua Mensah'),
      'reserved',
      inDays(3, 8), inDays(5, 18),
      'Shop yard', 'East Legon — community centre',
      null,
      'Annual fundraiser. Confirmed by phone Tuesday.',
      now, now,
    );
    insertLine.run(
      uuidv4(), tenantId, booking1,
      itemIdsBySku.get('CHR-WHT-01'), null, 80, 800,
      null, null, null, null, null, now, now,
    );
    insertLine.run(
      uuidv4(), tenantId, booking1,
      itemIdsBySku.get('TBL-RND-72'), null, 8, 4500,
      null, null, null, null, null, now, now,
    );

    const booking2 = uuidv4();
    insertBooking.run(
      booking2, tenantId,
      customerIdsByName.get('Kwame Asare'),
      'quote',
      inDays(10, 6), inDays(11, 14),
      'Shop yard', 'Osu mortuary',
      'Joseph Boateng',
      'Family burial — requested Cadillac specifically.',
      now, now,
    );
    insertLine.run(
      uuidv4(), tenantId, booking2,
      itemIdsBySku.get('HRS-CADILLAC-XTS'), null, 1, 320000,
      null, null, null, null, null, now, now,
    );
  });
  tx();
}
