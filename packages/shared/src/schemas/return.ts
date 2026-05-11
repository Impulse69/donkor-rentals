import { z } from 'zod';
import { IsoDateTime, Pesewas, Uuid } from './common';

export const ReturnCondition = z.enum(['good', 'damaged', 'lost']);
export const DamageSeverity = z.enum(['minor', 'moderate', 'severe', 'write_off']);

export const ReturnRecord = z.object({
  id: Uuid,
  tenant_id: Uuid,
  booking_id: Uuid,
  returned_at: IsoDateTime,
  received_by: z.string().max(120).nullable(),
  notes: z.string().max(2000).nullable(),
  deposit_pesewas: Pesewas,
  total_charges_pesewas: Pesewas,
  refund_pesewas: Pesewas,
  balance_due_pesewas: Pesewas,
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const DamageLine = z.object({
  id: Uuid,
  tenant_id: Uuid,
  return_id: Uuid,
  booking_line_id: Uuid,
  item_id: Uuid,
  item_unit_id: Uuid.nullable(),
  condition: ReturnCondition,
  severity: DamageSeverity.nullable(),
  quantity: z.number().int().positive(),
  description: z.string().max(500).nullable(),
  charge_pesewas: Pesewas,
  write_off: z.boolean(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const DamagePhoto = z.object({
  id: Uuid,
  tenant_id: Uuid,
  damage_line_id: Uuid,
  storage_path: z.string().min(1).max(500),
  caption: z.string().max(200).nullable(),
  created_at: IsoDateTime,
});

export const DamageLineCreateInput = DamageLine.omit({
  id: true,
  tenant_id: true,
  return_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});

export const ReturnCreateInput = z.object({
  booking_id: Uuid,
  returned_at: IsoDateTime,
  received_by: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  deposit_pesewas: Pesewas,
  lines: z.array(DamageLineCreateInput).min(1),
});

export type ReturnCondition = z.infer<typeof ReturnCondition>;
export type DamageSeverity = z.infer<typeof DamageSeverity>;
export type ReturnRecord = z.infer<typeof ReturnRecord>;
export type DamageLine = z.infer<typeof DamageLine>;
export type DamagePhoto = z.infer<typeof DamagePhoto>;
export type ReturnCreateInput = z.infer<typeof ReturnCreateInput>;
export type DamageLineCreateInput = z.infer<typeof DamageLineCreateInput>;
