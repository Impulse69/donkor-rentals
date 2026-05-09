import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  ItemCreateInput,
  ItemUpdateInput,
  ItemFilter,
  ItemUnitCreateInput,
  ItemUnitUpdateInput,
  Uuid,
} from '@shared/schemas';
import { wrap } from '../envelope';
import { getDb, ensureBootstrapTenant } from '../../db';
import * as items from '../../repositories/items';

function tenant(): string {
  return ensureBootstrapTenant(getDb());
}

export function registerCatalogIpc(): void {
  ipcMain.handle(
    'catalog:list',
    wrap('catalog:list', ItemFilter.optional().default({}), (filter) =>
      items.listItems(getDb(), tenant(), filter ?? {}),
    ),
  );

  ipcMain.handle(
    'catalog:get',
    wrap('catalog:get', z.object({ id: Uuid }), ({ id }) =>
      items.getItem(getDb(), tenant(), id),
    ),
  );

  ipcMain.handle(
    'catalog:create',
    wrap('catalog:create', ItemCreateInput, (input) =>
      items.createItem(getDb(), tenant(), input),
    ),
  );

  ipcMain.handle(
    'catalog:update',
    wrap(
      'catalog:update',
      z.object({ id: Uuid, patch: ItemUpdateInput }),
      ({ id, patch }) => items.updateItem(getDb(), tenant(), id, patch),
    ),
  );

  ipcMain.handle(
    'catalog:softDelete',
    wrap('catalog:softDelete', z.object({ id: Uuid }), ({ id }) => {
      items.softDeleteItem(getDb(), tenant(), id);
      return { id };
    }),
  );

  ipcMain.handle(
    'catalog:restore',
    wrap('catalog:restore', z.object({ id: Uuid }), ({ id }) => {
      items.restoreItem(getDb(), tenant(), id);
      return { id };
    }),
  );

  // Units
  ipcMain.handle(
    'catalog:listUnits',
    wrap('catalog:listUnits', z.object({ itemId: Uuid }), ({ itemId }) =>
      items.listUnits(getDb(), tenant(), itemId),
    ),
  );

  ipcMain.handle(
    'catalog:createUnit',
    wrap(
      'catalog:createUnit',
      z.object({ itemId: Uuid, input: ItemUnitCreateInput }),
      ({ itemId, input }) => items.createUnit(getDb(), tenant(), itemId, input),
    ),
  );

  ipcMain.handle(
    'catalog:updateUnit',
    wrap(
      'catalog:updateUnit',
      z.object({ id: Uuid, patch: ItemUnitUpdateInput }),
      ({ id, patch }) => items.updateUnit(getDb(), tenant(), id, patch),
    ),
  );

  ipcMain.handle(
    'catalog:softDeleteUnit',
    wrap('catalog:softDeleteUnit', z.object({ id: Uuid }), ({ id }) => {
      items.softDeleteUnit(getDb(), tenant(), id);
      return { id };
    }),
  );
}
