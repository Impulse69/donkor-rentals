import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The walk-in at the counter: lines -> Rent now -> take the money -> receipt.
 *
 * Small rentals do not want an invoice; they want to pay and leave with a
 * receipt. The chain on the booking page is pay-first for exactly that reason,
 * and "Rent now" lands on the booking with the payment sheet already open so
 * nobody has to find a button in between. Big jobs still get Create invoice,
 * one step down in the menu.
 */
let app: ElectronApplication;
let win: Page;
let userData: string;

test.beforeAll(async () => {
  userData = mkdtempSync(path.join(tmpdir(), 'donkor-walkin-'));
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

  // Something to rent.
  await win.evaluate(async () => {
    type Env = { ok: boolean; error?: { message?: string } };
    type Api = { catalog: { create: (i: unknown) => Promise<Env> } };
    const api = (window as unknown as { donkor: Api }).donkor;
    const r = await api.catalog.create({
      kind: 'party_supply', sku: 'CHR-WALKIN', name: 'Tiffany chair, white', description: null,
      daily_rate_pesewas: 800, replacement_value_pesewas: 6000, total_quantity: 500, status: 'active',
    });
    if (!r.ok) throw new Error(r.error?.message ?? 'catalog.create failed');
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
});

/** Create a booking at the given status through the API; returns its id. */
async function bookingAt(status: 'reserved' | 'out' | 'returned'): Promise<string> {
  return win.evaluate(async (st) => {
    type Rec = { id: string };
    type Env = { ok: boolean; data?: Rec; error?: { message?: string } };
    type Api = {
      catalog: { list: (f: unknown) => Promise<{ ok: boolean; data?: Rec[] }> };
      bookings: { create: (i: unknown) => Promise<Env>; transition: (id: string, s: string) => Promise<Env> };
    };
    const api = (window as unknown as { donkor: Api }).donkor;
    const must = (r: Env, w: string): Rec => {
      if (!r.ok || !r.data) throw new Error(`${w}: ${r.error?.message ?? 'failed'}`);
      return r.data;
    };
    const items = await api.catalog.list({});
    const item = items.data?.[0];
    if (!item) throw new Error('no catalogue item');
    const b = must(await api.bookings.create({
      customer_id: null, renter_name: 'Ike', renter_phone: null,
      starts_at: '2026-08-19T08:00:00.000Z', ends_at: '2026-08-20T08:00:00.000Z',
      pickup_location: null, dropoff_location: null, driver_name: null, notes: null,
      status: 'reserved',
      lines: [{
        item_id: item.id, item_unit_id: null, quantity: 2, daily_rate_pesewas: 800, notes: null,
        odometer_start_km: null, odometer_end_km: null, fuel_litres_start: null, fuel_litres_end: null,
      }],
    }), 'create');
    if (st === 'out' || st === 'returned') must(await api.bookings.transition(b.id, 'out'), 'out');
    if (st === 'returned') must(await api.bookings.transition(b.id, 'returned'), 'returned');
    return b.id;
  }, status);
}

async function openBooking(id: string, query = ''): Promise<void> {
  await win.evaluate(() => { window.location.hash = '#/'; });
  await expect(win.locator('h1.page-title')).toBeVisible();
  await win.evaluate(({ i, q }) => { window.location.hash = `#/bookings/${i}${q}`; }, { i: id, q: query });
  await expect(win.locator('.invoice-actionbar-right')).toBeVisible();
}

const primary = () => win.locator('.invoice-actionbar-right .split-btn-main');
const sheet = () => win.getByRole('dialog', { name: /Take payment/ });

test('a checked-out, unpaid booking asks for payment first', async () => {
  const id = await bookingAt('out');
  await openBooking(id);
  await expect(primary()).toHaveText('Take payment');
});

test('Rent now lands with the payment sheet already open, priced', async () => {
  // The full walk-in: the form\'s Rent now hands off with ?pay=1.
  const id = await bookingAt('out');
  await openBooking(id, '?pay=1');

  await expect(sheet()).toBeVisible();
  // 2 chairs x 8.00 x 1 day = 16.00 plus statutory taxes; whatever the server
  // prices it at is shown, and it is not zero or "working out".
  await expect(sheet()).not.toContainText('Working out');
  const amount = sheet().getByLabel('Amount received');
  await expect(amount).not.toHaveValue('0.00');
  await expect(amount).not.toHaveValue('');
});

test('taking payment settles the booking and moves the chain on', async () => {
  const id = await bookingAt('out');
  await openBooking(id, '?pay=1');
  await expect(sheet()).toBeVisible();

  const shownTotal = await sheet().getByLabel('Amount received').inputValue();
  await sheet().getByRole('button', { name: 'Take payment' }).click();
  await expect(sheet()).toHaveCount(0);

  // Paid: the next step is now the return, not another payment.
  await expect(primary()).toHaveText('Record return');

  // And an invoice exists underneath, settled, for exactly what was shown.
  const inv = await win.evaluate(async (bid) => {
    type Row = { id: string; status: string; total_pesewas: number; balance_due_pesewas: number };
    type Api = { invoices: { list: (f: unknown) => Promise<{ ok: boolean; data?: Row[] }> } };
    const api = (window as unknown as { donkor: Api }).donkor;
    const r = await api.invoices.list({ bookingId: bid });
    return r.data ?? [];
  }, id);
  expect(inv).toHaveLength(1);
  expect(inv[0].status).toBe('paid');
  expect(inv[0].balance_due_pesewas).toBe(0);
  expect((inv[0].total_pesewas / 100).toFixed(2)).toBe(shownTotal.replace(/,/g, ''));
});

test('a paid, returned booking leads with the receipt', async () => {
  const id = await bookingAt('out');
  await openBooking(id, '?pay=1');
  await sheet().getByRole('button', { name: 'Take payment' }).click();
  await expect(sheet()).toHaveCount(0);

  await win.evaluate(async (bid) => {
    type Api = { bookings: { transition: (id: string, s: string) => Promise<unknown> } };
    await (window as unknown as { donkor: Api }).donkor.bookings.transition(bid, 'returned');
  }, id);
  await openBooking(id);
  await expect(primary()).toHaveText('Print receipt');
});

test('the invoice path is still there for the big jobs', async () => {
  const id = await bookingAt('out');
  await openBooking(id);
  await win.locator('.invoice-actionbar-right').getByRole('button', { name: 'More actions' }).click();
  await expect(win.locator('.dropdown-menu').getByRole('menuitem', { name: 'Create invoice' })).toBeVisible();
});

test('taking payment never raises a second invoice', async () => {
  // Someone started the long path, then the customer paid at the counter.
  const id = await bookingAt('out');
  await win.evaluate(async (bid) => {
    type Api = { invoices: { createFromBooking: (i: unknown) => Promise<unknown> } };
    await (window as unknown as { donkor: Api }).donkor.invoices.createFromBooking({
      booking_id: bid, include_statutory_taxes: false,
    });
  }, id);

  await openBooking(id, '?pay=1');
  await sheet().getByRole('button', { name: 'Take payment' }).click();
  await expect(sheet()).toHaveCount(0);

  const count = await win.evaluate(async (bid) => {
    type Api = { invoices: { list: (f: unknown) => Promise<{ ok: boolean; data?: unknown[] }> } };
    const r = await (window as unknown as { donkor: Api }).donkor.invoices.list({ bookingId: bid });
    return r.data?.length ?? -1;
  }, id);
  expect(count).toBe(1);
});

test('the counter can sell Simple: toggling reprices, and the books match', async () => {
  // 2 chairs x 8.00 x 1 day = 16.00 net. Statutory prices at 19.32
  // (NHIL 0.40 + GETFund 0.40, then VAT 15% on 16.80 = 2.52).
  const id = await bookingAt('out');
  await openBooking(id, '?pay=1');
  await expect(sheet()).toBeVisible();

  const amount = sheet().getByLabel('Amount received');
  await expect(amount).toHaveValue('19.32');

  // Choose Simple: the server reprices and the amount follows.
  await sheet().getByLabel('Taxes').selectOption('simple');
  await expect(amount).toHaveValue('16.00');
  await expect(sheet()).toContainText('nothing added');

  // ...and back, so the choice is a real toggle, not a one-way door.
  await sheet().getByLabel('Taxes').selectOption('statutory');
  await expect(amount).toHaveValue('19.32');
  await sheet().getByLabel('Taxes').selectOption('simple');
  await expect(amount).toHaveValue('16.00');

  await sheet().getByRole('button', { name: 'Take payment' }).click();
  await expect(sheet()).not.toBeVisible();

  // The invoice underneath is Simple, settled, with no tax anywhere on it.
  const inv = await win.evaluate(async (bid) => {
    type Inv = {
      total_pesewas: number; balance_due_pesewas: number;
      include_statutory_taxes: boolean; nhil_pesewas: number; vat_pesewas: number;
    };
    type Api = {
      invoices: {
        list: (f: unknown) => Promise<{ ok: boolean; data?: Array<{ id: string }> }>;
        get: (id: string) => Promise<{ ok: boolean; data?: Inv }>;
      };
    };
    const api = (window as unknown as { donkor: Api }).donkor;
    const list = await api.invoices.list({ bookingId: bid });
    const first = list.data?.[0];
    if (!first) throw new Error('no invoice raised');
    return (await api.invoices.get(first.id)).data;
  }, id);

  expect(inv?.include_statutory_taxes).toBe(false);
  expect(inv?.total_pesewas).toBe(1600);
  expect(inv?.balance_due_pesewas).toBe(0);
  expect(inv?.nhil_pesewas).toBe(0);
  expect(inv?.vat_pesewas).toBe(0);
});

test('the tax choice disappears once an invoice has fixed the format', async () => {
  // An existing invoice owns the price; offering to reprice it at the counter
  // would make the sheet and the books disagree.
  const id = await bookingAt('out');
  await win.evaluate(async (bid) => {
    type Api = { invoices: { createFromBooking: (i: unknown) => Promise<{ ok: boolean }> } };
    const api = (window as unknown as { donkor: Api }).donkor;
    await api.invoices.createFromBooking({ booking_id: bid, include_statutory_taxes: true });
  }, id);

  await openBooking(id, '?pay=1');
  await expect(sheet()).toBeVisible();
  await expect(sheet().getByLabel('Amount received')).toHaveValue('19.32');
  await expect(sheet().getByLabel('Taxes')).toHaveCount(0);
});
