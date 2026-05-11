import type { Pesewas } from '../schemas/common';

export interface DepositCharge {
  label: string;
  amount_pesewas: Pesewas;
}

export interface DepositReconciliationInput {
  deposit_pesewas: Pesewas;
  charges: DepositCharge[];
}

export interface DepositReconciliationResult {
  deposit_pesewas: Pesewas;
  total_charges_pesewas: Pesewas;
  refund_pesewas: Pesewas;
  balance_due_pesewas: Pesewas;
}

export function reconcileDeposit(input: DepositReconciliationInput): DepositReconciliationResult {
  const totalCharges = input.charges.reduce((sum, charge) => sum + charge.amount_pesewas, 0);
  return {
    deposit_pesewas: input.deposit_pesewas,
    total_charges_pesewas: totalCharges,
    refund_pesewas: Math.max(0, input.deposit_pesewas - totalCharges),
    balance_due_pesewas: Math.max(0, totalCharges - input.deposit_pesewas),
  };
}
