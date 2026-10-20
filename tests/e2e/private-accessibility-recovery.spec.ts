import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import {
  PASSWORD,
  bearer,
  resetRateLimits,
  newSession,
  signInAsAdmin,
  provisionApprovedDriver,
  addPersonalVehicle,
  uploadEvidence,
  firstVehicleId,
  submitForReview,
  approveLatest,
  newActor,
  cityId,
  datetimeLocal,
  closeContexts,
} from './driver-hire.helpers';
test.describe.configure({ timeout: 300000 });
test.beforeEach(() => resetRateLimits());
async function narrowKeyboardForm(page: Page, route: string) {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route);
  await expect(page.locator('h1')).toBeVisible();
  const controls = page.locator(
    'main :is(input:not([type=radio]),input[type=radio]:checked,select,textarea,button):enabled:visible',
  );
  await expect.poll(() => controls.count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(
    true,
  );
  const checks = await controls.evaluateAll((nodes) =>
    nodes.map((node, index) => {
      node.setAttribute('data-keyboard-check', String(index));
      const style = getComputedStyle(node);
      return {
        labelled:
          node.matches('button') ||
          Boolean((node as HTMLInputElement).labels?.length) ||
          Boolean(node.getAttribute('aria-label')),
        motion: [
          ...style.animationDuration.split(','),
          ...style.transitionDuration.split(','),
        ].every((value) => parseFloat(value) === 0),
      };
    }),
  );
  expect(
    checks.every((check) => check.labelled),
    route,
  ).toBe(true);
  expect(
    checks.every((check) => check.motion),
    route,
  ).toBe(true);
  await page.locator('h1').focus();
  const visited = new Set<string>();
  const limit = checks.length + (await page.locator('main a:visible').count()) + 15;
  for (let i = 0; i < limit && visited.size < checks.length; i++) {
    await page.keyboard.press('Tab');
    const index = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-keyboard-check'),
    );
    if (index !== null && index !== undefined) visited.add(index);
  }
  expect(visited.size, `Keyboard reaches every enabled control: ${route}`).toBe(checks.length);
}

