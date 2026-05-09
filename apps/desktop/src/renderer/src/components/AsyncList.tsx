import type { ReactNode } from 'react';
import type { AsyncState } from '../lib/useAsync';
import { Alert } from './Alert';
import { EmptyState } from './EmptyState';
import { Spinner } from './Spinner';

interface Props<T> {
  state: AsyncState<T[]> & { refresh: () => void };
  loadingLabel?: string;
  emptyTitle: string;
  emptyBody?: ReactNode;
  emptyAction?: ReactNode;
  /** Called only when state.status === 'ok' and data is non-empty. */
  children: (data: T[]) => ReactNode;
}

/**
 * Standardised loading / error / empty / data branches for list screens.
 * Replaces the repeated 4-arm ternaries that lived in each *List route.
 */
export function AsyncList<T>({
  state,
  loadingLabel = 'Loading…',
  emptyTitle,
  emptyBody,
  emptyAction,
  children,
}: Props<T>): JSX.Element {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="card row" style={{ justifyContent: 'center' }}>
        <Spinner />
        <span className="muted" style={{ marginLeft: 10 }}>{loadingLabel}</span>
      </div>
    );
  }
  if (state.status === 'error') {
    return <Alert tone="bad" eyebrow="Error">{state.error.message}</Alert>;
  }
  if (state.data.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} actions={emptyAction} />;
  }
  return <>{children(state.data)}</>;
}
