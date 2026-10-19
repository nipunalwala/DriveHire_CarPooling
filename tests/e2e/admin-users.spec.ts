import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { requireTestDatabaseUrl } from '../../apps/api/src/runtime/test-database.js';

// Milestone04 administrator user-administration browser journeys. They drive the
// real API against the isolated E2E database (55434) only, register and verify a
// real passenger through Mailpit, then act as the per-run administrator that
// tests/e2e/server.ts provisions. Administrator credentials come from a
// gitignored fixture file (never logged or rendered). Accessible names mirror
// the implemented apps/web/src/features/admin/users/UsersPage.tsx screen.

const PASSWORD = 'CorrectHorseBrowser1!';
const MAILPIT_URL = 'http://127.0.0.1:18026';
const UI_ORIGIN = 'http://127.0.0.1:5174';
const SUSPEND_REASON = 'The account owner asked for a temporary hold on sign-in access.';
const REACTIVATE_REASON = 'The account review is complete and access is restored for the owner.';
// Playwright wipes test-results at run start, so the credential handoff lives in
// the gitignored .cache directory instead. It is never logged or rendered.
const E2E_FIXTURE_FILE = resolve('.cache', 'e2e-fixtures.json');

function adminFixture(): { email: string; password: string } {
  return JSON.parse(readFileSync(E2E_FIXTURE_FILE, 'utf8')).admin as {
    email: string;
    password: string;
  };
}

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

async function messageFor(email: string, subject: string): Promise<string> {
  let text = '';
  await expect
    .poll(
      async () => {
        const list = (await fetch(`${MAILPIT_URL}/api/v1/messages`).then((r) => r.json())) as {
          messages: { ID: string; Subject: string; To: { Address: string }[] }[];
        };
        const found = list.messages.find(
          (m) => m.Subject.includes(subject) && m.To.some((to) => to.Address === email),
        );
        if (!found) return false;
        const message = (await fetch(`${MAILPIT_URL}/api/v1/message/${found.ID}`).then((r) =>
          r.json(),
        )) as { Text: string };
        text = message.Text;
        return Boolean(text);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return text;
}

async function submitCredentials(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await submitCredentials(page, email, password);
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
}

async function registerVerifyAndSignIn(page: Page, name: string): Promise<string> {
  const email = `admin-users-${randomUUID()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  const mail = await messageFor(email, 'Verify');
  const code = /code is ([0-9]{6})/.exec(mail)?.[1];
  if (!code) throw new Error('Real Mailpit verification code missing');
  await page.getByLabel('Verification code').fill(code);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await signIn(page, email, PASSWORD);
  return email;
}

async function newSession(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  // Manually created contexts inherit none of the project's device emulation,
  // so copy the supported device options explicitly (conditional spreads keep
  // exactOptionalPropertyTypes happy for any values a project leaves unset).
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = test.info().project.use;
  const context = await browser.newContext({
    baseURL: UI_ORIGIN,
    ...(viewport ? { viewport } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(isMobile !== undefined ? { isMobile } : {}),
    ...(hasTouch !== undefined ? { hasTouch } : {}),
    ...(deviceScaleFactor !== undefined ? { deviceScaleFactor } : {}),
  });
  const page = await context.newPage();
  if (viewport) {
    // The secondary admin session must genuinely run at the configured device
    // size, otherwise its committed screenshot would silently be desktop.
    expect(page.viewportSize()).toEqual({ width: viewport.width, height: viewport.height });
  }
  return { context, page };
}

async function signInAsAdmin(admin: Page): Promise<void> {
  const { email, password } = adminFixture();
  await admin.goto('/login');
  await signIn(admin, email, password);
}

/** The open selected-user panel only, so status badges never collide with rows. */
function selectedUser(admin: Page) {
  return admin.getByRole('region', { name: 'Selected user' });
}

/** Committed-shape screenshot for Codex visual review (no live credentials shown). */
function capture(page: Page, state: string): Promise<Buffer> {
  return page.screenshot({
    path: resolve('artifacts', `admin-users-${state}-${test.info().project.name}.png`),
    fullPage: true,
  });
}

/** Search by exact unique email, then open the single matching account. */
async function findAndOpenUser(
  admin: Page,
  email: string,
  manageName: string | RegExp,
): Promise<void> {
  await admin.goto('/admin/users');
  await expect(admin.getByRole('heading', { name: 'User administration' })).toBeVisible();
  const find = admin.getByRole('form', { name: 'Find user' });
  await find.getByLabel('Search name or email').fill(email);
  await admin.getByRole('button', { name: 'Search users' }).click();
  await admin.getByRole('button', { name: manageName }).click();
  await expect(selectedUser(admin).getByText(email)).toBeVisible();
}

test('admin_suspends_and_reactivates_passenger_browser', async ({ page, browser }) => {
  const passengerEmail = await registerVerifyAndSignIn(page, 'Suspension Target Passenger');

  const { context: adminContext, page: admin } = await newSession(browser);
  try {
    await signInAsAdmin(admin);
    await findAndOpenUser(admin, passengerEmail, 'Manage Suspension Target Passenger');
    const details = selectedUser(admin);
    await expect(details.getByText('ACTIVE', { exact: true })).toBeVisible();
    await capture(admin, 'selected');

    await details.getByLabel('Reason').fill(SUSPEND_REASON);
    await details.getByRole('button', { name: 'Confirm suspension' }).click();
    await expect(
      admin.getByText('User suspended. Their active sessions are revoked.'),
    ).toBeVisible();
    await expect(details.getByText('SUSPENDED', { exact: true })).toBeVisible();

    // The suspended passenger loses access: the live session is revoked and a
    // fresh sign-in is refused.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await submitCredentials(page, passengerEmail, PASSWORD);
    await expect(page.getByRole('alert')).toContainText('Account is suspended');

    // Reactivation restores the passenger's ability to sign in.
    await details.getByLabel('Reason').fill(REACTIVATE_REASON);
    await details.getByRole('button', { name: 'Confirm reactivation' }).click();
    await expect(admin.getByText('User reactivated.')).toBeVisible();
    await expect(details.getByText('ACTIVE', { exact: true })).toBeVisible();

    await signIn(page, passengerEmail, PASSWORD);
    await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
  } finally {
    await adminContext.close();
  }
});

test('non_admin_is_denied_admin_routes_browser', async ({ page }) => {
  await registerVerifyAndSignIn(page, 'Denied Admin Passenger');

  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'User administration' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Go to your profile' })).toBeVisible();

  await page.goto('/admin/verifications');
  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qualification reviews' })).toHaveCount(0);
});

test('administrator_cannot_suspend_own_account_browser', async ({ browser }) => {
  const { context, page: admin } = await newSession(browser);
  try {
    await signInAsAdmin(admin);
    // The search matches the administrator's own unique account only, so its
    // single "Manage" control is unambiguous.
    await findAndOpenUser(admin, adminFixture().email, /^Manage /);
    const details = selectedUser(admin);
    await expect(details.getByRole('button', { name: 'Confirm suspension' })).toBeDisabled();
  } finally {
    await context.close();
  }
});
