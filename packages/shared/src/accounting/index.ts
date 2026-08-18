import type { AccountClassification, AccountDetailType } from '../schemas';

export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export const AGING_BUCKET_LABELS = {
  current: 'Current',
  d1_30: '1-30',
  d31_60: '31-60',
  d61_90: '61-90',
  d90_plus: '90+',
} as const satisfies Record<AgingBucket, string>;

export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd1_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd90_plus';
}

export function isContraAccount(detailType: AccountDetailType): boolean {
  return detailType === 'accumulated_depreciation' || detailType === 'owner_drawings' || detailType === 'contra_income';
}

export interface ProfitAndLossSummaryRow {
  label: string;
  amount_pesewas: number;
  kind: 'section' | 'subtotal' | 'total';
}

export interface ProfitAndLossInputRow {
  classification: AccountClassification;
  amount_pesewas: number;
}

export function summariseProfitAndLoss(rows: ProfitAndLossInputRow[]): ProfitAndLossSummaryRow[] {
  const sum = (classification: AccountClassification): number =>
    rows.filter((r) => r.classification === classification).reduce((total, r) => total + r.amount_pesewas, 0);
  const income = sum('operating_income') + sum('other_income');
  const costOfRevenue = sum('cost_of_revenue');
  const grossProfit = income - costOfRevenue;
  const operatingExpenses = sum('operating_expense');
  const operatingProfit = grossProfit - operatingExpenses;
  const other = sum('other_income') - sum('other_expense');
  return [
    { label: 'Income', amount_pesewas: income, kind: 'section' },
    { label: 'Cost of Revenue', amount_pesewas: costOfRevenue, kind: 'section' },
    { label: 'Gross Profit', amount_pesewas: grossProfit, kind: 'subtotal' },
    { label: 'Operating Expenses', amount_pesewas: operatingExpenses, kind: 'section' },
    { label: 'Operating Profit', amount_pesewas: operatingProfit, kind: 'subtotal' },
    { label: 'Other', amount_pesewas: other, kind: 'section' },
    { label: 'Net Profit', amount_pesewas: operatingProfit + other, kind: 'total' },
  ];
}

export interface BalanceSheetInputRow {
  account_type: 'asset' | 'liability' | 'equity';
  amount_pesewas: number;
}

export function summariseBalanceSheet(rows: BalanceSheetInputRow[]): { assets_pesewas: number; liabilities_pesewas: number; equity_pesewas: number } {
  return {
    assets_pesewas: rows.filter((r) => r.account_type === 'asset').reduce((s, r) => s + r.amount_pesewas, 0),
    liabilities_pesewas: rows.filter((r) => r.account_type === 'liability').reduce((s, r) => s + r.amount_pesewas, 0),
    equity_pesewas: rows.filter((r) => r.account_type === 'equity').reduce((s, r) => s + r.amount_pesewas, 0),
  };
}
