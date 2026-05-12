import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeFirstRun, createLocalUser, getSession, signIn } from './auth';

vi.mock('../db', () => ({
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

vi.mock('../supabase/client', () => ({
  getSupabaseClient: () => null,
  isSupabaseConfigured: () => false,
}));

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      currency TEXT NOT NULL,
      locale TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      logo_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE app_users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE auth_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return db;
}

describe('auth repository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  it('creates the first account as owner even when a worker role is requested', async () => {
    const session = await completeFirstRun(db, {
      shop_name: 'Donkor & Sons',
      owner_name: 'Ama Owner',
      owner_email: 'ama@example.com',
      password: 'password123',
      role: 'staff',
    });

    expect(session.user.role).toBe('owner');
    expect(getSession(db)?.user.email).toBe('ama@example.com');
  });

  it('creates additional local users with selected roles and requires their password', async () => {
    await completeFirstRun(db, {
      shop_name: 'Donkor & Sons',
      owner_name: 'Ama Owner',
      owner_email: 'ama@example.com',
      password: 'password123',
    });

    const worker = createLocalUser(db, {
      name: 'Kofi Worker',
      email: 'kofi@example.com',
      password: 'workerpass',
      role: 'manager',
    });

    expect(worker.role).toBe('manager');
    await expect(signIn(db, 'kofi@example.com', 'wrong')).rejects.toThrow('Invalid email or password');
    await expect(signIn(db, 'kofi@example.com', 'workerpass')).resolves.toMatchObject({
      user: { email: 'kofi@example.com', role: 'manager' },
    });
  });
});
