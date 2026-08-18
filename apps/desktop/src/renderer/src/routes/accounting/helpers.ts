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

export function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartInput(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}

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
