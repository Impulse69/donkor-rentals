import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureChartOfAccounts } from '../accounting/chart';
import { createBooking } from './bookings';
import { createInvoiceFromBooking, recordPayment, updateInvoice } from './invoices';

/**
 * What actually prints.
 *
 * The invoice and receipt are the only part of this system a customer holds in
 * their hand, and nothing asserted on them. An audit of the rendered output
 * found: every part-paid invoice printed "Amount Paid 0.00" with the full total
 * as the balance (a PAID one did too); the payment ledger printed the literal
 * word "undefined"; no line showed its days, so qty x price never equalled the
 * amount; the receipt's status was hardcoded PAID and its tax lines were read
 * from a column that is always zero. These tests read the documents the way a
 * customer would and pin each of those down.
 */
vi.mock('electron', () => ({ app: { getPath: () => process.env.TEMP ?? '/tmp', getVersion: () => '0.0.0-test' } }));

// Imported after the mock so documents.ts does not pull a real Electron.
const { generateInvoiceDocument, generateReceipt } = await import('./documents');

const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';
const CHAIRS = 'item-chairs';

let db: Database.Database;

function makeDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    d.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  const now = new Date().toISOString();
  d.prepare(
    `INSERT INTO tenants (id, name, currency, locale, address, phone, tin, created_at, updated_at)
     VALUES (?, 'Donkor & Sons Ltd', 'GHS', 'en-GB', 'P. O. Box 92 Agona Swedru', '0203915510', 'C0001234567', ?, ?)`,
  ).run(TENANT, now, now);
  d.prepare(
    `INSERT INTO items (id, tenant_id, kind, sku, name, daily_rate_pesewas,
      replacement_value_pesewas, total_quantity, status, created_at, updated_at)
     VALUES (?, ?, 'party_supply', 'CHAIR', 'Tiffany chair, gold', 1250, 6000, 500, 'active', ?, ?)`,
  ).run(CHAIRS, TENANT, now, now);
  ensureChartOfAccounts(d, TENANT);
  return d;
}

/** 150 chairs x 12.50 x 3 days = 5,625.00 before tax. */
function threeDayBooking(): string {
  return createBooking(db, TENANT, {
    customer_id: null,
    renter_name: 'Akosua Mensah',
    renter_phone: null,
    starts_at: '2026-09-04T08:00:00.000Z',
    ends_at: '2026-09-07T08:00:00.000Z',
    pickup_location: null,
    dropoff_location: null,
    driver_name: null,
    notes: null,
    lines: [{ item_id: CHAIRS, item_unit_id: null, quantity: 150, daily_rate_pesewas: 1_250, notes: null }],
  } as Parameters<typeof createBooking>[2]).id;
}

function issued(statutory: boolean) {
  const inv = createInvoiceFromBooking(db, TENANT, {
    booking_id: threeDayBooking(),
    due_at: '2026-09-20T17:00:00.000Z',
    include_statutory_taxes: statutory,
  } as Parameters<typeof createInvoiceFromBooking>[2]);
  return updateInvoice(db, TENANT, inv.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3]);
}

function pay(invoiceId: string, amount: number, opts: { reference?: string; kind?: 'payment' | 'refund' } = {}) {
  return recordPayment(db, TENANT, {
    invoice_id: invoiceId,
    kind: opts.kind ?? 'payment',
    amount_pesewas: amount,
    method: 'mobile_money',
    paid_at: '2026-09-01T10:00:00.000Z',
    reference: opts.reference ?? null,
    notes: null,
  } as Parameters<typeof recordPayment>[2]).payment;
}

/** Strip tags so assertions read like the printed page. */
function text(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ');
}

