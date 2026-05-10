import { z } from 'zod';
import { Uuid, Pesewas, IsoDateTime } from './common';

export const InvoiceStatus = z.enum(['draft', 'issued', 'paid', 'void']);
export const PaymentKind = z.enum(['deposit', 'payment', 'refund']);
export const PaymentMethod = z.enum(['cash', 'mobile_money', 'bank', 'card', 'other']);

export const INVOICE_STATUS_LABELS = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  void: 'Void',
} as const satisfies Record<z.infer<typeof InvoiceStatus>, string>;

export const PAYMENT_KIND_LABELS = {
  deposit: 'Deposit',
  payment: 'Payment',
  refund: 'Refund',
} as const satisfies Record<z.infer<typeof PaymentKind>, string>;

export const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  mobile_money: 'Mobile money',
  bank: 'Bank transfer',
  card: 'Card',
  other: 'Other',
} as const satisfies Record<z.infer<typeof PaymentMethod>, string>;

export const PAYMENT_METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABELS) as Array<keyof typeof PAYMENT_METHOD_LABELS>)
  .map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }));

export const InvoiceLine = z.object({
  id: Uuid,
  tenant_id: Uuid,
  invoice_id: Uuid,
  booking_line_id: Uuid.nullable(),
  description: z.string().min(1).max(400),
  quantity: z.number().int().positive(),
  days: z.number().int().positive(),
  unit_price_pesewas: Pesewas,
  line_total_pesewas: Pesewas,
  sort_order: z.number().int(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const InvoiceLineCreateInput = InvoiceLine.omit({
  id: true,
  tenant_id: true,
  invoice_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});

export const Invoice = z.object({
  id: Uuid,
  tenant_id: Uuid,
  booking_id: Uuid,
  number: z.string().min(1).max(64),
  status: InvoiceStatus,
  issued_at: IsoDateTime.nullable(),
  due_at: IsoDateTime.nullable(),
  subtotal_pesewas: Pesewas,
  tax_pesewas: Pesewas,
  discount_pesewas: Pesewas,
  total_pesewas: Pesewas,
  notes: z.string().max(2000).nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const InvoiceCreateFromBooking = z.object({
  booking_id: Uuid,
  due_at: IsoDateTime.nullable().optional(),
  tax_pesewas: Pesewas.optional().default(0),
  discount_pesewas: Pesewas.optional().default(0),
  notes: z.string().max(2000).nullable().optional(),
});

export const InvoiceUpdateInput = z.object({
  status: InvoiceStatus.optional(),
  due_at: IsoDateTime.nullable().optional(),
  tax_pesewas: Pesewas.optional(),
  discount_pesewas: Pesewas.optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const InvoiceFilter = z.object({
  status: InvoiceStatus.optional(),
  bookingId: Uuid.optional(),
  search: z.string().trim().max(200).optional(),
  includeDeleted: z.boolean().optional(),
});

export const Payment = z.object({
  id: Uuid,
  tenant_id: Uuid,
  invoice_id: Uuid,
  kind: PaymentKind,
  amount_pesewas: Pesewas.refine((n) => n > 0, 'Amount must be positive'),
  method: PaymentMethod,
  reference: z.string().max(120).nullable(),
  paid_at: IsoDateTime,
  notes: z.string().max(2000).nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const PaymentCreateInput = Payment.omit({
  id: true,
  tenant_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});

export const PaymentVoidInput = z.object({
  id: Uuid,
});

export type InvoiceStatus = z.infer<typeof InvoiceStatus>;
export type Invoice = z.infer<typeof Invoice>;
export type InvoiceLine = z.infer<typeof InvoiceLine>;
export type InvoiceCreateFromBooking = z.infer<typeof InvoiceCreateFromBooking>;
export type InvoiceUpdateInput = z.infer<typeof InvoiceUpdateInput>;
export type InvoiceFilter = z.infer<typeof InvoiceFilter>;
export type PaymentKind = z.infer<typeof PaymentKind>;
export type PaymentMethod = z.infer<typeof PaymentMethod>;
export type Payment = z.infer<typeof Payment>;
export type PaymentCreateInput = z.infer<typeof PaymentCreateInput>;
