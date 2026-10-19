import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { requireTestDatabaseUrl } from '../../apps/api/src/runtime/test-database.js';

// Test-only helpers for the Milestone05 driver-hiring browser journeys. They
// drive the real API, private storage and ClamAV scanner on the isolated E2E
// database (55434) only. No success path is mocked and no credential is logged.
// The administrator is provisioned per run by tests/e2e/server.ts.

export const PASSWORD = 'CorrectHorseBrowser1!';
export const MAILPIT_URL = 'http://127.0.0.1:18026';
export const UI_ORIGIN = 'http://127.0.0.1:5174';
const CLEAN_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'ascii',
);
const E2E_FIXTURE_FILE = resolve('.cache', 'e2e-fixtures.json');
const E2E_DATABASE_PORT = '55434';

type EvidenceKind = 'REGISTRATION' | 'INSURANCE' | 'LICENSE';
type SubjectType = 'DRIVER' | 'VEHICLE';

export interface Actor {
  context: BrowserContext;
  page: Page;
  email: string;
  token: string;
}

export interface ApprovedDriver {
  actor: Actor;
  driverId: string;
  displayName: string;
  hourlyRateMinor: number;
  licenseNumber: string;
  cityId: string;
}

export interface PassengerVehicle {
  actor: Actor;
  vehicleId: string;
}

export interface BookingDecisionState {
  providerId: string;
  kind: 'DRIVER';
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  decidedAt: string | null;
}

export interface BookingState {
  id: string;
  passengerId: string;
  status: string;
  driverId: string;
  vehicleId: string;
  tripId: string;
  version: number;
  startsAt: string;
  endsAt: string;
  totalMinor: number;
  paymentStatus: string;
  decisions: BookingDecisionState[];
}

export interface TripState {
  id: string;
  kind: string;
  status: string;
  driverId: string;
  vehicleId: string;
  startsAt: string;
  endsAt: string;
  version: number;
  incidentFlag: boolean;
}

export interface TripHistoryState {
  id: string;
  fromStatus: string;
  toStatus: string;
  actorId: string | null;
  reason?: string;
  createdAt: string;
}

export interface QuoteState {
  id: string;
  service: string;
  vehicleId: string;
  driverId: string;
  startsAt: string;
  endsAt: string;
  billableHours: number;
  driverSubtotalMinor: number;
  totalMinor: number;
  currency: string;
  expiresAt: string;
  paymentStatus: string;
}

export interface SendRequestResult {
  status: number;
  bookingId?: string;
}

function adminFixture(): { email: string; password: string } {
  return JSON.parse(readFileSync(E2E_FIXTURE_FILE, 'utf8')).admin as {
    email: string;
    password: string;
  };
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export function futureDate(days = 365): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Local datetime-local value, matching how the browser encodes the input. */
export function datetimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** A planned interval at least the required 60-minute lead from now. */
export function plannedInterval(hoursFromNow = 2, hours = 2): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(Date.now() + hoursFromNow * 3600 * 1000);
  startsAt.setSeconds(0, 0);
  return { startsAt, endsAt: new Date(startsAt.getTime() + hours * 3600 * 1000) };
}

export async function resetRateLimits(): Promise<void> {
  loadEnvFile('.env');
  const target = new URL(requireTestDatabaseUrl(process.env.TEST_MIGRATION_DATABASE_URL));
  target.port = E2E_DATABASE_PORT;
  const pool = new Pool({ connectionString: requireTestDatabaseUrl(target.toString()), max: 1 });
  try {
    await pool.query('TRUNCATE rate_limit_buckets');
  } finally {
    await pool.end();
  }
}

export async function messageFor(email: string, subject: string): Promise<string> {
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

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
}

export async function registerVerifyAndSignIn(page: Page, name: string): Promise<string> {
  const email = `hire-${randomUUID()}@example.com`;
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

/** A secondary context inherits the project's real device emulation. */
export async function newSession(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
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
    expect(page.viewportSize()).toEqual({ width: viewport.width, height: viewport.height });
  }
  return { context, page };
}

export async function apiLoginWith(page: Page, email: string, password: string): Promise<string> {
  const response = await page.request.post('/api/v1/auth/login', { data: { email, password } });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: { accessToken: string } }).data.accessToken;
}

