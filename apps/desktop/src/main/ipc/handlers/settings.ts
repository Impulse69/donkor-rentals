import { ipcMain } from 'electron';
import { z } from 'zod';
import { wrap } from '../envelope';
import { getDb } from '../../db';
import { configureCrashReporting, getCrashStatus } from '../../crash';
import { getAppSettings, updateAppSettings } from '../../repositories/settings';
import { checkForUpdates, getUpdateStatus, setUpdateChannel } from '../../updates';

const UpdateChannel = z.enum(['latest', 'beta']);

export function registerSettingsIpc(): void {
  ipcMain.handle(
    'settings:get',
    wrap('settings:get', z.void().optional(), () => ({
      settings: getAppSettings(getDb()),
      updates: getUpdateStatus(getDb()),
      crash: getCrashStatus(),
    })),
  );

  ipcMain.handle(
    'settings:update',
    wrap(
      'settings:update',
      z.object({
        update_channel: UpdateChannel.optional(),
        crash_reporting_enabled: z.boolean().optional(),
        sentry_dsn: z.string().max(500).nullable().optional(),
      }),
      (patch) => {
        const next = updateAppSettings(getDb(), patch);
        if (patch.update_channel) setUpdateChannel(getDb(), patch.update_channel);
        if (patch.crash_reporting_enabled !== undefined || patch.sentry_dsn !== undefined) {
          configureCrashReporting(getDb());
        }
        return {
          settings: next,
          updates: getUpdateStatus(getDb()),
          crash: getCrashStatus(),
        };
      },
    ),
  );

  ipcMain.handle(
    'settings:checkForUpdates',
    wrap('settings:checkForUpdates', z.void().optional(), () => checkForUpdates(getDb())),
  );
}
