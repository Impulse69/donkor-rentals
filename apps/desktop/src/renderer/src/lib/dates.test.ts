import { describe, expect, it } from 'vitest';
import { dateInputToIso, dateInputToIsoOrNull, monthStartInput, todayInput } from './dates';
import { todayInput as expensesToday } from '../routes/expenses/helpers';
import { todayInput as accountingToday, monthStartInput as accountingMonthStart } from '../routes/accounting/helpers';

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

describe('one definition of today', () => {
  it('is literally the same function everywhere, not a copy that agrees today', () => {
    // Asserting the VALUES match is close to worthless on a UTC+0 machine like
    // the one this was written on: a UTC copy and a local copy return the same
    // string all day in Accra, so the regression this guards against would sail
    // through. Asserting identity holds anywhere — a re-introduced local copy
    // fails it regardless of where the clock is set.
    expect(expensesToday).toBe(todayInput);
    expect(accountingToday).toBe(todayInput);
    expect(accountingMonthStart).toBe(monthStartInput);
  });

  it('agrees across every module that asks for it', () => {
    // There were three implementations: this one, and two route helpers using
    // `new Date().toISOString().slice(0, 10)` — which is today in UTC, not today
    // where the user is standing. In Ghana (UTC+0) they agree, so nothing ever
    // showed; anywhere else they disagree for part of every day, and an expense
    // dated "today" could be filed to the wrong day, the wrong month for VAT, or
    // into a period already closed.
    expect(expensesToday()).toBe(todayInput());
    expect(accountingToday()).toBe(todayInput());
    expect(accountingMonthStart()).toBe(monthStartInput());
  });

  // Only bites off UTC+0; kept because CI and other machines are not in Accra.
  it('reports the local date, not the UTC one', () => {
    const now = new Date();
    const localYmd = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    expect(todayInput()).toBe(localYmd);
  });

  it('starts the month on the first, locally', () => {
    const now = new Date();
    const first = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      '01',
    ].join('-');
    expect(monthStartInput()).toBe(first);
  });
});