export async function signInAsAdmin(page: Page): Promise<string> {
  const { email, password } = adminFixture();
  await page.goto('/login');
  await signIn(page, email, password);
  return apiLoginWith(page, email, password);
}

export async function newActor(browser: Browser, name: string): Promise<Actor> {
  const { context, page } = await newSession(browser);
  const email = await registerVerifyAndSignIn(page, name);
  const token = await apiLoginWith(page, email, PASSWORD);
  return { context, page, email, token };
}

export async function enableDriverCapability(page: Page): Promise<void> {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Enable driver capability' }).click();
  await expect(page.getByRole('button', { name: 'Enable driver capability' })).toHaveCount(0);
}

export async function saveDriverDetails(
  page: Page,
  licenseNumber: string,
  hourlyRate = '500',
  cityLabel = 'Pune · Asia/Kolkata',
): Promise<void> {
  await page.goto('/driver/qualification');
  await expect(page.getByRole('heading', { name: 'Your driver qualification' })).toBeVisible();
  const form = page.getByRole('form', { name: 'Driver qualification' });
  await form.getByLabel('License number').fill(licenseNumber);
  await form.getByLabel('License country code').fill('IN');
  await form.getByLabel('License expiry date').fill(futureDate());
  await form.getByLabel('Service city').selectOption({ label: cityLabel });
  await form.getByLabel('Hourly rate (INR)').fill(hourlyRate);
  await page.getByRole('button', { name: 'Save driver details' }).click();
  await expect(page.getByRole('heading', { name: 'Private evidence' })).toBeVisible();
}

export async function uploadEvidence(
  page: Page,
  kind: EvidenceKind,
  fileName: string,
): Promise<void> {
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

export async function submitForReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Current qualification: PENDING.')).toBeVisible();
}

export async function addPersonalVehicle(page: Page, registrationNumber: string): Promise<void> {
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
  await form.getByLabel('Service city').selectOption({ label: 'Pune · Asia/Kolkata' });
  await page.getByRole('button', { name: 'Save vehicle' }).click();
  await expect(page.getByText('Current qualification: DRAFT.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Private evidence' })).toBeVisible();
}

export async function firstVehicleId(page: Page, token: string): Promise<string> {
  const response = await page.request.get('/api/v1/users/me/vehicles', {
    headers: bearer(token),
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: { id: string }[] }).data[0]!.id;
}

export async function myDriverId(page: Page, token: string): Promise<string> {
  const response = await page.request.get('/api/v1/drivers/me', { headers: bearer(token) });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: { id: string } }).data.id;
}

/** Approve the exact pending revision through the real administrator API. */
export async function approveLatest(
  page: Page,
  adminToken: string,
  type: SubjectType,
  subjectId: string,
): Promise<void> {
  const response = await page.request.get(
    `/api/v1/admin/verifications?status=PENDING&type=${type}&page=1&pageSize=100`,
    { headers: bearer(adminToken) },
  );
  expect(response.status()).toBe(200);
  const rows = (
    (await response.json()) as {
      data: { id: string; subjectId: string; version: number }[];
    }
  ).data;
  const row = rows.find((candidate) => candidate.subjectId === subjectId);
  expect(row, `a pending ${type} revision exists for the submitted subject`).toBeTruthy();
  const decision = await page.request.post(`/api/v1/admin/verifications/${row!.id}/decision`, {
    headers: bearer(adminToken),
    data: {
      decision: 'APPROVE',
      version: row!.version,
      reason: 'Evidence is current, legible and matches the submitted subject.',
    },
  });
  expect(decision.status()).toBe(200);
}

export async function driverPrivate(
  page: Page,
  token: string,
): Promise<{
  id: string;
  version: number;
  verificationStatus: string;
  acceptingBookings: boolean;
}> {
  const response = await page.request.get('/api/v1/drivers/me', { headers: bearer(token) });
  expect(response.status()).toBe(200);
  return (
    (await response.json()) as {
      data: { id: string; version: number; verificationStatus: string; acceptingBookings: boolean };
    }
  ).data;
}

/** Enable the public listing only after real administrator approval. */
export async function enableListing(page: Page, token: string): Promise<void> {
  const current = await driverPrivate(page, token);
  expect(current.verificationStatus).toBe('APPROVED');
  const response = await page.request.patch('/api/v1/drivers/me/listing', {
    headers: bearer(token),
    data: { enabled: true, version: current.version },
  });
  expect(response.status()).toBe(200);
}

