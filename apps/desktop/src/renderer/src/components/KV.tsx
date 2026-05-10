/**
 * Compact label / value row used on detail and summary cards.
 * Tone tints the value (red for outstanding, green for settled).
 */
export type KvTone = 'ok' | 'bad' | 'warn' | 'info' | 'neutral';

const TONE_COLOR: Record<KvTone, string | undefined> = {
  ok: 'var(--ok)',
  bad: 'var(--bad)',
  warn: 'var(--warn)',
  info: 'var(--info)',
  neutral: undefined,
};

export function KV({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: KvTone;
}): JSX.Element {
  const colour = tone ? TONE_COLOR[tone] : undefined;
  return (
    <div className="row-between" style={{ padding: '4px 0' }}>
      <span className="muted">{label}</span>
      <span
        className="mono"
        style={{ fontWeight: bold ? 600 : 400, fontSize: bold ? 16 : 14, color: colour }}
      >
        {value}
      </span>
    </div>
  );
}
