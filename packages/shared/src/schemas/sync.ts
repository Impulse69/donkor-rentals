import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';

export const SyncStatus = z.object({
  configured: z.boolean(),
  online: z.boolean(),
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  lastSyncedAt: IsoDateTime.nullable(),
  lastError: z.string().nullable(),
});

export const SyncConflict = z.object({
  id: Uuid,
  tenant_id: Uuid,
  table_name: z.string().min(1),
  record_id: z.string().min(1),
  local_payload: z.string(),
  remote_payload: z.string(),
  local_updated_at: IsoDateTime,
  remote_updated_at: IsoDateTime,
  status: z.enum(['open', 'resolved_local', 'resolved_remote']),
  created_at: IsoDateTime,
  resolved_at: IsoDateTime.nullable(),
});

export const SyncConflictResolveInput = z.object({
  id: Uuid,
  resolution: z.enum(['local', 'remote']),
});

export type SyncStatus = z.infer<typeof SyncStatus>;
export type SyncConflict = z.infer<typeof SyncConflict>;
export type SyncConflictResolveInput = z.infer<typeof SyncConflictResolveInput>;
