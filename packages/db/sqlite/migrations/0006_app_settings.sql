-- Phase 7 - local app settings for update channel and crash reporting.

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO app_settings (key, value, updated_at)
VALUES
  ('update_channel', 'latest', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('crash_reporting_enabled', '0', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('sentry_dsn', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(key) DO NOTHING;
