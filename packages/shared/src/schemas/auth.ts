import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';

export const UserRole = z.enum(['owner', 'manager', 'staff']);

export const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
} as const satisfies Record<z.infer<typeof UserRole>, string>;

export const ShopProfile = z.object({
  id: Uuid,
  name: z.string().min(1).max(160),
  currency: z.literal('GHS'),
  locale: z.literal('en-GB'),
  address: z.string().max(400).nullable(),
  phone: z.string().max(80).nullable(),
  logo_path: z.string().max(500).nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});

export const LocalUser = z.object({
  id: Uuid,
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: UserRole,
  tenant_id: Uuid,
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});

export const AuthSession = z.object({
  user: LocalUser,
  shop: ShopProfile,
  supabaseConfigured: z.boolean(),
});

export const FirstRunInput = z.object({
  shop_name: z.string().min(1).max(160),
  shop_address: z.string().max(400).nullable().optional(),
  shop_phone: z.string().max(80).nullable().optional(),
  owner_name: z.string().min(1).max(120),
  owner_email: z.string().email(),
  password: z.string().min(8),
  role: UserRole.optional(),
});

export const SignInInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const LocalUserCreateInput = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8),
  role: UserRole,
});

export type UserRole = z.infer<typeof UserRole>;
export type ShopProfile = z.infer<typeof ShopProfile>;
export type LocalUser = z.infer<typeof LocalUser>;
export type AuthSession = z.infer<typeof AuthSession>;
export type FirstRunInput = z.infer<typeof FirstRunInput>;
export type SignInInput = z.infer<typeof SignInInput>;
export type LocalUserCreateInput = z.infer<typeof LocalUserCreateInput>;
