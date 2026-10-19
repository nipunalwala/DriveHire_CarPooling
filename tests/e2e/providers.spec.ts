import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { requireTestDatabaseUrl } from '../../apps/api/src/runtime/test-database.js';

// Milestone04 Task3 browser journeys. They drive the real API, private storage
// and ClamAV scanner against the isolated E2E database (55434) only, and mirror
// the accessible names of the implemented provider and administrator screens.
// The test administrator is provisioned per-run by tests/e2e/server.ts and its
// credentials are read from a gitignored fixture file (never logged).

type SubjectType = 'DRIVER' | 'VEHICLE';
type EvidenceKind = 'REGISTRATION' | 'INSURANCE' | 'LICENSE';

const PASSWORD = 'CorrectHorseBrowser1!';
const MAILPIT_URL = 'http://127.0.0.1:18026';
const UI_ORIGIN = 'http://127.0.0.1:5174';
const CLEAN_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'ascii',
);
// Playwright wipes test-results at run start, so the credential handoff lives
// in the gitignored .cache directory instead. It is never logged or rendered.
const E2E_FIXTURE_FILE = resolve('.cache', 'e2e-fixtures.json');
const CITY_OPTION = 'Pune · Asia/Kolkata';

function adminFixture(): { email: string; password: string } {
  return JSON.parse(readFileSync(E2E_FIXTURE_FILE, 'utf8')).admin as {
    email: string;
    password: string;
  };
}

function futureDate(days = 365): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
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

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
}

async function registerVerifyAndSignIn(page: Page, name: string): Promise<string> {
  const email = `provider-${randomUUID()}@example.com`;
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
    // The secondary admin/foreign session must genuinely run at the configured
    // device size, otherwise its committed screenshot would silently be desktop.
    expect(page.viewportSize()).toEqual({ width: viewport.width, height: viewport.height });
  }
  return { context, page };
}

async function signInAsAdmin(admin: Page): Promise<string> {
  const { email, password } = adminFixture();
  await admin.goto('/login');
  await signIn(admin, email, password);
  return apiLoginWith(admin, email, password);
}

async function apiLoginWith(page: Page, email: string, password: string): Promise<string> {
  const response = await page.request.post('/api/v1/auth/login', { data: { email, password } });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: { accessToken: string } }).data.accessToken;
}

async function enableDriverCapability(page: Page): Promise<void> {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Enable driver capability' }).click();
  await expect(page.getByRole('button', { name: 'Enable driver capability' })).toHaveCount(0);
}

async function addPersonalVehicle(page: Page, registrationNumber: string): Promise<void> {
  await page.goto('/vehicles');
  await expect(page.getByRole('heading', { name: 'Your personal vehicles' })).toBeVisible();
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  const form = page.getByRole('form', { name: 'Add vehicle' });
  await form.getByLabel('Registration number').fill(registrationNumber);
  await form.getByLabel('Make', { exact: true }).fill('Maruti');
  await form.getByLabel('Model', { exact: true }).fill('Swift');
  await form.getByLabel('Year').fill('2020');
  await form.getByLabel('Total seats, including driver').fill('4');
  await form.getByLabel('Category').selectOption('HATCHBACK');
  await form.getByLabel('Transmission').selectOption('MANUAL');
  await form.getByLabel('Fuel type').selectOption('PETROL');
  await form.getByLabel('Service city').selectOption({ label: CITY_OPTION });
  await page.getByRole('button', { name: 'Save vehicle' }).click();
  await expect(page.getByText('Current qualification: DRAFT.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Private evidence' })).toBeVisible();
}

async function saveDriverDetails(page: Page, licenseNumber: string): Promise<void> {
  await page.goto('/driver/qualification');
  await expect(page.getByRole('heading', { name: 'Your driver qualification' })).toBeVisible();
  const form = page.getByRole('form', { name: 'Driver qualification' });
  await form.getByLabel('License number').fill(licenseNumber);
  await form.getByLabel('License country code').fill('IN');
  await form.getByLabel('License expiry date').fill(futureDate());
  await form.getByLabel('Service city').selectOption({ label: CITY_OPTION });
  await form.getByLabel('Hourly rate (INR)').fill('500');
  await page.getByRole('button', { name: 'Save driver details' }).click();
  await expect(page.getByRole('heading', { name: 'Private evidence' })).toBeVisible();
}