test('private_320px_keyboard_flows_and_expired_seat_response_loss_recovery', async ({
  browser,
}, info) => {
  const admin = await newSession(browser),
    contexts = [admin.context];
  try {
    const adminToken = await signInAsAdmin(admin.page);
    const host = await provisionApprovedDriver(browser, admin.page, adminToken, {
      name: `Seat Recovery Host ${randomUUID().slice(0, 6)}`,
      licenseNumber: `SR${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    });
    contexts.push(host.actor.context);
    await addPersonalVehicle(host.actor.page, `KA01SR${randomUUID().slice(0, 6).toUpperCase()}`);
    await uploadEvidence(host.actor.page, 'REGISTRATION', 'seat-recovery-registration.pdf');
    await uploadEvidence(host.actor.page, 'INSURANCE', 'seat-recovery-insurance.pdf');
    const vehicleId = await firstVehicleId(host.actor.page, host.actor.token);
    await submitForReview(host.actor.page);
    await approveLatest(admin.page, adminToken, 'VEHICLE', vehicleId);
    for (const route of [
      '/profile',
      '/vehicles',
      '/driver/qualification',
      '/driver/availability',
      `/app/bookings/new?driverId=${host.driverId}`,
      '/app/carpools/new',
    ])
      await narrowKeyboardForm(host.actor.page, route);
    for (const route of [
      '/admin/users',
      '/admin/verifications',
      '/admin/operations',
      '/admin/audit',
    ])
      await narrowKeyboardForm(admin.page, route);
    await host.actor.page.screenshot({
      path: `artifacts/phase07-private-carpool-320-${info.project.name}.png`,
      fullPage: true,
    });
    await host.actor.page.getByLabel('Your vehicle', { exact: true }).selectOption(vehicleId);
    await host.actor.page.getByLabel('Origin', { exact: true }).selectOption(host.cityId);
    await host.actor.page
      .getByLabel('Destination', { exact: true })
      .selectOption(await cityId(host.actor.page, 'Mumbai'));
    await host.actor.page.getByLabel('Pickup note').fill('North station gate');
    await host.actor.page.getByLabel('Dropoff note').fill('Central station entrance');
    const starts = new Date(Date.now() + 3 * 3600000),
      ends = new Date(Date.now() + 5 * 3600000);
    await host.actor.page.getByLabel('Starts at', { exact: true }).fill(datetimeLocal(starts));
    await host.actor.page.getByLabel('Ends at', { exact: true }).fill(datetimeLocal(ends));
    await host.actor.page.getByLabel('Seats offered').fill('3');
    await host.actor.page.getByLabel('Price per seat (INR)').fill('60.00');
    await host.actor.page.getByRole('button', { name: 'Save draft', exact: true }).focus();
    const createdPromise = host.actor.page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/carpools') && r.request().method() === 'POST',
    );
    await host.actor.page.keyboard.press('Enter');
    const created = await createdPromise;
    expect(created.status()).toBe(201);
    const ride = (await created.json()).data as { id: string };
    await host.actor.page.getByRole('button', { name: 'Publish ride', exact: true }).focus();
    await host.actor.page.keyboard.press('Enter');
    await expect(
      host.actor.page.locator('.status-badge').filter({ hasText: /^PUBLISHED$/ }),
    ).toBeVisible();
    const pax = await newActor(browser, `Seat Recovery Passenger ${randomUUID().slice(0, 6)}`);
    contexts.push(pax.context);
    await narrowKeyboardForm(pax.page, `/carpools/${ride.id}`);
    await pax.page.getByLabel('Seats to join', { exact: true }).fill('99');
    await pax.page.getByRole('button', { name: 'Join instantly', exact: true }).focus();
    await pax.page.keyboard.press('Enter');
    await expect(pax.page.getByLabel('Seats to join', { exact: true })).toBeFocused();
    await pax.page.getByLabel('Seats to join', { exact: true }).fill('2');
    await pax.page.getByLabel('Message to host (optional)').fill('Meet at the north gate');
    const expired = {
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Session expired' },
      }),
    };
    const seatPath = `**/api/v1/carpools/${ride.id}/seat-requests`;
    let expiredKey = '';
    await pax.page.route(seatPath, (route) => {
      expiredKey = route.request().headers()['idempotency-key']!;
      return route.fulfill(expired);
    });
    await pax.page.route('**/api/v1/auth/refresh', (route) => route.fulfill(expired));
    await pax.page.getByRole('button', { name: 'Join instantly', exact: true }).focus();
    await pax.page.keyboard.press('Enter');
    await expect(
      pax.page.getByRole('link', { name: 'Sign in to join', exact: true }),
    ).toBeVisible();
    await pax.page.unroute(seatPath);
    await pax.page.unroute('**/api/v1/auth/refresh');
    await pax.page.getByRole('link', { name: 'Sign in to join', exact: true }).click();
    await pax.page.getByLabel('Email address').fill(pax.email);
    await pax.page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await pax.page.getByRole('button', { name: 'Sign in', exact: true }).focus();
    await pax.page.keyboard.press('Enter');
    await expect(pax.page.getByLabel('Seats to join', { exact: true })).toHaveValue('2');
    await expect(pax.page.getByLabel('Message to host (optional)')).toHaveValue(
      'Meet at the north gate',
    );
    const list = async () => {
      const r = await pax.page.request.get('/api/v1/users/me/seat-requests', {
        headers: bearer(pax.token),
      });
      expect(r.status()).toBe(200);
      return (await r.json()).meta.total as number;
    };
    const before = await list();
    let savedId = '',
      savedKey = '',
      authorization = '';
    await pax.page.route(seatPath, async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      savedId = (await response.json()).data.id as string;
      savedKey = route.request().headers()['idempotency-key']!;
      authorization = route.request().headers()['authorization']!;
      await route.abort('connectionreset');
    });
    await pax.page.getByRole('button', { name: 'Join instantly', exact: true }).focus();
    await pax.page.keyboard.press('Enter');
    await expect(pax.page.getByRole('alert')).toBeFocused();
    await expect(pax.page.getByText('Your seat is confirmed.', { exact: true })).toHaveCount(0);
    expect(savedKey).toBe(expiredKey);
    await pax.page.unroute(seatPath);
    await pax.page.getByRole('button', { name: 'Reload ride', exact: true }).focus();
    await pax.page.keyboard.press('Enter');
    await expect(
      pax.page.getByRole('heading', { name: 'Your participation', exact: true }),
    ).toBeVisible();
    await expect(pax.page.getByRole('button', { name: 'Join instantly', exact: true })).toHaveCount(
      0,
    );
    const replay = await pax.page.request.post(`/api/v1/carpools/${ride.id}/seat-requests`, {
      headers: { Authorization: authorization, 'Idempotency-Key': savedKey },
      data: { seats: 2, message: 'Meet at the north gate' },
    });
    expect([200, 201]).toContain(replay.status());
    expect((await replay.json()).data.id).toBe(savedId);
    expect((await list()) - before).toBe(1);
    const parent = await pax.page.request.get(`/api/v1/carpools/${ride.id}`);
    expect((await parent.json()).data).toMatchObject({ confirmedSeats: 2, availableSeats: 1 });
  } finally {
    await closeContexts(contexts);
  }
});
