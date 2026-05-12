import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { seedCatalogIfEmpty } from './seed';

vi.mock('./index', () => ({
  ensureBootstrapTenant: (db: Database.Database): string => {
    const row = db.prepare('SELECT id FROM tenants LIMIT 1').get() as { id: string } | undefined;
    if (row) return row.id;
    const id = '00000000-0000-4000-8000-000000000001';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
       VALUES (?, ?, 'GHS', 'en-GB', ?, ?)`,
    ).run(id, 'Donkor & Sons', now, now);
    return id;
  },
}));

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      currency TEXT NOT NULL,
      locale TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      daily_rate_pesewas INTEGER NOT NULL,
      replacement_value_pesewas INTEGER NOT NULL,
      total_quantity INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      id_type TEXT,
      id_number TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      status TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      pickup_location TEXT,
      dropoff_location TEXT,
      driver_name TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);
  return db;
}

describe('dev seed', () => {
  it('keeps starter catalog but does not create customer or booking test data', () => {
    const db = makeDb();

    seedCatalogIfEmpty(db);

    expect((db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n).toBeGreaterThan(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number }).n).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM bookings').get() as { n: number }).n).toBe(0);
  });
});
