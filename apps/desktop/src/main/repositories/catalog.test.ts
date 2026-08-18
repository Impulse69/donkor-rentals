import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createItem,
  createUnit,
  getItem,
  listItems,
  listUnits,
  restoreItem,
  softDeleteItem,
  softDeleteUnit,
  updateItem,
  updateUnit,
} from './items';
import { createCustomer, getCustomer, listCustomers, softDeleteCustomer, updateCustomer } from './customers';

/**
 * Catalog and rolodex CRUD. Lower consequence than the ledger, but these are the
 * tables every other feature reads, and soft delete is the recurring trap: a
 * "deleted" row still exists, so every list and lookup has to agree on whether
 * it is visible.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';

let db: Database.Database;

function makeDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  // Apply every shipped migration in order, exactly as the real runner does.
  // A hardcoded list here silently pins tests to an old schema the moment a
  // migration lands.
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    d.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  const now = new Date().toISOString();
  d.prepare(
    `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
     VALUES (?, 'Donkor', 'GHS', 'en-GB', ?, ?)`,
  ).run(TENANT, now, now);
  return d;
}

function newItem(over: Record<string, unknown> = {}) {
  return createItem(db, TENANT, {
    kind: 'party_supply',
    sku: 'CHAIR',
    name: 'Chairs',
    description: null,
    daily_rate_pesewas: 1_000,
    replacement_value_pesewas: 5_000,
    total_quantity: 100,
    status: 'active',
    ...over,
  } as Parameters<typeof createItem>[2]);
}

beforeEach(() => {
  db = makeDb();
});

describe('items', () => {
  it('creates and reads back an item', () => {
    const item = newItem();
    expect(getItem(db, TENANT, item.id)?.name).toBe('Chairs');
    expect(item.total_quantity).toBe(100);
  });

  it('refuses a duplicate SKU within a tenant', () => {
    newItem();
    expect(() => newItem({ name: 'Other chairs' })).toThrow();
  });

  it('updates only the fields supplied', () => {
    const item = newItem();
    const updated = updateItem(db, TENANT, item.id, { daily_rate_pesewas: 2_500 } as Parameters<typeof updateItem>[3]);

    expect(updated.daily_rate_pesewas).toBe(2_500);
    expect(updated.name).toBe('Chairs');
    expect(updated.sku).toBe('CHAIR');
  });

  it('hides a soft-deleted item from the list but can restore it', () => {
    const item = newItem();
    expect(listItems(db, TENANT)).toHaveLength(1);

    softDeleteItem(db, TENANT, item.id);
    expect(listItems(db, TENANT)).toHaveLength(0);

    restoreItem(db, TENANT, item.id);
    expect(listItems(db, TENANT)).toHaveLength(1);
  });

  it('filters by kind and status', () => {
    newItem();
    newItem({ kind: 'hearse', sku: 'HRS', name: 'Hearse', total_quantity: 2 });
    newItem({ sku: 'TENT', name: 'Retired tent', status: 'retired' });

    expect(listItems(db, TENANT, { kind: 'hearse' } as Parameters<typeof listItems>[2])).toHaveLength(1);
    expect(listItems(db, TENANT, { status: 'retired' } as Parameters<typeof listItems>[2])).toHaveLength(1);
  });

  it('does not leak another tenant rows', () => {
    newItem();
    const other = '00000000-0000-4000-8000-000000000002';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
       VALUES (?, 'Other', 'GHS', 'en-GB', ?, ?)`,
    ).run(other, now, now);

    expect(listItems(db, other)).toHaveLength(0);
    const mine = listItems(db, TENANT)[0];
    expect(getItem(db, other, mine.id)).toBeNull();
  });
});

describe('serial units', () => {
  it('creates units under an item and lists them', () => {
    const item = newItem({ kind: 'hearse', sku: 'HRS', name: 'Hearse', total_quantity: 2 });
    createUnit(db, TENANT, item.id, { identifier: 'GR-1111', vin: null, plate: 'GR-1111-24', odometer_km: 1_000, current_status: 'available', notes: null } as Parameters<typeof createUnit>[3]);
    createUnit(db, TENANT, item.id, { identifier: 'GR-2222', vin: null, plate: null, odometer_km: null, current_status: 'available', notes: null } as Parameters<typeof createUnit>[3]);

    expect(listUnits(db, TENANT, item.id)).toHaveLength(2);
  });

  it('refuses two units with the same identifier under one item', () => {
    const item = newItem({ kind: 'hearse', sku: 'HRS', name: 'Hearse', total_quantity: 2 });
    const unit = { identifier: 'GR-1111', vin: null, plate: null, odometer_km: null, current_status: 'available', notes: null };
    createUnit(db, TENANT, item.id, unit as Parameters<typeof createUnit>[3]);

    expect(() => createUnit(db, TENANT, item.id, unit as Parameters<typeof createUnit>[3])).toThrow();
  });

  it('updates a unit status and odometer', () => {
    const item = newItem({ kind: 'hearse', sku: 'HRS', name: 'Hearse', total_quantity: 1 });
    const unit = createUnit(db, TENANT, item.id, { identifier: 'GR-1111', vin: null, plate: null, odometer_km: 1_000, current_status: 'available', notes: null } as Parameters<typeof createUnit>[3]);

    const updated = updateUnit(db, TENANT, unit.id, { current_status: 'damaged', odometer_km: 1_500 } as Parameters<typeof updateUnit>[3]);
    expect(updated.current_status).toBe('damaged');
    expect(updated.odometer_km).toBe(1_500);
  });

  it('hides a soft-deleted unit', () => {
    const item = newItem({ kind: 'hearse', sku: 'HRS', name: 'Hearse', total_quantity: 1 });
    const unit = createUnit(db, TENANT, item.id, { identifier: 'GR-1111', vin: null, plate: null, odometer_km: null, current_status: 'available', notes: null } as Parameters<typeof createUnit>[3]);

    softDeleteUnit(db, TENANT, unit.id);
    expect(listUnits(db, TENANT, item.id)).toHaveLength(0);
  });
});

describe('customers', () => {
  function newCustomer(over: Record<string, unknown> = {}) {
    return createCustomer(db, TENANT, {
      name: 'Ama Mensah',
      phone: '0244000000',
      email: 'ama@example.com',
      id_type: 'ghana_card',
      id_number: 'GHA-123',
      address: 'Accra',
      notes: null,
      ...over,
    } as Parameters<typeof createCustomer>[2]);
  }

  it('creates and reads back a customer', () => {
    const c = newCustomer();
    expect(getCustomer(db, TENANT, c.id)?.name).toBe('Ama Mensah');
  });

  it('searches by name, phone and email', () => {
    newCustomer();
    newCustomer({ name: 'Kofi Boateng', phone: '0209999999', email: 'kofi@example.com' });

    expect(listCustomers(db, TENANT, { search: 'Kofi' } as Parameters<typeof listCustomers>[2])).toHaveLength(1);
    expect(listCustomers(db, TENANT, { search: '0244' } as Parameters<typeof listCustomers>[2])).toHaveLength(1);
    expect(listCustomers(db, TENANT, { search: 'kofi@' } as Parameters<typeof listCustomers>[2])).toHaveLength(1);
    expect(listCustomers(db, TENANT, { search: 'nobody' } as Parameters<typeof listCustomers>[2])).toHaveLength(0);
  });

  it('updates only the fields supplied', () => {
    const c = newCustomer();
    const updated = updateCustomer(db, TENANT, c.id, { phone: '0555000000' } as Parameters<typeof updateCustomer>[3]);

    expect(updated.phone).toBe('0555000000');
    expect(updated.name).toBe('Ama Mensah');
  });

  it('hides a soft-deleted customer from the list but still resolves it by id', () => {
    const c = newCustomer();
    softDeleteCustomer(db, TENANT, c.id);

    expect(listCustomers(db, TENANT)).toHaveLength(0);

    // Deliberate asymmetry: bookings and invoices reference customers
    // historically, so a lookup by id must still resolve a name for those
    // records to render. Only the browsable list hides them.
    expect(getCustomer(db, TENANT, c.id)?.id).toBe(c.id);
  });
});
