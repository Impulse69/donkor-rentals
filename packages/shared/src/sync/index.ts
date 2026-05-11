export type SyncOperation = 'upsert' | 'delete';

export interface LocalSyncRow {
  id: string;
  updated_at: string;
  payload: Record<string, unknown>;
}

export interface IncomingSyncChange {
  id: string;
  table_name: string;
  record_id: string;
  op: SyncOperation;
  updated_at: string;
  payload: Record<string, unknown>;
}

export interface SyncConflictDraft {
  table_name: string;
  record_id: string;
  local_payload: Record<string, unknown>;
  remote_payload: Record<string, unknown>;
  local_updated_at: string;
  remote_updated_at: string;
}

export type IncomingChangeResolution =
  | { action: 'apply'; payload: Record<string, unknown>; conflict?: never }
  | { action: 'skip'; payload?: never; conflict?: never }
  | { action: 'conflict'; payload?: never; conflict: SyncConflictDraft };

export function resolveIncomingChange(
  local: LocalSyncRow | null,
  incoming: IncomingSyncChange,
): IncomingChangeResolution {
  if (!local) {
    return { action: 'apply', payload: incoming.payload };
  }

  const localTime = Date.parse(local.updated_at);
  const remoteTime = Date.parse(incoming.updated_at);

  if (remoteTime > localTime) {
    return { action: 'apply', payload: incoming.payload };
  }

  if (remoteTime < localTime) {
    return { action: 'skip' };
  }

  if (stableJson(local.payload) === stableJson(incoming.payload)) {
    return { action: 'skip' };
  }

  return {
    action: 'conflict',
    conflict: {
      table_name: incoming.table_name,
      record_id: incoming.record_id,
      local_payload: local.payload,
      remote_payload: incoming.payload,
      local_updated_at: local.updated_at,
      remote_updated_at: incoming.updated_at,
    },
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => [key, sortJson(val)]),
  );
}