export async function setAvailability(
  page: Page,
  token: string,
  startsAt: Date,
  endsAt: Date,
): Promise<void> {
  const response = await page.request.post('/api/v1/drivers/me/availability', {
    headers: bearer(token),
    data: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), kind: 'AVAILABLE' },
  });
  expect(response.status()).toBe(201);
}

export async function cityId(page: Page, name: string): Promise<string> {
  const response = await page.request.get('/api/v1/cities?page=1&pageSize=100');
  expect(response.status()).toBe(200);
  const rows = ((await response.json()) as { data: { id: string; name: string }[] }).data;
  const city = rows.find((candidate) => candidate.name === name);
  expect(city, `${name} exists in the curated city catalogue`).toBeTruthy();
  return city!.id;
}

export async function provisionApprovedDriver(
  browser: Browser,
  adminPage: Page,
  adminToken: string,
  input: {
    name: string;
    licenseNumber: string;
    hourlyRateMinor?: number;
    cityLabel?: string;
    cityName?: string;
  },
): Promise<ApprovedDriver> {
  const actor = await newActor(browser, input.name);
  const hourlyRateMinor = input.hourlyRateMinor ?? 50_000;
  await enableDriverCapability(actor.page);
  await saveDriverDetails(
    actor.page,
    input.licenseNumber,
    (hourlyRateMinor / 100).toFixed(2),
    input.cityLabel ?? 'Pune · Asia/Kolkata',
  );
  await uploadEvidence(actor.page, 'LICENSE', 'license.pdf');
  const driverId = await myDriverId(actor.page, actor.token);
  await submitForReview(actor.page);
  await approveLatest(adminPage, adminToken, 'DRIVER', driverId);
  await enableListing(actor.page, actor.token);
  // A wide, real availability window covering every planned journey interval.
  await setAvailability(
    actor.page,
    actor.token,
    new Date(Date.now() - 3600 * 1000),
    new Date(Date.now() + 24 * 3600 * 1000),
  );
  const city = await cityId(actor.page, input.cityName ?? 'Pune');
  return {
    actor,
    driverId,
    displayName: input.name,
    hourlyRateMinor,
    licenseNumber: input.licenseNumber,
    cityId: city,
  };
}

export async function provisionPassengerWithVehicle(
  browser: Browser,
  adminPage: Page,
  adminToken: string,
  name: string,
): Promise<PassengerVehicle> {
  const actor = await newActor(browser, name);
  await addPersonalVehicle(actor.page, `KA01E2E${randomUUID().slice(0, 6).toUpperCase()}`);
  await uploadEvidence(actor.page, 'REGISTRATION', 'registration.pdf');
  await uploadEvidence(actor.page, 'INSURANCE', 'insurance.pdf');
  const vehicleId = await firstVehicleId(actor.page, actor.token);
  await submitForReview(actor.page);
  await approveLatest(adminPage, adminToken, 'VEHICLE', vehicleId);
  const response = await actor.page.request.get('/api/v1/users/me/vehicles', {
    headers: bearer(actor.token),
  });
  expect(response.status()).toBe(200);
  const vehicle = (
    (await response.json()) as { data: { id: string; verificationStatus: string }[] }
  ).data.find((row) => row.id === vehicleId);
  expect(vehicle?.verificationStatus).toBe('APPROVED');
  return { actor, vehicleId };
}

