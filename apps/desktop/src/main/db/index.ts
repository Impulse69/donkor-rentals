import Database, { type Database as DB } from 'better-sqlite3';
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import log from 'electron-log/main';

let db: DB | null = null;

export function dbPath(): string {
  const dir = join(app.getPath('userData'), 'db');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'donkor.sqlite');
}

function migrationsDir(): string {
  // In dev, electron-vite outputs main to out/main; the packages/db sources
  // sit at <repo>/packages/db/sqlite/migrations. In packaged builds the
  // migrations are bundled adjacent to main via electron-builder `extraResources`.
  if (app.isPackaged) {
    return join(process.resourcesPath, 'migrations');
  }
  // dev / pnpm dev: walk up from out/main to repo root.
  return join(__dirname, '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
}

function applyMigrations(database: DB): void {
  const dir = migrationsDir();
  if (!existsSync(dir)) {
    log.warn(`migrations directory missing: ${dir}`);
    return;
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  database.exec('CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const seen = new Set(
    database
      .prepare('SELECT id FROM _migrations')
      .all()
      .map((row) => (row as { id: string }).id),
  );

  // Refuse to run against a database built by a schema we no longer ship.
  //
  // The baseline is written entirely as CREATE TABLE IF NOT EXISTS, so against a
  // database carrying the old 0001..0009 migrations it applies cleanly, does
  // nothing, and records itself as applied — leaving a hybrid schema that fails
  // much later with a baffling "no such column" from unrelated code. Failing
  // here, with the reason and the fix, costs one confusing crash instead of an
  // afternoon. (This has already been hit twice: once on the dev database and
  // once on the default Electron userData directory during e2e.)
  const known = new Set(files.map((f) => f.replace(/\.sql$/, '')));
  const orphaned = [...seen].filter((id) => !known.has(id)).sort();
  if (orphaned.length > 0) {
    throw new Error(
      `This database was created by an older schema (${orphaned.join(', ')}) that this ` +
        `version no longer ships. The current baseline replaces those migrations wholesale, ` +
        `so there is no upgrade path. Delete the database and relaunch to start clean:\n` +
        `  ${dbPath()}\n` +
        `(also remove the matching -wal and -shm files).`,
    );
  }

  const insert = database.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)');
  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    if (seen.has(id)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    log.info(`applying migration ${id}`);
    database.pragma('foreign_keys = OFF');
    database.exec('BEGIN');
    try {
      database.exec(sql);
      insert.run(id, new Date().toISOString());
      database.exec('COMMIT');
      database.pragma('foreign_keys = ON');
    } catch (err) {
      database.exec('ROLLBACK');
      database.pragma('foreign_keys = ON');
      log.error(`migration ${id} failed`, err);
      throw err;
    }
  }
}

export function openDb(): DB {
  if (db) return db;
  const path = dbPath();
  log.info(`opening sqlite at ${path}`);
  const database = new Database(path);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('synchronous = NORMAL');
  applyMigrations(database);
  db = database;
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDb(): DB {
  if (!db) throw new Error('db not opened — call openDb() in app.whenReady');
  return db;
}

// Test seam: open an in-memory database with migrations applied.
export function openMemoryDb(): DB {
  const m = new Database(':memory:');
  m.pragma('foreign_keys = ON');
  applyMigrations(m);
  return m;
}

// Convenience: ensure a local tenant row exists for repository operations.
export function ensureBootstrapTenant(database: DB): string {
  const row = database.prepare('SELECT id FROM tenants LIMIT 1').get() as { id: string } | undefined;
  if (row) return row.id;
  const id = '00000000-0000-4000-8000-000000000001';
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
       VALUES (?, ?, 'GHS', 'en-GB', ?, ?)`,
    )
    .run(id, 'Donkor & Sons', now, now);
  return id;
}

// Re-export for handlers that need direct path/dir info.
export { dirname };
