import { z } from 'zod';

export const Uuid = z.string().uuid();
export const IsoDateTime = z.string().datetime({ offset: true });
export const Pesewas = z.number().int().nonnegative();

export const SoftDeletableTimestamps = z.object({
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export type Uuid = z.infer<typeof Uuid>;
export type Pesewas = z.infer<typeof Pesewas>;
