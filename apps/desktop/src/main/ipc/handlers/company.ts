import { ipcMain } from 'electron';
import { z } from 'zod';
import { CompanySetupInput } from '@shared/schemas';
import { wrap } from '../envelope';
import { getDb } from '../../db';
import * as company from '../../repositories/company';

export function registerCompanyIpc(): void {
  ipcMain.handle(
    'company:getProfile',
    wrap('company:getProfile', z.void().optional(), () => company.getCompanyProfile(getDb())),
  );

  ipcMain.handle(
    'company:hasProfile',
    wrap('company:hasProfile', z.void().optional(), () => company.hasCompanyProfile(getDb())),
  );

  ipcMain.handle(
    'company:setup',
    wrap('company:setup', CompanySetupInput, (input) => company.setupCompany(getDb(), input)),
  );
}
