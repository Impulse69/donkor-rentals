import type { ReactNode } from 'react';
import type { AsyncState } from '../lib/useAsync';
import { Alert } from './Alert';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { TableSkeleton } from './Skeleton';

interface Props<T> {
  state: AsyncState<T[]> & { refresh: () => void };
  loadingLabel?: string;
  emptyTitle: string;
  emptyBody?: ReactNode;
  emptyAction?: ReactNode;
  /** When provided, used for the loading skeleton instead of the default table skeleton. */
  loadingSkeleton?: ReactNode;
  /** Called only when state.status === 'ok' and data is non-empty. */
  children: (data: T[]) => ReactNode;
}

/**
 * Standardised loading / error / empty / data branches for list screens.
 * Replaces the repeated 4-arm ternaries that used to live in each *List route.
 */
export function AsyncList<T>({
  state,
  loadingLabel: _loadingLabel,
  emptyTitle,
  emptyBody,
  emptyAction,
  loadingSkeleton,
  children,
}: Props<T>): JSX.Element {
  void _loadingLabel; // kept for back-compat in call sites; the skeleton speaks for itself

  if (state.status === 'idle' || state.status === 'loading') {
    return <>{loadingSkeleton ?? <TableSkeleton rows={5} cols={4} />}</>;
  }
  if (state.status === 'error') {
    return (
      <Alert
        tone="bad"
        eyebrow="Could not load"
        title="Something went wrong fetching the list."
      >
        <div style={{ marginBottom: 12 }}>{state.error.message}</div>
        <Button size="sm" onClick={state.refresh}>Try again</Button>
      </Alert>
    );
  }
  if (state.data.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} actions={emptyAction} />;
  }
  return <>{children(state.data)}</>;
}
