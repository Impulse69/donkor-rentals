import type { Database } from 'better-sqlite3';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { AuthSession, FirstRunInput, LocalUser, LocalUserCreateInput, ShopProfile, UserRole } from '@shared/schemas';
import { ensureBootstrapTenant } from '../db';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client';

const USER_COLS = `id, tenant_id, email, name, role, created_at, updated_at, deleted_at`;
const SHOP_COLS = `id, name, currency, locale, address, phone, logo_path, created_at, updated_at`;

function nowIso(): string {
  return new Date().toISOString();
}

function passwordHash(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const digest = pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('base64url');
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}

function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, iterRaw, salt, digest] = stored.split('$');
  if (scheme !== 'pbkdf2_sha256' || !iterRaw || !salt || !digest) return false;
  const expected = Buffer.from(digest, 'base64url');
  const actual = pbkdf2Sync(password, salt, Number(iterRaw), expected.length, 'sha256');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function getSession(db: Database): AuthSession | null {
  const active = db
    .prepare(`SELECT value FROM auth_state WHERE key = 'active_user_id'`)
    .get() as { value: string } | undefined;
  if (!active) return null;

  const user = db
    .prepare(`SELECT ${USER_COLS} FROM app_users WHERE id = @id AND deleted_at IS NULL`)
    .get({ id: active.value }) as LocalUser | undefined;
  if (!user) return null;

  const shop = getShop(db, user.tenant_id);
  if (!shop) return null;
  return { user, shop, supabaseConfigured: isSupabaseConfigured() };
}

export function getShop(db: Database, tenantId?: string): ShopProfile | null {
  const id = tenantId ?? ensureBootstrapTenant(db);
  return (
    (db.prepare(`SELECT ${SHOP_COLS} FROM tenants WHERE id = @id`).get({ id }) as ShopProfile | undefined) ??
    null
  );
}

export async function completeFirstRun(db: Database, input: FirstRunInput): Promise<AuthSession> {
  const tenantId = ensureBootstrapTenant(db);
  const userId = uuidv4();
  const now = nowIso();
  const hash = passwordHash(input.password);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE tenants SET name = @name, address = @address, phone = @phone, updated_at = @updated_at
       WHERE id = @id`,
    ).run({
      id: tenantId,
      name: input.shop_name,
      address: input.shop_address ?? null,
      phone: input.shop_phone ?? null,
      updated_at: now,
    });

    db.prepare(
      `INSERT INTO app_users (${USER_COLS}, password_hash)
       VALUES (@id, @tenant_id, @email, @name, 'owner', @created_at, @updated_at, NULL, @password_hash)
       ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         role = 'owner',
         tenant_id = excluded.tenant_id,
         password_hash = excluded.password_hash,
         updated_at = excluded.updated_at,
         deleted_at = NULL`,
    ).run({
      id: userId,
      tenant_id: tenantId,
      email: input.owner_email.toLowerCase(),
      name: input.owner_name,
      password_hash: hash,
      created_at: now,
      updated_at: now,
    });

    const stored = db
      .prepare(`SELECT id FROM app_users WHERE email = @email`)
      .get({ email: input.owner_email.toLowerCase() }) as { id: string };
    db.prepare(
      `INSERT INTO auth_state (key, value) VALUES ('active_user_id', @id)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run({ id: stored.id });
  });
  tx();

  await mirrorFirstRunToSupabase(db, input, tenantId);

  const session = getSession(db);
  if (!session) throw new Error('First-run setup completed but no session was created');
  return session;
}

export function createLocalUser(db: Database, input: LocalUserCreateInput): LocalUser {
  const tenantId = ensureBootstrapTenant(db);
  const id = uuidv4();
  const now = nowIso();
  db.prepare(
    `INSERT INTO app_users (${USER_COLS}, password_hash)
     VALUES (@id, @tenant_id, @email, @name, @role, @created_at, @updated_at, NULL, @password_hash)
     ON CONFLICT(email) DO UPDATE SET
       name = excluded.name,
       role = excluded.role,
       tenant_id = excluded.tenant_id,
       password_hash = excluded.password_hash,
       updated_at = excluded.updated_at,
       deleted_at = NULL`,
  ).run({
    id,
    tenant_id: tenantId,
    email: input.email.toLowerCase(),
    name: input.name,
    role: input.role,
    password_hash: passwordHash(input.password),
    created_at: now,
    updated_at: now,
  });
  return db.prepare(`SELECT ${USER_COLS} FROM app_users WHERE email = @email`)
    .get({ email: input.email.toLowerCase() }) as LocalUser;
}

export async function signIn(db: Database, email: string, password: string): Promise<AuthSession> {
  const client = getSupabaseClient();
  if (client) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  const user = db
    .prepare(`SELECT ${USER_COLS}, password_hash FROM app_users WHERE email = @email AND deleted_at IS NULL`)
    .get({ email: email.toLowerCase() }) as LocalUser | undefined;
  if (!user) {
    throw new Error(client ? 'Supabase sign-in succeeded but no local profile exists' : 'No local user found for that email');
  }
  if (!client && !verifyPassword(password, (user as LocalUser & { password_hash?: string | null }).password_hash)) {
    throw new Error('Invalid email or password');
  }

  db.prepare(
    `INSERT INTO auth_state (key, value) VALUES ('active_user_id', @id)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run({ id: user.id });

  const session = getSession(db);
  if (!session) throw new Error('Sign-in completed but no session was created');
  return session;
}

export function hasLocalUsers(db: Database): boolean {
  const userCount = db.prepare(`SELECT COUNT(*) AS n FROM app_users WHERE deleted_at IS NULL`).get() as { n: number };
  return userCount.n > 0;
}

export async function signOut(db: Database): Promise<void> {
  const client = getSupabaseClient();
  if (client) await client.auth.signOut();
  db.prepare(`DELETE FROM auth_state WHERE key = 'active_user_id'`).run();
}

export function requireRole(db: Database, allowed: UserRole[]): void {
  const userCount = db.prepare(`SELECT COUNT(*) AS n FROM app_users WHERE deleted_at IS NULL`).get() as { n: number };
  if (userCount.n === 0) return;

  const session = getSession(db);
  if (!session) throw new Error('Sign in required');
  if (!allowed.includes(session.user.role)) {
    throw new Error(`Requires ${allowed.join(' or ')} role`);
  }
}

async function mirrorFirstRunToSupabase(db: Database, input: FirstRunInput, tenantId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !input.password) return;

  const { data, error } = await client.auth.signUp({
    email: input.owner_email,
    password: input.password,
    options: { data: { name: input.owner_name, role: 'owner', tenant_id: tenantId } },
  });
  if (error) throw new Error(error.message);

  const userId = data.user?.id;
  if (!userId) return;
  const shop = getShop(db, tenantId);
  if (!shop) return;

  await client.from('tenants').upsert({
    id: tenantId,
    name: shop.name,
    currency: shop.currency,
    locale: shop.locale,
    address: shop.address,
    phone: shop.phone,
    logo_path: shop.logo_path,
    created_at: shop.created_at,
    updated_at: shop.updated_at,
  });
  await client.from('memberships').upsert({ user_id: userId, tenant_id: tenantId, role: 'owner' });
  await client.from('profiles').upsert({
    id: userId,
    tenant_id: tenantId,
    email: input.owner_email.toLowerCase(),
    name: input.owner_name,
    role: 'owner',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}
