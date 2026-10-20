// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const { request, requestPage, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  return { request: vi.fn(), requestPage: vi.fn(), ApiError };
});
vi.mock('../../api/client.js', () => ({ api: { request, requestPage }, ApiError }));
vi.mock('../../auth/AuthProvider.js', () => ({ useAuth: () => ({ user: { roles: ['DRIVER'] } }) }));
import { CarpoolNewPage } from './CarpoolNewPage.js';
const id = '11111111-1111-4111-8111-111111111111';
const vehicleId = '22222222-2222-4222-8222-222222222222';
const originCityId = '33333333-3333-4333-8333-333333333333';
const destinationCityId = '44444444-4444-4444-8444-444444444444';
const ride = {
  id,
  vehicleId,
  originCityId,
  destinationCityId,
  hostId: '55555555-5555-4555-8555-555555555555',
  tripId: '66666666-6666-4666-8666-666666666666',
  pickupNote: 'Original pickup',
  dropoffNote: 'Station',
  startsAt: new Date(Date.now() + 8 * 3600000).toISOString(),
  endsAt: new Date(Date.now() + 10 * 3600000).toISOString(),
  seatsOffered: 2,
  confirmedSeats: 0,
  availableSeats: 2,
  pricePerSeatMinor: 12500,
  currency: 'INR',
  joinMode: 'INSTANT',
  status: 'DRAFT',
  version: 1,
  hostDisplayName: 'Host',
  vehicleSummary: { make: 'Maruti', model: 'Swift', seats: 4 },
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('stale_draft_reload_preserves_entries_and_requires_reconciled_version', async () => {
  let current = ride;
  requestPage.mockImplementation((path: string) =>
    Promise.resolve({
      data: path.startsWith('/cities')
        ? [
            {
              id: originCityId,
              name: 'Pune',
              region: 'Maharashtra',
              country: 'IN',
              timezone: 'Asia/Kolkata',
            },
            {
              id: destinationCityId,
              name: 'Mumbai',
              region: 'Maharashtra',
              country: 'IN',
              timezone: 'Asia/Kolkata',
            },
          ]
        : [
            {
              id: vehicleId,
              ownerId: ride.hostId,
              cityId: originCityId,
              make: 'Maruti',
              model: 'Swift',
              year: 2024,
              seats: 4,
              category: 'HATCHBACK',
              transmission: 'MANUAL',
              fuelType: 'PETROL',
              verificationStatus: 'APPROVED',
              registrationNumber: 'TESTONLY',
              version: 1,
            },
          ],
      meta: { page: 1, pageSize: 100, total: 2 },
    }),
  );
  request.mockImplementation((_path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(init.body as string) as { version: number };
      if (body.version === 1) {
        current = { ...ride, version: 2, dropoffNote: 'Updated elsewhere' };
        return Promise.reject(new ApiError('This draft changed. Reload it.', 409));
      }
      return Promise.resolve({ ...current, version: 3 });
    }
    return Promise.resolve(current);
  });
  render(
    <MemoryRouter initialEntries={[`/app/carpools/${id}/edit`]}>
      <Routes>
        <Route path="/app/carpools/:id/edit" element={<CarpoolNewPage />} />
        <Route path="/carpools/:id" element={<p>Saved successfully</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Save draft' });
  await waitFor(() =>
    expect((screen.getByLabelText('Origin') as HTMLSelectElement).value).toBe(originCityId),
  );
  fireEvent.change(screen.getByLabelText('Pickup note'), {
    target: { value: 'Keep my new meeting point' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Carpool draft' }));
  await screen.findByRole('alert');
  expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reload draft, keep my entries' }));
  await screen.findByText(/latest saved version is loaded/i);
  expect((screen.getByLabelText('Pickup note') as HTMLInputElement).value).toBe(
    'Keep my new meeting point',
  );
  fireEvent.submit(screen.getByRole('form', { name: 'Carpool draft' }));
  await screen.findByText('Saved successfully');
  const saves = request.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
  );
  expect(JSON.parse((saves[1]![1] as RequestInit).body as string)).toMatchObject({
    version: 2,
    pickupNote: 'Keep my new meeting point',
  });
});
