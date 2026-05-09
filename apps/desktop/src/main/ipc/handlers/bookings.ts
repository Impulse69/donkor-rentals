import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  BookingCreateInput,
  BookingUpdateInput,
  BookingFilter,
  BookingStatus,
  ConflictCheckInput,
  Uuid,
} from '@shared/schemas';
import { wrap } from '../envelope';
import { getDb, ensureBootstrapTenant } from '../../db';
import * as bookings from '../../repositories/bookings';

function tenant(): string {
  return ensureBootstrapTenant(getDb());
}

export function registerBookingsIpc(): void {
  ipcMain.handle(
    'bookings:list',
    wrap('bookings:list', BookingFilter.optional().default({}), (filter) =>
      bookings.listBookings(getDb(), tenant(), filter ?? {}),
    ),
  );

  ipcMain.handle(
    'bookings:get',
    wrap('bookings:get', z.object({ id: Uuid }), ({ id }) =>
      bookings.getBooking(getDb(), tenant(), id),
    ),
  );

  ipcMain.handle(
    'bookings:create',
    wrap('bookings:create', BookingCreateInput, (input) =>
      bookings.createBooking(getDb(), tenant(), input),
    ),
  );

  ipcMain.handle(
    'bookings:update',
    wrap(
      'bookings:update',
      z.object({ id: Uuid, patch: BookingUpdateInput }),
      ({ id, patch }) => bookings.updateBooking(getDb(), tenant(), id, patch),
    ),
  );

  ipcMain.handle(
    'bookings:transition',
    wrap(
      'bookings:transition',
      z.object({ id: Uuid, next: BookingStatus }),
      ({ id, next }) => bookings.transitionBooking(getDb(), tenant(), id, next),
    ),
  );

  ipcMain.handle(
    'bookings:checkConflicts',
    wrap('bookings:checkConflicts', ConflictCheckInput, (input) =>
      bookings.checkConflicts(getDb(), tenant(), input),
    ),
  );

  ipcMain.handle(
    'bookings:softDelete',
    wrap('bookings:softDelete', z.object({ id: Uuid }), ({ id }) => {
      bookings.softDeleteBooking(getDb(), tenant(), id);
      return { id };
    }),
  );
}
