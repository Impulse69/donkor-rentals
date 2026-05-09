import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';

test('app boots and shows header', async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
  });
  const win = await app.firstWindow();
  await expect(win.locator('h1')).toHaveText('Donkor & Sons');
  await app.close();
});
