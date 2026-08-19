/**
 * The state machine behind every numeric text field.
 *
 * A numeric field has two representations: the number the app stores, and the
 * text the person is part-way through typing. Deriving the text from the number
 * on every keystroke — `value={String(qty)}` with an onChange that parses and
 * clamps — is what makes a field impossible to edit:
 *
 *   qty is 1, the box shows "1". You select it and press Delete. onChange sees
 *   "", parses NaN, falls back to 1, and React redraws "1". The box never goes
 *   empty, so you can only ever append to the digit already sitting there.
 *
 * Money was worse: the display ran through a 2-decimal formatter, so typing
 * "25.50" into a field showing "10.00" walked through 10.00 -> 10.02 and landed
 * nowhere near what was typed.
 *
 * The fix is to let the typed text be authoritative while the field is being
 * edited. The parsed number is still published on every keystroke so live
 * totals keep up — publishing is fine; it is *rewriting the text underneath the
 * cursor* that breaks editing. Clamping happens once, when editing ends.
 */
export interface NumericFieldSpec {
  /** Text shown while the field is not being edited. */
  display: (value: number) => string;
  /** Text seeded into the draft when editing begins. */
  toDraft: (value: number) => string;
  /** Parse in-progress text. `null` means "no number typed yet" — not an error. */
  parse: (text: string) => number | null;
  /** Value to settle on when editing ends with nothing usable in the box. */
  fallback: number;
  /** Applied only when editing ends, never mid-keystroke. */
  clamp?: (n: number) => number;
}

/** What the input element should show. A live draft always wins. */
export function fieldText(spec: NumericFieldSpec, value: number, draft: string | null): string {
  return draft ?? spec.display(value);
}

/** Editing began: seed the draft from the stored number. */
export function beginEdit(spec: NumericFieldSpec, value: number): string {
  return spec.toDraft(value);
}

/**
 * A keystroke landed. The draft is whatever was typed, verbatim. The published
 * number is the best reading of it — deliberately un-clamped, so a half-typed
 * value is never rewritten under the cursor.
 */
export function editDraft(spec: NumericFieldSpec, text: string): { draft: string; value: number } {
  const parsed = spec.parse(text);
  return { draft: text, value: parsed ?? spec.fallback };
}

/** Editing ended: settle on a real number and clamp it. */
export function endEdit(spec: NumericFieldSpec, draft: string | null): number {
  const parsed = draft === null ? null : spec.parse(draft);
  const settled = parsed ?? spec.fallback;
  return spec.clamp ? spec.clamp(settled) : settled;
}

const PLAIN = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole-number counts: quantities, days, odometer readings. */
export function countSpec(opts: { min?: number; max?: number } = {}): NumericFieldSpec {
  const min = opts.min ?? 0;
  const max = opts.max ?? Number.MAX_SAFE_INTEGER;
  return {
    display: (n) => String(n),
    toDraft: (n) => String(n),
    parse: (text) => {
      const digits = text.replace(/[^\d]/g, '');
      return digits === '' ? null : Number.parseInt(digits, 10);
    },
    fallback: min,
    clamp: (n) => Math.max(min, Math.min(max, n)),
  };
}

/** Cedis amounts, stored as integer pesewas. */
export function moneySpec(opts: { allowNegative?: boolean } = {}): NumericFieldSpec {
  return {
    display: (p) => PLAIN.format(p / 100),
    // Commas are for reading, not for editing — leave them out of the draft so
    // the text is something a person can sensibly backspace through.
    toDraft: (p) => (p / 100).toFixed(2),
    parse: (text) => {
      const cleaned = text.replace(/[^\d.-]/g, '');
      if (!/\d/.test(cleaned)) return null;
      const n = Number.parseFloat(cleaned);
      if (!Number.isFinite(n)) return null;
      return Math.round(n * 100);
    },
    fallback: 0,
    clamp: opts.allowNegative ? undefined : (n) => Math.max(0, n),
  };
}
