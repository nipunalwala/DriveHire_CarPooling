// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 20000 });

const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  driver: '22222222-2222-4222-8222-222222222222',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function session(roles: string[], emailVerified = true) {
  return {
    accessToken: 'dashboard-test',
    expiresIn: 900,
    user: {
      id: ids.user,
      displayName: 'Alex Example',
      email: 'alex@example.test',
      emailVerified,
      roles,
      status: 'ACTIVE',
      createdAt: '2026-10-01T00:00:00Z',
    },
  };
}

function driver(verificationStatus: string, acceptingBookings: boolean) {
  return {
    id: ids.driver,
    displayName: 'Alex Example',
    cityId: null,
    verificationStatus,
    hourlyRateMinor: 25_000,
    currency: 'INR',
    acceptingBookings,
    version: 1,
    licenseNumber: 'KA0123456789',
    licenseCountry: 'IN',
    licenseExpiresOn: '2030-01-01',
  };
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});

async function renderDashboard(
  path: string,
  roles: string[],
  driverResponse?: () => Response,
  emailVerified = true,
) {
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/auth/refresh')) {
        return json({ success: true, data: session(roles, emailVerified) });
      }
      if (url.includes('/drivers/me')) {
        return driverResponse
          ? driverResponse()
          : json(
              { success: false, error: { code: 'NOT_FOUND', message: 'No driver profile.' } },
              404,
            );
      }
      return json({ success: true, data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    }),
  );
  const React = await import('react');
  const rtl = await import('@testing-library/react');
  const { MemoryRouter } = await import('react-router-dom');
  const { App } = await import('../../App.js');
  cleanup = rtl.cleanup;
  rtl.render(
    React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(App)),
  );
  return rtl;
}

function contentOf(main: HTMLElement) {
  const content = main.querySelector<HTMLElement>('.workspace-content');
  if (!content) throw new Error('Workspace content is missing.');
  return content;
}

it('leads a customer dashboard with one compact primary action and real management links', async () => {
  const { screen, within } = await renderDashboard('/app/dashboard', ['PASSENGER', 'ADMIN']);
  const main = await screen.findByRole('main');
  const content = contentOf(main);
  expect(
    await within(content).findByRole('heading', { level: 1, name: 'Welcome back, Alex.' }),
  ).toBeDefined();
  expect(within(content).queryByText('Your journey hub')).toBeNull();
  expect(within(content).queryByText('Your journey shortcuts')).toBeNull();
  expect(within(content).queryByText('One account, more ways to get there.')).toBeNull();
  expect(content.querySelectorAll('.button-primary')).toHaveLength(1);
  const primary = within(content).getByRole('link', { name: 'Find a driver' });
  expect(primary.className).toContain('button-primary');
  expect(primary.getAttribute('href')).toBe('/drivers');
  expect(within(content).getByRole('link', { name: 'Find a carpool' }).getAttribute('href')).toBe(
    '/carpools',
  );
  expect(within(content).getByRole('link', { name: 'Your bookings' }).getAttribute('href')).toBe(
    '/app/bookings',
  );
  expect(within(content).getByRole('link', { name: 'Carpool seats' }).getAttribute('href')).toBe(
    '/app/seats',
  );
  expect(within(content).getByText('Email verified')).toBeDefined();
  expect(within(content).getByRole('link', { name: 'Profile settings' }).getAttribute('href')).toBe(
    '/profile',
  );
  expect(within(content).getByRole('link', { name: 'Operations' }).getAttribute('href')).toBe(
    '/admin/operations',
  );
  expect(
    within(content).getByRole('link', { name: 'Qualification reviews' }).getAttribute('href'),
  ).toBe('/admin/verifications');
  expect(within(content).getByRole('link', { name: 'User accounts' }).getAttribute('href')).toBe(
    '/admin/users',
  );
  expect(within(content).getByRole('link', { name: 'Audit log' }).getAttribute('href')).toBe(
    '/admin/audit',
  );
});

it('shows an unverified customer the account step without hiding journey tools', async () => {
  const { screen, within } = await renderDashboard(
    '/app/dashboard',
    ['PASSENGER'],
    undefined,
    false,
  );
  const main = await screen.findByRole('main');
  const content = contentOf(main);
  expect(await within(content).findByText('Email not verified')).toBeDefined();
  const verify = within(content).getByRole('link', { name: 'Verify your email' });
  expect(verify.getAttribute('href')).toBe(
    `/verify-email?email=${encodeURIComponent('alex@example.test')}`,
  );
  expect(within(content).getByRole('link', { name: 'Your bookings' })).toBeDefined();
});

