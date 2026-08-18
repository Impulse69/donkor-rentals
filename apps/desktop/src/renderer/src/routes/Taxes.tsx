import { useMemo, useState } from 'react';
import { Alert } from '../components/Alert';
import { EmptyState } from '../components/EmptyState';
import { Input, Select } from '../components/Field';
import { Spinner } from '../components/Spinner';
import { api } from '../lib/api';
import { formatGhs } from '../lib/format';
import { useAsync } from '../lib/useAsync';

type Preset = 'month' | 'quarter' | 'year' | 'custom';

interface TrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  balance_side: 'debit' | 'credit' | 'zero';
  balance_pesewas: number;
}

const TAX_ACCOUNTS = [
  { code: '2210', label: 'NHIL Payable' },
  { code: '2220', label: 'GETFund Levy Payable' },
  { code: '2200', label: 'VAT Payable' },
] as const;

function inputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function presetRange(preset: Preset): { start: string; end: string } {
  const now = new Date();
  const end = inputDate(now);
  if (preset === 'year') return { start: `${now.getFullYear()}-01-01`, end };
  if (preset === 'quarter') {
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    return { start: inputDate(new Date(now.getFullYear(), qMonth, 1)), end };
  }
  return { start: inputDate(new Date(now.getFullYear(), now.getMonth(), 1)), end };
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function signedTbBalance(row: TrialBalanceRow | undefined): number {
  if (!row || row.balance_side === 'zero') return 0;
  return row.balance_side === 'credit' ? row.balance_pesewas : -row.balance_pesewas;
}

export default function Taxes(): JSX.Element {
  const [preset, setPreset] = useState<Preset>('month');
  const initial = useMemo(() => presetRange('month'), []);
  const [range, setRange] = useState(initial);
  const openingDate = dayBefore(range.start);
  const opening = useAsync(() => api.reports.trialBalance(openingDate), [openingDate]);
  const period = useAsync(() => api.reports.trialBalance(range.end, range.start), [range.start, range.end]);

  function setPresetRange(next: Preset): void {
    setPreset(next);
    if (next !== 'custom') setRange(presetRange(next));
  }

  const loading = opening.status === 'idle' || opening.status === 'loading' || period.status === 'idle' || period.status === 'loading';
  const error = opening.status === 'error' ? opening.error : period.status === 'error' ? period.error : null;
  const rows = opening.status === 'ok' && period.status === 'ok'
    ? TAX_ACCOUNTS.map((tax) => {
        const openingRow = (opening.data as TrialBalanceRow[]).find((r) => r.code === tax.code);
        const periodRow = (period.data as TrialBalanceRow[]).find((r) => r.code === tax.code);
        const openingBalance = signedTbBalance(openingRow);
        const charged = periodRow?.credit_pesewas ?? 0;
        const paid = periodRow?.debit_pesewas ?? 0;
        return {
          ...tax,
          name: periodRow?.name ?? openingRow?.name ?? tax.label,
          opening_pesewas: openingBalance,
          charged_pesewas: charged,
          paid_pesewas: paid,
          closing_pesewas: openingBalance + charged - paid,
        };
      })
    : [];

  return (
    <div className="page fade-up" style={{ maxWidth: 1080 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Taxes / Ghana statutory liabilities</div>
          <h1 className="page-title">Taxes</h1>
        </div>
      </header>

      <Alert tone="info" eyebrow="Cascade" title="NHIL and GETFund apply first; VAT applies on subtotal plus levies.">
        The invoice engine computes NHIL at 2.5 percent and GETFund at 2.5 percent on subtotal, then VAT at 15 percent on subtotal plus those levies.
      </Alert>

      <div className="dtable-toolbar">
        <Select
          label="Preset"
          value={preset}
          onChange={(e) => setPresetRange(e.target.value as Preset)}
          options={[
            { value: 'month', label: 'This month' },
            { value: 'quarter', label: 'This quarter' },
            { value: 'year', label: 'This year' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        <Input label="Start" type="date" value={range.start} onChange={(e) => { setPreset('custom'); setRange((s) => ({ ...s, start: e.target.value })); }} />
        <Input label="End" type="date" value={range.end} onChange={(e) => { setPreset('custom'); setRange((s) => ({ ...s, end: e.target.value })); }} />
      </div>

      {loading ? (
        <div className="row" style={{ justifyContent: 'center', padding: 60 }}><Spinner /></div>
      ) : error ? (
        <Alert tone="bad" eyebrow="Taxes" title="Could not load statutory liabilities">{error.message}</Alert>
      ) : rows.every((r) => r.opening_pesewas === 0 && r.charged_pesewas === 0 && r.paid_pesewas === 0 && r.closing_pesewas === 0) ? (
        <EmptyState title="No statutory tax activity" body="NHIL, GETFund, and VAT payable rows will appear here once posted invoices or payments affect the tax payable accounts." />
      ) : (
        <div className="dtable-wrap">
          <table className="dtable">
            <thead>
              <tr>
                <th>Tax</th>
                <th className="num">Opening balance</th>
                <th className="num">Charged in period</th>
                <th className="num">Paid in period</th>
                <th className="num">Closing balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} style={{ cursor: 'default' }}>
                  <td><span className="mono faint">{r.code}</span> {r.name}</td>
                  <td className="num">{formatGhs(r.opening_pesewas)}</td>
                  <td className="num">{formatGhs(r.charged_pesewas)}</td>
                  <td className="num">{formatGhs(r.paid_pesewas)}</td>
                  <td className="num strong">{formatGhs(r.closing_pesewas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
