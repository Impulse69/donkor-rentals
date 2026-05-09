import { describe, it, expect } from 'vitest';
import { fromCedis, toCedis, format, formatPlain, parseCedisInput, pesewas } from './index';

describe('money', () => {
  it('round-trips cedis ↔ pesewas', () => {
    expect(toCedis(fromCedis(12.5))).toBe(12.5);
  });

  it('rejects fractional pesewas', () => {
    expect(() => pesewas(1.5)).toThrow();
  });

  it('formats GHS with symbol', () => {
    const out = format(fromCedis(1234.5));
    // ICU output may vary by Node version; assert key parts.
    expect(out).toMatch(/1,234\.50/);
    expect(out).toMatch(/(GH₵|GHS)/);
  });

  it('formats plain decimal without symbol', () => {
    expect(formatPlain(fromCedis(7))).toBe('7.00');
    expect(formatPlain(fromCedis(1234.5))).toMatch(/1,234\.50/);
  });

  it('parses tolerant cedis input', () => {
    expect(parseCedisInput('GH₵ 12.50')).toBe(1250);
    expect(parseCedisInput('1,234.50')).toBe(123450);
    expect(parseCedisInput('  ')).toBe(0);
    expect(parseCedisInput('not a number')).toBe(0);
  });
});
