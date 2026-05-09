import { z } from 'zod';
import { Uuid, Pesewas, IsoDateTime } from './common';

export const ItemKind = z.enum(['party_supply', 'hearse']);
export const ItemStatus = z.enum(['active', 'retired']);

export const ItemUnitStatus = z.enum([
  'available',
  'reserved',
  'out',
  'returned',
  'damaged',
  'retired',
]);

export const Item = z.object({
  id: Uuid,
  tenant_id: Uuid,
  kind: ItemKind,
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  daily_rate_pesewas: Pesewas,
  replacement_value_pesewas: Pesewas,
  total_quantity: z.number().int().nonnegative(),
  status: ItemStatus,
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const ItemUnit = z.object({
  id: Uuid,
  tenant_id: Uuid,
  item_id: Uuid,
  identifier: z.string().min(1).max(64),
  vin: z.string().max(32).nullable(),
  plate: z.string().max(16).nullable(),
  odometer_km: z.number().int().nonnegative().nullable(),
  current_status: ItemUnitStatus,
  notes: z.string().max(2000).nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const ItemCreateInput = Item.omit({
  id: true,
  tenant_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});

export const ItemUpdateInput = ItemCreateInput.partial();

export const ItemUnitCreateInput = ItemUnit.omit({
  id: true,
  tenant_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});

export const ItemUnitUpdateInput = ItemUnitCreateInput.partial();

export const ItemFilter = z.object({
  search: z.string().trim().max(200).optional(),
  kind: ItemKind.optional(),
  status: ItemStatus.optional(),
  includeDeleted: z.boolean().optional(),
});

export type Item = z.infer<typeof Item>;
export type ItemKind = z.infer<typeof ItemKind>;
export type ItemStatus = z.infer<typeof ItemStatus>;
export type ItemUnit = z.infer<typeof ItemUnit>;
export type ItemUnitStatus = z.infer<typeof ItemUnitStatus>;
export type ItemCreateInput = z.infer<typeof ItemCreateInput>;
export type ItemUpdateInput = z.infer<typeof ItemUpdateInput>;
export type ItemUnitCreateInput = z.infer<typeof ItemUnitCreateInput>;
export type ItemUnitUpdateInput = z.infer<typeof ItemUnitUpdateInput>;
export type ItemFilter = z.infer<typeof ItemFilter>;
