/**
 * Money helpers. All monetary values are stored as integer pesewas (1 GHS = 100 pesewas)
 * to avoid floating-point drift. Display formatting goes through `format`.
 */

export type Pesewas = number & { readonly __brand: 'Pesewas' };

export function pesewas(n: number): Pesewas {
  if (!Number.isInteger(n)) throw new Error(`pesewas requires integer, got ${n}`);
  return n as Pesewas;
}

export function fromCedis(cedis: number): Pesewas {
  return pesewas(Math.round(cedis * 100));
}

export function toCedis(p: Pesewas): number {
  return p / 100;
}

const formatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GHS',
  currencyDisplay: 'symbol',
});

export function format(p: Pesewas): string {
  return formatter.format(toCedis(p));
}
