import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { Pool } from 'pg';
import { requireTestDatabaseUrl } from '../../apps/api/src/runtime/test-database.js';

test.beforeEach(async () => {
  // Independent browser cases share one loopback IP. Reset only the isolated
  // E2E database's counters; production rate limits remain fully enabled.
  loadEnvFile('.env');
  const target = new URL(requireTestDatabaseUrl(process.env.TEST_MIGRATION_DATABASE_URL));
  target.port = '55434';
  const pool = new Pool({ connectionString: requireTestDatabaseUrl(target.toString()), max: 1 });
  try {
    await pool.query('TRUNCATE rate_limit_buckets');
  } finally {
    await pool.end();
  }
});

async function messageFor(email: string, subject: string) {
  let text = '';
  await expect
    .poll(
      async () => {
        const list = (await fetch('http://127.0.0.1:18026/api/v1/messages').then((r) =>
          r.json(),
        )) as { messages: { ID: string; Subject: string; To: { Address: string }[] }[] };
        const found = list.messages.find(
          (m) => m.Subject.includes(subject) && m.To.some((to) => to.Address === email),
        );
        if (!found) return false;
        const message = (await fetch(`http://127.0.0.1:18026/api/v1/message/${found.ID}`).then(
          (r) => r.json(),
        )) as { Text: string };
        text = message.Text;
        return Boolean(text);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return text;
}
async function registerAndVerify(page: Page) {
  const email = `browser-${randomUUID()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Browser Passenger');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('CorrectHorseBrowser1!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  const mail = await messageFor(email, 'Verify');
  const code = /code is ([0-9]{6})/.exec(mail)?.[1];
  if (!code) throw new Error('Real Mailpit verification code missing');
  await page.getByLabel('Verification code').fill(code);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  return email;
}
async function login(page: Page, email: string, password = 'CorrectHorseBrowser1!') {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
}
test('register_verify_login_profile_logout_browser', async ({ page }) => {
  const email = await registerAndVerify(page);
  await login(page, email);
  expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('refreshToken'))).toBeNull();
  await page.getByLabel('Your name').fill('Updated Passenger');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText('Your profile has been saved.');
  await page.reload();
  await expect(page.getByLabel('Your name')).toHaveValue('Updated Passenger');
  const cookie = (await page.context().cookies()).find((item) => item.name === 'drivehire_refresh');
  expect(cookie?.httpOnly).toBe(true);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
test('protected_navigation_redirects_and_returns', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL(/login\?next=%2Fprofile/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('driver_schedule_persists_and_removes_windows', async ({ page }) => {
  const email = await registerAndVerify(page);
  await login(page, email);
  await page.goto('/driver/availability');
  await expect(page.getByRole('heading', { name: 'Driver access required' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to your profile' }).click();
  await page.getByRole('button', { name: 'Enable driver capability' }).click();
  await page.getByRole('link', { name: 'Manage your driving schedule' }).click();
  await expect(page.getByRole('heading', { name: 'Your driving schedule' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No time windows yet' })).toBeVisible();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.getByLabel('Starts', { exact: true }).fill(`${tomorrow}T10:00`);
  await page.getByLabel('Ends', { exact: true }).fill(`${tomorrow}T11:00`);
  await page.getByLabel('Keep this time free').check();
  await page.getByRole('button', { name: 'Save time window' }).click();
  await expect(
    page.getByText('Your schedule window has been saved.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Remove window starting/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `artifacts/schedule-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: /Remove window starting/ }).click();
  await expect(page.getByRole('heading', { name: 'No time windows yet' })).toBeVisible();
});
test('invalid_fields_keyboard_error_focus', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Your name').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email address')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('failed_refresh_returns_login_once', async ({ page }) => {
  let refreshes = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/auth/refresh')) refreshes++;
  });
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.waitForTimeout(300);
  expect(refreshes).toBe(1);
});
test('reset_browser_revokes_old_session', async ({ page, context }) => {
  const email = await registerAndVerify(page);
  await login(page, email);
  const other = await context.newPage();
  await other.goto('/forgot-password');
  await other.getByLabel('Email address').fill(email);
  await other.getByRole('button', { name: 'Send reset link' }).click();
  await expect(other.getByRole('status')).toContainText('If an account exists');
  const mail = await messageFor(email, 'Reset');
  const link = /http[^\s]+\/reset-password\?token=[^\s]+/.exec(mail)?.[0];
  if (!link) throw new Error('Real reset link missing');
  await other.goto(link);
  await other.getByLabel('New password', { exact: true }).fill('ChangedHorseBrowser2!');
  await other.getByRole('button', { name: 'Save new password' }).click();
  await expect(other.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await login(other, email, 'ChangedHorseBrowser2!');
});

test('cross_tab_refresh_preserves_session_and_logout_propagates', async ({ page, context }) => {
  const email = await registerAndVerify(page);
  await login(page, email);
  const second = await context.newPage();
  await Promise.all([page.reload(), second.goto('/profile')]);
  for (const tab of [page, second]) {
    await expect(tab.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
    expect(await tab.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
  }
  await second.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('protected_destination_returns_after_successful_login', async ({ page }) => {
  const email = await registerAndVerify(page);
  await page.goto('/profile');
  await expect(page).toHaveURL(/login\?next=%2Fprofile/);
  await login(page, email);
  await expect(page).toHaveURL(/\/profile$/);
});