async function uploadEvidence(page: Page, kind: EvidenceKind, fileName: string): Promise<void> {
  await page.getByLabel('Document type').selectOption(kind);
  if (kind === 'INSURANCE') {
    await page.getByLabel('Document expiry date (optional)').fill(futureDate());
  }
  await page.getByLabel('Evidence file').setInputFiles({
    name: fileName,
    mimeType: 'application/pdf',
    buffer: CLEAN_PDF,
  });
  await page.getByRole('button', { name: 'Upload document' }).click();
  await expect(page.getByText(/Document uploaded\. Scan status: CLEAN\./)).toBeVisible();
}

async function submitForReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Current qualification: PENDING.')).toBeVisible();
}

async function firstVehicleId(page: Page, token: string): Promise<string> {
  const response = await page.request.get('/api/v1/users/me/vehicles', {
    headers: bearer(token),
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: { id: string }[] }).data[0]!.id;
}

async function myDriverId(page: Page, token: string): Promise<string> {
  const response = await page.request.get('/api/v1/drivers/me', { headers: bearer(token) });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: { id: string } }).data.id;
}

/** The open review panel only, so status badges never collide with filter options. */
function selectedReview(admin: Page) {
  return admin.getByRole('region', { name: 'Selected review' });
}

/** Committed-shape screenshot for Codex visual review (no live credentials shown). */
async function capture(page: Page, name: string): Promise<void> {
  mkdirSync(resolve('artifacts'), { recursive: true });
  await page.screenshot({
    path: resolve('artifacts', `provider-${name}-${test.info().project.name}.png`),
    fullPage: true,
  });
}

/**
 * Resolve the exact pending request through the real administrator API (so
 * leftovers from earlier cases never mislead the queue), open its row, then
 * load the authenticated private evidence.
 */
async function openPendingReview(
  admin: Page,
  adminToken: string,
  type: SubjectType,
  subjectId: string,
): Promise<string> {
  await admin.goto('/admin/verifications');
  await expect(admin.getByRole('heading', { name: 'Qualification reviews' })).toBeVisible();
  await admin.getByLabel('Subject type').selectOption(type);
  const response = await admin.request.get(
    `/api/v1/admin/verifications?status=PENDING&type=${type}&page=1&pageSize=20`,
    { headers: bearer(adminToken) },
  );
  expect(response.status()).toBe(200);
  const rows = ((await response.json()) as { data: { id: string; subjectId: string }[] }).data;
  const index = rows.findIndex((row) => row.subjectId === subjectId);
  expect(index, 'a pending verification exists for the submitted subject').toBeGreaterThanOrEqual(
    0,
  );
  const verificationId = rows[index]!.id;
  await admin
    .getByRole('button', { name: `Review ${type.toLowerCase()} request ${index + 1}` })
    .click();
  await expect(admin.getByText(`Request reference: ${verificationId}`)).toBeVisible();
  await admin.getByRole('button', { name: 'Load private evidence 1' }).click();
  await expect(admin.getByRole('link', { name: 'Download private evidence 1' })).toBeVisible();
  return verificationId;
}

test('passenger_register_vehicle_admin_approves_browser', async ({ page, browser }) => {
  const ownerEmail = await registerVerifyAndSignIn(page, 'Browser Vehicle Owner');
  await addPersonalVehicle(page, `KA01E2E${randomUUID().slice(0, 6).toUpperCase()}`);
  await uploadEvidence(page, 'REGISTRATION', 'registration.pdf');
  await uploadEvidence(page, 'INSURANCE', 'insurance.pdf');
  const ownerToken = await apiLoginWith(page, ownerEmail, PASSWORD);
  const vehicleId = await firstVehicleId(page, ownerToken);
  await submitForReview(page);

  const { context: adminContext, page: admin } = await newSession(browser);
  try {
    const adminToken = await signInAsAdmin(admin);
    const verificationId = await openPendingReview(admin, adminToken, 'VEHICLE', vehicleId);
    await admin.getByLabel('Decision', { exact: true }).selectOption('APPROVE');
    await admin
      .getByLabel('Reason')
      .fill('Registration and insurance are current, legible and match the vehicle.');
    await admin.getByRole('button', { name: 'Save decision' }).click();
    const details = selectedReview(admin);
    await expect(details.getByText('APPROVED', { exact: true })).toBeVisible();
    await expect(details.getByText(`Request reference: ${verificationId}`)).toBeVisible();
    await capture(admin, 'vehicle-admin-approved');
  } finally {
    await adminContext.close();
  }

  await page.reload();
  await expect(page.getByText('APPROVED', { exact: true }).first()).toBeVisible();
  await capture(page, 'vehicle-owner-approved');
  await expect(page.getByRole('link', { name: /owner dashboard/i })).toHaveCount(0);
});

