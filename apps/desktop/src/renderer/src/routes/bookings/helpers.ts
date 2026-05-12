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

// Date-input bridge helpers live in lib/dates so other domains can reuse them.
export { localDateInput, localTimeInput, dateInputToIso, todayInput } from '../../lib/dates';
