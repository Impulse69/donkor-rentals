import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { IpcMainInvokeEvent } from 'electron';
import { fail, ok, wrap } from './envelope';

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Every IPC call in the app funnels through wrap(), so its contract matters more
 * than its size: the renderer must always receive a tagged union and never a
 * thrown error, and a validation failure must be distinguishable from a genuine
 * fault so the UI can tell the operator which one it is.
 */
const EVENT = {} as IpcMainInvokeEvent;

describe('Result helpers', () => {
  it('tags success and failure distinguishably', () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 });
    expect(fail('VALIDATION', 'nope')).toEqual({ ok: false, error: { code: 'VALIDATION', message: 'nope' } });
  });
});

describe('wrap', () => {
  it('passes parsed input through and wraps the result', async () => {
    const handler = wrap('test:echo', z.object({ n: z.number() }), (input) => input.n * 2);
    await expect(handler(EVENT, { n: 21 })).resolves.toEqual({ ok: true, data: 42 });
  });

  it('awaits an async handler', async () => {
    const handler = wrap('test:async', z.void().optional(), async () => {
      await Promise.resolve();
      return 'done';
    });
    await expect(handler(EVENT, undefined)).resolves.toEqual({ ok: true, data: 'done' });
  });

  it('reports a schema mismatch as VALIDATION, naming the field', async () => {
    const handler = wrap('test:strict', z.object({ n: z.number() }), (input) => input.n);
    const result = await handler(EVENT, { n: 'not a number' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toMatch(/n:/);
  });

  it('reports a thrown error as INTERNAL and keeps its message', async () => {
    const handler = wrap('test:throws', z.void().optional(), () => {
      throw new Error('Cannot void an invoice with payments');
    });
    const result = await handler(EVENT, undefined);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('INTERNAL');
    // Repository guards speak to the operator, so the message must survive the
    // boundary intact rather than being flattened to something generic.
    expect(result.error.message).toBe('Cannot void an invoice with payments');
  });

  it('reports a rejected promise as INTERNAL too', async () => {
    const handler = wrap('test:rejects', z.void().optional(), async () => {
      await Promise.resolve();
      throw new Error('async boom');
    });
    const result = await handler(EVENT, undefined);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.message).toBe('async boom');
  });

  it('survives a non-Error throw without producing [object Object]', async () => {
    const handler = wrap('test:throws-string', z.void().optional(), () => {
      throw 'plain string';
    });
    const result = await handler(EVENT, undefined);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.message).toBe('plain string');
  });

  it('never throws at the boundary, whatever the handler does', async () => {
    const handlers = [
      wrap('a', z.object({ x: z.number() }), (i) => i.x),
      wrap('b', z.void().optional(), () => { throw new Error('sync'); }),
      wrap('c', z.void().optional(), async () => { throw new Error('async'); }),
    ];

    for (const handler of handlers) {
      // Deliberately bad input for the first, undefined for the rest.
      await expect(handler(EVENT, undefined)).resolves.toHaveProperty('ok');
    }
  });
});
