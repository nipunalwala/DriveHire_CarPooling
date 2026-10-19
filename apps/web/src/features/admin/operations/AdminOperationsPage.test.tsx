// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { BookingDto } from '@drivehire/contracts';

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

import { AdminOperationsPage } from './AdminOperationsPage.js';

const BOOKING_A: BookingDto = {
  id: '11111111-1111-4111-8111-111111111111',
  passengerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  service: 'DRIVER_HIRE',
  vehicleId: '22222222-2222-4222-8222-222222222222',
  driverId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  tripId: '33333333-3333-4333-8333-333333333333',
  status: 'PENDING',
  startsAt: '2026-06-01T09:00:00.000Z',
  endsAt: '2026-06-01T12:00:00.000Z',
  totalMinor: 135000,
  currency: 'INR',
  expiresAt: '2026-05-31T09:00:00.000Z',
  version: 1,
  paymentStatus: 'NOT_COLLECTED',
  decisions: [
    {
      providerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      kind: 'DRIVER',
      status: 'PENDING',
      decidedAt: null,
    },
  ],
};

const BOOKING_B: BookingDto = {
  ...BOOKING_A,
  id: '44444444-4444-4444-8444-444444444444',
  startsAt: '2026-06-02T09:00:00.000Z',
  endsAt: '2026-06-02T12:00:00.000Z',
};

const FROM_VALUE = '2026-06-01T09:00';
const TO_VALUE = '2026-06-30T18:00';

function operationsEnvelope(path: string) {
  const query = new URLSearchParams(path.split('?')[1] ?? '');
  const page = Number(query.get('page') ?? '1');
  return {
    success: true as const,
    data: [page === 1 ? BOOKING_A : BOOKING_B],
    meta: { page, pageSize: 20, total: 45 },
  };
}

beforeEach(() => {
  request.mockReset();
  requestPage.mockReset();
  request.mockRejectedValue(new Error('Unexpected request'));
  requestPage.mockImplementation((path: string) => Promise.resolve(operationsEnvelope(path)));
});

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminOperationsPage />
    </MemoryRouter>,
  );
}

function lastQuery() {
  const calls = requestPage.mock.calls;
  const path = String(calls[calls.length - 1]?.[0] ?? '');
  return new URLSearchParams(path.split('?')[1] ?? '');
}

it('applies From/To date filters as UTC bounds and resets page 2 to page 1', async () => {
  renderPage();
  await screen.findByText(`Reference: ${BOOKING_A.id}`);

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(requestPage).toHaveBeenCalledTimes(2));
  expect(String(requestPage.mock.calls[1]?.[0])).toContain('page=2');
  await screen.findByText(`Reference: ${BOOKING_B.id}`);

  const from = screen.getByLabelText('From') as HTMLInputElement;
  const to = screen.getByLabelText('To') as HTMLInputElement;
  expect(from.type).toBe('datetime-local');
  expect(to.type).toBe('datetime-local');

  fireEvent.change(from, { target: { value: FROM_VALUE } });
  fireEvent.change(to, { target: { value: TO_VALUE } });
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));

  await waitFor(() => expect(requestPage).toHaveBeenCalledTimes(3));
  const query = lastQuery();
  expect(query.get('page')).toBe('1');
  expect(query.get('from')).toBe(new Date(FROM_VALUE).toISOString());
  expect(query.get('to')).toBe(new Date(TO_VALUE).toISOString());
});

it('rejects reversed date bounds, preserves the inputs and sends no new query', async () => {
  renderPage();
  await screen.findByText(`Reference: ${BOOKING_A.id}`);
  const before = requestPage.mock.calls.length;

  const from = screen.getByLabelText('From') as HTMLInputElement;
  const to = screen.getByLabelText('To') as HTMLInputElement;
  fireEvent.change(from, { target: { value: TO_VALUE } });
  fireEvent.change(to, { target: { value: FROM_VALUE } });
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));

  const text = (await screen.findByRole('alert')).textContent ?? '';
  expect(text).toMatch(/(from|start)/i);
  expect(text).toMatch(/(to|end)/i);
  expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe(TO_VALUE);
  expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe(FROM_VALUE);

  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(requestPage).toHaveBeenCalledTimes(before);
});
