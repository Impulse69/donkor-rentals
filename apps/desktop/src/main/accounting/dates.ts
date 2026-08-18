export function toEntryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO date: ${iso}`);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Accra',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string): string => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error(`Could not format ${type} for ${iso}`);
    return value;
  };
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function fiscalYearStart(asOf: string, startMonth: number): string {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new Error(`Invalid fiscal year start month: ${startMonth}`);
  }
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(asOf);
  if (!match) throw new Error(`Invalid entry date: ${asOf}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const fiscalYear = month >= startMonth ? year : year - 1;
  return `${fiscalYear}-${String(startMonth).padStart(2, '0')}-01`;
}
