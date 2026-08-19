import { useMemo, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Input } from './Field';
import {
  beginEdit,
  countSpec,
  editDraft,
  endEdit,
  fieldText,
  moneySpec,
  type NumericFieldSpec,
} from '../lib/numeric-field';

type PassThrough = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'onFocus' | 'onBlur' | 'type'
>;

interface BaseProps extends PassThrough {
  label: string;
  value: number;
  onValueChange: (n: number) => void;
  hint?: string;
  error?: string;
  containerClass?: string;
  prefix?: ReactNode;
  required?: boolean;
}

/**
 * A numeric field that can actually be typed into.
 *
 * The whole point is that while the field has focus the person's own text is
 * what is displayed — never a re-formatted version of the parsed number. See
 * `lib/numeric-field.ts` for why that distinction is the entire bug.
 *
 * Focus selects the contents, so typing replaces rather than appends. That is
 * what QuickBooks does, and it is the direct answer to "I can only add numbers
 * to the already existing 1".
 */
function NumericInput({
  spec,
  value,
  onValueChange,
  ...rest
}: BaseProps & { spec: NumericFieldSpec }): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Input
      {...rest}
      inputMode="decimal"
      value={fieldText(spec, value, draft)}
      onFocus={(e) => {
        setDraft(beginEdit(spec, value));
        // Select after the browser has finished its own focus handling,
        // otherwise a click places the caret and wipes the selection.
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => {
        const next = editDraft(spec, e.target.value);
        setDraft(next.draft);
        onValueChange(next.value);
      }}
      onBlur={() => {
        onValueChange(endEdit(spec, draft));
        setDraft(null);
      }}
    />
  );
}

interface CountProps extends BaseProps {
  min?: number;
  max?: number;
}

/** Whole-number field: quantities, counts, odometer readings. */
export function CountInput({ min = 0, max, ...rest }: CountProps): JSX.Element {
  const spec = useMemo(() => countSpec({ min, max }), [min, max]);
  return <NumericInput {...rest} spec={spec} mono />;
}

interface MoneyProps extends BaseProps {
  /** Credits, adjustments and corrections may legitimately be negative. */
  allowNegative?: boolean;
}

/** Cedis field. `value` is, and stays, integer pesewas. */
export function MoneyInput({ allowNegative = false, prefix, ...rest }: MoneyProps): JSX.Element {
  const spec = useMemo(() => moneySpec({ allowNegative }), [allowNegative]);
  // Spread first: putting it after would let an absent `prefix` clobber the default.
  return <NumericInput {...rest} spec={spec} mono prefix={prefix ?? 'GH₵'} />;
}
