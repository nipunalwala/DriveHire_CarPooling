// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { CarpoolDto } from '@drivehire/contracts';
const { request, requestPage, ApiError, authState } = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public code = 'REQUEST_FAILED',
    ) {
      super(message);
    }
  }
  return {
    request: vi.fn(),
    requestPage: vi.fn(),
    ApiError,
    authState: { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', roles: ['PASSENGER'] } },
  };
});
vi.mock('../../auth/AuthProvider.js', () => ({
  useAuth: () => ({ user: authState.user, ready: true }),
}));
vi.mock('../../api/client.js', () => ({ api: { request, requestPage }, ApiError }));
import { CarpoolDetailPage } from './CarpoolDetailPage.js';
import { CarpoolNewPage } from './CarpoolNewPage.js';
const RIDE: CarpoolDto = {
  id: '11111111-1111-4111-8111-111111111111',
  hostId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  vehicleId: '22222222-2222-4222-8222-222222222222',
  tripId: '33333333-3333-4333-8333-333333333333',
  originCityId: '44444444-4444-4444-8444-444444444444',
  destinationCityId: '55555555-5555-4555-8555-555555555555',
  pickupNote: 'Main entrance',
  dropoffNote: 'Station entrance',
  startsAt: new Date(Date.now() + 3 * 3600000).toISOString(),
  endsAt: new Date(Date.now() + 5 * 3600000).toISOString(),
  seatsOffered: 2,
  confirmedSeats: 0,
  availableSeats: 2,
  pricePerSeatMinor: 12550,
  currency: 'INR',
  joinMode: 'INSTANT',
  status: 'PUBLISHED',
  version: 2,
  hostDisplayName: 'Approved Host',
  vehicleSummary: { make: 'Maruti', model: 'Swift', seats: 4 },
};
function detail() {
  return render(
    <MemoryRouter initialEntries={[`/carpools/${RIDE.id}`]}>
      <Routes>
        <Route path="/carpools/:id" element={<CarpoolDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  request.mockReset();
  requestPage.mockReset();
  authState.user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', roles: ['PASSENGER'] };
  requestPage.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 100, total: 0 } });
});
afterEach(cleanup);
it('unknown_join_preserves_message_and_same_key_after_reload_without_false_confirmation', async () => {
  request.mockImplementation((_path: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Promise.reject(new ApiError('Network unavailable', 0))
      : Promise.resolve(RIDE),
  );
  detail();
  const join = await screen.findByRole('button', { name: 'Join instantly' });
  fireEvent.change(screen.getByLabelText('Message to host (optional)'), {
    target: { value: 'Meet at the main gate' },
  });
  fireEvent.click(join);
  await screen.findByRole('alert');
  expect(screen.queryByText('Your seat is confirmed.')).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Join instantly' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByLabelText('Message to host (optional)') as HTMLInputElement).value).toBe(
    'Meet at the main gate',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reload ride' }));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Join instantly' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Join instantly' }));
  await screen.findByRole('alert');
  const keys = request.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(
      ([, init]) => ((init as RequestInit).headers as Record<string, string>)['Idempotency-Key'],
    );
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});
it('lost_final_seat_requires_refresh_and_never_displays_confirmation', async () => {
  let current = RIDE;
  request.mockImplementation((_path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      current = { ...RIDE, confirmedSeats: 2, availableSeats: 0, version: 3 };
      return Promise.reject(new ApiError('No seats remain', 409));
    }
    return Promise.resolve(current);
  });
  detail();
  fireEvent.click(await screen.findByRole('button', { name: 'Join instantly' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Your seat is confirmed.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reload ride' }));
  await screen.findByRole('heading', { name: 'This ride is full' });
  expect(screen.queryByRole('button', { name: 'Join instantly' })).toBeNull();
});
it('missing_owned_vehicle_links_to_real_onboarding', async () => {
  authState.user = { id: authState.user.id, roles: ['PASSENGER', 'DRIVER'] };
  render(
    <MemoryRouter>
      <CarpoolNewPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Add an approved personal vehicle' });
  expect(
    screen
      .getByRole('link', { name: 'Add your vehicle and submit it for review' })
      .getAttribute('href'),
  ).toBe('/vehicles');
  expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
});
