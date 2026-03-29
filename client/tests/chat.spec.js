import { test, expect } from '@playwright/test';

test('dashboard loads title and primary controls', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await expect(page.getByRole('heading', { name: 'chatting-sol' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Refresh status / wallets' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run one tick' })).toBeVisible();
});
