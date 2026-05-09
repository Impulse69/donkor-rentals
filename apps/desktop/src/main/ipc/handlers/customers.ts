import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  CustomerCreateInput,
  CustomerUpdateInput,
  CustomerFilter,
  Uuid,
} from '@shared/schemas';
import { wrap } from '../envelope';
import { getDb, ensureBootstrapTenant } from '../../db';
import * as customers from '../../repositories/customers';

function tenant(): string {
  return ensureBootstrapTenant(getDb());
}

export function registerCustomersIpc(): void {
  ipcMain.handle(
    'customers:list',
    wrap('customers:list', CustomerFilter.optional().default({}), (filter) =>
      customers.listCustomers(getDb(), tenant(), filter ?? {}),
    ),
  );

  ipcMain.handle(
    'customers:get',
    wrap('customers:get', z.object({ id: Uuid }), ({ id }) =>
      customers.getCustomer(getDb(), tenant(), id),
    ),
  );

  ipcMain.handle(
    'customers:create',
    wrap('customers:create', CustomerCreateInput, (input) =>
      customers.createCustomer(getDb(), tenant(), input),
    ),
  );

  ipcMain.handle(
    'customers:update',
    wrap(
      'customers:update',
      z.object({ id: Uuid, patch: CustomerUpdateInput }),
      ({ id, patch }) => customers.updateCustomer(getDb(), tenant(), id, patch),
    ),
  );

  ipcMain.handle(
    'customers:softDelete',
    wrap('customers:softDelete', z.object({ id: Uuid }), ({ id }) => {
      customers.softDeleteCustomer(getDb(), tenant(), id);
      return { id };
    }),
  );
}
