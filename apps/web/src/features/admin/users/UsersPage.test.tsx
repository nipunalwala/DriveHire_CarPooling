// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { UserDto } from '@drivehire/contracts';

vi.setConfig({ testTimeout: 20000 });

const { request, requestPage, auth } = vi.hoisted(() => {
  const user = {
    id: '00000000-0000-4000-8000-000000000000',
    displayName: 'Admin',
    email: 'admin@example.com',
    emailVerified: true,
    roles: ['ADMIN'],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  return { request: vi.fn(), requestPage: vi.fn(), auth: { user: user as unknown } };
});

vi.mock('../../../auth/AuthProvider.js', () => ({
  useAuth: () => ({
    user: auth.user,
    ready: true,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
}));

vi.mock('../../../api/client.js', () => ({
  api: { request, requestPage },
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly status = 0,
      readonly code = 'REQUEST_FAILED',
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { UsersPage } from './UsersPage.js';

const ADMIN_USER = auth.user as UserDto;

const ACCOUNT: UserDto = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Asha Venkataraman-Rao',
  email: 'asha.venkataraman.rao@example.test',
  emailVerified: true,
  roles: ['PASSENGER', 'DRIVER'],
  status: 'ACTIVE',
  createdAt: '2026-02-03T10:15:00.000Z',
};

const SUSPENDED: UserDto = { ...ACCOUNT, status: 'SUSPENDED' };

function page(data: unknown[], total = data.length, pageNumber = 1) {
  return {
    success: true as const,
    data,
    meta: { page: pageNumber, pageSize: 20, total },
  };
}

beforeEach(() => {
  auth.user = ADMIN_USER;
  request.mockReset();
  requestPage.mockReset();
  requestPage.mockImplementation((path: string) => {
    const query = new URLSearchParams(path.split('?')[1] ?? '');
    return Promise.resolve(page([ACCOUNT], 23, Number(query.get('page') ?? '1')));
  });
  request.mockImplementation((path: string) => {
    if (path.endsWith('/suspend')) return Promise.resolve(SUSPENDED);
    if (path === `/admin/users/${ACCOUNT.id}`) return Promise.resolve(ACCOUNT);
    return Promise.reject(new Error(`Unexpected request ${path}`));
  });
});

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>,
  );
}

function lastQuery() {
  const calls = requestPage.mock.calls;
  const path = String(calls[calls.length - 1]?.[0] ?? '');
  return new URLSearchParams(path.split('?')[1] ?? '');
}

it('selects an account, requires an audited reason and refreshes the row after suspension', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: `Manage ${ACCOUNT.displayName}` }));

  await screen.findByRole('heading', { name: ACCOUNT.displayName });
  expect(screen.getAllByText('Passenger · Driver')).toHaveLength(2);
  expect(screen.getByText(ACCOUNT.id)).toBeDefined();

  const form = screen.getByRole('form', { name: 'Change account access' });
  fireEvent.submit(form);
  expect((await screen.findByRole('alert')).textContent).toMatch(/reason/i);
  expect(request).toHaveBeenCalledTimes(1);

  fireEvent.change(screen.getByLabelText('Reason'), {
    target: { value: 'Repeated policy violations on recorded journeys' },
  });
  fireEvent.submit(form);

  await screen.findByText('User suspended. Their active sessions are revoked.');
  expect(request).toHaveBeenCalledWith(`/admin/users/${ACCOUNT.id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Repeated policy violations on recorded journeys' }),
  });
  await waitFor(() => expect(requestPage).toHaveBeenCalledTimes(2));
});

it('keeps search, status and role filters in the URL and resets to page one', async () => {
  renderPage();
  await screen.findByRole('button', { name: `Manage ${ACCOUNT.displayName}` });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(lastQuery().get('page')).toBe('2'));

  fireEvent.change(screen.getByLabelText('Account status'), {
    target: { value: 'SUSPENDED' },
  });
  await waitFor(() => expect(lastQuery().get('status')).toBe('SUSPENDED'));
  expect(lastQuery().get('page')).toBe('1');

  fireEvent.change(screen.getByLabelText('Account role'), { target: { value: 'DRIVER' } });
  fireEvent.change(screen.getByLabelText('Search name or email'), {
    target: { value: 'asha' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search users' }));

  await waitFor(() => {
    const query = lastQuery();
    expect(query.get('search')).toBe('asha');
    expect(query.get('status')).toBe('SUSPENDED');
    expect(query.get('role')).toBe('DRIVER');
    expect(query.get('page')).toBe('1');
  });
});

it('reports a failed account load without claiming that no accounts match', async () => {
  requestPage.mockRejectedValueOnce(new Error('Account records are temporarily unavailable.'));
  renderPage();
  expect((await screen.findByRole('alert')).textContent).toMatch(/temporarily unavailable/i);
  expect(screen.queryByText('No accounts match')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
});

it('retries a failed account load from the toolbar and restores the filtered rows', async () => {
  requestPage.mockRejectedValueOnce(new Error('Account records are temporarily unavailable.'));
  renderPage();
  expect((await screen.findByRole('alert')).textContent).toMatch(/temporarily unavailable/i);

  fireEvent.click(screen.getByRole('button', { name: 'Reload users' }));
  expect(
    await screen.findByRole('button', { name: `Manage ${ACCOUNT.displayName}` }),
  ).toBeDefined();
  expect(requestPage).toHaveBeenCalledTimes(2);
});

it('shows the forbidden state without requesting account data', () => {
  auth.user = { ...ADMIN_USER, roles: ['PASSENGER'] };
  renderPage();
  expect(screen.getByText('Administrator access is required')).toBeDefined();
  expect(requestPage).not.toHaveBeenCalled();
});
