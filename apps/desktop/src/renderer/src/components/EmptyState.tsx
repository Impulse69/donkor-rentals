import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  body,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="empty">
      {icon !== undefined && <div className="empty-icon">{icon}</div>}
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {body && <p className="muted" style={{ maxWidth: 400, margin: '0 auto 18px' }}>{body}</p>}
      {actions && <div className="row" style={{ justifyContent: 'center' }}>{actions}</div>}
    </div>
  );
}
