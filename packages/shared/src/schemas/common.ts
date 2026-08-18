import { z } from 'zod';

export const Uuid = z.string().uuid();
export const IsoDateTime = z.string().datetime({ offset: true });
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');
export const Pesewas = z.number().int().nonnegative();

export const SoftDeletableTimestamps = z.object({
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export type Uuid = z.infer<typeof Uuid>;
export type IsoDate = z.infer<typeof IsoDate>;
export type Pesewas = z.infer<typeof Pesewas>;
