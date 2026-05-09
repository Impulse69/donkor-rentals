import { describe, it, expect } from 'vitest';
import { fromCedis, toCedis, format, pesewas } from './index';

describe('money', () => {
  it('round-trips cedis ↔ pesewas', () => {
    expect(toCedis(fromCedis(12.5))).toBe(12.5);
  });

  it('rejects fractional pesewas', () => {
    expect(() => pesewas(1.5)).toThrow();
  });

  it('formats GHS', () => {
    const out = format(fromCedis(1234.5));
    // ICU output may vary by Node version; assert key parts.
    expect(out).toMatch(/1,234\.50/);
    expect(out).toMatch(/(GH₵|GHS)/);
  });
});
