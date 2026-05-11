import { describe, expect, it } from 'vitest';
import { calculateUtilizationPercent } from './index';

describe('calculateUtilizationPercent', () => {
  it('calculates booked quantity-days against available quantity-days', () => {
    expect(calculateUtilizationPercent({ bookedQuantityDays: 45, totalQuantity: 10, windowDays: 9 })).toBe(50);
  });

  it('returns zero when there is no capacity', () => {
    expect(calculateUtilizationPercent({ bookedQuantityDays: 10, totalQuantity: 0, windowDays: 9 })).toBe(0);
  });
});
