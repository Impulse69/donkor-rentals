import type { Account, Vendor } from '@shared/schemas';

// Re-exported rather than redefined: this used to be a UTC copy that disagreed
// with the rest of the app for part of every day outside UTC+0.
export { todayInput } from '../../lib/dates';

export function dateInputToIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

export function vendorName(vendors: Vendor[], id: string | null | undefined): string {
  return vendors.find((v) => v.id === id)?.name ?? 'No vendor';
}

export function accountName(accounts: Account[], id: string | null | undefined): string {
  return accounts.find((a) => a.id === id)?.name ?? 'Unassigned';
}

export function accountOptions(accounts: Account[]): Array<{ value: string; label: string }> {
  return accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }));
}
