import { z } from 'zod';
import { Uuid, IsoDateTime } from './common';

export const CustomerIdType = z.enum([
  'ghana_card',
  'voter_id',
  'passport',
  'drivers_license',
  'other',
]);

/** Display labels for the id_type enum, in the order they should appear in pickers. */
export const CUSTOMER_ID_LABELS = {
  ghana_card: 'Ghana Card',
  voter_id: 'Voter ID',
  passport: 'Passport',
  drivers_license: 'Driver’s licence',
  other: 'Other',
} as const satisfies Record<z.infer<typeof CustomerIdType>, string>;

export const CUSTOMER_ID_OPTIONS = (Object.keys(CUSTOMER_ID_LABELS) as Array<keyof typeof CUSTOMER_ID_LABELS>)
  .map((value) => ({ value, label: CUSTOMER_ID_LABELS[value] }));

export const Customer = z.object({
  id: Uuid,
  tenant_id: Uuid,
  name: z.string().min(1).max(200),
  phone: z
    .string()
    .trim()
    .min(0)
    .max(32)
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  email: z.string().email().max(200).nullable().or(z.literal('').transform(() => null)),
  id_type: CustomerIdType.nullable(),
  id_number: z.string().max(64).nullable(),
  address: z.string().max(500).nullable(),
  notes: z.string().max(2000).nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const CustomerCreateInput = Customer.omit({
  id: true,
  tenant_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});

export const CustomerUpdateInput = CustomerCreateInput.partial();

export const CustomerFilter = z.object({
  search: z.string().trim().max(200).optional(),
  includeDeleted: z.boolean().optional(),
});

export type Customer = z.infer<typeof Customer>;
export type CustomerIdType = z.infer<typeof CustomerIdType>;
export type CustomerCreateInput = z.infer<typeof CustomerCreateInput>;
export type CustomerUpdateInput = z.infer<typeof CustomerUpdateInput>;
export type CustomerFilter = z.infer<typeof CustomerFilter>;
