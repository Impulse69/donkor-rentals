import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';

export const Vendor = z.object({
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
  tin: z.string().max(64).nullable(),
  address: z.string().max(500).nullable(),
  notes: z.string().max(2000).nullable(),
  default_expense_account_id: Uuid.nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const VendorCreateInput = Vendor.omit({
  id: true,
  tenant_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});

export const VendorUpdateInput = VendorCreateInput.partial();

export const VendorFilter = z.object({
  search: z.string().trim().max(200).optional(),
  includeDeleted: z.boolean().optional(),
});

export type Vendor = z.infer<typeof Vendor>;
export type VendorCreateInput = z.infer<typeof VendorCreateInput>;
export type VendorUpdateInput = z.infer<typeof VendorUpdateInput>;
export type VendorFilter = z.infer<typeof VendorFilter>;
