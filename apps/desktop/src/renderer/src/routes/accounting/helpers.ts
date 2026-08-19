import {
  ACCOUNT_CLASSIFICATION_LABELS,
  ACCOUNT_DETAIL_TYPE_LABELS,
  ACCOUNT_TYPE_LABELS,
  NORMAL_BALANCE_LABELS,
  type Account,
  type AccountClassification,
  type AccountDetailType,
  type AccountType,
  type NormalBalance,
} from '@shared/schemas';

// Re-exported rather than redefined: these were UTC copies that disagreed with
// the rest of the app for part of every day outside UTC+0. monthStartInput was
// worse — it read local year/month and then built a UTC date from them.
export { todayInput, monthStartInput } from '../../lib/dates';

export function accountName(accounts: Account[], id: string | null | undefined): string {
  return accounts.find((a) => a.id === id)?.name ?? 'Unknown account';
}

export function accountLabel(a: Account): string {
  return `${a.code} - ${a.name}`;
}

export function typeLabel(value: AccountType): string {
  return ACCOUNT_TYPE_LABELS[value];
}

export function detailTypeLabel(value: AccountDetailType): string {
  return ACCOUNT_DETAIL_TYPE_LABELS[value];
}

export function classificationLabel(value: AccountClassification): string {
  return ACCOUNT_CLASSIFICATION_LABELS[value];
}

export function normalBalanceLabel(value: NormalBalance): string {
  return NORMAL_BALANCE_LABELS[value];
}
