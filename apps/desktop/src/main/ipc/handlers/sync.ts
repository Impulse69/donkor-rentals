import { ipcMain } from 'electron';
import { z } from 'zod';
import { SyncConflictResolveInput } from '@shared/schemas';
import { wrap } from '../envelope';
import { getDb, ensureBootstrapTenant } from '../../db';
import { getSupabaseClient } from '../../supabase/client';
import { drainOutbox, getSyncStatus, retryFailedOutbox } from '../../sync/outbox';
import { applyInbox, listConflicts, resolveConflict } from '../../sync/inbox';

function tenant(): string {
  return ensureBootstrapTenant(getDb());
}

export function registerSyncIpc(): void {
  ipcMain.handle(
    'sync:status',
    wrap('sync:status', z.void().optional(), () => getSyncStatus(getDb())),
  );

  ipcMain.handle(
    'sync:drain',
    wrap('sync:drain', z.void().optional(), () => drainOutbox(getDb(), getSupabaseClient())),
  );

  ipcMain.handle(
    'sync:retryFailed',
    wrap('sync:retryFailed', z.void().optional(), () => {
      retryFailedOutbox(getDb());
      return getSyncStatus(getDb());
    }),
  );

  ipcMain.handle(
    'sync:applyInbox',
    wrap('sync:applyInbox', z.void().optional(), () => ({ applied: applyInbox(getDb(), tenant()) })),
  );

  ipcMain.handle(
    'sync:listConflicts',
    wrap('sync:listConflicts', z.void().optional(), () => listConflicts(getDb(), tenant())),
  );

  ipcMain.handle(
    'sync:resolveConflict',
    wrap('sync:resolveConflict', SyncConflictResolveInput, ({ id, resolution }) =>
      resolveConflict(getDb(), tenant(), id, resolution),
    ),
  );
}
