import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  PASSWORD,
  bearer,
  resetRateLimits,
  newSession,
  signInAsAdmin,
  provisionApprovedDriver,
  provisionPassengerWithVehicle,
  plannedInterval,
  fillBookingRequest,
  cityId,
  closeContexts,
} from './driver-hire.helpers';
test.describe.configure({ timeout: 300000 });
test.beforeEach(() => resetRateLimits());
test('expired_session_keeps_journey_and_lost_booking_response_retries_once', async ({
  browser,
}) => {
  const admin = await newSession(browser),
    contexts = [admin.context];
  try {
    const adminToken = await signInAsAdmin(admin.page);
    const driver = await provisionApprovedDriver(browser, admin.page, adminToken, {
      name: `Recovery Driver ${randomUUID().slice(0, 6)}`,
      licenseNumber: `REC${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    });
    contexts.push(driver.actor.context);
    const passenger = await provisionPassengerWithVehicle(
      browser,
      admin.page,
      adminToken,
      `Recovery Passenger ${randomUUID().slice(0, 6)}`,
    );
    contexts.push(passenger.actor.context);
    const page = passenger.actor.page;
    await page.goto(`/app/bookings/new?driverId=${driver.driverId}`);
    const interval = plannedInterval(4, 2);
    const destinationCityId = await cityId(page, 'Mumbai');
    await fillBookingRequest(page, {
      vehicleId: passenger.vehicleId,
      interval,
      originCityId: driver.cityId,
      destinationCityId,
      passengers: 2,
    });
    const start = await page.getByLabel('Starts at', { exact: true }).inputValue();
    const expired = {
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Session expired. Sign in again.' },
      }),
    };
    await page.route('**/api/v1/booking-quotes', (route) => route.fulfill(expired));
    await page.route('**/api/v1/auth/refresh', (route) => route.fulfill(expired));
    await page.getByRole('button', { name: 'Review estimate', exact: true }).click();
    await expect(page).toHaveURL(/login\?next=/);
    await page.unroute('**/api/v1/booking-quotes');
    await page.unroute('**/api/v1/auth/refresh');
    await page.getByLabel('Email address').fill(passenger.actor.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Request a driver', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Your vehicle')).toHaveValue(passenger.vehicleId);
    await expect(page.getByLabel('Starts at', { exact: true })).toHaveValue(start);
    await expect(page.getByLabel('Origin', { exact: true })).toHaveValue(driver.cityId);
    await expect(page.getByLabel('Destination', { exact: true })).toHaveValue(destinationCityId);
    await expect(page.getByLabel('Passengers', { exact: true })).toHaveValue('2');
    const beforeResponse = await page.request.get('/api/v1/bookings', {
      headers: bearer(passenger.actor.token),
    });
    expect(beforeResponse.status()).toBe(200);
    const before = (await beforeResponse.json()).meta.total as number;
    await page.getByRole('button', { name: 'Review estimate', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your estimate', exact: true })).toBeVisible();
    let dropped = false;
    const keys: (string | undefined)[] = [];
    await page.route('**/api/v1/bookings', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      keys.push(route.request().headers()['idempotency-key']);
      const response = await route.fetch();
      expect([200, 201]).toContain(response.status());
      if (!dropped) {
        dropped = true;
        await route.abort('connectionreset');
      } else await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('CONFIRMED', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/bookings\/[0-9a-f-]+$/);
    const afterResponse = await page.request.get('/api/v1/bookings', {
      headers: bearer(passenger.actor.token),
    });
    expect(afterResponse.status()).toBe(200);
    const after = (await afterResponse.json()).meta.total as number;
    expect(after - before).toBe(1);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
  } finally {
    await closeContexts(contexts);
  }
});