async function selectCity(page: Page, label: string, cityIdValue: string): Promise<void> {
  const select = page.getByLabel(label, { exact: true });
  await expect(select.locator(`option[value="${cityIdValue}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });
  await expect(select).toBeEnabled();
  await select.selectOption(cityIdValue);
}

export async function findDriverAndOpenRequest(
  page: Page,
  driver: ApprovedDriver,
  interval: { startsAt: Date; endsAt: Date },
): Promise<void> {
  await page.goto('/drivers');
  await expect(page.getByRole('heading', { name: 'Find a driver', exact: true })).toBeVisible();
  await selectCity(page, 'City', driver.cityId);
  await page.getByLabel('Starts at', { exact: true }).fill(datetimeLocal(interval.startsAt));
  await page.getByLabel('Ends at', { exact: true }).fill(datetimeLocal(interval.endsAt));
  await page.getByRole('button', { name: 'Find drivers', exact: true }).click();
  const viewDriver = page.getByRole('link', {
    name: `View ${driver.displayName}`,
    exact: true,
  });
  await expect(viewDriver).toBeVisible({ timeout: 30_000 });
  await viewDriver.click();
  await expect(page.getByRole('heading', { name: 'Driver details' })).toBeVisible();
  await expect(page.getByRole('heading', { name: driver.displayName })).toBeVisible();
  await expect(page.getByText('Payment not collected by DriveHire.')).toBeVisible();
  await page.getByRole('link', { name: 'Hire this driver' }).click();
  await expect(page.getByRole('heading', { name: 'Request a driver' })).toBeVisible();
}

export async function fillBookingRequest(
  page: Page,
  input: {
    vehicleId: string;
    interval: { startsAt: Date; endsAt: Date };
    originCityId: string;
    destinationCityId: string;
    passengers?: number;
  },
): Promise<void> {
  const vehicle = page.getByLabel('Your vehicle');
  await expect(vehicle.locator(`option[value="${input.vehicleId}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });
  await expect(vehicle).toBeEnabled();
  await vehicle.selectOption(input.vehicleId);
  await page.getByLabel('Starts at', { exact: true }).fill(datetimeLocal(input.interval.startsAt));
  await page.getByLabel('Ends at', { exact: true }).fill(datetimeLocal(input.interval.endsAt));
  await selectCity(page, 'Origin', input.originCityId);
  await selectCity(page, 'Destination', input.destinationCityId);
  await page.getByLabel('Passengers', { exact: true }).fill(String(input.passengers ?? 1));
}

export async function reviewEstimate(page: Page): Promise<QuoteState> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname === '/api/v1/booking-quotes' &&
        candidate.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Review estimate' }).click(),
  ]);
  expect(response.status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Your estimate' })).toBeVisible();
  return ((await response.json()) as { data: QuoteState }).data;
}

export async function sendRequest(page: Page): Promise<SendRequestResult> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname === '/api/v1/bookings' &&
        candidate.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Send request' }).click(),
  ]);
  const status = response.status();
  if (status !== 201) return { status };
  const bookingId = ((await response.json()) as { data: { id: string } }).data.id;
  await expect(page).toHaveURL(new RegExp(`/app/bookings/${bookingId}$`));
  await expect(page.getByRole('heading', { name: 'Booking details' })).toBeVisible();
  return { status, bookingId };
}

export async function acceptBookingViaUi(driverPage: Page, bookingId: string): Promise<void> {
  await driverPage.goto('/app/driver/bookings');
  await expect(driverPage.getByRole('heading', { name: 'Driver requests' })).toBeVisible();
  const row = driverPage
    .locator('.record-list li')
    .filter({ hasText: `Request reference: ${bookingId}` });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText('PENDING', { exact: true })).toBeVisible();
  await row.getByRole('link', { name: 'View booking' }).click();
  await expect(driverPage.getByRole('heading', { name: 'Booking details' })).toBeVisible();
  await expect(driverPage.locator('.status-badge').filter({ hasText: /^PENDING$/ })).toBeVisible();
  await driverPage.getByRole('button', { name: 'Accept request' }).click();
  await expect(
    driverPage.getByText('Request accepted. The booking is now confirmed.'),
  ).toBeVisible();
  await expect(
    driverPage.locator('.status-badge').filter({ hasText: /^CONFIRMED$/ }),
  ).toBeVisible();
}

export async function cancelBookingViaUi(
  page: Page,
  bookingId: string,
  reason: string,
): Promise<void> {
  await page.goto(`/app/bookings/${bookingId}`);
  await expect(page.getByRole('heading', { name: 'Booking details' })).toBeVisible();
  await page.getByLabel('Cancellation reason').fill(reason);
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.getByText('Booking cancelled.')).toBeVisible();
  await expect(page.locator('.status-badge').filter({ hasText: /^CANCELLED$/ })).toBeVisible();
}

export async function updateDriverHourlyRate(page: Page, hourlyRateInr: string): Promise<void> {
  await page.goto('/driver/qualification');
  await expect(page.getByRole('heading', { name: 'Your driver qualification' })).toBeVisible();
  const form = page.getByRole('form', { name: 'Driver qualification' });
  await form.getByLabel('Hourly rate (INR)').fill(hourlyRateInr);
  await page.getByRole('button', { name: 'Save driver details' }).click();
  await expect(
    page.getByText('Driver details saved. Upload your license and submit for review.'),
  ).toBeVisible();
  await expect(
    page
      .locator('p')
      .filter({ hasText: /^Qualification:/ })
      .getByText('APPROVED', { exact: true }),
  ).toBeVisible();
}

