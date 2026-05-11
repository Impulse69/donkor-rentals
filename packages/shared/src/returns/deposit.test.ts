import { describe, expect, it } from 'vitest';
import { reconcileDeposit } from './index';

describe('reconcileDeposit', () => {
  it('deducts damage and loss charges from the deposit and returns the balance', () => {
    const result = reconcileDeposit({
      deposit_pesewas: 50_000,
      charges: [
        { label: 'Chair repairs', amount_pesewas: 12_500 },
        { label: 'Lost linen', amount_pesewas: 8_000 },
      ],
    });

    expect(result.total_charges_pesewas).toBe(20_500);
    expect(result.refund_pesewas).toBe(29_500);
    expect(result.balance_due_pesewas).toBe(0);
  });

  it('reports the remaining customer balance when charges exceed the deposit', () => {
    const result = reconcileDeposit({
      deposit_pesewas: 10_000,
      charges: [{ label: 'Speaker replacement', amount_pesewas: 42_000 }],
    });

    expect(result.total_charges_pesewas).toBe(42_000);
    expect(result.refund_pesewas).toBe(0);
    expect(result.balance_due_pesewas).toBe(32_000);
  });
});
