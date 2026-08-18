import { ipcMain } from 'electron';
import { z } from 'zod';
import { AccountCreateInput, AccountFilter, AccountMappingKey, AccountUpdateInput, AccountingSettings, JournalEntryCreateInput, JournalFilter, Uuid, type Account, type AccountMapping, type JournalEntry } from '@shared/schemas';
import { wrap } from '../envelope';
import { ensureBootstrapTenant, getDb } from '../../db';
import { everyEntryBalances, arTiesToSubLedger, depositsNeverNegative, unpostedEvents } from '../../accounting/health';
import { postOnce, reverseEntry } from '../../accounting/posting';
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const nowIso = (): string => new Date().toISOString();
function tenant(): string { return ensureBootstrapTenant(getDb()); }
const accountCols = 'id, tenant_id, code, name, description, account_type, detail_type, classification, normal_balance, parent_id, system_key, is_active, is_system, sort_order, created_at, updated_at, deleted_at';
type AccountRow = Omit<Account, 'is_active' | 'is_system'> & { is_active: number; is_system: number };
type AccountingSettingsRow = Omit<z.infer<typeof AccountingSettings>, 'vat_registered'> & { vat_registered: number };
const boolAccount = (a: AccountRow): Account => ({ ...a, is_active: Boolean(a.is_active), is_system: Boolean(a.is_system) });
function listAccounts(db: Database, tenantId: string, filter: z.infer<typeof AccountFilter> = {}): Account[] {
  const p: Record<string, unknown> = { tenant_id: tenantId }; let sql = `SELECT ${accountCols} FROM accounts WHERE tenant_id=@tenant_id`;
  if (!filter.includeDeleted) sql += ' AND deleted_at IS NULL'; if (!filter.includeInactive) sql += ' AND is_active=1';
  if (filter.accountType) { sql += ' AND account_type=@account_type'; p.account_type = filter.accountType; }
  if (filter.classification) { sql += ' AND classification=@classification'; p.classification = filter.classification; }
  if (filter.search) { sql += ' AND (code LIKE @q OR name LIKE @q)'; p.q = `%${filter.search}%`; }
  return (db.prepare(`${sql} ORDER BY sort_order ASC, code ASC`).all(p) as AccountRow[]).map(boolAccount);
}
function getAccount(db: Database, tenantId: string, id: string): Account | null {
  const row = db.prepare(`SELECT ${accountCols} FROM accounts WHERE id=@id AND tenant_id=@tenant_id`).get({ id, tenant_id: tenantId }) as AccountRow | undefined;
  return row ? boolAccount(row) : null;
}
function createAccount(db: Database, tenantId: string, input: z.infer<typeof AccountCreateInput>): Account {
  const id = uuidv4(); const now = nowIso();
  db.prepare(`INSERT INTO accounts (${accountCols}) VALUES (@id,@tenant_id,@code,@name,@description,@account_type,@detail_type,@classification,@normal_balance,@parent_id,@system_key,@is_active,@is_system,@sort_order,@created_at,@updated_at,NULL)`)
    .run({ id, tenant_id: tenantId, ...input, description: input.description ?? null, parent_id: input.parent_id ?? null, system_key: input.system_key ?? null, is_active: input.is_active ? 1 : 0, is_system: input.is_system ? 1 : 0, created_at: now, updated_at: now });
  const row = getAccount(db, tenantId, id); if (!row) throw new Error('createAccount: readback failed'); return row;
}
function updateAccount(db: Database, tenantId: string, id: string, patch: z.infer<typeof AccountUpdateInput>): Account {
  const existing = getAccount(db, tenantId, id); if (!existing) throw new Error(`updateAccount: account ${id} not found`);
  const merged = { ...existing, ...patch, updated_at: nowIso() };
  db.prepare(`UPDATE accounts SET code=@code,name=@name,description=@description,account_type=@account_type,detail_type=@detail_type,classification=@classification,normal_balance=@normal_balance,parent_id=@parent_id,system_key=@system_key,is_active=@is_active,is_system=@is_system,sort_order=@sort_order,updated_at=@updated_at WHERE id=@id AND tenant_id=@tenant_id`)
    .run({ id, tenant_id: tenantId, ...merged, is_active: merged.is_active ? 1 : 0, is_system: merged.is_system ? 1 : 0 });
  const row = getAccount(db, tenantId, id); if (!row) throw new Error('updateAccount: readback failed'); return row;
}
function archiveAccount(db: Database, tenantId: string, id: string): void {
  const used = db.prepare(`SELECT 1 FROM journal_lines WHERE tenant_id=@tenant_id AND account_id=@id UNION ALL SELECT 1 FROM account_mappings WHERE tenant_id=@tenant_id AND account_id=@id LIMIT 1`).get({ tenant_id: tenantId, id });
  if (used) throw new Error('Cannot archive an account with journal lines or accounting mappings');
  db.prepare('UPDATE accounts SET is_active=0, deleted_at=@t, updated_at=@t WHERE id=@id AND tenant_id=@tenant_id').run({ id, tenant_id: tenantId, t: nowIso() });
}
function getJournal(db: Database, tenantId: string, id: string): JournalEntry | null {
  const e = db.prepare('SELECT * FROM journal_entries WHERE id=@id AND tenant_id=@tenant_id').get({ id, tenant_id: tenantId }) as Omit<JournalEntry, 'lines'> | undefined;
  if (!e) return null; e.lines = db.prepare('SELECT * FROM journal_lines WHERE entry_id=@id AND tenant_id=@tenant_id ORDER BY line_no ASC').all({ id, tenant_id: tenantId }); return e;
}
function listJournal(db: Database, tenantId: string, filter: z.infer<typeof JournalFilter> = {}): JournalEntry[] {
  const p: Record<string, unknown> = { tenant_id: tenantId }; let sql = 'SELECT id FROM journal_entries WHERE tenant_id=@tenant_id';
  if (filter.status) { sql += ' AND status=@status'; p.status = filter.status; } if (filter.origin) { sql += ' AND origin=@origin'; p.origin = filter.origin; }
  if (filter.sourceType) { sql += ' AND source_type=@source_type'; p.source_type = filter.sourceType; } if (filter.sourceId) { sql += ' AND source_id=@source_id'; p.source_id = filter.sourceId; }
  if (filter.dateFrom) { sql += ' AND entry_date>=@date_from'; p.date_from = filter.dateFrom; } if (filter.dateTo) { sql += ' AND entry_date<=@date_to'; p.date_to = filter.dateTo; }
  if (filter.search) { sql += ' AND (entry_no LIKE @q OR memo LIKE @q)'; p.q = `%${filter.search}%`; }
  return (db.prepare(`${sql} ORDER BY entry_date DESC, entry_no DESC`).all(p) as Array<{ id: string }>).map((r) => getJournal(db, tenantId, r.id)).filter(Boolean) as JournalEntry[];
}
function settings(db: Database, tenantId: string): z.infer<typeof AccountingSettings> {
  const row = db.prepare('SELECT * FROM accounting_settings WHERE tenant_id=@tenant_id').get({ tenant_id: tenantId }) as AccountingSettingsRow;
  return { ...row, vat_registered: Boolean(row.vat_registered) };
}

