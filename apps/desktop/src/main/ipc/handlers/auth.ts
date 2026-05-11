import { ipcMain } from 'electron';
import { z } from 'zod';
import { FirstRunInput, SignInInput } from '@shared/schemas';
import { wrap } from '../envelope';
import { getDb } from '../../db';
import * as auth from '../../repositories/auth';

export function registerAuthIpc(): void {
  ipcMain.handle(
    'auth:getSession',
    wrap('auth:getSession', z.void().optional(), () => auth.getSession(getDb())),
  );

  ipcMain.handle(
    'auth:firstRun',
    wrap('auth:firstRun', FirstRunInput, (input) => auth.completeFirstRun(getDb(), input)),
  );

  ipcMain.handle(
    'auth:signIn',
    wrap('auth:signIn', SignInInput, (input) => auth.signIn(getDb(), input.email, input.password)),
  );

  ipcMain.handle(
    'auth:signOut',
    wrap('auth:signOut', z.void().optional(), () => auth.signOut(getDb())),
  );
}
