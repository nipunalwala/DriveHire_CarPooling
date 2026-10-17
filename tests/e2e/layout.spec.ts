import { test, expect } from '@playwright/test';
test('auth_layout_desktop_mobile', async ({ page }, info) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/auth-${info.project.name}.png`, fullPage: true });
});
