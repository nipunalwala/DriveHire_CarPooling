// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { AuditEntryDto } from '@drivehire/contracts';

vi.setConfig({ testTimeout: 20000 });

const { requestPage, auth } = vi.hoisted(() => {
  const user = {
    id: '00000000-0000-4000-8000-000000000000',
    displayName: 'Admin',
    email: 'admin@example.com',
    emailVerified: true,
    roles: ['ADMIN'],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  return { requestPage: vi.fn(), auth: { user: user as unknown } };
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
  api: { request: vi.fn(), requestPage },
  ApiError: class ApiError extends Error {},
}));

import { AuditPage } from './AuditPage.js';

const ADMIN_USER = auth.user as {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  roles: string[];
  status: string;
  createdAt: string;
};

const ENTRY: AuditEntryDto = {
  id: '11111111-1111-4111-8111-111111111111',
  actorId: '22222222-2222-4222-8222-222222222222',
  action: 'ADMIN_USER_SUSPEND',
  subjectType: 'USER',
  subjectId: '33333333-3333-4333-8333-333333333333',
  reason:
    'Repeated policy violations were confirmed against the recorded journey history before suspension.',
  requestId: 'req-simulated-001',
  createdAt: '2026-05-01T09:30:00.000Z',
};

function page(data: unknown[], total = data.length) {
  return { success: true as const, data, meta: { page: 1, pageSize: 20, total } };
}

function lastQuery() {
  const calls = requestPage.mock.calls;
  const path = String(calls[calls.length - 1]?.[0] ?? '');
  return new URLSearchParams(path.split('?')[1] ?? '');
}

beforeEach(() => {
  auth.user = ADMIN_USER;
  requestPage.mockReset();
  requestPage.mockResolvedValue(page([ENTRY], 45));
});

afterEach(cleanup);

function renderPage(entries = ['/admin/audit']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <AuditPage />
    </MemoryRouter>,
  );
}

it('keeps audit filters in the URL and renders exact action, identity and reason data', async () => {
  renderPage(['/admin/audit?action=ADMIN_USER_SUSPEND&page=2']);
  expect(await screen.findByText('Admin User Suspend')).toBeDefined();
  expect(screen.getByText('ADMIN_USER_SUSPEND')).toBeDefined();
  expect(screen.getByText(ENTRY.actorId as string)).toBeDefined();
  expect(screen.getByText(ENTRY.reason as string)).toBeDefined();
  expect(screen.getByText('45 audit entries')).toBeDefined();
  expect(lastQuery().get('action')).toBe('ADMIN_USER_SUSPEND');
  expect(lastQuery().get('page')).toBe('2');
  expect(lastQuery().get('pageSize')).toBe('20');
});

it('applies actor and date filters as UTC bounds and resets them without losing the page reset', async () => {
  renderPage();
  await screen.findByText('ADMIN_USER_SUSPEND');
  const before = requestPage.mock.calls.length;

  fireEvent.change(screen.getByLabelText('Action'), {
    target: { value: 'ADMIN_VERIFICATION_APPROVE' },
  });
  fireEvent.change(screen.getByLabelText('Actor ID'), { target: { value: ENTRY.actorId } });
  fireEvent.change(screen.getByLabelText('From (local time)'), {
    target: { value: '2026-05-01T09:00' },
  });
  fireEvent.change(screen.getByLabelText('To (local time)'), {
    target: { value: '2026-05-02T09:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

  await waitFor(() => expect(requestPage.mock.calls.length).toBeGreaterThan(before));
  const applied = lastQuery();
  expect(applied.get('action')).toBe('ADMIN_VERIFICATION_APPROVE');
  expect(applied.get('actorId')).toBe(ENTRY.actorId);
  expect(applied.get('from')).toBe(new Date('2026-05-01T09:00').toISOString());
  expect(applied.get('to')).toBe(new Date('2026-05-02T09:00').toISOString());
  expect(applied.get('page')).toBe('1');

  fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
  await waitFor(() => {
    const reset = lastQuery();
    expect(reset.get('action')).toBeNull();
    expect(reset.get('actorId')).toBeNull();
    expect(reset.get('from')).toBeNull();
    expect(reset.get('to')).toBeNull();
    expect(reset.get('page')).toBeNull();
  });
});

it('rejects a reversed date range without issuing another request', async () => {
  renderPage();
  await screen.findByText('ADMIN_USER_SUSPEND');
  const before = requestPage.mock.calls.length;

  fireEvent.change(screen.getByLabelText('From (local time)'), {
    target: { value: '2026-05-02T09:00' },
  });
  fireEvent.change(screen.getByLabelText('To (local time)'), {
    target: { value: '2026-05-01T09:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

  expect((await screen.findByRole('alert')).textContent).toMatch(/after its start/i);
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(requestPage).toHaveBeenCalledTimes(before);
});

it('hides pagination for an empty result set', async () => {
  requestPage.mockResolvedValue(page([], 0));
  renderPage();
  expect(await screen.findByText('No audit entries match')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull();
});

it('keeps filters and retries a failed audit load from the toolbar', async () => {
  requestPage.mockRejectedValueOnce(new Error('Audit records are temporarily unavailable.'));
  renderPage(['/admin/audit?action=ADMIN_USER_SUSPEND&page=2']);
  expect((await screen.findByRole('alert')).textContent).toMatch(/temporarily unavailable/i);
  expect(screen.getByRole('alert').textContent).toMatch(/current filters have been kept/i);

  fireEvent.click(screen.getByRole('button', { name: 'Reload audit' }));
  expect(await screen.findByText('Admin User Suspend')).toBeDefined();
  expect(lastQuery().get('action')).toBe('ADMIN_USER_SUSPEND');
  expect(lastQuery().get('page')).toBe('2');
});

it('shows the forbidden state without requesting audit data', () => {
  const originalRoles = [...ADMIN_USER.roles];
  ADMIN_USER.roles = ['PASSENGER'];
  try {
    renderPage();
    expect(screen.getByText('Administrator access is required')).toBeDefined();
    expect(requestPage).not.toHaveBeenCalled();
  } finally {
    ADMIN_USER.roles = originalRoles;
  }
});
