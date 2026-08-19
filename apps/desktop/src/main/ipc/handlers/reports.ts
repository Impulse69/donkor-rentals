import { ipcMain } from 'electron';
import { z } from 'zod';
import { IsoDate, IsoDateTime, Uuid } from '@shared/schemas';
import { wrap } from '../envelope';
import { getDb, ensureBootstrapTenant } from '../../db';
import * as reports from '../../repositories/reports';
import * as accountingReports from '../../repositories/accounting-reports';

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
    wrap('reports:topCustomers', z.object({ limit: z.number().int().positive().max(50).optional(), start: z.string().optional(), end: z.string().optional() }), ({ limit, start, end }) =>
      reports.getTopCustomers(getDb(), tenant(), limit ?? 10, start, end),
    ),
  );

  ipcMain.handle(
    'reports:tripLog',
    wrap('reports:tripLog', z.object({ limit: z.number().int().positive().max(200).optional(), start: z.string().optional(), end: z.string().optional() }), ({ limit, start, end }) =>
      reports.getTripLog(getDb(), tenant(), limit ?? 50, start, end),
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

  ipcMain.handle(
    'reports:trialBalance',
    wrap('reports:trialBalance', z.object({ asOf: IsoDate, start: IsoDate.optional() }), ({ asOf, start }) =>
      accountingReports.trialBalance(getDb(), tenant(), asOf, start),
    ),
  );
  ipcMain.handle(
    'reports:profitAndLoss',
    wrap('reports:profitAndLoss', z.object({ start: IsoDate, end: IsoDate }), ({ start, end }) =>
      accountingReports.profitAndLoss(getDb(), tenant(), start, end),
    ),
  );
  ipcMain.handle(
    'reports:balanceSheet',
    wrap('reports:balanceSheet', z.object({ asOf: IsoDate }), ({ asOf }) =>
      accountingReports.balanceSheet(getDb(), tenant(), asOf),
    ),
  );
  ipcMain.handle(
    'reports:arAging',
    wrap('reports:arAging', z.object({ asOf: IsoDate }), ({ asOf }) =>
      accountingReports.arAging(getDb(), tenant(), asOf),
    ),
  );
  ipcMain.handle(
    'reports:generalLedger',
    wrap('reports:generalLedger', z.object({ start: IsoDate, end: IsoDate, accountId: Uuid.optional() }), ({ start, end, accountId }) =>
      accountId
        ? accountingReports.accountRegister(getDb(), tenant(), accountId, start, end)
        : accountingReports.generalLedger(getDb(), tenant(), start, end),
    ),
  );
}
