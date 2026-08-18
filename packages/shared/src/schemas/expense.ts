import { z } from 'zod';
import { IsoDate, IsoDateTime, Pesewas, Uuid } from './common';
import { PaymentMethod } from './invoice';

export const ExpenseKind = z.enum(['expense', 'bill']);
export const ExpenseStatus = z.enum(['draft', 'recorded', 'paid', 'void']);

export const EXPENSE_KIND_LABELS = {
  expense: 'Expense',
  bill: 'Bill',
} as const satisfies Record<z.infer<typeof ExpenseKind>, string>;

export const EXPENSE_STATUS_LABELS = {
  draft: 'Draft',
  recorded: 'Recorded',
  paid: 'Paid',
  void: 'Void',
} as const satisfies Record<z.infer<typeof ExpenseStatus>, string>;

export const EXPENSE_STATUS_OPTIONS = (Object.keys(EXPENSE_STATUS_LABELS) as Array<keyof typeof EXPENSE_STATUS_LABELS>)
  .map((value) => ({ value, label: EXPENSE_STATUS_LABELS[value] }));
export const EXPENSE_KIND_OPTIONS = (Object.keys(EXPENSE_KIND_LABELS) as Array<keyof typeof EXPENSE_KIND_LABELS>)
  .map((value) => ({ value, label: EXPENSE_KIND_LABELS[value] }));

export const ExpenseLine = z.object({
  id: Uuid,
  tenant_id: Uuid,
  expense_id: Uuid,
  account_id: Uuid,
  description: z.string().min(1).max(400),
  quantity: z.number().int().positive(),
  unit_amount_pesewas: Pesewas,
  amount_pesewas: Pesewas,
  item_unit_id: Uuid.nullable(),
  sort_order: z.number().int(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const ExpenseLineCreateInput = ExpenseLine.omit({
  id: true,
  tenant_id: true,
  expense_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});

export const Expense = z.object({
  id: Uuid,
  tenant_id: Uuid,
  vendor_id: Uuid.nullable(),
  kind: ExpenseKind,
  number: z.string().min(1).max(64),
  status: ExpenseStatus,
  txn_date: IsoDate,
  due_date: IsoDate.nullable(),
  payment_account_id: Uuid.nullable(),
  payment_method: PaymentMethod.nullable(),
  reference: z.string().max(120).nullable(),
  memo: z.string().max(2000).nullable(),
  subtotal_pesewas: Pesewas,
  tax_pesewas: Pesewas,
  total_pesewas: Pesewas,
  item_unit_id: Uuid.nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const ExpenseCreateInput = Expense.omit({
  id: true,
  tenant_id: true,
  status: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
}).extend({
  status: ExpenseStatus.optional().default('draft'),
  lines: z.array(ExpenseLineCreateInput).min(1, 'An expense needs at least one line'),
});

export const ExpenseUpdateInput = Expense.omit({
  id: true,
  tenant_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
}).partial();

export const ExpenseFilter = z.object({
  kind: ExpenseKind.optional(),
  status: ExpenseStatus.optional(),
  vendorId: Uuid.optional(),
  dateFrom: IsoDate.optional(),
  dateTo: IsoDate.optional(),
  search: z.string().trim().max(200).optional(),
  includeDeleted: z.boolean().optional(),
});

export const BillPayment = z.object({
  id: Uuid,
  tenant_id: Uuid,
  expense_id: Uuid,
  paid_from_account_id: Uuid,
  amount_pesewas: Pesewas.refine((n) => n > 0, 'Amount must be positive'),
  method: PaymentMethod,
  reference: z.string().max(120).nullable(),
  paid_at: IsoDateTime,
  notes: z.string().max(2000).nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const BillPaymentCreateInput = BillPayment.omit({
  id: true,
  tenant_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});

export type ExpenseKind = z.infer<typeof ExpenseKind>;
export type ExpenseStatus = z.infer<typeof ExpenseStatus>;
export type ExpenseLine = z.infer<typeof ExpenseLine>;
export type ExpenseLineCreateInput = z.infer<typeof ExpenseLineCreateInput>;
export type Expense = z.infer<typeof Expense>;
export type ExpenseCreateInput = z.infer<typeof ExpenseCreateInput>;
export type ExpenseUpdateInput = z.infer<typeof ExpenseUpdateInput>;
export type ExpenseFilter = z.infer<typeof ExpenseFilter>;
export type BillPayment = z.infer<typeof BillPayment>;
export type BillPaymentCreateInput = z.infer<typeof BillPaymentCreateInput>;
