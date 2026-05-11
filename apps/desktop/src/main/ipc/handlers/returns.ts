import { ipcMain } from 'electron';
import { z } from 'zod';
import { ReturnCreateInput, Uuid } from '@shared/schemas';
import { wrap } from '../envelope';
import { getDb, ensureBootstrapTenant } from '../../db';
import * as returnsRepo from '../../repositories/returns';

function tenant(): string {
  return ensureBootstrapTenant(getDb());
}

export function registerReturnsIpc(): void {
  ipcMain.handle(
    'returns:list',
    wrap('returns:list', z.void().optional(), () => returnsRepo.listReturns(getDb(), tenant())),
  );

  ipcMain.handle(
    'returns:get',
    wrap('returns:get', z.object({ id: Uuid }), ({ id }) => returnsRepo.getReturn(getDb(), tenant(), id)),
  );

  ipcMain.handle(
    'returns:create',
    wrap('returns:create', ReturnCreateInput, (input) => returnsRepo.createReturn(getDb(), tenant(), input)),
  );

  ipcMain.handle(
    'returns:attachPhoto',
    wrap(
      'returns:attachPhoto',
      z.object({
        damageLineId: Uuid,
        storagePath: z.string().min(1).max(500),
        caption: z.string().max(200).nullable().optional(),
      }),
      ({ damageLineId, storagePath, caption }) =>
        returnsRepo.attachDamagePhoto(getDb(), tenant(), damageLineId, storagePath, caption ?? null),
    ),
  );
}
