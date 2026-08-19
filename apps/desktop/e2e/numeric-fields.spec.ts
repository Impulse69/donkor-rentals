import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Field report: "the quantity of items during the booking process cannot be
 * wiped or modified properly. I can only add numbers to the already existing 1."
 *
 * The unit tests in src/renderer/src/lib/numeric-field.test.ts cover the state
 * machine. This drives the real widget in the real app, because the bug lived in
 * the round trip between React state and the DOM input — which is precisely the
 * part a pure unit test cannot see.
 */

let app: ElectronApplication;
let win: Page;
let userData: string;

test.beforeAll(async () => {
  // Its own company file. This spec adds a product, and the smoke suite asserts
  // on a catalogue that is still empty — sharing one database makes whichever
  // spec runs second fail for reasons that have nothing to do with it.
  userData = mkdtempSync(path.join(tmpdir(), 'donkor-numeric-'));
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

  // A packaged-style launch does not seed, so give the booking form something
  // to pick. Going through the real API keeps this honest.
  await win.evaluate(async () => {
    await (window as unknown as { donkor: { catalog: { create: (i: unknown) => Promise<unknown> } } }).donkor.catalog.create({
      kind: 'party_supply',
      sku: 'CHR-GLD-01',
      name: 'Tiffany chair, gold',
      description: null,
      daily_rate_pesewas: 1000,
      replacement_value_pesewas: 6000,
      total_quantity: 500,
      status: 'active',
    });
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
});

/** Open a fresh booking form with one line already added. */
async function bookingWithOneLine(): Promise<void> {
  // Bounce via the dashboard: re-setting the same hash does not remount the
  // form, so lines from a previous test would pile up in this one.
  await win.evaluate(() => { window.location.hash = '#/'; });
  await expect(win.locator('h1.page-title')).toBeVisible();
  await win.evaluate(() => { window.location.hash = '#/bookings/new'; });
  await expect(win.locator('h1.page-title')).toBeVisible();

  const picker = win.locator('select[aria-label="Add item to booking"]');
  await expect(picker).toBeVisible({ timeout: 10_000 });
  // Pick the first real product; the leading option is the placeholder.
  const value = await picker.locator('option:not([value=""])').first().getAttribute('value');
  await picker.selectOption(value ?? '');
  await win.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(win.getByLabel('Quantity')).toBeVisible();
}

test('the quantity box can be cleared', async () => {
  await bookingWithOneLine();
  const qty = win.getByLabel('Quantity');
  await expect(qty).toHaveValue('1');

  // The reported symptom: this used to snap straight back to "1".
  await qty.click();
  await qty.press('ControlOrMeta+a');
  await qty.press('Delete');
  await expect(qty).toHaveValue('');
});

test('typing a quantity replaces the 1 instead of appending to it', async () => {
  await bookingWithOneLine();
  const qty = win.getByLabel('Quantity');

  // Exactly what a person does: click the box and type. Focus selects the
  // contents, so this must give 5 — not 15.
  await qty.click();
  await qty.fill('5');
  await expect(qty).toHaveValue('5');

  await qty.blur();
  await expect(qty).toHaveValue('5');
});

test('an emptied quantity settles back to 1 rather than sticking at nothing', async () => {
  await bookingWithOneLine();
  const qty = win.getByLabel('Quantity');

  await qty.click();
  await qty.press('ControlOrMeta+a');
  await qty.press('Delete');
  await expect(qty).toHaveValue('');

  await qty.blur();
  await expect(qty).toHaveValue('1');
});

test('a multi-digit quantity drives the subtotal', async () => {
  await bookingWithOneLine();
  const qty = win.getByLabel('Quantity');

  await qty.click();
  await qty.fill('250');
  await expect(qty).toHaveValue('250');

  // 250 chairs at GH₵10.00/day, over however many days the default range spans.
  // Proves the typed number actually reached the model rather than merely
  // looking right in the box.
  const label = await win.getByText(/^Subtotal - \d+ days?$/).textContent();
  const days = Number(/(\d+)/.exec(label ?? '')?.[1]);
  expect(days).toBeGreaterThan(0);
  const expected = (250 * 10 * days).toLocaleString('en-GB', { minimumFractionDigits: 2 });
  await expect(win.getByText(expected, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
});

test('the daily rate accepts a decimal amount typed over the existing one', async () => {
  await bookingWithOneLine();
  const rate = win.getByLabel('Daily rate');
  await expect(rate).toHaveValue('10.00');

  // This is the money version of the same bug: it used to walk 10.00 -> 10.02.
  await rate.click();
  await rate.fill('25.50');
  await expect(rate).toHaveValue('25.50');

  await rate.blur();
  await expect(rate).toHaveValue('25.50');
});

test('the daily rate can be backspaced to empty and settles at 0.00', async () => {
  await bookingWithOneLine();
  const rate = win.getByLabel('Daily rate');

  await rate.click();
  await rate.press('ControlOrMeta+a');
  await rate.press('Delete');
  await expect(rate).toHaveValue('');

  await rate.blur();
  await expect(rate).toHaveValue('0.00');
});

test('clearing a date does not take the booking form down', async () => {
  // Regression: dateInputToIso ran during render and threw on an empty string,
  // so the keystroke that clears a date to retype it replaced the whole form
  // with the error boundary — losing everything else already entered.
  await bookingWithOneLine();

  const start = win.locator('input[type="date"]').first();
  await start.click();
  await start.press('ControlOrMeta+a');
  await start.press('Delete');
  await expect(start).toHaveValue('');

  // The form is still standing.
  await expect(win.locator('.error-boundary')).toHaveCount(0);
  await expect(win.getByLabel('Quantity')).toBeVisible();

  // ...and refuses to save an incomplete booking rather than guessing a date.
  const save = win.getByRole('button', { name: /Reserved|Save|Quote/ }).last();
  await expect(save).toBeDisabled();

  // Typing a real date brings it back to life. The end date has to move with
  // it — "end after start" is a separate, legitimate guard.
  await start.fill('2027-01-04');
  await win.locator('input[type="date"]').nth(1).fill('2027-01-06');
  await expect(win.locator('.error-boundary')).toHaveCount(0);
  await expect(save).toBeEnabled();
});

test('editing a booking keeps the driver even after the hearse is retired', async () => {
  // Regression: the payload nulled pickup/drop-off/driver whenever no line
  // resolved to a hearse in the ACTIVE catalogue. A retired hearse never
  // resolves, so opening an old funeral booking to change a date and pressing
  // Save silently erased who was driving and where they were collecting from.
  const bookingId = await win.evaluate(async () => {
    type Envelope = { ok: boolean; data?: { id: string }; error?: { message?: string } };
    type Api = Record<string, Record<string, (...args: unknown[]) => Promise<Envelope>>>;
    const api = (window as unknown as { donkor: Api }).donkor;
    // Surface the envelope's error rather than failing on `undefined.id`, which
    // says nothing about what actually went wrong.
    const must = (r: Envelope, what: string): { id: string } => {
      if (!r.ok || !r.data) throw new Error(`${what} failed: ${r.error?.message ?? 'unknown'}`);
      return r.data;
    };
    const item = await api.catalog.create({
      kind: 'hearse', sku: 'HRS-RETIRE-1', name: 'Old Mercedes hearse', description: null,
      daily_rate_pesewas: 50000, replacement_value_pesewas: 9000000, total_quantity: 1, status: 'active',
    });
    const itemId = must(item, 'catalog.create').id;
    const booking = await api.bookings.create({
      customer_id: null, renter_name: 'Mensah family', renter_phone: null,
      starts_at: '2027-05-01T08:00:00.000Z', ends_at: '2027-05-02T08:00:00.000Z',
      pickup_location: 'Tema Community 1', dropoff_location: 'Osu Cemetery',
      driver_name: 'Kwame Asante', notes: null,
      lines: [{
        item_id: itemId, item_unit_id: null, quantity: 1, daily_rate_pesewas: 50000, notes: null,
        odometer_start_km: null, odometer_end_km: null, fuel_litres_start: null, fuel_litres_end: null,
      }],
    });
    // The vehicle is sold off and retired from the catalogue.
    must(await api.catalog.update(itemId, { status: 'retired' }), 'catalog.update');
    return must(booking, 'bookings.create').id;
  });

  await win.evaluate(() => { window.location.hash = '#/'; });
  await expect(win.locator('h1.page-title')).toBeVisible();
  await win.evaluate((id) => { window.location.hash = `#/bookings/${id}/edit`; }, bookingId);
  await expect(win.locator('h1.page-title')).toBeVisible();

  // The driver is still on screen, not hidden behind a retired-item check.
  await expect(win.getByLabel('Driver')).toHaveValue('Kwame Asante');

  const save = win.getByRole('button', { name: /Reserved|Save|Quote|Update/ }).last();
  await expect(save).toBeEnabled();
  await save.click();

  const after = await win.evaluate(async (id) => {
    type Booking = { driver_name: string | null; pickup_location: string | null; dropoff_location: string | null };
    type Api = { bookings: { get: (id: string) => Promise<{ ok: boolean; data: Booking }> } };
    const api = (window as unknown as { donkor: Api }).donkor;
    const r = await api.bookings.get(id);
    return { driver: r.data.driver_name, pickup: r.data.pickup_location, dropoff: r.data.dropoff_location };
  }, bookingId);

  expect(after.driver).toBe('Kwame Asante');
  expect(after.pickup).toBe('Tema Community 1');
  expect(after.dropoff).toBe('Osu Cemetery');
});

test('picking the same item twice raises its quantity instead of repeating it', async () => {
  // Reported from a booking that listed "White drape kit x1" twice. Picking a
  // thing twice means two of them; it does not mean putting it on the booking
  // twice. The duplicate rode downstream too - the customer's invoice printed
  // the item on two lines and the check-in sheet asked for it to be inspected
  // twice.
  await win.evaluate(() => { window.location.hash = '#/'; });
  await expect(win.locator('h1.page-title')).toBeVisible();
  await win.evaluate(() => { window.location.hash = '#/bookings/new'; });
  await expect(win.locator('h1.page-title')).toBeVisible();

  const picker = win.locator('select[aria-label="Add item to booking"]');
  await expect(picker).toBeVisible({ timeout: 10_000 });
  const value = await picker.locator('option:not([value=""])').first().getAttribute('value');

  await picker.selectOption(value ?? '');
  await win.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(win.getByLabel('Quantity')).toHaveCount(1);

  await picker.selectOption(value ?? '');
  await win.getByRole('button', { name: 'Add', exact: true }).click();

  // Still one line - now for two of them.
  await expect(win.getByLabel('Quantity')).toHaveCount(1);
  await expect(win.getByLabel('Quantity')).toHaveValue('2');
});

test('two hearses still get a line each, so both can be assigned', async () => {
  // The exception that stops the merge being wrong: a line here stands for one
  // vehicle, and the unit is pinned after the line exists. Merging them would
  // make a two-hearse funeral impossible to book.
  const hearseId = await win.evaluate(async () => {
    type Env = { ok: boolean; data?: { id: string }; error?: { message?: string } };
    type Api = { catalog: { create: (i: unknown) => Promise<Env> } };
    const api = (window as unknown as { donkor: Api }).donkor;
    const r = await api.catalog.create({
      kind: 'hearse', sku: `HRS-DUP-${Date.now()}`, name: 'Mercedes hearse', description: null,
      daily_rate_pesewas: 50_000, replacement_value_pesewas: 9_000_000, total_quantity: 2, status: 'active',
    });
    if (!r.ok || !r.data) throw new Error(r.error?.message ?? 'catalog.create failed');
    return r.data.id;
  });

  await win.evaluate(() => { window.location.hash = '#/'; });
  await expect(win.locator('h1.page-title')).toBeVisible();
  await win.evaluate(() => { window.location.hash = '#/bookings/new'; });
  await expect(win.locator('h1.page-title')).toBeVisible();

  const picker = win.locator('select[aria-label="Add item to booking"]');
  await expect(picker).toBeVisible({ timeout: 10_000 });

  await picker.selectOption(hearseId);
  await win.getByRole('button', { name: 'Add', exact: true }).click();
  await picker.selectOption(hearseId);
  await win.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(win.getByLabel('Quantity')).toHaveCount(2);
});
