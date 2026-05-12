/**
 * Bridge helpers between an HTML `<input type="date">` (which yields and
 * accepts a YYYY-MM-DD string in local time) and the ISO 8601 strings the
 * backend stores. Hoisted from bookings so invoices can reuse them.
 */

export function localDateInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateInputToIso(date: string, time = '08:00'): string {
  return new Date(`${date}T${time}`).toISOString();
}

export function localTimeInput(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Today as YYYY-MM-DD in local time. */
export function todayInput(): string {
  return localDateInput(new Date().toISOString());
}
