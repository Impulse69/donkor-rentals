import { describe, expect, it } from 'vitest';
import { resolveIncomingChange } from './index';

const baseLocal = {
  id: 'row-1',
  updated_at: '2026-05-01T10:00:00.000Z',
  payload: { id: 'row-1', name: 'Local row', updated_at: '2026-05-01T10:00:00.000Z' },
};

describe('resolveIncomingChange', () => {
  it('applies an incoming row when it is newer than the local copy', () => {
    const result = resolveIncomingChange(baseLocal, {
      id: 'change-1',
      table_name: 'customers',
      record_id: 'row-1',
      op: 'upsert',
      updated_at: '2026-05-01T11:00:00.000Z',
      payload: { id: 'row-1', name: 'Remote row', updated_at: '2026-05-01T11:00:00.000Z' },
    });

    expect(result.action).toBe('apply');
    expect(result.payload?.name).toBe('Remote row');
  });

  it('skips an incoming row when the local copy is newer', () => {
    const result = resolveIncomingChange(baseLocal, {
      id: 'change-2',
      table_name: 'customers',
      record_id: 'row-1',
      op: 'upsert',
      updated_at: '2026-05-01T09:00:00.000Z',
      payload: { id: 'row-1', name: 'Remote row', updated_at: '2026-05-01T09:00:00.000Z' },
    });

    expect(result.action).toBe('skip');
  });

  it('flags a conflict when equal timestamps carry divergent payloads', () => {
    const result = resolveIncomingChange(baseLocal, {
      id: 'change-3',
      table_name: 'customers',
      record_id: 'row-1',
      op: 'upsert',
      updated_at: '2026-05-01T10:00:00.000Z',
      payload: { id: 'row-1', name: 'Remote row', updated_at: '2026-05-01T10:00:00.000Z' },
    });

    expect(result.action).toBe('conflict');
    expect(result.conflict?.table_name).toBe('customers');
    expect(result.conflict?.record_id).toBe('row-1');
  });
});
