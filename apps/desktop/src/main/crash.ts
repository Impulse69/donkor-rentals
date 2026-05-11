import type { Database } from 'better-sqlite3';
import log from 'electron-log/main';
import { getAppSettings } from './repositories/settings';

let enabled = false;
let dsn: string | null = null;

export function configureCrashReporting(db: Database): void {
  const settings = getAppSettings(db);
  enabled = settings.crash_reporting_enabled;
  dsn = settings.sentry_dsn ?? process.env['DONKOR_SENTRY_DSN'] ?? null;
  if (enabled && dsn) {
    log.info('crash reporting configured');
  } else {
    log.info('crash reporting disabled');
  }
}

export function getCrashStatus(): { enabled: boolean; configured: boolean } {
  return { enabled, configured: Boolean(dsn) };
}

export function captureCrash(error: unknown): void {
  if (!enabled) return;
  log.error('captured crash-report event', error);
}
