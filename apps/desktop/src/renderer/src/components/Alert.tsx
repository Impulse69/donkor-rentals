import type { ReactNode } from 'react';

export type AlertTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info';

interface Props {
  tone?: AlertTone;
  eyebrow?: string;
  title?: ReactNode;
  children?: ReactNode;
  /** Compact left-bar variant — used inside conflict reports etc. */
  compact?: boolean;
}

const TONE_TO_VAR: Record<AlertTone, { border: string; bg: string; ink: string }> = {
  neutral: { border: 'var(--rule)',   bg: 'var(--panel)',     ink: 'var(--ink-mute)' },
  ok:      { border: 'var(--ok)',     bg: 'var(--ok-soft)',   ink: 'var(--ok)' },
  warn:    { border: 'var(--warn)',   bg: 'var(--warn-soft)', ink: 'var(--warn)' },
  bad:     { border: 'var(--bad)',    bg: 'var(--bad-soft)',  ink: 'var(--bad)' },
  info:    { border: 'var(--info)',   bg: 'var(--info-soft)', ink: 'var(--info)' },
};

export function Alert({ tone = 'neutral', eyebrow, title, children, compact }: Props): JSX.Element {
  const c = TONE_TO_VAR[tone];
  if (compact) {
    return (
      <div style={{ borderLeft: `2px solid ${c.border}`, paddingLeft: 10 }}>
        {eyebrow && <span className="eyebrow" style={{ color: c.ink }}>{eyebrow}</span>}
        {title && <div style={{ fontWeight: 500, marginTop: eyebrow ? 4 : 0 }}>{title}</div>}
        {children && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{children}</div>}
      </div>
    );
  }
  return (
    <div className="card" style={{ borderColor: c.border, background: c.bg }}>
      {eyebrow && <span className="eyebrow" style={{ color: c.ink }}>{eyebrow}</span>}
      {title && <h3 style={{ marginTop: 6 }}>{title}</h3>}
      {children && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}
