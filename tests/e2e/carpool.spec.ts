import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { loadEnvFile } from 'node:process';
import { Pool } from 'pg';
import {
  resetRateLimits,
  enableDriverCapability,
  newSession,
  newActor,
  signInAsAdmin,
  provisionApprovedDriver,
  addPersonalVehicle,
  uploadEvidence,
  firstVehicleId,
  submitForReview,
  approveLatest,
  cityId,
  closeContexts,
} from './driver-hire.helpers';
const local = (date: Date) => {
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
async function capture(page: Page, label: string) {
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({
    path: resolve('artifacts', `carpool-${label}-${test.info().project.name}.png`),
    fullPage: true,
  });
}
test.describe.configure({ timeout: 300000 });
test.beforeEach(() => resetRateLimits());
test('carpool_search_has_real_empty_state', async ({ page }) => {
  await page.goto('/carpools');
  await expect(page.getByRole('heading', { name: 'Find a carpool', exact: true })).toBeVisible();
  await page.getByLabel('Origin', { exact: true }).selectOption(await cityId(page, 'Delhi'));
  await page.getByLabel('Destination', { exact: true }).selectOption(await cityId(page, 'Mumbai'));
  const future = new Date(Date.now() + 365 * 86400000);
  await page.getByLabel('Departure date', { exact: true }).fill(future.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Find carpools', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No carpools match' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Offer a ride' })).toBeVisible();
});
test('host_publish_passenger_join_cancel_and_manual_complete_browser', async ({ browser }) => {
  const admin = await newSession(browser),
    contexts = [admin.context];
  try {
    const adminToken = await signInAsAdmin(admin.page);
    const host = await provisionApprovedDriver(browser, admin.page, adminToken, {
      name: `Carpool Host ${randomUUID().slice(0, 6)}`,
      licenseNumber: `KA01${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`,
    });
    contexts.push(host.actor.context);
    await addPersonalVehicle(host.actor.page, `KA01CP${randomUUID().slice(0, 6).toUpperCase()}`);
    await uploadEvidence(host.actor.page, 'REGISTRATION', 'carpool-registration.pdf');
    await uploadEvidence(host.actor.page, 'INSURANCE', 'carpool-insurance.pdf');
    const vehicleId = await firstVehicleId(host.actor.page, host.actor.token);
    await submitForReview(host.actor.page);
    await approveLatest(admin.page, adminToken, 'VEHICLE', vehicleId);
    const passengerName = `Carpool Passenger ${randomUUID().slice(0, 6)}`;
    const pax = await newActor(browser, passengerName);
    contexts.push(pax.context);
    const starts = new Date(Date.now() + 3 * 3600000);
    starts.setSeconds(0, 0);
    const ends = new Date(starts.getTime() + 2 * 3600000);
    await host.actor.page.goto('/app/carpools/new');
    await expect(host.actor.page.getByRole('heading', { name: 'Offer a carpool' })).toBeVisible();
    await host.actor.page.getByLabel('Your vehicle', { exact: true }).selectOption(vehicleId);
    await host.actor.page.getByLabel('Origin', { exact: true }).selectOption(host.cityId);
    await host.actor.page
      .getByLabel('Destination', { exact: true })
      .selectOption(await cityId(host.actor.page, 'Mumbai'));
    await host.actor.page.getByLabel('Pickup note').fill('Main station entrance');
    await host.actor.page.getByLabel('Dropoff note').fill('Central bus station');
    await host.actor.page.getByLabel('Starts at', { exact: true }).fill(local(starts));
    await host.actor.page.getByLabel('Ends at', { exact: true }).fill(local(ends));
    await host.actor.page.getByLabel('Seats offered').fill('1');
    await host.actor.page.getByLabel('Price per seat (INR)').fill('125.50');
    const [created] = await Promise.all([
      host.actor.page.waitForResponse(
        (r) => r.url().endsWith('/api/v1/carpools') && r.request().method() === 'POST',
      ),
      host.actor.page.getByRole('button', { name: 'Save draft', exact: true }).click(),
    ]);
    expect(created.status()).toBe(201);
    const ride = (await created.json()).data as { id: string; tripId: string };
    await expect(
      host.actor.page.locator('.status-badge').filter({ hasText: /^DRAFT$/ }),
    ).toBeVisible();
    await capture(host.actor.page, 'draft');
    const [published] = await Promise.all([
      host.actor.page.waitForResponse((r) => r.url().endsWith(`/carpools/${ride.id}/publish`)),
      host.actor.page.getByRole('button', { name: 'Publish ride', exact: true }).click(),
    ]);
    expect(published.status()).toBe(200);
    await expect(
      host.actor.page.locator('.status-badge').filter({ hasText: /^PUBLISHED$/ }),
    ).toBeVisible();
    await pax.page.goto('/carpools');
    await pax.page.getByLabel('Origin', { exact: true }).selectOption(host.cityId);
    await pax.page
      .getByLabel('Destination', { exact: true })
      .selectOption(await cityId(pax.page, 'Mumbai'));
    const departureDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(starts);
    await pax.page.getByLabel('Departure date', { exact: true }).fill(departureDate);
    await pax.page.getByRole('button', { name: 'Find carpools', exact: true }).click();
    await pax.page
      .locator('.record-list li')
      .filter({ hasText: host.displayName })
      .getByRole('link', { name: 'View ride' })
      .click();
    await expect(pax.page.getByText('Payment not collected by DriveHire.')).toBeVisible();
    async function instantJoin() {
      const [result] = await Promise.all([
        pax.page.waitForResponse(
          (r) =>
            r.url().endsWith(`/carpools/${ride.id}/seat-requests`) &&
            r.request().method() === 'POST',
        ),
        pax.page.getByRole('button', { name: 'Join instantly', exact: true }).click(),
      ]);
      expect(result.status()).toBe(201);
      await expect(pax.page.getByText('Your seat is confirmed.')).toBeVisible();
      return (await result.json()).data as { id: string };
    }
    const rival = await newActor(browser, `Seat Rival ${randomUUID().slice(0, 6)}`);
    contexts.push(rival.context);
    await rival.page.goto(`/carpools/${ride.id}`);
    await expect(
      rival.page.getByRole('button', { name: 'Join instantly', exact: true }),
    ).toBeVisible();
    await rival.page.getByLabel('Message to host (optional)').fill('I can meet at the entrance');
    await instantJoin();
    const [lostSeat] = await Promise.all([
      rival.page.waitForResponse(
        (response) =>
          response.url().endsWith(`/carpools/${ride.id}/seat-requests`) &&
          response.request().method() === 'POST',
      ),
      rival.page.getByRole('button', { name: 'Join instantly', exact: true }).click(),
    ]);
    expect(lostSeat.status()).toBe(409);
    await expect(rival.page.getByRole('alert')).toContainText('Reload ride');
    await expect(rival.page.getByText('Your seat is confirmed.')).toHaveCount(0);
    await expect(rival.page.getByLabel('Message to host (optional)')).toHaveValue(
      'I can meet at the entrance',
    );
    await rival.page.getByRole('button', { name: 'Reload ride', exact: true }).click();
    await expect(rival.page.getByRole('heading', { name: 'This ride is full' })).toBeVisible();
    await expect(rival.page.getByRole('button', { name: 'Join instantly' })).toHaveCount(0);
    await capture(rival.page, 'lost-final-seat');
    await capture(pax.page, 'joined');
    await host.actor.page.reload();
    await expect(host.actor.page.getByRole('heading', { name: 'Passengers' })).toBeVisible();
    await expect(host.actor.page.getByText(passengerName, { exact: true })).toBeVisible();
    await expect(
      host.actor.page.getByRole('button', { name: /approve request|reject request/i }),
    ).toHaveCount(0);
    await capture(host.actor.page, 'roster');
    await pax.page.goto('/app/seats');
    await expect(pax.page.getByRole('heading', { name: 'Your carpool seats' })).toBeVisible();
    await pax.page.getByLabel('Cancellation reason').fill('Plans changed for this journey');
    const [cancelled] = await Promise.all([
      pax.page.waitForResponse(
        (r) => r.url().includes('/seat-requests/') && r.url().endsWith('/cancel'),
      ),
      pax.page.getByRole('button', { name: 'Cancel seats', exact: true }).click(),
    ]);
    expect(cancelled.status()).toBe(200);
    await expect(
      pax.page.locator('.status-badge').filter({ hasText: /^CANCELLED$/ }),
    ).toBeVisible();
    await pax.page.goto(`/carpools/${ride.id}`);
    await instantJoin();
    loadEnvFile('.env');
    const url = new URL(process.env.TEST_MIGRATION_DATABASE_URL!);
    url.port = process.env.E2E_DATABASE_PORT ?? '55434';
    if (
      url.pathname !== '/drivehire_test' ||
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.port !== '55434'
    )
      throw Error('Refusing trip fixture outside isolated E2E target');
    const pool = new Pool({ connectionString: url.toString() });
    try {
      await pool.query(
        "UPDATE carpools SET starts_at=now()-interval '5 minutes',ends_at=now()+interval '2 hours' WHERE id=$1",
        [ride.id],
      );
      await pool.query(
        "UPDATE trips SET starts_at=now()-interval '5 minutes',ends_at=now()+interval '2 hours' WHERE carpool_id=$1",
        [ride.id],
      );
    } finally {
      await pool.end();
    }
    await host.actor.page.goto(`/app/trips/${ride.tripId}`);
    for (const name of ['Start trip', 'In transit', 'Complete trip']) {
      const [result] = await Promise.all([
        host.actor.page.waitForResponse(
          (r) =>
            r.url().endsWith(`/trips/${ride.tripId}/transitions`) &&
            r.request().method() === 'POST',
        ),
        host.actor.page.getByRole('button', { name, exact: true }).click(),
      ]);
      expect(result.status()).toBe(200);
    }
    await expect(
      host.actor.page.locator('.status-badge').filter({ hasText: /^COMPLETED$/ }),
    ).toBeVisible();
    await pax.page.goto('/app/seats');
    await expect(pax.page.getByText(/Ride completed/).first()).toBeVisible();
    await expect(pax.page.locator('.status-badge').filter({ hasText: /^ACCEPTED$/ })).toBeVisible();
    await expect(pax.page.getByRole('button', { name: 'Cancel seats' })).toHaveCount(0);
    await capture(pax.page, 'completed-history');
  } finally {
    await closeContexts(contexts);
  }
});

test('missing_owned_vehicle_links_to_onboarding_browser', async ({ browser }) => {
  const actor = await newActor(browser, `Host Without Vehicle ${randomUUID().slice(0, 6)}`);
  try {
    await enableDriverCapability(actor.page);
    await actor.page.goto('/app/carpools/new');
    await expect(
      actor.page.getByRole('heading', { name: 'Add an approved personal vehicle' }),
    ).toBeVisible();
    await expect(
      actor.page.getByRole('link', { name: 'Add your vehicle and submit it for review' }),
    ).toHaveAttribute('href', '/vehicles');
    await expect(actor.page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
  } finally {
    await actor.context.close();
  }
});
