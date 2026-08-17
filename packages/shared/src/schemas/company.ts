import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';

export const ShopProfile = z.object({
  id: Uuid,
  name: z.string().min(1).max(160),
  currency: z.literal('GHS'),
  locale: z.literal('en-GB'),
  address: z.string().max(400).nullable(),
  phone: z.string().max(80).nullable(),
  tin: z.string().max(80).nullable(),
  fiscal_year_start: z.string().max(10).nullable(),
  logo_path: z.string().max(500).nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});

export const CompanySetupInput = z.object({
  name: z.string().min(1).max(160),
  address: z.string().max(400).nullable().optional(),
  phone: z.string().max(80).nullable().optional(),
  tin: z.string().max(80).nullable().optional(),
  currency: z.literal('GHS'),
  fiscal_year_start: z.string().min(1).max(10),
});

export type ShopProfile = z.infer<typeof ShopProfile>;
export type CompanySetupInput = z.infer<typeof CompanySetupInput>;
