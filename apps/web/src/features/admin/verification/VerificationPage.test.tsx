// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const { request, requestPage, ADMIN_USER } = vi.hoisted(() => ({
  request: vi.fn(),
  requestPage: vi.fn(),
  ADMIN_USER: {
    id: '00000000-0000-4000-8000-000000000000',
    displayName: 'Admin',
    email: 'admin@example.com',
    emailVerified: true,
    roles: ['ADMIN'],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
}));

vi.mock('../../../auth/AuthProvider.js', () => ({
  useAuth: () => ({
    user: ADMIN_USER,
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

import { VerificationPage } from './VerificationPage.js';

const REQUEST_A = {
  id: '11111111-1111-4111-8111-111111111111',
  subjectType: 'DRIVER',
  subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  status: 'PENDING',
  version: 1,
  documentIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
  submittedAt: '2026-05-01T09:00:00.000Z',
};

const REQUEST_B = {
  id: '22222222-2222-4222-8222-222222222222',
  subjectType: 'VEHICLE',
  subjectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  status: 'PENDING',
  version: 1,
  documentIds: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
  submittedAt: '2026-05-02T09:00:00.000Z',
};

function page(data: unknown[]) {
  return { success: true as const, data, meta: { page: 1, pageSize: 20, total: data.length } };
}

beforeEach(() => {
  request.mockReset();
  requestPage.mockReset();
  requestPage.mockResolvedValue(page([REQUEST_A, REQUEST_B]));
  request.mockImplementation((path: string) => {
    if (path.endsWith('/decision')) return Promise.reject(new Error('decision not expected'));
    const id = path.split('/').pop();
    if (id === REQUEST_A.id) return Promise.resolve(REQUEST_A);
    if (id === REQUEST_B.id) return Promise.resolve(REQUEST_B);
    return Promise.reject(new Error(`Unexpected request ${path}`));
  });
});

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <VerificationPage />
    </MemoryRouter>,
  );
}

it('clears an unsaved decision and reason when the admin switches to another request', async () => {
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: 'Review driver request 1' }));
  await screen.findByRole('form', { name: 'Review decision' });

  const decision = screen.getByLabelText('Decision') as HTMLSelectElement;
  const reason = screen.getByLabelText('Reason') as HTMLInputElement;
  fireEvent.change(decision, { target: { value: 'APPROVE' } });
  fireEvent.change(reason, { target: { value: 'Documents look valid for this driver' } });
  expect(decision.value).toBe('APPROVE');
  expect(reason.value).toBe('Documents look valid for this driver');

  fireEvent.click(screen.getByRole('button', { name: 'Review vehicle request 2' }));
  await screen.findByText(
    (_, element) => element?.textContent === `Request reference: ${REQUEST_B.id}`,
  );

  expect((screen.getByLabelText('Decision') as HTMLSelectElement).value).toBe('');
  expect((screen.getByLabelText('Reason') as HTMLInputElement).value).toBe('');
});

it('keeps the draft reason when the same request is reloaded for conflict recovery', async () => {
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: 'Review driver request 1' }));
  await screen.findByRole('form', { name: 'Review decision' });

  const reason = screen.getByLabelText('Reason') as HTMLInputElement;
  fireEvent.change(reason, { target: { value: 'Kept for conflict recovery after a 409' } });

  fireEvent.click(screen.getByRole('button', { name: 'Reload review' }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));

  await waitFor(() =>
    expect((screen.getByLabelText('Reason') as HTMLInputElement).value).toBe(
      'Kept for conflict recovery after a 409',
    ),
  );
});
