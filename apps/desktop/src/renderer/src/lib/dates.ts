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

/**
 * An `<input type="date">` is empty for as long as it takes someone to clear it
 * and type a new one. `new Date('T08:00')` is an Invalid Date and
 * `.toISOString()` throws on it, so that keystroke used to take down the whole
 * form via the error boundary — losing everything else typed into it.
 *
 * Returns null when there is no usable date. Callers decide what an absent date
 * means; crashing is never the answer.
 */
export function dateInputToIsoOrNull(date: string, time = '08:00'): string | null {
  if (!date) return null;
  const d = new Date(`${date}T${time || '08:00'}`);
  if (Number.isNaN(d.getTime())) return null;
  // A date is parsed local, and JavaScript quietly rolls impossible days over:
  // "2026-02-31" becomes 3 March. A date field that silently books a different
  // day than the one written in it is worse than one that refuses, so check the
  // parse round-trips before trusting it.
  const [y, m, day] = date.split('-').map(Number);
  if (d.getFullYear() !== y || d.getMonth() + 1 !== m || d.getDate() !== day) return null;
  return d.toISOString();
}

export function dateInputToIso(date: string, time = '08:00'): string {
  const iso = dateInputToIsoOrNull(date, time);
  if (iso === null) throw new Error(`dateInputToIso: "${date}" is not a date`);
  return iso;
}

export function localTimeInput(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Today as YYYY-MM-DD in local time. */
/**
 * Today, as the person sitting in front of the machine understands it.
 *
 * There were three copies of this: this one, and two more in route helpers that
 * used `new Date().toISOString().slice(0, 10)` — which is today in UTC, not
 * today here. In Ghana (UTC+0) they agree, so it never showed; anywhere else
 * they disagree for part of every day, and an expense dated "today" could be
 * filed to the wrong day, the wrong month for VAT, or into a period that has
 * already been closed. One definition, exported, used everywhere.
 */
export function todayInput(): string {
  return localDateInput(new Date().toISOString());
}

/** The first of the current month, in local time for the same reason. */
export function monthStartInput(): string {
  const d = new Date();
  return localDateInput(new Date(d.getFullYear(), d.getMonth(), 1).toISOString());
}