it('makes driver work and approved setup state visible without decorative panels', async () => {
  const { screen, within } = await renderDashboard(
    '/app/driver/dashboard',
    ['PASSENGER', 'DRIVER'],
    () => json({ success: true, data: driver('APPROVED', true) }),
  );
  const main = await screen.findByRole('main');
  const content = contentOf(main);
  expect(
    await within(content).findByRole('heading', { level: 1, name: 'Welcome back, Alex.' }),
  ).toBeDefined();
  expect(await within(content).findByText('APPROVED')).toBeDefined();
  expect(within(content).getByText('Your public listing is accepting bookings.')).toBeDefined();
  expect(within(content).queryByText('Everything for your service')).toBeNull();
  expect(within(content).queryByText('Drive with trust')).toBeNull();
  expect(content.querySelectorAll('.button-primary')).toHaveLength(1);
  const primary = within(content).getByRole('link', { name: 'View driver requests' });
  expect(primary.className).toContain('button-primary');
  expect(primary.getAttribute('href')).toBe('/app/driver/bookings');
  expect(within(content).getByRole('link', { name: 'Hosted carpools' }).getAttribute('href')).toBe(
    '/app/carpools',
  );
  expect(within(content).getByRole('link', { name: 'Availability' }).getAttribute('href')).toBe(
    '/driver/availability',
  );
  expect(
    within(content).getByRole('link', { name: 'Personal vehicles' }).getAttribute('href'),
  ).toBe('/vehicles');
});

it('puts qualification setup ahead of work when a driver has not started', async () => {
  const { screen, within } = await renderDashboard('/app/driver/dashboard', [
    'PASSENGER',
    'DRIVER',
  ]);
  const main = await screen.findByRole('main');
  const content = contentOf(main);
  expect(await within(content).findByText('Qualification not started')).toBeDefined();
  const primary = within(content).getByRole('link', { name: 'Set up qualification' });
  expect(primary.className).toContain('button-primary');
  expect(primary.getAttribute('href')).toBe('/driver/qualification');
  expect(
    within(content).getByRole('link', { name: 'View driver requests' }).getAttribute('href'),
  ).toBe('/app/driver/bookings');
});

it('explains an expired qualification and puts renewal ahead of accepting work', async () => {
  const { screen, within } = await renderDashboard(
    '/app/driver/dashboard',
    ['PASSENGER', 'DRIVER'],
    () => json({ success: true, data: driver('EXPIRED', false) }),
  );
  const main = await screen.findByRole('main');
  const content = contentOf(main);
  expect(await within(content).findByText('EXPIRED')).toBeDefined();
  expect(within(content).getByText('Qualification has expired.')).toBeDefined();
  const primary = within(content).getByRole('link', { name: 'Renew qualification' });
  expect(primary.className).toContain('button-primary');
  expect(primary.getAttribute('href')).toBe('/driver/qualification');
  expect(within(content).queryByText('Qualification not started')).toBeNull();
});

it('describes a saved draft as in progress instead of not started', async () => {
  const { screen, within } = await renderDashboard(
    '/app/driver/dashboard',
    ['PASSENGER', 'DRIVER'],
    () => json({ success: true, data: driver('DRAFT', false) }),
  );
  const main = await screen.findByRole('main');
  const content = contentOf(main);
  expect(await within(content).findByText('DRAFT')).toBeDefined();
  expect(within(content).getByText('Qualification draft saved.')).toBeDefined();
  expect(within(content).getByRole('link', { name: 'Continue qualification' })).toBeDefined();
  expect(within(content).queryByText('Qualification not started')).toBeNull();
});

it('keeps driver work links available when setup status cannot load', async () => {
  const { screen, within } = await renderDashboard(
    '/app/driver/dashboard',
    ['PASSENGER', 'DRIVER'],
    () =>
      json(
        { success: false, error: { code: 'SERVER_ERROR', message: 'Setup service unavailable.' } },
        500,
      ),
  );
  const main = await screen.findByRole('main');
  const content = contentOf(main);
  expect((await within(content).findByRole('alert')).textContent ?? '').toMatch(
    /could not load your driver setup/i,
  );
  expect(within(content).getByRole('button', { name: 'Retry setup check' })).toBeDefined();
  expect(within(content).getByRole('link', { name: 'Hosted carpools' })).toBeDefined();
});

it('preserves the role-specific dashboard redirects', async () => {
  const driverRedirect = await renderDashboard('/app/dashboard', ['PASSENGER', 'DRIVER'], () =>
    json({ success: true, data: driver('APPROVED', true) }),
  );
  const driverMain = await driverRedirect.screen.findByRole('main');
  expect(
    await driverRedirect.within(driverMain).findByRole('heading', { name: 'Your work' }),
  ).toBeDefined();
  driverRedirect.cleanup?.();

  const customerRedirect = await renderDashboard('/app/driver/dashboard', ['PASSENGER']);
  const customerMain = await customerRedirect.screen.findByRole('main');
  expect(
    await customerRedirect.within(customerMain).findByRole('heading', { name: 'Your journeys' }),
  ).toBeDefined();
  expect(customerRedirect.screen.queryByRole('heading', { name: 'Driver setup' })).toBeNull();
});
