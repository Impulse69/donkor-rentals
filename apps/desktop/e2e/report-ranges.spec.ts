import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The date range on Top Customers and the Trip Log has to survive the whole
 * trip: renderer -> preload -> IPC -> repository.
 *
 * This exists because the repository tests passed while the feature was still
 * broken. The IPC handler accepted `start` and `end` and then called the query
 * without them, so every range was silently discarded one layer below the
 * screen. Only a test that crosses the boundary can see that.
 */
let app: ElectronApplication;
let win: Page;
let userData: string;

test.beforeAll(async () => {
  userData = mkdtempSync(path.join(tmpdir(), 'donkor-ranges-'));
  app = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DONKOR_USERDATA_OVERRIDE: userData },
  });
  win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1);
  });

  const wizard = win.locator('form:has-text("Set up your company")');
  await Promise.race([
    wizard.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => null),
    win.waitForSelector('.shell', { timeout: 20_000 }).catch(() => null),
  ]);
  if (await wizard.count()) {
    await wizard.getByLabel(/Company name/).fill('Donkor & Sons');
    await wizard.getByRole('button', { name: 'Save company setup' }).click();
  }
  await win.waitForSelector('.shell', { timeout: 20_000 });

  // One hearse trip, firmly in February 2027.
  await win.evaluate(async () => {
    type Api = Record<string, Record<string, (...a: never[]) => Promise<{ ok: boolean; data?: { id: string }; error?: { message?: string } }>>>;
    const api = (window as unknown as { donkor: Api }).donkor;
    const must = (r: { ok: boolean; data?: { id: string }; error?: { message?: string } }, what: string): { id: string } => {
      if (!r.ok || !r.data) throw new Error(`${what}: ${r.error?.message ?? 'failed'}`);
      return r.data;
    };
    const item = must(await api.catalog.create({
      kind: 'hearse', sku: 'HRS-RANGE-1', name: 'Range test hearse', description: null,
      daily_rate_pesewas: 50_000, replacement_value_pesewas: 9_000_000, total_quantity: 1, status: 'active',
    } as never), 'catalog.create');
    const customer = must(await api.customers.create({
      name: 'February Family', phone: null, email: null,
      id_type: null, id_number: null, address: null, notes: null,
    } as never), 'customers.create');
    must(await api.bookings.create({
      customer_id: customer.id, renter_name: null, renter_phone: null,
      starts_at: '2027-02-10T08:00:00.000Z', ends_at: '2027-02-11T08:00:00.000Z',
      pickup_location: null, dropoff_location: null, driver_name: 'Kwesi', notes: null,
      lines: [{
        item_id: item.id, item_unit_id: null, quantity: 1, daily_rate_pesewas: 50_000, notes: null,
        odometer_start_km: null, odometer_end_km: null, fuel_litres_start: null, fuel_litres_end: null,
      }],
    } as never), 'bookings.create');
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
});

test('the trip log range survives the trip through IPC', async () => {
  const counts = await win.evaluate(async () => {
    type Api = { reports: { tripLog: (l?: number, s?: string, e?: string) => Promise<Envelope<unknown[]>> } };
    type Envelope<T> = { ok: boolean; data?: T; error?: { message?: string } };
    const api = (window as unknown as { donkor: Api }).donkor;
    const inFeb = await api.reports.tripLog(50, '2027-02-01', '2027-02-28');
    const inMay = await api.reports.tripLog(50, '2027-05-01', '2027-05-31');
    const allTime = await api.reports.tripLog(50);
    return {
      feb: inFeb.data?.length ?? -1,
      may: inMay.data?.length ?? -1,
      all: allTime.data?.length ?? -1,
    };
  });

  expect(counts.all).toBe(1);
  expect(counts.feb).toBe(1);
  // The whole point: a range that excludes the trip must exclude it. This
  // returned 1 while the handler was dropping the dates.
  expect(counts.may).toBe(0);
});

test('the top-customers range survives the trip through IPC', async () => {
  const revenue = await win.evaluate(async () => {
    type Row = { customer_name: string; revenue_pesewas: number };
    type Envelope<T> = { ok: boolean; data?: T; error?: { message?: string } };
    type Api = { reports: { topCustomers: (l?: number, s?: string, e?: string) => Promise<Envelope<Row[]>> } };
    const api = (window as unknown as { donkor: Api }).donkor;
    const find = (rows: Row[] | undefined): number =>
      rows?.find((r) => r.customer_name === 'February Family')?.revenue_pesewas ?? -1;
    const feb = await api.reports.topCustomers(10, '2027-02-01', '2027-02-28');
    const may = await api.reports.topCustomers(10, '2027-05-01', '2027-05-31');
    return { feb: find(feb.data), may: find(may.data) };
  });

  // The booking sits in February, so May must not attribute it any bookings.
  expect(revenue.feb).toBeGreaterThanOrEqual(0);
  expect(revenue.may).toBeLessThanOrEqual(0);
});

test('a date filter can be cleared and retyped', async () => {
  // Journal Entries deleted the URL parameter on an empty value and then fell
  // back to a default, so the field visibly jumped back to the start of the
  // month the instant you cleared it — there was no way to clear and retype.
  await win.evaluate(() => { window.location.hash = '#/accounting/journal'; });
  await expect(win.locator('h1.page-title')).toHaveText('Journal Entries');

  const from = win.getByLabel('Date from');
  await expect(from).not.toHaveValue('');

  await from.click();
  await from.press('ControlOrMeta+a');
  await from.press('Delete');

  // It stays empty, and the page keeps working rather than erroring.
  await expect(from).toHaveValue('');
  await expect(win.locator('.error-boundary')).toHaveCount(0);

  await from.fill('2027-01-01');
  await expect(from).toHaveValue('2027-01-01');
  await expect(win.locator('.error-boundary')).toHaveCount(0);
});

test('an account register survives its date being cleared', async () => {
  // Register had the sharper version of the same bug: the emptied value reached
  // the query as "", which the IPC layer rejects outright, so clearing a date
  // replaced the register with an error.
  await win.evaluate(() => { window.location.hash = '#/accounting/chart'; });
  await expect(win.locator('h1.page-title')).toHaveText('Chart of Accounts');
  await win.locator('.dtable tbody tr').first().locator('td').first().click();
  await expect(win).toHaveURL(/accounting\/accounts\//);

  const start = win.getByLabel('Start date');
  await expect(start).not.toHaveValue('');
  await start.click();
  await start.press('ControlOrMeta+a');
  await start.press('Delete');

  await expect(start).toHaveValue('');
  await expect(win.locator('.error-boundary')).toHaveCount(0);
  // The register still renders rather than showing a validation failure.
  await expect(win.getByText(/rejected|invalid|failed/i)).toHaveCount(0);
});
