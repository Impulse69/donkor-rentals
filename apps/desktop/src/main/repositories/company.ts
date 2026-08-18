import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { CompanySetupInput, ShopProfile } from '@shared/schemas';
import { ensureBootstrapTenant } from '../db';

const SHOP_COLS = `id, name, currency, locale, address, phone, tin, fiscal_year_start, logo_path, created_at, updated_at`;

function nowIso(): string {
  return new Date().toISOString();
}

export function getCompanyProfile(db: Database): ShopProfile | null {
  return (db.prepare(`SELECT ${SHOP_COLS} FROM tenants LIMIT 1`).get() as ShopProfile | undefined) ?? null;
}

export function hasCompanyProfile(db: Database): boolean {
  const profile = getCompanyProfile(db);
  return Boolean(profile?.name?.trim());
}

export function setupCompany(db: Database, input: CompanySetupInput): ShopProfile {
  const existing = getCompanyProfile(db);
  const id = existing?.id ?? uuidv4();
  const now = nowIso();
  if (existing) {
    db.prepare(
      `UPDATE tenants
       SET name = @name,
           currency = 'GHS',
           locale = 'en-GB',
           address = @address,
           phone = @phone,
           tin = @tin,
           fiscal_year_start = @fiscal_year_start,
           updated_at = @updated_at
       WHERE id = @id`,
    ).run({
      id,
      name: input.name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      tin: input.tin ?? null,
      fiscal_year_start: input.fiscal_year_start,
      updated_at: now,
    });
  } else {
    db.prepare(
      `INSERT INTO tenants (
         id, name, currency, locale, address, phone, tin, fiscal_year_start, logo_path, created_at, updated_at
       ) VALUES (
         @id, @name, 'GHS', 'en-GB', @address, @phone, @tin, @fiscal_year_start, NULL, @created_at, @updated_at
       )`,
    ).run({
      id,
      name: input.name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      tin: input.tin ?? null,
      fiscal_year_start: input.fiscal_year_start,
      created_at: now,
      updated_at: now,
    });
  }
  return getCompanyProfile(db) ?? (() => {
    throw new Error('Company setup completed but no profile was found');
  })();
}

export function getOrCreateCompanyProfile(db: Database): ShopProfile {
  ensureBootstrapTenant(db);
  const profile = getCompanyProfile(db);
  if (!profile) throw new Error('Company profile could not be initialized');
  return profile;
}
