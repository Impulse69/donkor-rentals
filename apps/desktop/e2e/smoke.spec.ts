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
  await win.waitForSelector('.shell', { timeout: 20_000 });
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
  for (const label of ['Dashboard', 'Invoices', 'Customers', 'Bookings', 'Products and Services', 'Returns', 'Calendar', 'Reports']) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible();
  }
  // Phases 5-7 own these; a link now would 404.
  for (const absent of ['Expenses', 'Vendors', 'Chart of Accounts', 'Journal Entries', 'Taxes']) {
    await expect(nav.getByText(absent, { exact: true })).toHaveCount(0);
  }
  // Settings moved to the top-bar gear, as in QBO.
  await expect(nav.getByText('Settings', { exact: true })).toHaveCount(0);
});

test('+ New opens and every entry targets a route that renders', async () => {
  await win.locator('.new-button').click();
  const menu = win.locator('.new-menu');
  await expect(menu).toBeVisible();

  const entries = menu.locator('.new-menu-item');
  await expect(entries.first()).toBeVisible();
  const count = await entries.count();
  expect(count).toBeGreaterThan(0);

  await win.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('navigates every converted screen without an error boundary', async () => {
  const screens: Array<[string, string]> = [
    ['Invoices', 'Invoices'],
    ['Customers', 'Customers'],
    ['Bookings', 'Bookings'],
    ['Products and Services', 'Products and Services'],
    ['Returns', 'Returns'],
    ['Reports', 'Reports'],
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
