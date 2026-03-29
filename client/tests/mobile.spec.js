import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 12'] });

test('dashboard is visible on mobile', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await expect(page.getByRole('heading', { name: 'chatting-sol' })).toBeVisible();
  const dash = page.locator('.dashboard');
  await expect(dash).toBeVisible();
});
