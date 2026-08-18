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
  for (const label of ['Dashboard', 'Invoices', 'Customers', 'Bookings', 'Products and Services', 'Returns', 'Calendar', 'Expenses', 'Vendors', 'Chart of Accounts', 'Journal Entries', 'Reports']) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible();
  }
  // Taxes still belongs to a future phase; a link now would 404.
  for (const absent of ['Taxes']) {
    await expect(nav.getByText(absent, { exact: true })).toHaveCount(0);
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
    ['Reports', 'Revenue and operations'],
  ];

  for (const [navLabel, heading] of screens) {
    await win.locator('.sidebar-nav').getByText(navLabel, { exact: true }).click();
    await expect(win.locator('h1.page-title')).toHaveText(heading, { timeout: 10_000 });
    // A crashed screen renders the error boundary instead of the page.
    await expect(win.locator('.error-boundary')).toHaveCount(0);
  }
});

test('global search still deep-links into products', async () => {
  await win.keyboard.press('Control+KeyK');
  const search = win.locator('.topbar-search input, .topbar input[type="search"], .topbar input').first();
  await search.fill('tent');
  await search.press('Enter');
  await expect(win).toHaveURL(/catalog/, { timeout: 10_000 });
});