export async function cancelBookingViaApi(
  page: Page,
  token: string,
  bookingId: string,
  reason: string,
): Promise<void> {
  const current = await getBooking(page, token, bookingId);
  const response = await page.request.post(`/api/v1/bookings/${bookingId}/cancel`, {
    headers: bearer(token),
    data: { version: current.version, reason },
  });
  expect(response.status()).toBe(200);
}

export async function captureScreen(page: Page, label: string): Promise<void> {
  mkdirSync(resolve('artifacts'), { recursive: true });
  await page.screenshot({
    path: resolve('artifacts', `driver-hire-${label}-${test.info().project.name}.png`),
    fullPage: true,
  });
}

export async function closeContexts(contexts: BrowserContext[]): Promise<void> {
  await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
}

export async function getBooking(page: Page, token: string, id: string): Promise<BookingState> {
  const response = await page.request.get(`/api/v1/bookings/${id}`, {
    headers: bearer(token),
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: BookingState }).data;
}

export async function getTrip(page: Page, token: string, id: string): Promise<TripState> {
  const response = await page.request.get(`/api/v1/trips/${id}`, { headers: bearer(token) });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: TripState }).data;
}

export async function getTripHistory(
  page: Page,
  token: string,
  id: string,
): Promise<TripHistoryState[]> {
  const response = await page.request.get(`/api/v1/trips/${id}/history?page=1&pageSize=100`, {
    headers: bearer(token),
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: TripHistoryState[] }).data;
}

export async function expectPersistedBooking(
  page: Page,
  token: string,
  id: string,
  status: string,
): Promise<void> {
  await expect
    .poll(async () => (await getBooking(page, token, id)).status, { timeout: 15_000 })
    .toBe(status);
}

/**
 * Test-only clock fixture. Booking creation requires a 60-minute lead and trip
 * starts are only legal inside [starts_at-15min, starts_at+30min], which a
 * browser case cannot wait for. This atomically shifts only the booking, trip
 * and reservation rows created by this test so the real persisted start lands
 * five minutes in the past. No production clock override or backdoor is added.
 */
export async function shiftBookingIntoStartWindow(
  bookingId: string,
  leadMinutes = 5,
): Promise<void> {
  loadEnvFile('.env');
  const target = new URL(requireTestDatabaseUrl(process.env.TEST_MIGRATION_DATABASE_URL));
  target.port = E2E_DATABASE_PORT;
  const pool = new Pool({ connectionString: requireTestDatabaseUrl(target.toString()), max: 1 });
  try {
    const row = await pool.query<{ starts_at: Date }>(
      'SELECT starts_at FROM bookings WHERE id = $1',
      [bookingId],
    );
    const startsAt = row.rows[0]?.starts_at;
    if (!startsAt) throw new Error('Test booking missing for the isolated clock fixture');
    const deltaSeconds = (startsAt.getTime() - (Date.now() - leadMinutes * 60 * 1000)) / 1000;
    if (deltaSeconds <= 0) return;
    await pool.query('BEGIN');
    try {
      await pool.query(
        `UPDATE bookings
         SET starts_at = starts_at - make_interval(secs => $2),
             ends_at = ends_at - make_interval(secs => $2)
         WHERE id = $1`,
        [bookingId, deltaSeconds],
      );
      await pool.query(
        `UPDATE trips
         SET starts_at = starts_at - make_interval(secs => $2),
             ends_at = ends_at - make_interval(secs => $2)
         WHERE booking_id = $1`,
        [bookingId, deltaSeconds],
      );
      await pool.query(
        `UPDATE resource_reservations
         SET starts_at = starts_at - make_interval(secs => $2),
             ends_at = ends_at - make_interval(secs => $2)
         WHERE booking_id = $1`,
        [bookingId, deltaSeconds],
      );
      await pool.query('COMMIT');
    } catch (cause) {
      await pool.query('ROLLBACK');
      throw cause;
    }
  } finally {
    await pool.end();
  }
}
