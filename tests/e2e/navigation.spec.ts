import { test, expect } from '@playwright/test';
import { bearer, newSession, signInAsAdmin, resetRateLimits } from './driver-hire.helpers';
test.beforeEach(() => resetRateLimits());
test('canonical_private_screen_aliases_reach_authentication', async ({ page }) => {
  for (const route of [
    '/app/profile',
    '/app/vehicles',
    '/app/driver/profile',
    '/app/driver/availability',
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  }
});
test('admin_audit_is_read_only_filterable_and_keyboard_operable', async ({ browser }) => {
  const admin = await newSession(browser);
  try {
    const token = await signInAsAdmin(admin.page);
    const users = await admin.page.request.get('/api/v1/admin/users', { headers: bearer(token) });
    expect(users.status()).toBe(200);
    const userId = (await users.json()).data[0].id as string;
    expect(
      (
        await admin.page.request.get(`/api/v1/admin/users/${userId}`, { headers: bearer(token) })
      ).status(),
    ).toBe(200);
    await admin.page.goto('/admin/audit');
    await expect(
      admin.page.getByRole('heading', { name: 'Administrative audit', exact: true }),
    ).toBeVisible();
    await admin.page.getByLabel('Action', { exact: true }).fill('ADMIN_USER_READ');
    await admin.page.getByRole('button', { name: 'Apply filters', exact: true }).focus();
    await admin.page.keyboard.press('Enter');
    await expect(admin.page.locator('[data-audit-entry]').first()).toBeVisible();
    const entries = await admin.page.locator('[data-audit-entry]').all();
    for (const entry of entries)
      await expect(
        entry.getByRole('heading', { name: 'ADMIN_USER_READ', exact: true }),
      ).toBeVisible();
    await expect(admin.page.getByRole('button', { name: /delete|edit|approve/i })).toHaveCount(0);
    await admin.page.setViewportSize({ width: 320, height: 800 });
    expect(
      await admin.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
  } finally {
    await admin.context.close();
  }
});