test('driver_upload_scan_submit_admin_review_browser', async ({ page, browser }) => {
  const driverEmail = await registerVerifyAndSignIn(page, 'Browser Driver');
  await enableDriverCapability(page);
  await saveDriverDetails(page, `KA01${randomUUID().slice(0, 8).toUpperCase()}`);
  await uploadEvidence(page, 'LICENSE', 'license.pdf');
  const driverToken = await apiLoginWith(page, driverEmail, PASSWORD);
  const driverId = await myDriverId(page, driverToken);
  await submitForReview(page);

  const { context: adminContext, page: admin } = await newSession(browser);
  try {
    const adminToken = await signInAsAdmin(admin);
    await openPendingReview(admin, adminToken, 'DRIVER', driverId);
    await admin.getByLabel('Decision', { exact: true }).selectOption('APPROVE');
    await admin
      .getByLabel('Reason')
      .fill('The license is current, legible and matches the account holder.');
    await admin.getByRole('button', { name: 'Save decision' }).click();
    await expect(selectedReview(admin).getByText('APPROVED', { exact: true })).toBeVisible();
    await capture(admin, 'driver-admin-approved');
  } finally {
    await adminContext.close();
  }

  await page.reload();
  await expect(page.getByText('Current qualification: APPROVED.')).toBeVisible();
  await capture(page, 'driver-owner-approved');
});

test('rejected_revision_corrected_resubmitted', async ({ page, browser }) => {
  const driverEmail = await registerVerifyAndSignIn(page, 'Resubmitting Driver');
  await enableDriverCapability(page);
  await saveDriverDetails(page, `KA01${randomUUID().slice(0, 8).toUpperCase()}`);
  await uploadEvidence(page, 'LICENSE', 'license.pdf');
  const driverToken = await apiLoginWith(page, driverEmail, PASSWORD);
  const driverId = await myDriverId(page, driverToken);
  await submitForReview(page);

  const rejectReason = 'This license image is unreadable; upload a clearer scan of both sides.';
  const { context: adminContext, page: admin } = await newSession(browser);
  let firstRevision: string;
  try {
    const adminToken = await signInAsAdmin(admin);
    firstRevision = await openPendingReview(admin, adminToken, 'DRIVER', driverId);
    await admin.getByLabel('Decision', { exact: true }).selectOption('REJECT');
    await admin.getByLabel('Reason').fill(rejectReason);
    await admin.getByRole('button', { name: 'Save decision' }).click();
    const details = selectedReview(admin);
    await expect(details.getByText('REJECTED', { exact: true })).toBeVisible();
    await expect(details.getByText(rejectReason)).toBeVisible();
    await capture(admin, 'driver-admin-rejected');
  } finally {
    await adminContext.close();
  }

  await page.reload();
  await expect(page.getByText('Current qualification: REJECTED.')).toBeVisible();
  await expect(
    page.getByText(
      'Review was rejected. Correct your details and evidence, then submit a new revision.',
    ),
  ).toBeVisible();
  await capture(page, 'driver-owner-rejected');

  // Correct the evidence and submit a genuinely new revision.
  await uploadEvidence(page, 'LICENSE', 'license-clear.pdf');
  await submitForReview(page);

  const { context: secondAdminContext, page: secondAdmin } = await newSession(browser);
  try {
    const adminToken = await signInAsAdmin(secondAdmin);
    const secondRevision = await openPendingReview(secondAdmin, adminToken, 'DRIVER', driverId);
    expect(secondRevision).not.toBe(firstRevision);
    await expect(selectedReview(secondAdmin).getByText('PENDING', { exact: true })).toBeVisible();
    await capture(secondAdmin, 'driver-resubmitted-pending');
  } finally {
    await secondAdminContext.close();
  }
});

