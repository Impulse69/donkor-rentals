import DatabaseCtor, { type Database } from 'better-sqlite3';
import { app, dialog } from 'electron';
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import log from 'electron-log';
import { dbPath, getDb, closeDb } from './db';

export interface BackupManifest {
  appVersion: string;
  schemaVersion: string | null;
  createdAt: string;
  databaseFile: string;
  rowCounts: Record<string, number>;
}

export interface BackupResult {
  filePath: string;
  manifestPath: string;
  manifest: BackupManifest;
}

const TABLES = [
  'tenants',
  'customers',
  'items',
  'item_units',
  'bookings',
  'booking_lines',
  'invoices',
  'invoice_lines',
  'invoice_sequences',
  'payments',
  'returns',
  'damage_lines',
  'damage_photos',
  'documents',
  'app_settings',
  'audit_log',
] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function timestamp(d = new Date()): string {
  // Seconds included deliberately: with minute precision, two backups taken in
  // the same minute resolve to the same filename and the second silently
  // overwrites the first.
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** Never overwrite an existing backup — suffix until the name is free. */
function uniquePath(dir: string, base: string, ext: string): string {
  let candidate = join(dir, `${base}${ext}`);
  let n = 2;
  while (existsSync(candidate)) {
    candidate = join(dir, `${base}-${n}${ext}`);
    n += 1;
  }
  return candidate;
}

function latestSchemaVersion(db: Database): string | null {
  const row = db
    .prepare('SELECT id FROM _migrations ORDER BY applied_at DESC, id DESC LIMIT 1')
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

function rowCounts(db: Database): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    counts[table] = row.n;
  }
  return counts;
}

function manifestPathFor(filePath: string): string {
  return `${filePath}.json`;
}

const BACKUP_DIR_KEY = 'backup_last_dir';
const BACKUP_AT_KEY = 'backup_last_at';
const BACKUP_FILE_RE = /^donkor-backup-.*\.db$/;

/** Remember where the operator last backed up, so we can list that folder later. */
function rememberBackupLocation(db: Database, dir: string, at: string): void {
  const set = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (@key, @value, @updated_at)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  set.run({ key: BACKUP_DIR_KEY, value: dir, updated_at: at });
  set.run({ key: BACKUP_AT_KEY, value: at, updated_at: at });
}

function readSetting(db: Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value || null;
}

/** ISO timestamp of the most recent backup, or null if none has been taken. */
export function lastBackupAt(): string | null {
  return readSetting(getDb(), BACKUP_AT_KEY);
}

/**
 * The manifest lives INSIDE the backup file, in a one-row `_backup_manifest`
 * table. A backup is something people email, WhatsApp, or copy to a USB stick,
 * and a two-file backup fails the moment only the .db travels. That is exactly
 * what happened in the field: "backup manifest missing" on a colleague's
 * machine, because the .db.json sidecar stayed behind. SQLite can carry its own
 * metadata, so make it.
 *
 * Older backups (pre-1.3.7) only wrote the sidecar, so it is still honoured as a
 * fallback. Nothing already sitting on a USB stick stops restoring.
 */
function readManifest(filePath: string): BackupManifest {
  const probe = new DatabaseCtor(filePath, { readonly: true, fileMustExist: true });
  try {
    const hasTable = probe
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_backup_manifest'")
      .get();
    if (hasTable) {
      const row = probe.prepare('SELECT manifest_json FROM _backup_manifest LIMIT 1').get() as
        | { manifest_json: string }
        | undefined;
      if (row) return JSON.parse(row.manifest_json) as BackupManifest;
    }
  } finally {
    probe.close();
  }

  // Legacy: sidecar beside the file.
  const manifestPath = manifestPathFor(filePath);
  if (existsSync(manifestPath)) {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackupManifest;
    if (raw.databaseFile !== basename(filePath)) {
      throw new Error('Backup manifest does not match the selected database file');
    }
    return raw;
  }

  throw new Error(
    'This file is not a Donkor backup: no manifest found inside it or beside it. ' +
      'Make sure you are choosing a file created by "Back up company file".',
  );
}

