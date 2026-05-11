export interface UtilizationInput {
  bookedQuantityDays: number;
  totalQuantity: number;
  windowDays: number;
}

export function calculateUtilizationPercent(input: UtilizationInput): number {
  const capacity = input.totalQuantity * input.windowDays;
  if (capacity <= 0) return 0;
  return Math.round((input.bookedQuantityDays / capacity) * 10000) / 100;
}
