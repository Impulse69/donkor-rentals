import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(readSupabaseConfig());
}

export function getSupabaseClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const config = readSupabaseConfig();
  cached = config ? createClient(config.url, config.anonKey, { auth: { persistSession: false } }) : null;
  return cached;
}

function readSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env['DONKOR_SUPABASE_URL'] ?? process.env['VITE_SUPABASE_URL'];
  const anonKey = process.env['DONKOR_SUPABASE_ANON_KEY'] ?? process.env['VITE_SUPABASE_ANON_KEY'];
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
