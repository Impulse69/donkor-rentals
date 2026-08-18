import { z } from 'zod';
import { IsoDate, IsoDateTime, Pesewas, Uuid } from './common';

export const JournalEntryStatus = z.enum(['posted', 'void']);
export const JournalOrigin = z.enum(['auto', 'manual']);
export const JournalSourceType = z.enum(['invoice', 'payment', 'return', 'expense', 'bill_payment', 'manual']);

export const JOURNAL_ENTRY_STATUS_LABELS = {
  posted: 'Posted',
  void: 'Void',
} as const satisfies Record<z.infer<typeof JournalEntryStatus>, string>;

export const JOURNAL_ORIGIN_LABELS = {
  auto: 'Automatic',
  manual: 'Manual',
} as const satisfies Record<z.infer<typeof JournalOrigin>, string>;

export const JOURNAL_SOURCE_TYPE_LABELS = {
  invoice: 'Invoice',
  payment: 'Payment',
  return: 'Return',
  expense: 'Expense',
  bill_payment: 'Bill payment',
  manual: 'Manual',
} as const satisfies Record<z.infer<typeof JournalSourceType>, string>;

export const JOURNAL_ENTRY_STATUS_OPTIONS = (
  Object.keys(JOURNAL_ENTRY_STATUS_LABELS) as Array<keyof typeof JOURNAL_ENTRY_STATUS_LABELS>
).map((value) => ({ value, label: JOURNAL_ENTRY_STATUS_LABELS[value] }));
export const JOURNAL_ORIGIN_OPTIONS = (
  Object.keys(JOURNAL_ORIGIN_LABELS) as Array<keyof typeof JOURNAL_ORIGIN_LABELS>
).map((value) => ({ value, label: JOURNAL_ORIGIN_LABELS[value] }));
export const JOURNAL_SOURCE_TYPE_OPTIONS = (
  Object.keys(JOURNAL_SOURCE_TYPE_LABELS) as Array<keyof typeof JOURNAL_SOURCE_TYPE_LABELS>
).map((value) => ({ value, label: JOURNAL_SOURCE_TYPE_LABELS[value] }));

export const JournalLine = z.object({
  id: Uuid,
  tenant_id: Uuid,
  entry_id: Uuid,
  line_no: z.number().int().positive(),
  account_id: Uuid,
  debit_pesewas: Pesewas,
  credit_pesewas: Pesewas,
  memo: z.string().max(2000).nullable(),
  customer_id: Uuid.nullable(),
  vendor_id: Uuid.nullable(),
  item_id: Uuid.nullable(),
  item_unit_id: Uuid.nullable(),
  created_at: IsoDateTime,
});

export const JournalEntry = z.object({
  id: Uuid,
  tenant_id: Uuid,
  entry_no: z.string().min(1).max(64),
  entry_date: IsoDate,
  memo: z.string().max(2000).nullable(),
  status: JournalEntryStatus,
  origin: JournalOrigin,
  source_type: JournalSourceType,
  source_id: Uuid.nullable(),
  source_event: z.string().max(120).nullable(),
  source_key: z.string().min(1).max(200),
  reversal_of_id: Uuid.nullable(),
  reversed_by_id: Uuid.nullable(),
  posting_version: z.number().int().positive(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  lines: z.array(JournalLine),
});

export const JournalLineInput = JournalLine.omit({
  id: true,
  tenant_id: true,
  entry_id: true,
  line_no: true,
  created_at: true,
});

export const JournalEntryCreateInput = JournalEntry.omit({
  id: true,
  tenant_id: true,
  entry_no: true,
  status: true,
  reversal_of_id: true,
  reversed_by_id: true,
  posting_version: true,
  created_at: true,
  updated_at: true,
  lines: true,
}).extend({
  status: JournalEntryStatus.optional().default('posted'),
  lines: z.array(JournalLineInput).min(2, 'A journal entry needs at least two lines'),
}).superRefine((entry, ctx) => {
  let debits = 0;
  let credits = 0;

  entry.lines.forEach((line, index) => {
    const hasDebit = line.debit_pesewas > 0;
    const hasCredit = line.credit_pesewas > 0;
    if (hasDebit === hasCredit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Each journal line must have exactly one non-zero side',
        path: ['lines', index],
      });
    }
    debits += line.debit_pesewas;
    credits += line.credit_pesewas;
  });

  if (debits !== credits) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Journal entry debits must equal credits',
      path: ['lines'],
    });
  }
});

export const JournalFilter = z.object({
  status: JournalEntryStatus.optional(),
  origin: JournalOrigin.optional(),
  sourceType: JournalSourceType.optional(),
  sourceId: Uuid.optional(),
  dateFrom: IsoDate.optional(),
  dateTo: IsoDate.optional(),
  search: z.string().trim().max(200).optional(),
});

export type JournalEntryStatus = z.infer<typeof JournalEntryStatus>;
export type JournalOrigin = z.infer<typeof JournalOrigin>;
export type JournalSourceType = z.infer<typeof JournalSourceType>;
export type JournalLine = z.infer<typeof JournalLine>;
export type JournalEntry = z.infer<typeof JournalEntry>;
export type JournalLineInput = z.infer<typeof JournalLineInput>;
export type JournalEntryCreateInput = z.infer<typeof JournalEntryCreateInput>;
export type JournalFilter = z.infer<typeof JournalFilter>;
