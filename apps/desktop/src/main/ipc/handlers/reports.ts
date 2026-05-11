import { ipcMain } from 'electron';
import { z } from 'zod';
import { IsoDateTime } from '@shared/schemas';
import { wrap } from '../envelope';
import { getDb, ensureBootstrapTenant } from '../../db';
import * as reports from '../../repositories/reports';

function tenant(): string {
  return ensureBootstrapTenant(getDb());
}

export function registerReportsIpc(): void {
  ipcMain.handle(
    'reports:overview',
    wrap('reports:overview', z.void().optional(), () => reports.getOverview(getDb(), tenant())),
  );

  ipcMain.handle(
    'reports:utilization',
    wrap(
      'reports:utilization',
      z.object({ start: IsoDateTime, end: IsoDateTime }),
      ({ start, end }) => reports.getUtilization(getDb(), tenant(), start, end),
    ),
  );

  ipcMain.handle(
    'reports:topCustomers',
    wrap('reports:topCustomers', z.object({ limit: z.number().int().positive().max(50).optional() }), ({ limit }) =>
      reports.getTopCustomers(getDb(), tenant(), limit ?? 10),
    ),
  );

  ipcMain.handle(
    'reports:tripLog',
    wrap('reports:tripLog', z.object({ limit: z.number().int().positive().max(200).optional() }), ({ limit }) =>
      reports.getTripLog(getDb(), tenant(), limit ?? 50),
    ),
  );

  ipcMain.handle(
    'reports:damageSummary',
    wrap('reports:damageSummary', z.void().optional(), () => reports.getDamageSummary(getDb(), tenant())),
  );

  ipcMain.handle(
    'reports:exportCsv',
    wrap('reports:exportCsv', z.void().optional(), () => reports.exportReportsCsv(getDb(), tenant())),
  );
}
