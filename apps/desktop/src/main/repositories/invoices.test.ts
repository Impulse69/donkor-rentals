import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import {
  computeStatutoryTaxes,
  createInvoiceFromBooking,
  updateInvoice,
} from './invoices';
import { renderInvoiceHtml, applyStatutoryOverride, type InvoiceTemplateData } from './documents';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ITEM_ID = '00000000-0000-4000-8000-000000000010';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL, locale TEXT NOT NULL,
      address TEXT, phone TEXT, logo_path TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE customers (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL, phone TEXT, email TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE items (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
      kind TEXT NOT NULL, sku TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT, daily_rate_pesewas INTEGER NOT NULL,
      replacement_value_pesewas INTEGER NOT NULL, total_quantity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE item_units (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, item_id TEXT NOT NULL,
      identifier TEXT, plate TEXT, status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
      customer_id TEXT, renter_name TEXT, status TEXT NOT NULL,
      starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
      pickup_location TEXT, dropoff_location TEXT, driver_name TEXT, notes TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE booking_lines (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, booking_id TEXT NOT NULL,
      item_id TEXT NOT NULL, item_unit_id TEXT,
      quantity INTEGER NOT NULL, daily_rate_pesewas INTEGER NOT NULL,
      odometer_start_km INTEGER, odometer_end_km INTEGER,
      fuel_litres_start REAL, fuel_litres_end REAL, notes TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE invoices (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, booking_id TEXT NOT NULL,
      number TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      issued_at TEXT, due_at TEXT,
      subtotal_pesewas INTEGER NOT NULL CHECK (subtotal_pesewas >= 0),
      tax_pesewas INTEGER NOT NULL DEFAULT 0,
      discount_pesewas INTEGER NOT NULL DEFAULT 0,
      total_pesewas INTEGER NOT NULL CHECK (total_pesewas >= 0),
      include_statutory_taxes INTEGER NOT NULL DEFAULT 1 CHECK (include_statutory_taxes IN (0, 1)),
      nhil_pesewas INTEGER NOT NULL DEFAULT 0 CHECK (nhil_pesewas >= 0),
      getfund_pesewas INTEGER NOT NULL DEFAULT 0 CHECK (getfund_pesewas >= 0),
      vat_pesewas INTEGER NOT NULL DEFAULT 0 CHECK (vat_pesewas >= 0),
      initial_payment_percent INTEGER NOT NULL DEFAULT 50 CHECK (initial_payment_percent BETWEEN 0 AND 100),
      before_delivery_percent INTEGER NOT NULL DEFAULT 50 CHECK (before_delivery_percent BETWEEN 0 AND 100),
      notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      UNIQUE (tenant_id, number)
    );
    CREATE TABLE invoice_lines (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, invoice_id TEXT NOT NULL,
      booking_line_id TEXT, description TEXT NOT NULL,
      quantity INTEGER NOT NULL, days INTEGER NOT NULL,
      unit_price_pesewas INTEGER NOT NULL, line_total_pesewas INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE payments (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, invoice_id TEXT NOT NULL,
      kind TEXT NOT NULL, amount_pesewas INTEGER NOT NULL,
      method TEXT NOT NULL, reference TEXT, paid_at TEXT NOT NULL,
      notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE invoice_sequences (
      tenant_id TEXT PRIMARY KEY, next_value INTEGER NOT NULL DEFAULT 1
    );
  `);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
     VALUES (?, 'Donkor & Sons', 'GHS', 'en-GB', ?, ?)`,
  ).run(TENANT_ID, now, now);
  db.prepare(
    `INSERT INTO items (id, tenant_id, kind, sku, name, daily_rate_pesewas,
       replacement_value_pesewas, total_quantity, status, created_at, updated_at)
     VALUES (?, ?, 'party_supply', 'CHAIR-01', 'Stack chairs', 1000, 5000, 100, 'active', ?, ?)`,
  ).run(ITEM_ID, TENANT_ID, now, now);
  return db;
}

function seedBooking(db: Database.Database, opts: { quantity: number; rate: number }): string {
  const bookingId = uuid();
  const now = new Date().toISOString();
  const starts = '2026-06-01T09:00:00.000Z';
  const ends = '2026-06-02T09:00:00.000Z'; // 1 day
  db.prepare(
    `INSERT INTO bookings (id, tenant_id, renter_name, status, starts_at, ends_at,
       created_at, updated_at)
     VALUES (?, ?, 'Walk-in', 'reserved', ?, ?, ?, ?)`,
  ).run(bookingId, TENANT_ID, starts, ends, now, now);
  db.prepare(
    `INSERT INTO booking_lines (id, tenant_id, booking_id, item_id, quantity,
       daily_rate_pesewas, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(uuid(), TENANT_ID, bookingId, ITEM_ID, opts.quantity, opts.rate, now, now);
  return bookingId;
}

describe('computeStatutoryTaxes — cascading Ghana VAT', () => {
  it('₵1000 subtotal (100000 pesewas)', () => {
    const r = computeStatutoryTaxes(100_000);
    // nhil = round(100000 * 0.025) = 2500
    // getfund = 2500
    // vat = round((100000 + 2500 + 2500) * 0.15) = round(15750) = 15750
    expect(r.nhil).toBe(2500);
    expect(r.getfund).toBe(2500);
    expect(r.vat).toBe(15_750);
    expect(r.total_inclusive).toBe(120_750);
  });

  it('1 pesewa subtotal — rounding floor', () => {
    const r = computeStatutoryTaxes(1);
    // nhil = round(0.025) = 0
    // getfund = 0
    // vat = round((1 + 0 + 0) * 0.15) = 0
    expect(r.nhil).toBe(0);
    expect(r.getfund).toBe(0);
    expect(r.vat).toBe(0);
    expect(r.total_inclusive).toBe(1);
  });

  it('999999 pesewas — large subtotal', () => {
    const r = computeStatutoryTaxes(999_999);
    // nhil    = round(999999 * 0.025) = round(24999.975) = 25000
    // getfund = 25000
    // vat     = round((999999 + 25000 + 25000) * 0.15) = round(157499.85) = 157500
    expect(r.nhil).toBe(25_000);
    expect(r.getfund).toBe(25_000);
    expect(r.vat).toBe(157_500);
    expect(r.total_inclusive).toBe(1_207_499);
  });

  it('zero subtotal stays zero', () => {
    expect(computeStatutoryTaxes(0)).toEqual({ nhil: 0, getfund: 0, vat: 0, total_inclusive: 0 });
  });
});

describe('createInvoiceFromBooking — two formats', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
  });

  it('Format A (Statutory): subtotal + NHIL + GETFund + VAT − discount', () => {
    const bookingId = seedBooking(db, { quantity: 100, rate: 1000 }); // 100 * 1000 * 1 day = 100,000
    const inv = createInvoiceFromBooking(db, TENANT_ID, {
      booking_id: bookingId,
      include_statutory_taxes: true,
      initial_payment_percent: 60,
      before_delivery_percent: 40,
      discount_pesewas: 0,
    });
    expect(inv.include_statutory_taxes).toBe(true);
    expect(inv.subtotal_pesewas).toBe(100_000);
    expect(inv.nhil_pesewas).toBe(2_500);
    expect(inv.getfund_pesewas).toBe(2_500);
    expect(inv.vat_pesewas).toBe(15_750);
    expect(inv.total_pesewas).toBe(120_750);
    expect(inv.initial_payment_percent).toBe(60);
    expect(inv.before_delivery_percent).toBe(40);
  });

  it('Format B (Simple): subtotal only', () => {
    const bookingId = seedBooking(db, { quantity: 100, rate: 1000 });
    const inv = createInvoiceFromBooking(db, TENANT_ID, {
      booking_id: bookingId,
      include_statutory_taxes: false,
      initial_payment_percent: 50,
      before_delivery_percent: 50,
      discount_pesewas: 0,
    });
    expect(inv.include_statutory_taxes).toBe(false);
    expect(inv.subtotal_pesewas).toBe(100_000);
    expect(inv.nhil_pesewas).toBe(0);
    expect(inv.getfund_pesewas).toBe(0);
    expect(inv.vat_pesewas).toBe(0);
    expect(inv.total_pesewas).toBe(100_000);
  });

  it('discount applies at the end in Statutory format', () => {
    const bookingId = seedBooking(db, { quantity: 100, rate: 1000 });
    const inv = createInvoiceFromBooking(db, TENANT_ID, {
      booking_id: bookingId,
      include_statutory_taxes: true,
      initial_payment_percent: 50,
      before_delivery_percent: 50,
      discount_pesewas: 750,
    });
    // 120_750 − 750 = 120_000
    expect(inv.total_pesewas).toBe(120_000);
    expect(inv.nhil_pesewas).toBe(2_500); // breakdown unchanged
  });

  it('discount applies at the end in Simple format', () => {
    const bookingId = seedBooking(db, { quantity: 100, rate: 1000 });
    const inv = createInvoiceFromBooking(db, TENANT_ID, {
      booking_id: bookingId,
      include_statutory_taxes: false,
      initial_payment_percent: 50,
      before_delivery_percent: 50,
      discount_pesewas: 1_000,
    });
    expect(inv.total_pesewas).toBe(99_000);
  });

  it('updateInvoice recomputes when format toggles', () => {
    const bookingId = seedBooking(db, { quantity: 100, rate: 1000 });
    const inv = createInvoiceFromBooking(db, TENANT_ID, {
      booking_id: bookingId,
      include_statutory_taxes: true,
      initial_payment_percent: 50,
      before_delivery_percent: 50,
      discount_pesewas: 0,
    });
    expect(inv.total_pesewas).toBe(120_750);
    const after = updateInvoice(db, TENANT_ID, inv.id, { include_statutory_taxes: false });
    expect(after.include_statutory_taxes).toBe(false);
    expect(after.nhil_pesewas).toBe(0);
    expect(after.getfund_pesewas).toBe(0);
    expect(after.vat_pesewas).toBe(0);
    expect(after.total_pesewas).toBe(100_000);
  });
});

describe('renderInvoiceHtml — customer-mandated template', () => {
  const baseInvoice: InvoiceTemplateData = {
    number: 'INV-000123',
    status: 'draft',
    issued_at: '2026-05-20T10:00:00.000Z',
    due_at: '2026-05-27T10:00:00.000Z',
    notes: null,
    customer_name: 'Acme Events Ltd.',
    subtotal_pesewas: 100_000,
    discount_pesewas: 0,
    total_pesewas: 120_750,
    include_statutory_taxes: true,
    nhil_pesewas: 2_500,
    getfund_pesewas: 2_500,
    vat_pesewas: 15_750,
    initial_payment_percent: 60,
    before_delivery_percent: 40,
    lines: [
      { description: 'Stack chairs\nGold trim, padded', quantity: 100, unit_price_pesewas: 1_000, line_total_pesewas: 100_000 },
    ],
  };

  it('Format A renders statutory tax lines', () => {
    const html = renderInvoiceHtml(baseInvoice);
    // Anchor on the cell markup so base64 logo noise can't false-positive.
    expect(html).toContain('>NHIL (2.5%)<');
    expect(html).toContain('>GETFund (2.5%)<');
    expect(html).toContain('>VAT (15%)<');
    expect(html).toContain('Total Amount');
    expect(html).toContain('GHC 1000.00'); // subtotal in cedis
    expect(html).toContain('GHC 1207.50'); // total — no thousands separator in template
    expect(html).toContain('Acme Events Ltd.');
    expect(html).toContain('INV-000123');
    expect(html).toContain('Initial Payment: 60%');
    expect(html).toContain('Before Delivery: 40%');
    expect(html).toContain('S/n');
    expect(html).toContain('Description');
    expect(html).toContain('Specifications');
    expect(html).toContain('Gold trim, padded');
  });

  it('Format B renders only subtotal and total, no statutory rows', () => {
    const html = renderInvoiceHtml({ ...baseInvoice, include_statutory_taxes: false, nhil_pesewas: 0, getfund_pesewas: 0, vat_pesewas: 0, total_pesewas: 100_000 });
    // The 135 KB base64 logo on the letterhead can coincidentally contain the
    // letters "VAT", "NHIL" etc. as substrings — so we check for the actual
    // totals-table cell markup rather than the bare word.
    expect(html).not.toContain('>NHIL (2.5%)<');
    expect(html).not.toContain('>GETFund (2.5%)<');
    expect(html).not.toContain('>VAT (15%)<');
    expect(html).toContain('Total Amount');
    expect(html).toContain('GHC 1000.00');
  });

  it('always renders the note and tagline footer', () => {
    const a = renderInvoiceHtml(baseInvoice);
    const b = renderInvoiceHtml({ ...baseInvoice, include_statutory_taxes: false });
    for (const html of [a, b]) {
      expect(html).toContain('PRICES QUOTED EXCLUDES TRANSPORTATION AND HANDLING');
      expect(html).toContain('where every event becomes a memory');
      expect(html).toContain('Donkor and Sons Ltd.');
      expect(html).toContain('P. O. Box 92 Agona Swedru');
      expect(html).toContain('www.donkorandsons.com');
      expect(html).toContain('Bill To:');
      // Logo letterhead — base64-embedded so the print HTML is self-contained.
      expect(html).toContain('data:image/png;base64,');
      expect(html).toContain('class="logo"');
    }
  });
});

describe('applyStatutoryOverride — print-time format swap', () => {
  const statutory: InvoiceTemplateData = {
    number: 'INV-OVR-1', status: 'issued',
    issued_at: null, due_at: null, notes: null,
    customer_name: 'X', subtotal_pesewas: 100_000, discount_pesewas: 0,
    total_pesewas: 120_750, include_statutory_taxes: true,
    nhil_pesewas: 2_500, getfund_pesewas: 2_500, vat_pesewas: 15_750,
    initial_payment_percent: 50, before_delivery_percent: 50,
    lines: [{ description: 'X', quantity: 1, unit_price_pesewas: 100_000, line_total_pesewas: 100_000 }],
  };

  it('Statutory → Simple zeroes the breakdown and rebases the total on subtotal', () => {
    const out = applyStatutoryOverride(statutory, false);
    expect(out.include_statutory_taxes).toBe(false);
    expect(out.nhil_pesewas).toBe(0);
    expect(out.getfund_pesewas).toBe(0);
    expect(out.vat_pesewas).toBe(0);
    expect(out.total_pesewas).toBe(100_000); // subtotal − discount(0)
  });

  it('Simple → Statutory recomputes NHIL/GETFund/VAT via the cascading Ghana formula', () => {
    const simple: InvoiceTemplateData = { ...statutory, include_statutory_taxes: false, nhil_pesewas: 0, getfund_pesewas: 0, vat_pesewas: 0, total_pesewas: 100_000 };
    const out = applyStatutoryOverride(simple, true);
    expect(out.include_statutory_taxes).toBe(true);
    expect(out.nhil_pesewas).toBe(2_500);
    expect(out.getfund_pesewas).toBe(2_500);
    expect(out.vat_pesewas).toBe(15_750);
    expect(out.total_pesewas).toBe(120_750);
  });

  it('applies discount last in both directions', () => {
    const withDisc: InvoiceTemplateData = { ...statutory, discount_pesewas: 5_000, total_pesewas: 115_750 };
    const off = applyStatutoryOverride(withDisc, false);
    expect(off.total_pesewas).toBe(95_000); // 100_000 − 5_000

    const simpleWithDisc: InvoiceTemplateData = {
      ...statutory, include_statutory_taxes: false, nhil_pesewas: 0, getfund_pesewas: 0, vat_pesewas: 0,
      discount_pesewas: 5_000, total_pesewas: 95_000,
    };
    const on = applyStatutoryOverride(simpleWithDisc, true);
    expect(on.total_pesewas).toBe(115_750); // 100k + 2.5k + 2.5k + 15.75k − 5k
  });

  it('no-op when the override matches the persisted flag', () => {
    expect(applyStatutoryOverride(statutory, true)).toBe(statutory);
  });

  it('rebases balance_due_pesewas on the new total while preserving amount_paid_pesewas', () => {
    // 50k already paid against the statutory total of 120,750 → balance 70,750.
    const partiallyPaid: InvoiceTemplateData = {
      ...statutory,
      amount_paid_pesewas: 50_000,
      balance_due_pesewas: 70_750,
    };
    const off = applyStatutoryOverride(partiallyPaid, false);
    expect(off.amount_paid_pesewas).toBe(50_000); // payments are sticky
    expect(off.total_pesewas).toBe(100_000);      // simple total = subtotal
    expect(off.balance_due_pesewas).toBe(50_000); // 100,000 − 50,000
  });
});

describe('renderInvoiceHtml — payment history ledger', () => {
  const withPayments: InvoiceTemplateData = {
    number: 'INV-LDG-1', status: 'issued',
    issued_at: '2026-05-20T10:00:00.000Z', due_at: '2026-05-27T10:00:00.000Z', notes: null,
    customer_name: 'Acme Events Ltd.',
    subtotal_pesewas: 100_000, discount_pesewas: 0, total_pesewas: 120_750,
    include_statutory_taxes: true, nhil_pesewas: 2_500, getfund_pesewas: 2_500, vat_pesewas: 15_750,
    initial_payment_percent: 60, before_delivery_percent: 40,
    lines: [{ description: 'Stack chairs', quantity: 100, unit_price_pesewas: 1_000, line_total_pesewas: 100_000 }],
    payments: [
      { paid_at: '2026-05-10T09:00:00.000Z', kind: 'deposit', method: 'cash',          reference: null,          amount_pesewas: 30_000 },
      { paid_at: '2026-05-15T11:30:00.000Z', kind: 'payment', method: 'mobile_money',  reference: 'MTN-XYZ-987', amount_pesewas: 40_000 },
    ],
    amount_paid_pesewas: 70_000,
    balance_due_pesewas: 50_750,
  };

  it('renders each payment row with date, kind, method and reference', () => {
    const html = renderInvoiceHtml(withPayments);
    expect(html).toContain('Payment history');
    expect(html).toContain('Deposit · Cash');
    expect(html).toContain('Payment · Mobile Money');
    expect(html).toContain('MTN-XYZ-987');
    expect(html).toContain('GHC 300.00'); // first installment
    expect(html).toContain('GHC 400.00'); // second installment
  });

  it('renders Amount Paid and Balance lines under Total Amount', () => {
    const html = renderInvoiceHtml(withPayments);
    expect(html).toContain('Amount Paid');
    expect(html).toContain('GHC 700.00');   // amount_paid
    expect(html).toContain('>Balance<');
    expect(html).toContain('GHC 507.50');   // balance
  });

  it('handles invoices with no payments yet', () => {
    const html = renderInvoiceHtml({ ...withPayments, payments: [], amount_paid_pesewas: 0, balance_due_pesewas: 120_750 });
    expect(html).toContain('No payments received yet');
    expect(html).toContain('>Amount Paid<');
    expect(html).toContain('>Balance<');
  });

  it('renders refunds as negatives', () => {
    const html = renderInvoiceHtml({
      ...withPayments,
      payments: [
        { paid_at: '2026-05-20T11:00:00.000Z', kind: 'refund', method: 'bank', reference: null, amount_pesewas: 10_000 },
      ],
      amount_paid_pesewas: -10_000,
      balance_due_pesewas: 130_750,
    });
    expect(html).toContain('Refund · Bank');
    expect(html).toContain('−GHC 100.00');
  });
});
