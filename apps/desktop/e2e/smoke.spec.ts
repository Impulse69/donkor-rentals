import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * Smoke coverage for the QuickBooks Online shell and the converted screens.
 *
 * Deliberately asserts on structure and navigation rather than copy. The
 * previous version of this file checked `h1` for the literal "Good morning.",
 * which is a time-of-day greeting — it passed in the morning and failed every
 * afternoon. Assertions here should hold at any hour.
 */

let app: ElectronApplication;
let win: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
  });
  win = await app.firstWindow();

  // The app ships at 90% page zoom (see DEFAULT_ZOOM in main/index.ts), but
  // Electron's zoom factor offsets Playwright's hit-testing: clicks land off
  // target and retry until the test times out. Drive at 100% instead. Zoom is a
  // rendering scale, so every assertion here — structure, navigation, copy — is
  // unaffected by it.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1);
  });

  // A database with no company profile opens on the first-run wizard rather
  // than the shell, so the run is not reproducible unless we handle both. This
  // also gives the wizard — new in 1.2.0, and otherwise untested — real
  // coverage: it replaced the old owner-account login.
  // Wait for the renderer to mount before deciding which screen we are on.
  // `isVisible()` does not auto-wait, so checking it immediately after launch
  // reports false and skips the wizard even when it is about to appear.
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

test('first run reaches the shell without asking anyone to log in', async () => {
  await expect(win.locator('.shell')).toBeVisible();
  // Authentication was removed in 1.2.0 — nothing should ask for credentials.
  await expect(win.locator('input[type="password"]')).toHaveCount(0);
});

test.afterAll(async () => {
  await app?.close();
});

test('boots into the QBO shell', async () => {
  await expect(win.locator('.shell-sidebar')).toBeVisible();
  await expect(win.locator('.shell-topbar')).toBeVisible();
  // The dashboard heading is a time-based greeting, so assert it exists and is
  // non-empty rather than pinning its text.
  await expect(win.locator('h1.page-title')).not.toBeEmpty();
});

test('sidebar exposes the QBO sections and no future-phase links', async () => {
  const nav = win.locator('.sidebar-nav');
  for (const label of ['Dashboard', 'Invoices', 'Customers', 'Bookings', 'Products and Services', 'Returns', 'Calendar', 'Expenses', 'Vendors', 'Chart of Accounts', 'Journal Entries', 'Reports', 'Taxes']) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible();
  }
  // Settings moved to the top-bar gear, as in QBO.
  await expect(nav.getByText('Settings', { exact: true })).toHaveCount(0);
});

test('+ New opens and every entry targets a route that renders', async () => {
  await win.locator('.new-button').click();
  const menu = win.locator('.new-menu');
  await expect(menu).toBeVisible();

  for (const label of ['Expense', 'Bill', 'Journal entry', 'Vendor']) {
    await expect(menu.getByRole('menuitem', { name: label })).toBeVisible();
  }

  await win.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  const entries: Array<[string, RegExp]> = [
    ['Expense', /New expense/],
    ['Bill', /New bill/],
    ['Journal entry', /New journal entry/],
    ['Vendor', /Add a vendor/],
  ];

  for (const [label, heading] of entries) {
    await win.locator('.new-button').click();
    await win.locator('.new-menu').getByRole('menuitem', { name: label }).click();
    await expect(win.locator('h1.page-title')).toHaveText(heading, { timeout: 10_000 });
    await expect(win.locator('.error-boundary')).toHaveCount(0);
  }
});

test('navigates every converted screen without an error boundary', async () => {
  // Nav label -> page heading. Two screens deliberately keep domain copy for
  // their heading rather than echoing the nav label, so this is not a 1:1 map.
  const screens: Array<[string, string]> = [
    ['Invoices', 'Invoices'],
    ['Customers', 'Customers'],
    ['Bookings', 'Bookings'],
    ['Products and Services', 'Products and Services'],
    ['Returns', 'Damage and deposits'],
    ['Expenses', 'Expenses'],
    ['Vendors', 'Vendors'],
    ['Chart of Accounts', 'Chart of Accounts'],
    ['Journal Entries', 'Journal Entries'],
    ['Reports', 'Reports'],
    ['Taxes', 'Taxes'],
  ];

  for (const [navLabel, heading] of screens) {
    await win.locator('.sidebar-nav').getByText(navLabel, { exact: true }).click();
    await expect(win.locator('h1.page-title')).toHaveText(heading, { timeout: 10_000 });
    // A crashed screen renders the error boundary instead of the page.
    await expect(win.locator('.error-boundary')).toHaveCount(0);
  }
});

test('a fresh install explains an empty catalogue instead of a dead item picker', async () => {
  // Regression: seeding is gated on !app.isPackaged, so a real install starts
  // with no products. The picker still rendered its "Party supplies" and
  // "Hearses" optgroup labels, which draw as grey rows that look selectable —
  // clicking them did nothing and the booking could not be completed. Reported
  // from the field as "the dropdown opens but selecting doesn't work".
  await win.evaluate(() => { window.location.hash = '#/bookings/new'; });
  await expect(win.locator('h1.page-title')).toBeVisible();

  await expect(win.getByText(/Add a product or service before booking/i)).toBeVisible();
  await expect(win.locator('a[href*="catalog/new"]')).toBeVisible();

  // The dead picker must not be there at all when there is nothing to pick.
  await expect(win.locator('select', { hasText: 'Add item to booking' })).toHaveCount(0);
});

test('back and forward buttons walk the navigation history', async () => {
  // Replaced the breadcrumb trail and the global search: the search only ever
  // pointed at the catalogue whatever its placeholder promised, and the trail
  // was three levels of where-you-already-are. Back/forward is what people
  // actually reached for.
  await win.locator('.sidebar-nav').getByText('Customers', { exact: true }).click();
  await expect(win.locator('h1.page-title')).toHaveText('Customers');
  await win.locator('.sidebar-nav').getByText('Invoices', { exact: true }).click();
  await expect(win.locator('h1.page-title')).toHaveText('Invoices');

  await win.getByRole('button', { name: 'Go back' }).click();
  await expect(win.locator('h1.page-title')).toHaveText('Customers');
  await win.getByRole('button', { name: 'Go forward' }).click();
  await expect(win.locator('h1.page-title')).toHaveText('Invoices');

  // And the search is really gone.
  await expect(win.locator('.topbar-search')).toHaveCount(0);
});
