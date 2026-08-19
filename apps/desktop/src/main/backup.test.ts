import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for local backup / restore.
 *
 * These run against the REAL `0001_baseline.sql` schema and real SQLite files on
 * disk — the point is to prove the round-trip actually swaps data, not to
 * re-assert the shape of a hand-rolled fixture.
 *
 * `migrationsDir()` in `./db` resolves relative to the bundled `out/main`, so it
 * does not point anywhere useful under Vitest. The baseline is therefore applied
 * directly here, which also keeps the test honest about which schema it covers.
 */

const MIGRATION = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'sqlite',
  'migrations',
  '0001_baseline.sql',
);
const SCHEMA_ID = '0001_baseline';
const APP_VERSION = '1.2.0-test';

let userDataDir: string;
let backupDir: string;

vi.mock('electron', () => ({
  app: {
    getVersion: (): string => APP_VERSION,
    getPath: (): string => userDataDir,
    relaunch: vi.fn(),
    exit: vi.fn(),
    isPackaged: false,
  },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Imported after the mocks so the module graph picks them up.
const { createBackup, restoreBackup, listRecentBackups, lastBackupAt } = await import('./backup');
const { openDb, closeDb, dbPath } = await import('./db');

function seedDatabase(): void {
  const db = new Database(dbPath());
  db.pragma('journal_mode = WAL');
  db.exec(readFileSync(MIGRATION, 'utf8'));
  db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(
    SCHEMA_ID,
    new Date().toISOString(),
  );
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
     VALUES ('t1', 'Donkor & Sons', 'GHS', 'en-GB', ?, ?)`,
  ).run(now, now);
  db.close();
}

function addCustomer(name: string): void {
  const now = new Date().toISOString();
  openDb()
    .prepare(
      `INSERT INTO customers (id, tenant_id, name, created_at, updated_at)
       VALUES (?, 't1', ?, ?, ?)`,
    )
    .run(`c-${name}`, name, now, now);
}

function customerNames(): string[] {
  return (openDb().prepare('SELECT name FROM customers ORDER BY name').all() as Array<{ name: string }>).map(
    (r) => r.name,
  );
}

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'donkor-userdata-'));
  backupDir = mkdtempSync(join(tmpdir(), 'donkor-backups-'));
  mkdirSync(join(userDataDir, 'db'), { recursive: true });
  seedDatabase();
  openDb();
});

afterEach(() => {
  closeDb();
  rmSync(userDataDir, { recursive: true, force: true });
  rmSync(backupDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('createBackup', () => {
  it('writes a database copy plus a manifest describing it', async () => {
    addCustomer('Ama');

    const result = await createBackup(backupDir);

    expect(existsSync(result.filePath)).toBe(true);
    expect(existsSync(result.manifestPath)).toBe(true);
    expect(result.manifest.appVersion).toBe(APP_VERSION);
    expect(result.manifest.schemaVersion).toBe(SCHEMA_ID);
    expect(result.manifest.rowCounts.customers).toBe(1);
    expect(result.manifest.rowCounts.tenants).toBe(1);

    // The copy must be a readable database carrying the same row, not a stub.
    const copy = new Database(result.filePath, { readonly: true });
    expect((copy.prepare('SELECT name FROM customers').get() as { name: string }).name).toBe('Ama');
    copy.close();
  });

  it('records where and when the backup was taken', async () => {
    const result = await createBackup(backupDir);
    expect(lastBackupAt()).toBe(result.manifest.createdAt);
  });
});

describe('listRecentBackups', () => {
  it('returns nothing before any backup has been taken', () => {
    expect(listRecentBackups()).toEqual([]);
  });

  it('lists backups newest first', async () => {
    const first = await createBackup(backupDir);
    addCustomer('Kofi');
    const second = await createBackup(backupDir);

    const listed = listRecentBackups();
    expect(listed).toHaveLength(2);
    expect(listed[0].filePath).toBe(second.filePath);
    expect(listed[1].filePath).toBe(first.filePath);
  });

  it('never overwrites an earlier backup taken in the same second', async () => {
    const first = await createBackup(backupDir);
    const second = await createBackup(backupDir);

    expect(second.filePath).not.toBe(first.filePath);
    expect(existsSync(first.filePath)).toBe(true);
    expect(existsSync(second.filePath)).toBe(true);
  });

  it('skips a backup whose manifest is unreadable instead of throwing', async () => {
    const good = await createBackup(backupDir);
    const orphan = join(backupDir, 'donkor-backup-2020-01-01-0000.db');
    writeFileSync(orphan, 'not a database', 'utf8');
    writeFileSync(`${orphan}.json`, '{ this is not json', 'utf8');

    const listed = listRecentBackups();
    expect(listed).toHaveLength(1);
    expect(listed[0].filePath).toBe(good.filePath);
  });
});

describe('restoreBackup', () => {
  it('replaces current data with the backup and keeps a pre-restore snapshot', async () => {
    addCustomer('Ama');
    const backup = await createBackup(backupDir);

    // Diverge from the backup.
    addCustomer('Kofi');
    expect(customerNames()).toEqual(['Ama', 'Kofi']);

    const { preRestorePath } = await restoreBackup(backup.filePath);

    // The customer added after the backup is gone.
    expect(customerNames()).toEqual(['Ama']);

    // The pre-restore snapshot still holds the discarded state, so the operator
    // can get back to it.
    expect(existsSync(preRestorePath)).toBe(true);
    const snapshot = new Database(preRestorePath, { readonly: true });
    expect((snapshot.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number }).n).toBe(2);
    snapshot.close();
  });

  it('survives a full close and reopen from disk', async () => {
    addCustomer('Ama');
    const backup = await createBackup(backupDir);
    addCustomer('Kofi');

    await restoreBackup(backup.filePath);

    // restoreBackup closes the handle, so nothing can be served from a cached
    // connection. Check the on-disk file directly, then again through the app's
    // own open path, to be sure the swap landed on disk and not just in memory.
    const onDisk = new Database(dbPath(), { readonly: true });
    expect((onDisk.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number }).n).toBe(1);
    onDisk.close();

    closeDb();
    expect(customerNames()).toEqual(['Ama']);
  });

  it('restarts the app so the new database is picked up', async () => {
    const backup = await createBackup(backupDir);
    const { app } = await import('electron');

    await restoreBackup(backup.filePath);

    expect(app.relaunch).toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalledWith(0);
  });

  it('refuses a corrupt backup without touching the live database', async () => {
    addCustomer('Ama');
    const good = await createBackup(backupDir);

    // Keep the manifest, replace the payload with garbage.
    writeFileSync(good.filePath, 'definitely not sqlite', 'utf8');

    await expect(restoreBackup(good.filePath)).rejects.toThrow();

    // The live database must survive a rejected restore intact.
    expect(customerNames()).toEqual(['Ama']);
  });

  it('refuses a backup built on a different schema version', async () => {
    const backup = await createBackup(backupDir);
    // The manifest is authoritative INSIDE the file now, so tamper with it there.
    const db = new Database(backup.filePath);
    const raw = JSON.parse((db.prepare('SELECT manifest_json FROM _backup_manifest').get() as { manifest_json: string }).manifest_json) as Record<string, unknown>;
    raw.schemaVersion = '0007_something_older';
    db.prepare('UPDATE _backup_manifest SET manifest_json = ?').run(JSON.stringify(raw));
    db.close();

    await expect(restoreBackup(backup.filePath)).rejects.toThrow(/schema/i);
  });

  it('restores a backup shared as a single file, with no sidecar beside it', async () => {
    // The field report: a colleague was sent the .db only and restore failed with
    // "backup manifest missing". Backups are emailed, WhatsApped and copied to
    // USB sticks, and only the .db travels. It has to be self-contained.
    addCustomer('Ama');
    const backup = await createBackup(backupDir);

    // Simulate sharing: move just the .db somewhere the .json is not.
    const sharedDir = mkdtempSync(join(tmpdir(), 'donkor-shared-'));
    const sharedPath = join(sharedDir, 'donkor-backup-from-a-friend.db');
    copyFileSync(backup.filePath, sharedPath);
    expect(existsSync(`${sharedPath}.json`)).toBe(false);

    addCustomer('Kofi');
    await restoreBackup(sharedPath);

    expect(customerNames()).toEqual(['Ama']);
    rmSync(sharedDir, { recursive: true, force: true });
  });

  it('still restores an older backup that only has the sidecar', async () => {
    // Pre-1.3.7 backups wrote the manifest beside the file only. Anything
    // already on a USB stick must keep working.
    addCustomer('Ama');
    const backup = await createBackup(backupDir);
    const db = new Database(backup.filePath);
    db.exec('DROP TABLE _backup_manifest');
    db.close();
    expect(existsSync(backup.manifestPath)).toBe(true);

    addCustomer('Kofi');
    await restoreBackup(backup.filePath);
    expect(customerNames()).toEqual(['Ama']);
  });

  it('does not carry the backup marker table into the live company file', async () => {
    // The marker belongs to the backup. Left in place, the next backup of this
    // file would inherit a stale manifest instead of writing a fresh one.
    const backup = await createBackup(backupDir);
    await restoreBackup(backup.filePath);

    const live = new Database(dbPath(), { readonly: true });
    const marker = live.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_backup_manifest'").get();
    live.close();
    expect(marker).toBeUndefined();
  });

  it('refuses a file that is not a Donkor backup at all', async () => {
    const backup = await createBackup(backupDir);
    const db = new Database(backup.filePath);
    db.exec('DROP TABLE _backup_manifest');
    db.close();
    rmSync(backup.manifestPath);

    await expect(restoreBackup(backup.filePath)).rejects.toThrow(/not a Donkor backup/i);
  });
});
