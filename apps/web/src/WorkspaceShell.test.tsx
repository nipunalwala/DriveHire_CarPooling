// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 20000 });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function session(roles: string[]) {
  return {
    accessToken: 'workspace-shell-test',
    expiresIn: 900,
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      displayName: 'Alex Example',
      email: 'alex@example.test',
      emailVerified: true,
      roles,
      status: 'ACTIVE',
      createdAt: '2026-10-01T00:00:00Z',
    },
  };
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});

async function renderApp(path: string, roles?: string[]) {
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/auth/refresh')) {
        return roles
          ? json({ success: true, data: session(roles) })
          : json(
              { success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required' } },
              401,
            );
      }
      return json({ success: true, data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    }),
  );
  const React = await import('react');
  const rtl = await import('@testing-library/react');
  const { MemoryRouter } = await import('react-router-dom');
  const { App } = await import('./App.js');
  cleanup = rtl.cleanup;
  rtl.render(
    React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(App)),
  );
  await rtl.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return rtl;
}

it('keeps signed-out public browsing free of a workspace sidebar', async () => {
  const { screen } = await renderApp('/drivers');
  expect(screen.queryByRole('complementary', { name: 'Workspace navigation' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeDefined();
});

it('shows customer journeys and exactly one active destination', async () => {
  const { screen, within } = await renderApp('/app/dashboard', ['PASSENGER']);
  const sidebar = screen.getByRole('complementary', { name: 'Workspace navigation' });
  expect(within(sidebar).getByRole('link', { name: /Find a driver/ })).toBeDefined();
  expect(within(sidebar).getByRole('link', { name: /Your bookings/ })).toBeDefined();
  expect(within(sidebar).queryByRole('link', { name: /Qualification/ })).toBeNull();
  expect(within(sidebar).queryByRole('link', { name: /Operations/ })).toBeNull();
  expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1);
  expect(screen.getByRole('link', { current: 'page', name: /Dashboard/ })).toBeDefined();
});

it('uses driver tools for drivers instead of customer journeys', async () => {
  const { screen, within } = await renderApp('/app/driver/dashboard', ['PASSENGER', 'DRIVER']);
  const sidebar = screen.getByRole('complementary', { name: 'Workspace navigation' });
  expect(within(sidebar).getByRole('link', { name: /Qualification/ })).toBeDefined();
  expect(within(sidebar).getByRole('link', { name: /Availability/ })).toBeDefined();
  expect(within(sidebar).getByRole('link', { name: /Driver requests/ })).toBeDefined();
  expect(within(sidebar).queryByRole('link', { name: /Find a driver/ })).toBeNull();
  expect(within(sidebar).queryByRole('link', { name: /Operations/ })).toBeNull();
});

it('retains driver and administration groups for combined roles', async () => {
  const { screen, within } = await renderApp('/app/driver/bookings', [
    'PASSENGER',
    'DRIVER',
    'ADMIN',
  ]);
  const sidebar = screen.getByRole('complementary', { name: 'Workspace navigation' });
  expect(within(sidebar).getByRole('link', { name: /Qualification/ })).toBeDefined();
  expect(within(sidebar).getByRole('link', { name: /Operations/ })).toBeDefined();
  expect(within(sidebar).getByRole('link', { name: /User accounts/ })).toBeDefined();
  expect(within(sidebar).queryByRole('link', { name: /Find a driver/ })).toBeNull();
  const current = screen.getAllByRole('link', { current: 'page' });
  expect(current).toHaveLength(1);
  expect(current[0]?.textContent).toContain('Driver requests');
});

it('gives administrators customer and administration groups without driver tools', async () => {
  const { screen, within } = await renderApp('/admin/operations', ['PASSENGER', 'ADMIN']);
  const sidebar = screen.getByRole('complementary', { name: 'Workspace navigation' });
  expect(within(sidebar).getByRole('link', { name: /Find a driver/ })).toBeDefined();
  expect(within(sidebar).getByRole('link', { name: /Operations/ })).toBeDefined();
  expect(within(sidebar).queryByRole('link', { name: /Qualification/ })).toBeNull();
  const current = screen.getAllByRole('link', { current: 'page' });
  expect(current).toHaveLength(1);
  expect(current[0]?.textContent).toContain('Operations');
});
