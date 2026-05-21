import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  body,
  actions,
}: {
  /** Inline glyph or SVG. Defaults to a quiet dot if nothing is passed. */
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>{icon ?? <DefaultGlyph />}</div>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {body && (
        <p className="muted" style={{ maxWidth: 420, margin: '0 auto 18px', lineHeight: 1.55 }}>
          {body}
        </p>
      )}
      {actions && <div className="row" style={{ justifyContent: 'center' }}>{actions}</div>}
    </div>
  );
}

function DefaultGlyph(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="6.5" />
      <path d="M7 10h6" strokeLinecap="round" />
    </svg>
  );
}
