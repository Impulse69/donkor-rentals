import type { BookingStatus } from '@shared/schemas';

export function bookingStatusTone(s: BookingStatus): 'neutral' | 'info' | 'gold' | 'warn' | 'ok' | 'bad' {
  switch (s) {
    case 'quote': return 'neutral';
    case 'reserved': return 'gold';
    case 'out': return 'warn';
    case 'returned': return 'ok';
    case 'cancelled': return 'bad';
  }
}

/**
 * Whole calendar days the booking covers (inclusive). End is exclusive in
 * storage but bookings are charged per started day, so we ceil.
 */
export function daysCovered(starts: string, ends: string): number {
  const a = new Date(starts).getTime();
  const b = new Date(ends).getTime();
  const ms = Math.max(0, b - a);
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function localDateInput(iso: string): string {
  // Returns YYYY-MM-DD for an <input type="date">. Uses local TZ.
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateInputToIso(date: string, time = '08:00'): string {
  // Build an ISO-with-offset string from a local date + time string.
  const d = new Date(`${date}T${time}`);
  return d.toISOString();
}
