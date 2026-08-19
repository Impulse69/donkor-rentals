import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * A toast must never sit on top of a control.
 *
 * Reported as the split button's menu arrow "beginning to hide once it's changed
 * states a couple of times" — which is exactly when toasts fire. The shelf was
 * pinned bottom-right and the action bar puts its primary button in the same
 * corner, so each toast parked itself over the arrow and, being
 * `pointer-events: auto` despite having nothing to click, swallowed the press.
 */
let app: ElectronApplication;
let win: Page;
let userData: string;

test.beforeAll(async () => {
  userData = mkdtempSync(path.join(tmpdir(), 'donkor-toast-'));
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
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
});

async function draftInvoice(): Promise<string> {
  return win.evaluate(async () => {
    type Rec = { id: string; total_pesewas: number };
    type Env = { ok: boolean; data?: Rec; error?: { message?: string } };
    type Api = Record<string, Record<string, (...a: never[]) => Promise<Env>>>;
    const api = (window as unknown as { donkor: Api }).donkor;
    const must = (r: Env, w: string): Rec => {
      if (!r.ok || !r.data) throw new Error(`${w}: ${r.error?.message ?? 'failed'}`);
      return r.data;
    };
    const item = must(await api.catalog.create({
      kind: 'party_supply', sku: `CHR-T-${Date.now()}`, name: 'Tiffany chair, white', description: null,
      daily_rate_pesewas: 800, replacement_value_pesewas: 6000, total_quantity: 500, status: 'active',
    } as never), 'catalog');
    const booking = must(await api.bookings.create({
      customer_id: null, renter_name: 'Walk-in', renter_phone: null,
      starts_at: '2026-08-19T08:00:00.000Z', ends_at: '2026-08-21T08:00:00.000Z',
      pickup_location: null, dropoff_location: null, driver_name: null, notes: null,
      lines: [{
        item_id: item.id, item_unit_id: null, quantity: 1, daily_rate_pesewas: 800, notes: null,
        odometer_start_km: null, odometer_end_km: null, fuel_litres_start: null, fuel_litres_end: null,
      }],
    } as never), 'booking');
    return must(await api.invoices.createFromBooking({
      booking_id: booking.id, due_at: '2026-08-27T17:00:00.000Z', include_statutory_taxes: false,
    } as never), 'invoice').id;
  });
}

test('the toast shelf sits clear of the bottom action bar', async () => {
  const id = await draftInvoice();
  await win.evaluate((i) => { window.location.hash = `#/invoices/${i}`; }, id);
  await expect(win.locator('.invoice-actionbar-right')).toBeVisible();

  // Issuing raises a toast. That is the moment the arrow used to disappear.
  await win.getByRole('button', { name: 'Save and issue' }).click();
  await expect(win.locator('.toast').first()).toBeVisible();

  const geometry = await win.evaluate(() => {
    const shelf = document.querySelector('.toast-shelf');
    const bar = document.querySelector('.invoice-actionbar');
    if (!shelf || !bar) return null;
    return {
      shelfBottom: Math.round(shelf.getBoundingClientRect().bottom),
      barTop: Math.round(bar.getBoundingClientRect().top),
    };
  });

  expect(geometry).not.toBeNull();
  // The whole point: the shelf must end above where the bar begins.
  expect(geometry!.shelfBottom).toBeLessThanOrEqual(geometry!.barTop);
});

test('a live toast cannot swallow a click on the action bar', async () => {
  const id = await draftInvoice();
  await win.evaluate((i) => { window.location.hash = `#/invoices/${i}`; }, id);
  await expect(win.locator('.invoice-actionbar-right')).toBeVisible();

  await win.getByRole('button', { name: 'Save and issue' }).click();
  await expect(win.locator('.toast').first()).toBeVisible();

  // While the toast is still on screen, the menu arrow must still take a click
  // and open. Playwright refuses to click through an intercepting element, so
  // this fails outright if a toast is covering it.
  await win.locator('.split-btn-caret').click({ timeout: 5_000 });
  await expect(win.locator('.dropdown-menu')).toBeVisible();
});

test('nothing on a toast intercepts pointer events', async () => {
  const id = await draftInvoice();
  await win.evaluate((i) => { window.location.hash = `#/invoices/${i}`; }, id);
  await expect(win.locator('.invoice-actionbar-right')).toBeVisible();

  await win.getByRole('button', { name: 'Save and issue' }).click();
  await expect(win.locator('.toast').first()).toBeVisible();

  // A toast carries no dismiss control, so it has no business absorbing clicks
  // wherever it happens to float.
  const pointerEvents = await win.locator('.toast').first().evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(pointerEvents).toBe('none');
});
