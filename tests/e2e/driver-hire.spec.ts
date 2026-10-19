import { randomUUID } from 'node:crypto';
import { test, expect, type BrowserContext } from '@playwright/test';
import {
  acceptBookingViaUi,
  cancelBookingViaApi,
  cancelBookingViaUi,
  captureScreen,
  cityId,
  closeContexts,
  fillBookingRequest,
  findDriverAndOpenRequest,
  getBooking,
  getTrip,
  getTripHistory,
  newActor,
  newSession,
  provisionApprovedDriver,
  provisionPassengerWithVehicle,
  registerVerifyAndSignIn,
  resetRateLimits,
  reviewEstimate,
  sendRequest,
  shiftBookingIntoStartWindow,
  signInAsAdmin,
  updateDriverHourlyRate,
  expectPersistedBooking,
} from './driver-hire.helpers';

type City = { id: string; name: string; timezone: string };

function datetimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function plannedInterval(hoursFromNow = 2, hours = 2): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(Date.now() + hoursFromNow * 3600 * 1000);
  startsAt.setSeconds(0, 0);
  return { startsAt, endsAt: new Date(startsAt.getTime() + hours * 3600 * 1000) };
}

function uniqueLicense(): string {
  return `KA01${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
}

test.describe.configure({ timeout: 300_000 });

test.beforeEach(async () => {
  await resetRateLimits();
});

test('rejection_and_empty_availability_recovery', async ({ page }) => {
  const citiesResponse = await page.request.get('/api/v1/cities?page=1&pageSize=100');
  expect(citiesResponse.status()).toBe(200);
  const cities = ((await citiesResponse.json()) as { data: City[] }).data;
  const city = cities.find((candidate) => candidate.name === 'Delhi');
  expect(city, 'Delhi exists in the curated city catalogue').toBeTruthy();

  const startsAt = new Date();
  startsAt.setUTCDate(startsAt.getUTCDate() + 365);
  startsAt.setUTCHours(9, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);

  const query = new URLSearchParams({
    cityId: city!.id,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    page: '1',
    pageSize: '20',
  });
  const availability = await page.request.get(`/api/v1/drivers?${query.toString()}`);
  expect(availability.status()).toBe(200);
  expect(((await availability.json()) as { meta: { total: number } }).meta.total).toBe(0);

  await page.goto('/drivers');
  await expect(page.getByRole('heading', { name: 'Find a driver', exact: true })).toBeVisible();
  await page.getByLabel('City', { exact: true }).selectOption(city!.id);
  await page.getByLabel('Starts at', { exact: true }).fill(datetimeLocal(startsAt));
  await page.getByLabel('Ends at', { exact: true }).fill(datetimeLocal(endsAt));
  await page.getByRole('button', { name: 'Find drivers', exact: true }).click();
  await expect(page.getByText(/No drivers match/i)).toBeVisible();
  await expect(page.getByText(/change (your )?filters/i)).toBeVisible();
});

test('booking_request_form_is_reachable_after_sign_in', async ({ page }) => {
  await registerVerifyAndSignIn(page, 'UniqueName');
  await page.goto('/app/bookings/new');
  await expect(page.getByRole('heading', { name: 'Request a driver' })).toBeVisible();
});

test('driver_hire_request_accept_start_complete_browser', async ({ browser }) => {
  const admin = await newSession(browser);
  const contexts: BrowserContext[] = [admin.context];
  try {
    const adminToken = await signInAsAdmin(admin.page);
    const driver = await provisionApprovedDriver(browser, admin.page, adminToken, {
      name: `Journey Driver ${randomUUID().slice(0, 6)}`,
      licenseNumber: uniqueLicense(),
    });
    contexts.push(driver.actor.context);
    const passenger = await provisionPassengerWithVehicle(
      browser,
      admin.page,
      adminToken,
      `Journey Passenger ${randomUUID().slice(0, 6)}`,
    );
    contexts.push(passenger.actor.context);

    const interval = plannedInterval(2, 2);
    await findDriverAndOpenRequest(passenger.actor.page, driver, interval);
    await fillBookingRequest(passenger.actor.page, {
      vehicleId: passenger.vehicleId,
      interval,
      originCityId: driver.cityId,
      destinationCityId: await cityId(passenger.actor.page, 'Mumbai'),
    });
    const quote = await reviewEstimate(passenger.actor.page);
    expect(quote.driverId).toBe(driver.driverId);
    expect(quote.paymentStatus).toBe('NOT_COLLECTED');
    await expect(
      passenger.actor.page.getByText('Payment not collected by DriveHire.'),
    ).toBeVisible();
    await captureScreen(passenger.actor.page, 'estimate');

    const sent = await sendRequest(passenger.actor.page);
    expect(sent.status).toBe(201);
    const bookingId = sent.bookingId!;
    await expect(passenger.actor.page.getByText('PENDING', { exact: true }).first()).toBeVisible();
    await expect(
      passenger.actor.page.getByText('Payment not collected by DriveHire.'),
    ).toBeVisible();
    await captureScreen(passenger.actor.page, 'booking-pending');

    await acceptBookingViaUi(driver.actor.page, bookingId);
    const accepted = await getBooking(driver.actor.page, driver.actor.token, bookingId);
    expect(accepted.status).toBe('CONFIRMED');
    expect(accepted.paymentStatus).toBe('NOT_COLLECTED');
    expect(accepted.decisions).toEqual([
      expect.objectContaining({ kind: 'DRIVER', status: 'ACCEPTED' }),
    ]);

    await passenger.actor.page.goto(`/app/bookings/${bookingId}`);
    await expect(
      passenger.actor.page.getByText('CONFIRMED', { exact: true }).first(),
    ).toBeVisible();
    await captureScreen(passenger.actor.page, 'booking-confirmed');

    await shiftBookingIntoStartWindow(bookingId);
    const shifted = await getBooking(passenger.actor.page, passenger.actor.token, bookingId);
    await driver.actor.page.goto(`/app/trips/${shifted.tripId}`);
    await expect(driver.actor.page.getByRole('heading', { name: 'Trip details' })).toBeVisible();
    const startTrip = driver.actor.page.getByRole('button', { name: 'Start trip' });
    await expect(startTrip).toBeEnabled({ timeout: 10_000 });
    await startTrip.click();
    await expect(driver.actor.page.getByRole('button', { name: 'In transit' })).toBeVisible();
    await expect(driver.actor.page.getByText('Trip status saved.')).toBeVisible();

    await driver.actor.page.getByRole('button', { name: 'In transit' }).click();
    await expect(driver.actor.page.getByRole('button', { name: 'Complete trip' })).toBeVisible();
    await captureScreen(driver.actor.page, 'trip-in-transit');

    const [completedResponse] = await Promise.all([
      driver.actor.page.waitForResponse(
        (response) =>
          response.url().endsWith(`/trips/${shifted.tripId}/transitions`) &&
          response.request().method() === 'POST',
      ),
      driver.actor.page.getByRole('button', { name: 'Complete trip' }).click(),
    ]);
    expect(completedResponse.status()).toBe(200);
    await expect(
      driver.actor.page.locator('.status-badge').filter({ hasText: /^COMPLETED$/ }),
    ).toBeVisible();
    await expect(driver.actor.page.getByRole('button', { name: 'Complete trip' })).toHaveCount(0);

    const trip = await getTrip(driver.actor.page, driver.actor.token, shifted.tripId);
    expect(trip.status).toBe('COMPLETED');
    const history = await getTripHistory(driver.actor.page, driver.actor.token, shifted.tripId);
    expect(history.map((entry) => entry.toStatus)).toEqual(
      expect.arrayContaining(['STARTED', 'IN_TRANSIT', 'COMPLETED']),
    );
    await expectPersistedBooking(
      passenger.actor.page,
      passenger.actor.token,
      bookingId,
      'COMPLETED',
    );

    await passenger.actor.page.goto(`/app/bookings/${bookingId}`);
    await expect(
      passenger.actor.page.getByText('COMPLETED', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      passenger.actor.page.getByText('Payment not collected by DriveHire.'),
    ).toBeVisible();
    await captureScreen(passenger.actor.page, 'booking-completed');
  } finally {
    await closeContexts(contexts);
  }
});

test('passenger_cancel_before_start', async ({ browser }) => {
  const admin = await newSession(browser);
  const contexts: BrowserContext[] = [admin.context];
  try {
    const adminToken = await signInAsAdmin(admin.page);
    const driver = await provisionApprovedDriver(browser, admin.page, adminToken, {
      name: `Cancel Driver ${randomUUID().slice(0, 6)}`,
      licenseNumber: uniqueLicense(),
    });
    contexts.push(driver.actor.context);
    const passenger = await provisionPassengerWithVehicle(
      browser,
      admin.page,
      adminToken,
      `Cancel Passenger ${randomUUID().slice(0, 6)}`,
    );
    contexts.push(passenger.actor.context);

    const interval = plannedInterval(2, 2);
    await findDriverAndOpenRequest(passenger.actor.page, driver, interval);
    await fillBookingRequest(passenger.actor.page, {
      vehicleId: passenger.vehicleId,
      interval,
      originCityId: driver.cityId,
      destinationCityId: await cityId(passenger.actor.page, 'Mumbai'),
    });
    await reviewEstimate(passenger.actor.page);
    const sent = await sendRequest(passenger.actor.page);
    expect(sent.status).toBe(201);
    const bookingId = sent.bookingId!;
    await acceptBookingViaUi(driver.actor.page, bookingId);

    await cancelBookingViaUi(
      passenger.actor.page,
      bookingId,
      'Plans changed before the driver starts this journey.',
    );
    const booking = await getBooking(passenger.actor.page, passenger.actor.token, bookingId);
    expect(booking.status).toBe('CANCELLED');
    const trip = await getTrip(passenger.actor.page, passenger.actor.token, booking.tripId);
    expect(trip.status).toBe('CANCELLED');
    await captureScreen(passenger.actor.page, 'booking-cancelled');
  } finally {
    await closeContexts(contexts);
  }
});

test('stale_quote_prompts_requote', async ({ browser }) => {
  const admin = await newSession(browser);
  const contexts: BrowserContext[] = [admin.context];
  try {
    const adminToken = await signInAsAdmin(admin.page);
    const driver = await provisionApprovedDriver(browser, admin.page, adminToken, {
      name: `Stale Driver ${randomUUID().slice(0, 6)}`,
      licenseNumber: uniqueLicense(),
      hourlyRateMinor: 50_000,
    });
    contexts.push(driver.actor.context);
    const passenger = await provisionPassengerWithVehicle(
      browser,
      admin.page,
      adminToken,
      `Stale Passenger ${randomUUID().slice(0, 6)}`,
    );
    contexts.push(passenger.actor.context);

    const interval = plannedInterval(2, 2);
    await findDriverAndOpenRequest(passenger.actor.page, driver, interval);
    await fillBookingRequest(passenger.actor.page, {
      vehicleId: passenger.vehicleId,
      interval,
      originCityId: driver.cityId,
      destinationCityId: await cityId(passenger.actor.page, 'Mumbai'),
    });
    const firstQuote = await reviewEstimate(passenger.actor.page);
    await captureScreen(passenger.actor.page, 'estimate-before-rate-change');

    await updateDriverHourlyRate(driver.actor.page, '750.00');

    const refused = await sendRequest(passenger.actor.page);
    expect(refused.status).toBe(409);
    const alert = passenger.actor.page.getByRole('alert');
    await expect(alert).toContainText('Review a new estimate before trying again.');
    await expect(alert).toBeFocused();
    await expect(
      passenger.actor.page.getByText('Payment not collected by DriveHire.'),
    ).toBeVisible();
    await expect(passenger.actor.page.getByLabel('Your vehicle')).toHaveValue(passenger.vehicleId);
    await expect(passenger.actor.page.getByLabel('Starts at', { exact: true })).toHaveValue(
      datetimeLocal(interval.startsAt),
    );
    await expect(passenger.actor.page.getByLabel('Ends at', { exact: true })).toHaveValue(
      datetimeLocal(interval.endsAt),
    );
    await expect(passenger.actor.page.getByLabel('Passengers', { exact: true })).toHaveValue('1');
    await captureScreen(passenger.actor.page, 'stale-estimate-error');

    const secondQuote = await reviewEstimate(passenger.actor.page);
    expect(secondQuote.driverId).toBe(driver.driverId);
    expect(secondQuote.totalMinor).toBeGreaterThan(firstQuote.totalMinor);
    await captureScreen(passenger.actor.page, 'requoted-estimate');

    const sent = await sendRequest(passenger.actor.page);
    expect(sent.status).toBe(201);
    const booking = await getBooking(passenger.actor.page, passenger.actor.token, sent.bookingId!);
    expect(booking.status).toBe('PENDING');
    expect(booking.totalMinor).toBe(secondQuote.totalMinor);
    await captureScreen(passenger.actor.page, 'requoted-booking');
    await cancelBookingViaApi(
      passenger.actor.page,
      passenger.actor.token,
      booking.id,
      'Stale quote verification is complete.',
    );
  } finally {
    await closeContexts(contexts);
  }
});

test('foreign_booking_direct_URL_denied', async ({ browser }) => {
  const admin = await newSession(browser);
  const contexts: BrowserContext[] = [admin.context];
  try {
    const adminToken = await signInAsAdmin(admin.page);
    const driver = await provisionApprovedDriver(browser, admin.page, adminToken, {
      name: `Foreign Driver ${randomUUID().slice(0, 6)}`,
      licenseNumber: uniqueLicense(),
    });
    contexts.push(driver.actor.context);
    const owner = await provisionPassengerWithVehicle(
      browser,
      admin.page,
      adminToken,
      `Owner Passenger ${randomUUID().slice(0, 6)}`,
    );
    contexts.push(owner.actor.context);

    const interval = plannedInterval(2, 2);
    await findDriverAndOpenRequest(owner.actor.page, driver, interval);
    await fillBookingRequest(owner.actor.page, {
      vehicleId: owner.vehicleId,
      interval,
      originCityId: driver.cityId,
      destinationCityId: await cityId(owner.actor.page, 'Mumbai'),
    });
    await reviewEstimate(owner.actor.page);
    const sent = await sendRequest(owner.actor.page);
    expect(sent.status).toBe(201);
    const bookingId = sent.bookingId!;

    const foreign = await newActor(browser, `Foreign Passenger ${randomUUID().slice(0, 6)}`);
    contexts.push(foreign.context);
    await foreign.page.goto(`/app/bookings/${bookingId}`);
    await expect(foreign.page.getByRole('heading', { name: 'Booking details' })).toBeVisible();
    await expect(foreign.page.getByRole('alert')).toContainText(
      /not found|not authorized|forbidden|access/i,
    );
    await expect(foreign.page.getByText('Request reference:')).toHaveCount(0);
    await captureScreen(foreign.page, 'foreign-booking-denied');

    const apiDenied = await foreign.page.request.get(`/api/v1/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${foreign.token}` },
    });
    expect(apiDenied.status()).toBe(404);
    await cancelBookingViaApi(
      owner.actor.page,
      owner.actor.token,
      bookingId,
      'Foreign direct URL check completed.',
    );
  } finally {
    await closeContexts(contexts);
  }
});

test('driver_changed_requires_cancel_new_quote', async ({ browser }) => {
  const admin = await newSession(browser);
  const contexts: BrowserContext[] = [admin.context];
  try {
    const adminToken = await signInAsAdmin(admin.page);
    const firstDriver = await provisionApprovedDriver(browser, admin.page, adminToken, {
      name: `First Driver ${randomUUID().slice(0, 6)}`,
      licenseNumber: uniqueLicense(),
    });
    contexts.push(firstDriver.actor.context);
    const secondDriver = await provisionApprovedDriver(browser, admin.page, adminToken, {
      name: `Second Driver ${randomUUID().slice(0, 6)}`,
      licenseNumber: uniqueLicense(),
    });
    contexts.push(secondDriver.actor.context);
    const passenger = await provisionPassengerWithVehicle(
      browser,
      admin.page,
      adminToken,
      `Change Passenger ${randomUUID().slice(0, 6)}`,
    );
    contexts.push(passenger.actor.context);

    const interval = plannedInterval(2, 2);
    const destinationCityId = await cityId(passenger.actor.page, 'Mumbai');
    await findDriverAndOpenRequest(passenger.actor.page, firstDriver, interval);
    await fillBookingRequest(passenger.actor.page, {
      vehicleId: passenger.vehicleId,
      interval,
      originCityId: firstDriver.cityId,
      destinationCityId,
    });
    await reviewEstimate(passenger.actor.page);
    const firstRequest = await sendRequest(passenger.actor.page);
    expect(firstRequest.status).toBe(201);
    const firstBookingId = firstRequest.bookingId!;
    await acceptBookingViaUi(firstDriver.actor.page, firstBookingId);

    await passenger.actor.page.goto(`/app/bookings/${firstBookingId}`);
    await expect(
      passenger.actor.page.getByText('CONFIRMED', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      passenger.actor.page.getByText(
        'To change the driver or vehicle, cancel and request a new estimate.',
      ),
    ).toBeVisible();
    await expect(passenger.actor.page.getByRole('button', { name: /replace/i })).toHaveCount(0);
    await expect(passenger.actor.page.getByRole('link', { name: /replace/i })).toHaveCount(0);

    await cancelBookingViaUi(
      passenger.actor.page,
      firstBookingId,
      'The assigned driver can no longer make this journey.',
    );
    const cancelled = await getBooking(passenger.actor.page, passenger.actor.token, firstBookingId);
    expect(cancelled.status).toBe('CANCELLED');
    expect(
      (await getTrip(passenger.actor.page, passenger.actor.token, cancelled.tripId)).status,
    ).toBe('CANCELLED');
    await captureScreen(passenger.actor.page, 'driver-change-requires-cancel');

    await findDriverAndOpenRequest(passenger.actor.page, secondDriver, interval);
    await fillBookingRequest(passenger.actor.page, {
      vehicleId: passenger.vehicleId,
      interval,
      originCityId: secondDriver.cityId,
      destinationCityId,
    });
    const newQuote = await reviewEstimate(passenger.actor.page);
    expect(newQuote.driverId).toBe(secondDriver.driverId);
    const secondRequest = await sendRequest(passenger.actor.page);
    expect(secondRequest.status).toBe(201);
    expect(secondRequest.bookingId).not.toBe(firstBookingId);

    const replacement = await getBooking(
      passenger.actor.page,
      passenger.actor.token,
      secondRequest.bookingId!,
    );
    expect(replacement.driverId).toBe(secondDriver.driverId);
    expect(replacement.status).toBe('PENDING');
    await captureScreen(passenger.actor.page, 'new-driver-request');
    await cancelBookingViaApi(
      passenger.actor.page,
      passenger.actor.token,
      replacement.id,
      'Driver replacement verification is complete.',
    );
  } finally {
    await closeContexts(contexts);
  }
});

test('all_estimates_say_payment_not_collected', async ({ browser }) => {
  const admin = await newSession(browser);
  const contexts: BrowserContext[] = [admin.context];
  try {
    const adminToken = await signInAsAdmin(admin.page);
    const driver = await provisionApprovedDriver(browser, admin.page, adminToken, {
      name: `Notice Driver ${randomUUID().slice(0, 6)}`,
      licenseNumber: uniqueLicense(),
    });
    contexts.push(driver.actor.context);
    const passenger = await provisionPassengerWithVehicle(
      browser,
      admin.page,
      adminToken,
      `Notice Passenger ${randomUUID().slice(0, 6)}`,
    );
    contexts.push(passenger.actor.context);

    await passenger.actor.page.goto('/drivers');
    await expect(
      passenger.actor.page.getByRole('heading', { name: 'Find a driver', exact: true }),
    ).toBeVisible();
    await expect(
      passenger.actor.page.getByText('Payment not collected by DriveHire.'),
    ).toBeVisible();

    const interval = plannedInterval(2, 2);
    await findDriverAndOpenRequest(passenger.actor.page, driver, interval);
    await expect(
      passenger.actor.page.getByText('Payment not collected by DriveHire.'),
    ).toBeVisible();
    await fillBookingRequest(passenger.actor.page, {
      vehicleId: passenger.vehicleId,
      interval,
      originCityId: driver.cityId,
      destinationCityId: await cityId(passenger.actor.page, 'Mumbai'),
    });
    const quote = await reviewEstimate(passenger.actor.page);
    expect(quote.paymentStatus).toBe('NOT_COLLECTED');
    expect(quote.totalMinor).toBeGreaterThan(0);
    await expect(
      passenger.actor.page.getByText('Payment not collected by DriveHire.'),
    ).toBeVisible();
    await captureScreen(passenger.actor.page, 'payment-notice-estimate');

    const sent = await sendRequest(passenger.actor.page);
    expect(sent.status).toBe(201);
    const bookingId = sent.bookingId!;
    await expect(passenger.actor.page.getByText('estimated total')).toBeVisible();
    await expect(
      passenger.actor.page.getByText('Payment not collected by DriveHire.'),
    ).toBeVisible();
    await captureScreen(passenger.actor.page, 'payment-notice-booking');

    await passenger.actor.page.goto('/app/bookings');
    const ownRow = passenger.actor.page
      .locator('.record-list li')
      .filter({ hasText: `Request reference: ${bookingId}` });
    await expect(ownRow).toBeVisible();
    await expect(ownRow).toContainText('Estimate');
    await expect(
      passenger.actor.page.getByText('Payment not collected by DriveHire.'),
    ).toBeVisible();
    await captureScreen(passenger.actor.page, 'payment-notice-bookings');

    await admin.page.goto('/admin/operations');
    await expect(admin.page.getByRole('heading', { name: 'Journey administration' })).toBeVisible();
    await admin.page.getByLabel('Status').selectOption('PENDING');
    const adminRow = admin.page
      .locator('.record-list li')
      .filter({ hasText: `Reference: ${bookingId}` });
    await expect(adminRow).toBeVisible({ timeout: 30_000 });
    await expect(adminRow).toContainText('Estimate');
    await expect(adminRow).toContainText('Payment not collected by DriveHire.');
    await captureScreen(admin.page, 'payment-notice-admin');

    await cancelBookingViaApi(
      passenger.actor.page,
      passenger.actor.token,
      bookingId,
      'Payment notice verification is complete.',
    );
  } finally {
    await closeContexts(contexts);
  }
});
