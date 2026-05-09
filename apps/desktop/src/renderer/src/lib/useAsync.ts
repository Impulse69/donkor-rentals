import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; error: Error };

/**
 * Minimal async hook. Re-runs when `deps` change. Cancels stale resolutions.
 * Exposes `refresh()` to re-fetch on demand (used after mutations).
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
): AsyncState<T> & { refresh: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });
  const counterRef = useRef(0);

  const run = useCallback(() => {
    const myCounter = ++counterRef.current;
    setState({ status: 'loading' });
    fn().then(
      (data) => {
        if (counterRef.current === myCounter) setState({ status: 'ok', data });
      },
      (err) => {
        if (counterRef.current === myCounter) {
          setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) });
        }
      },
    );
    // deps are caller-controlled; we intentionally spread them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
    return () => {
      counterRef.current++;
    };
  }, [run]);

  // Spread to keep the discriminated-union variant intact while attaching `refresh`.
  return { ...state, refresh: run } as AsyncState<T> & { refresh: () => void };
}