export async function chooseAndCreateBackup(): Promise<BackupResult | null> {
  const selected = await dialog.showOpenDialog({
    title: 'Choose backup folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (selected.canceled || selected.filePaths.length === 0) return null;
  return createBackup(selected.filePaths[0]);
}

export async function createBackup(targetDir: string): Promise<BackupResult> {
  const db = getDb();
  db.pragma('wal_checkpoint(TRUNCATE)');
  const filePath = uniquePath(targetDir, `donkor-backup-${timestamp()}`, '.db');
  await db.backup(filePath);
  const manifest: BackupManifest = {
    appVersion: app.getVersion(),
    schemaVersion: latestSchemaVersion(db),
    createdAt: new Date().toISOString(),
    databaseFile: basename(filePath),
    rowCounts: rowCounts(db),
  };
  // Embed the manifest in the backup itself so the single .db is self-contained.
  const copy = new DatabaseCtor(filePath);
  try {
    copy.exec('CREATE TABLE IF NOT EXISTS _backup_manifest (manifest_json TEXT NOT NULL)');
    copy.exec('DELETE FROM _backup_manifest');
    copy.prepare('INSERT INTO _backup_manifest (manifest_json) VALUES (?)').run(JSON.stringify(manifest));
  } finally {
    copy.close();
  }

  // The sidecar stays as a human-readable companion, but nothing depends on it.
  const manifestPath = manifestPathFor(filePath);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  rememberBackupLocation(db, targetDir, manifest.createdAt);
  return { filePath, manifestPath, manifest };
}

export async function chooseAndRestoreBackup(): Promise<{ restored: true; preRestorePath: string } | null> {
  const selected = await dialog.showOpenDialog({
    title: 'Choose Donkor backup',
    filters: [{ name: 'Donkor backup', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (selected.canceled || selected.filePaths.length === 0) return null;
  return restoreBackup(selected.filePaths[0]);
}

export async function restoreBackup(filePath: string): Promise<{ restored: true; preRestorePath: string }> {
  const db = getDb();
  const manifest = readManifest(filePath);
  const currentSchema = latestSchemaVersion(db);
  if (manifest.schemaVersion !== currentSchema) {
    throw new Error(`Backup schema ${manifest.schemaVersion ?? 'unknown'} does not match current schema ${currentSchema ?? 'unknown'}`);
  }

  // Validate the incoming file BEFORE destroying anything. With no cloud copy,
  // a failed restore over a good database is unrecoverable.
  const probe = new DatabaseCtor(filePath, { readonly: true, fileMustExist: true });
  try {
    const result = probe.pragma('integrity_check', { simple: true }) as string;
    if (result !== 'ok') throw new Error(`Backup file failed integrity check: ${result}`);
  } finally {
    probe.close();
  }

  db.pragma('wal_checkpoint(TRUNCATE)');
  const currentPath = dbPath();
  const preRestorePath = join(dirname(currentPath), `donkor.sqlite.${timestamp()}.pre-restore`);

  // Close first: copying an open database yields a torn snapshot even after a checkpoint.
  closeDb();
  copyFileSync(currentPath, preRestorePath);

  // Belt and braces. SQLite removes -wal/-shm itself on a clean close, so these
  // normally do not exist by now — but if the previous session died uncleanly, a
  // stale WAL sitting beside the file we are about to overwrite is exactly the
  // kind of thing that turns a restore into a corrupt database. Cheap to rule out.
  for (const suffix of ['-wal', '-shm']) {
    rmSync(`${currentPath}${suffix}`, { force: true });
  }
  copyFileSync(filePath, currentPath);

  // The marker table belongs to the backup, not to a live company file. Drop it
  // so the restored database is indistinguishable from one that was never backed
  // up, and so backing THIS one up later writes a fresh manifest rather than
  // inheriting a stale one.
  const restored = new DatabaseCtor(currentPath);
  try {
    restored.exec('DROP TABLE IF EXISTS _backup_manifest');
  } finally {
    restored.close();
  }

  log.info(`restored backup ${filePath}; previous database saved to ${preRestorePath}`);
  app.relaunch();
  app.exit(0);
  return { restored: true, preRestorePath };
}

/**
 * List backups sitting in the folder the operator last backed up to.
 * A backup is only listed when its sidecar manifest parses and matches the .db
 * file beside it — an unreadable manifest is skipped, never thrown, so one bad
 * file cannot break the whole list.
 */
export function listRecentBackups(limit = 10): BackupResult[] {
  const dir = readSetting(getDb(), BACKUP_DIR_KEY);
  if (!dir || !existsSync(dir)) return [];

  const found: BackupResult[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    log.warn(`cannot read backup folder ${dir}`, err);
    return [];
  }

  for (const entry of entries) {
    if (!BACKUP_FILE_RE.test(entry)) continue;
    const filePath = join(dir, entry);
    try {
      const manifest = readManifest(filePath);
      found.push({ filePath, manifestPath: manifestPathFor(filePath), manifest });
    } catch (err) {
      log.warn(`skipping backup with unreadable manifest: ${filePath}`, err);
    }
  }

  return found
    .sort((a, b) => b.manifest.createdAt.localeCompare(a.manifest.createdAt))
    .slice(0, limit);
}
