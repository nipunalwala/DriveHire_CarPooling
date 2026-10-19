import { test, expect, type Page, type Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { Pool } from 'pg';
import { requireTestDatabaseUrl } from '../../apps/api/src/runtime/test-database.js';

const PASSWORD = 'CorrectHorseBrowser1!';
const BASE_URL = 'http://127.0.0.1:5174';
const REFRESH_ROUTE = '**/api/v1/auth/refresh';

type HeldRefresh = {
  status: number;
  body: string;
  headers: Record<string, string>;
};

test.beforeEach(async () => {
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
  const email = `cookie-order-${randomUUID()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Cookie Ordering Account');
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
  return email;
}

async function login(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
}

test('old_refresh_cookie_cannot_restore_previous_account_after_login', async ({
  page,
  browser,
}) => {
  const emailA = await registerAndVerify(page);
  await login(page, emailA);

  const otherContext = await browser.newContext({ baseURL: BASE_URL });
  const otherPage = await otherContext.newPage();
  const emailB = await registerAndVerify(otherPage);
  await otherContext.close();

  let releaseRefresh!: () => void;
  const releaseSignal = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let markHandled!: () => void;
  const handled = new Promise<void>((resolve) => {
    markHandled = resolve;
  });
  let held: HeldRefresh | undefined;

  const handler = async (route: Route) => {
    try {
      const request = route.request();
      const upstream = await fetch(request.url(), {
        method: request.method(),
        headers: await request.allHeaders(),
        body: request.postData() ?? undefined,
      });
      const setCookie = upstream.headers.getSetCookie();
      const result: HeldRefresh = {
        status: upstream.status,
        body: await upstream.text(),
        headers: {
          'content-type': upstream.headers.get('content-type') ?? 'application/json',
          ...(setCookie.length > 0 ? { 'set-cookie': setCookie.join('\n') } : {}),
        },
      };
      held = result;
      await releaseSignal;
      await route.fulfill({ status: result.status, body: result.body, headers: result.headers });
    } catch {
      await route.abort().catch(() => {});
    } finally {
      markHandled();
    }
  };

  await page.route(REFRESH_ROUTE, handler);
  await page.goto('/login');
  await expect.poll(() => Boolean(held), { timeout: 15_000 }).toBe(true);

  const loginStarted = page
    .waitForRequest((request) => request.url().includes('/api/v1/auth/login'), { timeout: 1_000 })
    .then(() => true)
    .catch(() => false);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/auth/login') && response.request().method() === 'POST',
    { timeout: 20_000 },
  );
  loginResponse.catch(() => {});

  await page.getByLabel('Email address').fill(emailB);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const started = await loginStarted;
  if (started) await loginResponse.catch(() => {});

  releaseRefresh();
  await handled;
  await page.unroute(REFRESH_ROUTE, handler);

  if (!started) await loginResponse.catch(() => {});

  await expect(page).toHaveURL(/\/profile$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.account-email')).toHaveText(emailB);
  const body = await page.locator('body').innerText();
  expect(body).not.toContain(emailA);
});