export function registerAccountingIpc(): void {
  ipcMain.handle('accounts:list', wrap('accounts:list', AccountFilter.optional().default({}), (f) => listAccounts(getDb(), tenant(), f ?? {})));
  ipcMain.handle('accounts:get', wrap('accounts:get', z.object({ id: Uuid }), ({ id }) => getAccount(getDb(), tenant(), id)));
  ipcMain.handle('accounts:create', wrap('accounts:create', AccountCreateInput, (input) => createAccount(getDb(), tenant(), input)));
  ipcMain.handle('accounts:update', wrap('accounts:update', z.object({ id: Uuid, patch: AccountUpdateInput }), ({ id, patch }) => updateAccount(getDb(), tenant(), id, patch)));
  ipcMain.handle('accounts:archive', wrap('accounts:archive', z.object({ id: Uuid }), ({ id }) => { archiveAccount(getDb(), tenant(), id); return { id }; }));
  ipcMain.handle('accounts:mappings', wrap('accounts:mappings', z.void().optional(), () => getDb().prepare('SELECT tenant_id, key, account_id, updated_at FROM account_mappings WHERE tenant_id=@tenant_id ORDER BY key ASC').all({ tenant_id: tenant() }) as AccountMapping[]));
  ipcMain.handle('accounts:setMapping', wrap('accounts:setMapping', z.object({ key: AccountMappingKey, account_id: Uuid }), ({ key, account_id }) => { const t = tenant(); getDb().prepare('UPDATE account_mappings SET account_id=@account_id, updated_at=@updated_at WHERE tenant_id=@tenant_id AND key=@key').run({ tenant_id: t, key, account_id, updated_at: nowIso() }); return { key, account_id }; }));
  ipcMain.handle('journal:list', wrap('journal:list', JournalFilter.optional().default({}), (f) => listJournal(getDb(), tenant(), f ?? {})));
  ipcMain.handle('journal:get', wrap('journal:get', z.object({ id: Uuid }), ({ id }) => getJournal(getDb(), tenant(), id)));
  ipcMain.handle('journal:createManual', wrap('journal:createManual', JournalEntryCreateInput, (input) => { const id = uuidv4(); const t = tenant(); const entryId = postOnce(getDb(), t, { ...input, source_type: 'manual', source_id: id, source_event: 'manual', origin: 'manual' }); return getJournal(getDb(), t, entryId ?? id); }));
  ipcMain.handle('journal:void', wrap('journal:void', z.object({ id: Uuid, entry_date: z.string().optional(), reason: z.string().optional() }), ({ id, entry_date, reason }) => reverseEntry(getDb(), tenant(), id, entry_date ?? new Date().toISOString().slice(0, 10), reason ?? 'Journal entry voided')));
  ipcMain.handle('accounting:settings', wrap('accounting:settings', z.void().optional(), () => settings(getDb(), tenant())));
  ipcMain.handle('accounting:updateSettings', wrap('accounting:updateSettings', AccountingSettings.partial().omit({ tenant_id: true, created_at: true, updated_at: true }), (patch) => { const t = tenant(); getDb().prepare('UPDATE accounting_settings SET fiscal_year_start_month=COALESCE(@fiscal_year_start_month,fiscal_year_start_month), books_closed_through=COALESCE(@books_closed_through,books_closed_through), vat_registered=COALESCE(@vat_registered,vat_registered), updated_at=@updated_at WHERE tenant_id=@tenant_id').run({ tenant_id: t, fiscal_year_start_month: patch.fiscal_year_start_month ?? null, books_closed_through: patch.books_closed_through ?? null, vat_registered: patch.vat_registered === undefined ? null : patch.vat_registered ? 1 : 0, updated_at: nowIso() }); return settings(getDb(), t); }));
  ipcMain.handle('accounting:closeBooks', wrap('accounting:closeBooks', z.object({ through: z.string() }), ({ through }) => { const t = tenant(); getDb().prepare('UPDATE accounting_settings SET books_closed_through=@through, updated_at=@updated_at WHERE tenant_id=@tenant_id').run({ tenant_id: t, through, updated_at: nowIso() }); return settings(getDb(), t); }));
  ipcMain.handle('accounting:status', wrap('accounting:status', z.void().optional(), () => { const t = tenant(); const s = settings(getDb(), t); return { chart_ready: listAccounts(getDb(), t, {}).length > 0, books_closed_through: s.books_closed_through, unposted_counts: unpostedEvents(getDb(), t).length }; }));
  ipcMain.handle('accounting:health', wrap('accounting:health', z.object({ asOf: z.string() }), ({ asOf }) => ({ unbalanced_entries: everyEntryBalances(getDb(), tenant()), ar: arTiesToSubLedger(getDb(), tenant(), asOf), deposits: depositsNeverNegative(getDb(), tenant()), unposted: unpostedEvents(getDb(), tenant()) })));
}
