import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The invoice screen should say what comes next: raise it, issue it, take the
 * money, hand over a receipt.
 *
 * Reported from the field, against a fully-settled invoice: "the Record payment
 * button should change to Print receipt". It did not, because both buttons were
 * keyed off `status === 'paid'` — and status only reaches 'paid' when a payment
 * settles an ISSUED invoice. Take the money before issuing and the screen kept
 * offering to take it again while refusing to print the receipt for what had
 * already been paid.
 */
let app: ElectronApplication;
let win: Page;
let userData: string;

type Env<T> = { ok: boolean; data?: T; error?: { message?: string } };

async function boot(): Promise<void> {
  userData = mkdtempSync(path.join(tmpdir(), 'donkor-invoice-'));
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
}

/** Build a draft invoice worth 1600 pesewas, optionally paying it in full. */
async function makeInvoice(opts: { pay: boolean; issue: boolean }): Promise<string> {
  return win.evaluate(async ({ pay, issue }) => {
    type Api = Record<string, Record<string, (...a: never[]) => Promise<Env<Rec>>>>;
    type Rec = { id: string; total_pesewas: number };
    type Env<T> = { ok: boolean; data?: T; error?: { message?: string } };
    const api = (window as unknown as { donkor: Api }).donkor;
    const must = (r: Env<Rec>, what: string): Rec => {
      if (!r.ok || !r.data) throw new Error(`${what}: ${r.error?.message ?? 'failed'}`);
      return r.data;
    };
    const item = must(await api.catalog.create({
      kind: 'party_supply', sku: `CHR-${Date.now()}`, name: 'Tiffany chair, white', description: null,
      daily_rate_pesewas: 800, replacement_value_pesewas: 6000, total_quantity: 500, status: 'active',
    } as never), 'catalog.create');
    const customer = must(await api.customers.create({
      name: 'Akosua Mensah', phone: null, email: null,
      id_type: null, id_number: null, address: null, notes: null,
    } as never), 'customers.create');
    const booking = must(await api.bookings.create({
      customer_id: customer.id, renter_name: null, renter_phone: null,
      starts_at: '2026-08-19T08:00:00.000Z', ends_at: '2026-08-21T08:00:00.000Z',
      pickup_location: null, dropoff_location: null, driver_name: null, notes: null,
      lines: [{
        item_id: item.id, item_unit_id: null, quantity: 1, daily_rate_pesewas: 800, notes: null,
        odometer_start_km: null, odometer_end_km: null, fuel_litres_start: null, fuel_litres_end: null,
      }],
    } as never), 'bookings.create');
    const invoice = must(await api.invoices.createFromBooking({
      booking_id: booking.id, due_at: '2026-08-27T17:00:00.000Z', include_statutory_taxes: false,
    } as never), 'invoices.createFromBooking');

    if (issue) must(await api.invoices.update(invoice.id, { status: 'issued' } as never), 'issue');
    if (pay) {
      must(await api.payments.record({
        invoice_id: invoice.id, kind: 'payment', amount_pesewas: invoice.total_pesewas,
        method: 'mobile_money', paid_at: '2026-08-19T16:09:00.000Z', reference: null, notes: null,
      } as never), 'payments.record');
    }
    return invoice.id;
  }, opts);
}

async function openInvoice(id: string): Promise<void> {
  await win.evaluate(() => { window.location.hash = '#/'; });
  await expect(win.locator('h1.page-title')).toBeVisible();
  await win.evaluate((i) => { window.location.hash = `#/invoices/${i}`; }, id);
  await expect(win.locator('.invoice-actionbar-right')).toBeVisible();
}

function actions() {
  return win.locator('.invoice-actionbar-right');
}

test.beforeAll(boot);
test.afterAll(async () => {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
});

test('an unpaid draft asks to be issued', async () => {
  const id = await makeInvoice({ pay: false, issue: false });
  await openInvoice(id);

  await expect(actions().getByRole('button', { name: 'Save and issue' })).toBeVisible();
  await expect(actions().getByRole('button', { name: 'Print receipt' })).toHaveCount(0);
});

test('an issued invoice with money owing asks for payment', async () => {
  const id = await makeInvoice({ pay: false, issue: true });
  await openInvoice(id);

  await expect(actions().getByRole('button', { name: 'Record payment' })).toBeVisible();
  await expect(actions().getByRole('button', { name: 'Print receipt' })).toHaveCount(0);
});

test('a settled invoice offers the receipt, not another payment', async () => {
  // The reported case.
  const id = await makeInvoice({ pay: true, issue: true });
  await openInvoice(id);

  await expect(actions().getByRole('button', { name: 'Print receipt' })).toBeVisible();
  await expect(actions().getByRole('button', { name: 'Record payment' })).toHaveCount(0);
});

test('a draft settled before it was issued still offers the receipt', async () => {
  // Exactly what the screenshot showed: balance nil, yet the screen asked for
  // another payment and would not print the receipt for money already taken.
  const id = await makeInvoice({ pay: true, issue: false });
  await openInvoice(id);

  await expect(actions().getByRole('button', { name: 'Record payment' })).toHaveCount(0);
  await expect(actions().getByRole('button', { name: 'Print receipt' })).toBeVisible();
  // Issuing is still the next step, so it keeps the green.
  await expect(actions().getByRole('button', { name: 'Save and issue' })).toBeVisible();
});

test('exactly one action is the primary one', async () => {
  for (const opts of [
    { pay: false, issue: false },
    { pay: false, issue: true },
    { pay: true, issue: true },
    { pay: true, issue: false },
  ]) {
    const id = await makeInvoice(opts);
    await openInvoice(id);
    // Two green buttons is two "next steps", which is no guidance at all.
    await expect(actions().locator('.btn-primary:not(:disabled)')).toHaveCount(1);
  }
});

test('printing the invoice stays available at every stage', async () => {
  for (const opts of [
    { pay: false, issue: false },
    { pay: true, issue: true },
  ]) {
    const id = await makeInvoice(opts);
    await openInvoice(id);
    await expect(actions().getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  }
});
