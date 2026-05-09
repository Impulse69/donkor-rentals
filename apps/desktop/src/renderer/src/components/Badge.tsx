import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'gold';

export function Badge({
  tone = 'neutral',
  dot,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" style={{ background: 'currentColor' }} />}
      {children}
    </span>
  );
}
