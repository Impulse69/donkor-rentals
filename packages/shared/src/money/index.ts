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

export function toCedis(p: Pesewas | number): number {
  return p / 100;
}

const currency = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GHS',
  currencyDisplay: 'symbol',
});

const decimal = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "GH₵12.50" — used in totals/lists. Accepts a raw pesewas integer. */
export function format(p: Pesewas | number): string {
  return currency.format(toCedis(p));
}

/** "12.50" — used in form fields where the symbol lives in the prefix slot. */
export function formatPlain(p: Pesewas | number): string {
  return decimal.format(toCedis(p));
}

/**
 * Parse a free-text cedis input ("1,234.50", "GH₵ 25", " 7. ") into an integer pesewas.
 * Tolerant of currency symbols, commas, and stray whitespace; non-numeric → 0.
 */
export function parseCedisInput(input: string): Pesewas {
  const cleaned = input.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const n = Number.parseFloat(cleaned || '0');
  return fromCedis(Number.isFinite(n) ? n : 0);
}