/** Pull the figure printed next to a label in the totals block. */
function figure(html: string, label: string): string | null {
  const m = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</td>\\s*<td[^>]*>\\s*([^<]+)`).exec(html);
  return m ? m[1].trim() : null;
}

beforeEach(() => {
  db = makeDb();
});

describe('invoice', () => {
  it('prints what has been paid and what is owed', () => {
    // 5,625.00 net + 140.63 + 140.63 + 885.94 = 6,792.20. Pay 2,000.
    const inv = issued(true);
    pay(inv.id, 200_000, { reference: 'MM-88213' });
    const html = generateInvoiceDocument(db, TENANT, inv.id).html;

    expect(figure(html, 'Amount Paid')).toBe('GHC 2,000.00');
    expect(figure(html, 'Balance')).toBe('GHC 4,792.20');
  });

  it('prints a settled invoice as settled', () => {
    // The case that was most wrong: a PAID invoice said the customer owed it all.
    const inv = issued(true);
    pay(inv.id, inv.total_pesewas);
    const html = generateInvoiceDocument(db, TENANT, inv.id).html;

    expect(figure(html, 'Amount Paid')).toBe('GHC 6,792.20');
    expect(figure(html, 'Balance')).toBe('GHC 0.00');
  });

  it('never prints the word undefined', () => {
    const inv = issued(true);
    pay(inv.id, 200_000, { reference: 'MM-88213' });
    const t = text(generateInvoiceDocument(db, TENANT, inv.id).html);
    expect(t).not.toMatch(/undefined|NaN|null/);
    // The payment line carries its kind and reference.
    expect(t).toContain('Payment');
    expect(t).toContain('MM-88213');
  });

  it('shows a refund as money going back, and nets it off', () => {
    const inv = issued(true);
    pay(inv.id, 300_000);
    pay(inv.id, 100_000, { kind: 'refund' });
    const html = generateInvoiceDocument(db, TENANT, inv.id).html;

    expect(text(html)).toContain('Refund');
    expect(html).toMatch(/Refund[\s\S]{0,200}−GHC 1,000\.00/);
    expect(figure(html, 'Amount Paid')).toBe('GHC 2,000.00');
  });

  it('prints the days so quantity x rate x days equals the amount', () => {
    const html = generateInvoiceDocument(db, TENANT, issued(false).id).html;
    const t = text(html);
    // Without this, the line reads "150 x 12.50 = 5,625.00", a 3x overcharge.
    expect(t).toContain('3 days');
    expect(t).toContain('GHC 12.50');
    expect(t).toContain('GHC 5,625.00');
  });

  it('shows the statutory breakdown only on a statutory invoice', () => {
    const stat = text(generateInvoiceDocument(db, TENANT, issued(true).id).html);
    expect(stat).toContain('NHIL');
    expect(stat).toContain('GETFund');
    expect(stat).toContain('VAT');

    const simple = text(generateInvoiceDocument(db, TENANT, issued(false).id).html);
    expect(simple).not.toContain('NHIL');
    expect(simple).not.toContain('VAT (15%)');
  });

  it('adds up: net + levies + VAT = total, to the pesewa', () => {
    const inv = issued(true);
    const html = generateInvoiceDocument(db, TENANT, inv.id).html;
    const money = (label: string): number => Number((figure(html, label) ?? '').replace(/[^\d.]/g, ''));
    const sum = money('Total') + money('NHIL (2.5%)') + money('GETFund (2.5%)') + money('VAT (15%)');
    expect(sum.toFixed(2)).toBe(money('Total Amount').toFixed(2));
  });

  it('carries the company profile as its letterhead, not a hardcoded one', () => {
    const t = text(generateInvoiceDocument(db, TENANT, issued(true).id).html);
    expect(t).toContain('Donkor & Sons Ltd');
    expect(t).toContain('P. O. Box 92 Agona Swedru');
    expect(t).toContain('0203915510');
    expect(t).toContain('C0001234567');
    // The old placeholder block must be gone from every document.
    expect(t).not.toContain('+233 20 000 0000');
    expect(t).not.toContain('donkorrentals.com');
  });

  it('shows the rental period', () => {
    const t = text(generateInvoiceDocument(db, TENANT, issued(true).id).html);
    expect(t).toMatch(/4 Sept 2026\s*–\s*7 Sept 2026/);
  });

  it('prints a credit rather than a blank zero when the customer has overpaid on paper', () => {
    // A settled statutory invoice printed in Simple format: the total on paper
    // drops below what was received. That is a credit and must say so.
    const inv = issued(true);
    pay(inv.id, inv.total_pesewas);
    const html = generateInvoiceDocument(db, TENANT, inv.id, { overrideStatutory: false }).html;
    expect(text(html)).toContain('Credit due to customer');
    expect(figure(html, 'Credit due to customer')).toBe('GHC 1,167.20');
  });
});

describe('receipt', () => {
  it('says PART PAID when the bill is not settled, and PAID when it is', () => {
    const inv = issued(true);
    const first = pay(inv.id, 200_000);
    expect(text(generateReceipt(db, TENANT, first.id).html)).toContain('PART PAID');

    const second = pay(inv.id, inv.total_pesewas - 200_000);
    const t = text(generateReceipt(db, TENANT, second.id).html);
    expect(t).toContain('PAID');
    expect(t).not.toContain('PART PAID');
  });

  it('shows this payment, paid to date, and what is left', () => {
    const inv = issued(true);
    pay(inv.id, 100_000);
    const second = pay(inv.id, 200_000);
    const html = generateReceipt(db, TENANT, second.id).html;

    expect(figure(html, 'Paid to date')).toBe('GHC 3,000.00');
    expect(figure(html, 'Balance remaining')).toBe('GHC 3,792.20');
    expect(text(html)).toContain('This receipt · MOBILE_MONEY GHC 2,000.00');
  });

  it('itemises the taxes on a statutory receipt', () => {
    // It used to read the stored tax_pesewas column, which is always 0, so the
    // receipt jumped from subtotal to total with nothing in between.
    const inv = issued(true);
    const html = generateReceipt(db, TENANT, pay(inv.id, inv.total_pesewas).id).html;
    expect(figure(html, 'NHIL (2.5%)')).toBe('GHC 140.63');
    expect(figure(html, 'GETFund (2.5%)')).toBe('GHC 140.63');
    expect(figure(html, 'VAT (15%)')).toBe('GHC 885.94');
  });

  it('uses the same letterhead and currency label as the invoice', () => {
    const inv = issued(true);
    const t = text(generateReceipt(db, TENANT, pay(inv.id, inv.total_pesewas).id).html);
    expect(t).toContain('Donkor & Sons Ltd');
    expect(t).toContain('0203915510');
    expect(t).not.toContain('+233 20 000 0000');
    expect(t).not.toMatch(/GHS \d/);
  });
});
