import type { Database } from 'better-sqlite3';
import { resolveUpdatePolicy, type UpdateChannel } from '@shared/updates';

export interface AppSettings {
  update_channel: UpdateChannel;
  crash_reporting_enabled: boolean;
  sentry_dsn: string | null;
}

export function getAppSettings(db: Database): AppSettings {
  const rows = db.prepare(`SELECT key, value FROM app_settings`).all() as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const channel = map.get('update_channel') === 'beta' ? 'beta' : 'latest';
  return {
    update_channel: channel,
    crash_reporting_enabled: map.get('crash_reporting_enabled') === '1',
    sentry_dsn: map.get('sentry_dsn') || null,
  };
}

export function updateAppSettings(db: Database, patch: Partial<AppSettings>): AppSettings {
  const set = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (@key, @value, @updated_at)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const now = new Date().toISOString();
  if (patch.update_channel) {
    const policy = resolveUpdatePolicy(patch.update_channel);
    set.run({ key: 'update_channel', value: policy.channel, updated_at: now });
  }
  if (patch.crash_reporting_enabled !== undefined) {
    set.run({ key: 'crash_reporting_enabled', value: patch.crash_reporting_enabled ? '1' : '0', updated_at: now });
  }
  if (patch.sentry_dsn !== undefined) {
    set.run({ key: 'sentry_dsn', value: patch.sentry_dsn ?? '', updated_at: now });
  }
  return getAppSettings(db);
}
