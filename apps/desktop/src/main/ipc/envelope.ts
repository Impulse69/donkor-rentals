import { z } from 'zod';
import log from 'electron-log/main';

/**
 * IPC handlers always return a Result envelope. Renderer never sees thrown errors —
 * it sees a tagged union it can branch on. This keeps the contextBridge surface
 * predictable and avoids leaking stack traces to the UI.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

export function wrap<I, O>(
  channel: string,
  inputSchema: z.ZodType<I>,
  fn: (input: I) => O | Promise<O>,
): (raw: unknown) => Promise<Result<O>> {
  return async (raw: unknown) => {
    try {
      const parsed = inputSchema.parse(raw);
      const data = await fn(parsed);
      return ok(data);
    } catch (err) {
      if (err instanceof z.ZodError) {
        log.warn(`ipc:${channel} validation`, err.errors);
        return fail('VALIDATION', err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      }
      const message = err instanceof Error ? err.message : String(err);
      log.error(`ipc:${channel} failed`, err);
      return fail('INTERNAL', message);
    }
  };
}
