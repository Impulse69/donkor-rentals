import { describe, expect, it } from 'vitest';
import { dateInputToIso, dateInputToIsoOrNull } from './dates';

/**
 * `<input type="date">` is empty for as long as it takes someone to clear it and
 * type a new one. `new Date('T08:00')` is an Invalid Date and `.toISOString()`
 * throws on it — and because the booking form called this during render, that
 * single keystroke replaced the whole form with the error boundary and threw
 * away everything else already typed into it.
 */
describe('dateInputToIsoOrNull', () => {
  it('returns null for a field that is mid-edit rather than throwing', () => {
    expect(dateInputToIsoOrNull('')).toBeNull();
    expect(dateInputToIsoOrNull('not-a-date')).toBeNull();
    // Half-typed years arrive here on every keystroke.
    expect(dateInputToIsoOrNull('2')).toBeNull();
    expect(dateInputToIsoOrNull('2026-')).toBeNull();
  });

  it('rejects a date that looks well-formed but does not exist', () => {
    expect(dateInputToIsoOrNull('2026-02-31')).toBeNull();
    expect(dateInputToIsoOrNull('2026-13-01')).toBeNull();
  });

  it('converts a real date', () => {
    const iso = dateInputToIsoOrNull('2026-04-01', '08:00');
    expect(iso).not.toBeNull();
    expect(new Date(iso as string).getFullYear()).toBe(2026);
  });

  it('falls back to a default time when the time field is also empty', () => {
    expect(dateInputToIsoOrNull('2026-04-01', '')).not.toBeNull();
  });
});

describe('dateInputToIso', () => {
  it('still throws, but with a message naming the input', () => {
    // Callers inside submit handlers rely on the throw; it just has to be
    // legible when it surfaces in a toast.
    expect(() => dateInputToIso('')).toThrow(/not a date/i);
  });

  it('agrees with the nullable variant on valid input', () => {
    expect(dateInputToIso('2026-04-01', '08:00')).toBe(dateInputToIsoOrNull('2026-04-01', '08:00'));
  });
});