test('foreign_evidence_not_exposed', async ({ page, browser }) => {
  const ownerEmail = await registerVerifyAndSignIn(page, 'Evidence Owner');
  await addPersonalVehicle(page, `KA01E2E${randomUUID().slice(0, 6).toUpperCase()}`);
  await uploadEvidence(page, 'REGISTRATION', 'registration.pdf');

  const ownerToken = await apiLoginWith(page, ownerEmail, PASSWORD);
  const vehicleId = await firstVehicleId(page, ownerToken);
  const documents = await page.request.get(`/api/v1/vehicles/${vehicleId}/documents`, {
    headers: bearer(ownerToken),
  });
  expect(documents.status()).toBe(200);
  const documentId = ((await documents.json()) as { data: { id: string }[] }).data[0]!.id;
  const contentPath = `/api/v1/documents/${documentId}/content`;
  expect((await page.request.get(contentPath, { headers: bearer(ownerToken) })).status()).toBe(200);

  const { context: foreignContext, page: foreign } = await newSession(browser);
  try {
    const foreignEmail = await registerVerifyAndSignIn(foreign, 'Foreign Browser User');
    const foreignToken = await apiLoginWith(foreign, foreignEmail, PASSWORD);
    const denied = await foreign.request.get(contentPath, { headers: bearer(foreignToken) });
    expect(denied.status()).toBe(404);
    await foreign.goto('/vehicles');
    await expect(foreign.getByRole('heading', { name: 'Your personal vehicles' })).toBeVisible();
    await expect(foreign.getByText('No personal vehicles yet')).toBeVisible();
    await expect(foreign.getByRole('link', { name: /download private evidence/i })).toHaveCount(0);
    await capture(foreign, 'foreign-vehicle-denied');
  } finally {
    await foreignContext.close();
  }
});

test('stale_review_preserves_context', async ({ page, browser }) => {
  const ownerEmail = await registerVerifyAndSignIn(page, 'Stale Subject Owner');
  await addPersonalVehicle(page, `KA01E2E${randomUUID().slice(0, 6).toUpperCase()}`);
  await uploadEvidence(page, 'REGISTRATION', 'registration.pdf');
  await uploadEvidence(page, 'INSURANCE', 'insurance.pdf');
  const ownerToken = await apiLoginWith(page, ownerEmail, PASSWORD);
  const vehicleId = await firstVehicleId(page, ownerToken);
  await submitForReview(page);

  const reason = 'Evidence verified for the reviewed revision before the subject changed.';
  const { context: adminContext, page: admin } = await newSession(browser);
  try {
    const adminToken = await signInAsAdmin(admin);
    const verificationId = await openPendingReview(admin, adminToken, 'VEHICLE', vehicleId);
    await admin.getByLabel('Reason').fill(reason);

    // The owner materially edits the subject while the reviewer holds context.
    const list = await page.request.get('/api/v1/users/me/vehicles', {
      headers: bearer(ownerToken),
    });
    const vehicle = ((await list.json()) as { data: Record<string, unknown>[] }).data[0]!;
    const edited = await page.request.put(`/api/v1/vehicles/${vehicleId}`, {
      headers: bearer(ownerToken),
      data: {
        registrationNumber: vehicle.registrationNumber,
        make: vehicle.make,
        model: 'Baleno',
        year: vehicle.year,
        category: vehicle.category,
        seats: vehicle.seats,
        transmission: vehicle.transmission,
        fuelType: vehicle.fuelType,
        cityId: vehicle.cityId,
        version: vehicle.version,
      },
    });
    expect(edited.status()).toBe(200);

    await admin.getByLabel('Decision', { exact: true }).selectOption('APPROVE');
    await admin.getByRole('button', { name: 'Save decision' }).click();

    // A stale approval never silently retries: the same request reference and
    // the entered reason are preserved and a reload is requested.
    await expect(admin.getByRole('alert')).toContainText(/reload/i);
    const details = selectedReview(admin);
    await expect(
      details.getByText(
        'This review changed. Reload review, inspect current evidence and then decide again.',
      ),
    ).toBeVisible();
    await expect(details.getByText(`Request reference: ${verificationId}`)).toBeVisible();
    await expect(admin.getByLabel('Reason')).toHaveValue(reason);
    await expect(details.getByText('PENDING', { exact: true })).toBeVisible();
    await capture(admin, 'stale-review-error');
  } finally {
    await adminContext.close();
  }
});

test('keyboard_upload_errors_and_status_readable', async ({ page }) => {
  await registerVerifyAndSignIn(page, 'Keyboard Evidence User');
  await addPersonalVehicle(page, `KA01E2E${randomUUID().slice(0, 6).toUpperCase()}`);

  const evidenceFile = page.getByLabel('Evidence file');
  await evidenceFile.focus();
  await expect(evidenceFile).toBeFocused();
  await evidenceFile.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is not an accepted evidence format'),
  });
  await page.getByRole('button', { name: 'Upload document' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toBeFocused();
  await expect(alert).toContainText(/JPEG|PNG|WebP|PDF/i);
  await expect(evidenceFile).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Current qualification: DRAFT.')).toBeVisible();
  await capture(page, 'evidence-upload-error');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
