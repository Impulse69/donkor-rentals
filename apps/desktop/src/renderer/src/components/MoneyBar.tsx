import { format } from '@shared/money';

export type MoneyBarTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export interface MoneyBarEntry {
  label: string;
  amountPesewas: number;
  tone: MoneyBarTone;
  onClick?: () => void;
}

interface MoneyBarProps {
  entries: MoneyBarEntry[];
  ariaLabel?: string;
}

export function MoneyBar({ entries, ariaLabel = 'Money summary' }: MoneyBarProps): JSX.Element {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.amountPesewas), 0);

  return (
    <div className="money-bar" aria-label={ariaLabel}>
      <div className="money-bar-track" role="list">
        {entries.map((entry) => {
          const value = Math.max(0, entry.amountPesewas);
          const width = total > 0 ? `${(value / total) * 100}%` : `${100 / Math.max(entries.length, 1)}%`;
          const SegmentTag = entry.onClick ? 'button' : 'span';

          return (
            <SegmentTag
              key={entry.label}
              type={entry.onClick ? 'button' : undefined}
              className={`money-bar-segment money-bar-${entry.tone}`}
              style={{ width }}
              onClick={entry.onClick}
              role="listitem"
              title={`${entry.label}: ${format(entry.amountPesewas)}`}
            />
          );
        })}
      </div>
      <div className="money-bar-legend">
        {entries.map((entry) => (
          <button
            key={entry.label}
            type="button"
            className={`money-bar-key money-bar-key-${entry.tone}`}
            onClick={entry.onClick}
            disabled={!entry.onClick}
          >
            <span className="money-bar-dot" aria-hidden="true" />
            <span className="money-bar-amount">{format(entry.amountPesewas)}</span>
            <span className="money-bar-label">{entry.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
