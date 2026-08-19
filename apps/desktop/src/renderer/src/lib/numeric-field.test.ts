import { describe, expect, it } from 'vitest';
import {
  beginEdit,
  countSpec,
  editDraft,
  endEdit,
  fieldText,
  moneySpec,
  type NumericFieldSpec,
} from './numeric-field';

/**
 * These tests exist because of a field report: "the quantity of items during the
 * booking process cannot be wiped or modified properly. I can only add numbers
 * to the already existing 1."
 *
 * The old code was `value={String(line.quantity)}` with an onChange that parsed,
 * fell back to 1, and clamped — every keystroke. So the box could never be
 * emptied, and the same shape applied to every money field in the app.
 *
 * `type` a whole string through the field the way a person would, and assert on
 * what they are left looking at. That is the only assertion that would have
 * caught this.
 */

/** Drive a field the way a person does: focus, keystrokes, blur. */
function typeInto(
  spec: NumericFieldSpec,
  startValue: number,
  keystrokes: string,
  opts: { clearFirst?: boolean } = {},
): { shown: string; committed: number } {
  let value = startValue;
  let draft: string | null = beginEdit(spec, value);
  if (opts.clearFirst) {
    const r = editDraft(spec, '');
    draft = r.draft;
    value = r.value;
  }
  for (const ch of keystrokes) {
    const r = editDraft(spec, (draft ?? '') + ch);
    draft = r.draft;
    value = r.value;
  }
  const committed = endEdit(spec, draft);
  return { shown: spec.display(committed), committed };
}

describe('quantity field', () => {
  const qty = countSpec({ min: 1 });

  it('can be emptied — the reported bug', () => {
    // Selecting the "1" and pressing Delete must leave an empty box. The old
    // code snapped straight back to "1", which is why nothing could be edited.
    const { draft } = editDraft(qty, '');
    expect(draft).toBe('');
    expect(fieldText(qty, 1, draft)).toBe('');
  });

  it('replaces the existing 1 instead of appending to it', () => {
    // The exact complaint: typing 5 gave 15.
    const { committed } = typeInto(qty, 1, '5', { clearFirst: true });
    expect(committed).toBe(5);
  });

  it('accepts a multi-digit quantity typed from empty', () => {
    expect(typeInto(qty, 1, '250', { clearFirst: true }).committed).toBe(250);
  });

  it('settles back to the minimum when left empty', () => {
    // Clearing the box and clicking away is not an error — it means "1".
    expect(endEdit(qty, '')).toBe(1);
  });

  it('does not clamp mid-keystroke', () => {
    // Someone typing "10" passes through "1"; someone typing "05" passes
    // through "0". Clamping then would rewrite the text under the cursor.
    expect(editDraft(qty, '0').draft).toBe('0');
    // Published un-clamped: 0 is what is currently in the box. It only becomes
    // the minimum when editing ends.
    expect(editDraft(qty, '0').value).toBe(0);
    expect(endEdit(qty, '0')).toBe(1);
  });

  it('ignores letters and punctuation rather than resetting', () => {
    expect(editDraft(qty, '2a').value).toBe(2);
    expect(endEdit(qty, 'abc')).toBe(1);
  });

  it('honours a maximum when editing ends', () => {
    const capped = countSpec({ min: 1, max: 10 });
    expect(endEdit(capped, '999')).toBe(10);
    // ...but not while typing, or "1" on the way to "1" would stick.
    expect(editDraft(capped, '999').draft).toBe('999');
  });
});

describe('money field', () => {
  const money = moneySpec();

  it('accepts a decimal amount typed over an existing one', () => {
    // The old behaviour turned this into 10.02.
    const { committed, shown } = typeInto(money, 1000, '25.50', { clearFirst: true });
    expect(committed).toBe(2550);
    expect(shown).toBe('25.50');
  });

  it('survives a half-typed decimal point', () => {
    // "10." must stay "10." — reformatting it to "10.00" moves the cursor and
    // the next keystroke lands in the wrong place.
    const r = editDraft(money, '10.');
    expect(r.draft).toBe('10.');
    expect(r.value).toBe(1000);
  });

  it('can be backspaced down to empty', () => {
    let draft = beginEdit(money, 1000); // "10.00"
    expect(draft).toBe('10.00');
    while (draft.length > 0) draft = editDraft(money, draft.slice(0, -1)).draft;
    expect(draft).toBe('');
    expect(endEdit(money, draft)).toBe(0);
  });

  it('keeps pesewas exact', () => {
    expect(editDraft(money, '0.01').value).toBe(1);
    expect(editDraft(money, '1234.56').value).toBe(123456);
    // Floating point would give 807.9999999999999 here.
    expect(editDraft(money, '8.08').value).toBe(808);
  });

  it('strips a currency symbol pasted in from elsewhere', () => {
    expect(editDraft(money, 'GH₵ 12.50').value).toBe(1250);
    expect(editDraft(money, '1,234.50').value).toBe(123450);
  });

  it('refuses to go negative unless the field allows it', () => {
    expect(endEdit(money, '-5')).toBe(0);
    expect(endEdit(moneySpec({ allowNegative: true }), '-5')).toBe(-500);
  });

  it('shows thousands separators when idle but not while editing', () => {
    // Commas are for reading. Leaving them in the draft makes backspacing
    // through the number confusing.
    expect(fieldText(money, 123450, null)).toBe('1,234.50');
    expect(beginEdit(money, 123450)).toBe('1234.50');
  });
});

describe('the invariant that was broken', () => {
  it('never rewrites the text a person is typing', () => {
    // Every prefix of a plausible entry must survive being echoed back. This is
    // the property the old implementation violated on literally every keystroke.
    for (const spec of [countSpec({ min: 1 }), moneySpec()]) {
      for (const target of ['5', '250', '10.50', '0.01', '']) {
        let draft = '';
        for (const ch of target) {
          draft = editDraft(spec, draft + ch).draft;
        }
        expect(draft).toBe(target);
      }
    }
  });
});
