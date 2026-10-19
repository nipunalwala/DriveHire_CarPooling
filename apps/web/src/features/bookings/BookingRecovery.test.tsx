// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { BookingDto } from '@drivehire/contracts';

const { request, requestPage, ApiError, authState } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(message: string, status = 0, code = 'REQUEST_FAILED') {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }
  return {
    request: vi.fn(),
    requestPage: vi.fn(),
    ApiError,
    authState: { user: undefined as { id: string; roles: string[] } | undefined },
  };
});

vi.mock('../../auth/AuthProvider.js', () => ({
  useAuth: () => ({
    user: authState.user,
    ready: true,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
}));

vi.mock('../../api/client.js', () => ({
  api: { request, requestPage },
  ApiError,
}));

import { BookingDetailPage } from './BookingsPage.js';

const PASSENGER_USER = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  roles: ['PASSENGER'],
};

const DRIVER_USER = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  roles: ['DRIVER'],
};

const BOOKING: BookingDto = {
  id: '11111111-1111-4111-8111-111111111111',
  passengerId: PASSENGER_USER.id,
  service: 'DRIVER_HIRE',
  vehicleId: '22222222-2222-4222-8222-222222222222',
  driverId: DRIVER_USER.id,
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
      providerId: DRIVER_USER.id,
      kind: 'DRIVER',
      status: 'PENDING',
      decidedAt: null,
    },
  ],
};

const REASON = 'Plans changed, I cannot travel that day';

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/app/bookings/${BOOKING.id}`]}>
      <Routes>
        <Route path="/app/bookings/:id" element={<BookingDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function control(name: string) {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

function isDisabled(element: HTMLElement) {
  return (
    (element as HTMLButtonElement).disabled ||
    element.closest('fieldset[disabled]') !== null ||
    element.getAttribute('aria-disabled') === 'true'
  );
}

function expectRecoveryRequired(names: string[]) {
  const text = screen.getByRole('alert').textContent ?? '';
  expect(text).toMatch(/reload booking/i);
  expect(text).not.toMatch(/not (have )?been saved|was not saved/i);
  for (const name of names) {
    expect(isDisabled(control(name))).toBe(true);
  }
}

beforeEach(() => {
  request.mockReset();
  requestPage.mockReset();
  authState.user = DRIVER_USER;
});

afterEach(cleanup);

it('requires a reload after an uncertain driver acceptance instead of claiming the change was not saved', async () => {
  authState.user = DRIVER_USER;
  request.mockImplementation((_path: string, init?: RequestInit) =>
    (init?.method ?? 'GET') === 'GET'
      ? Promise.resolve(BOOKING)
      : Promise.reject(new ApiError('Your changes have not been saved.', 0)),
  );

  renderDetail();
  fireEvent.click(await screen.findByRole('button', { name: 'Accept request' }));

  await screen.findByRole('alert');
  await screen.findByRole('button', { name: 'Accept request' });
  expectRecoveryRequired(['Accept request', 'Reject request', 'Cancel booking']);

  fireEvent.click(screen.getByRole('button', { name: 'Reload booking' }));
  await waitFor(() => expect(isDisabled(control('Accept request'))).toBe(false));
});

it('treats a malformed successful booking response as an unknown outcome requiring a reload', async () => {
  authState.user = DRIVER_USER;
  request.mockImplementation((_path: string, init?: RequestInit) =>
    (init?.method ?? 'GET') === 'GET'
      ? Promise.resolve(BOOKING)
      : Promise.resolve({ id: BOOKING.id }),
  );

  renderDetail();
  fireEvent.click(await screen.findByRole('button', { name: 'Accept request' }));

  await screen.findByRole('alert');
  await screen.findByRole('button', { name: 'Accept request' });
  expectRecoveryRequired(['Accept request', 'Reject request', 'Cancel booking']);

  fireEvent.click(screen.getByRole('button', { name: 'Reload booking' }));
  await waitFor(() => expect(isDisabled(control('Accept request'))).toBe(false));
});

it('requires a reload after an uncertain passenger cancellation and keeps the entered reason', async () => {
  authState.user = PASSENGER_USER;
  request.mockImplementation((_path: string, init?: RequestInit) =>
    (init?.method ?? 'GET') === 'GET'
      ? Promise.resolve(BOOKING)
      : Promise.reject(new ApiError('Your changes have not been saved.', 0)),
  );

  renderDetail();
  const reason = (await screen.findByLabelText('Cancellation reason')) as HTMLInputElement;
  fireEvent.change(reason, { target: { value: REASON } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));

  await screen.findByRole('alert');
  await screen.findByRole('button', { name: 'Cancel booking' });
  expectRecoveryRequired(['Cancel booking']);
  expect((screen.getByLabelText('Cancellation reason') as HTMLInputElement).value).toBe(REASON);

  fireEvent.click(screen.getByRole('button', { name: 'Reload booking' }));
  await waitFor(() => expect(isDisabled(control('Cancel booking'))).toBe(false));
});
