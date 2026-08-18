import { describe, expect, it } from 'vitest';
import { fiscalYearStart, toEntryDate } from './dates';

describe('accounting dates', () => {
  it('formats entry dates in Africa/Accra even when the process timezone is not UTC', () => {
    expect(process.env.TZ).not.toBe('UTC');
    expect(toEntryDate('2026-01-01T01:00:00.000Z')).toBe('2026-01-01');
  });

  it('finds the fiscal year start for any configured start month', () => {
    expect(fiscalYearStart('2026-08-18', 1)).toBe('2026-01-01');
    expect(fiscalYearStart('2026-02-28', 4)).toBe('2025-04-01');
    expect(fiscalYearStart('2026-04-01', 4)).toBe('2026-04-01');
  });
});
