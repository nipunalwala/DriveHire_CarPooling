// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { BookingDto, CarpoolDto, DriverDto, TripDto } from '@drivehire/contracts';

const { request, requestPage, ApiError, authState } = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      message: string,
      public status = 0,
      public code = 'REQUEST_FAILED',
    ) {
      super(message);
      this.name = 'ApiError';
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
  useAuth: () => ({ user: authState.user, ready: true }),
}));

vi.mock('../../api/client.js', () => ({
  api: { request, requestPage },
  ApiError,
}));

import { DriversPage } from '../drivers/DriversPage.js';
import { BookingsPage } from '../bookings/BookingsPage.js';
import { BookingDetailPage } from '../bookings/BookingsPage.js';
import { CarpoolDetailPage } from '../carpools/CarpoolDetailPage.js';
import { CarpoolNewPage } from '../carpools/CarpoolNewPage.js';
import { TripPage } from '../trips/TripPage.js';

const cityId = '11111111-1111-4111-8111-111111111111';
const driverId = '22222222-2222-4222-8222-222222222222';

const PASSENGER = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  roles: ['PASSENGER'],
};

const DRIVER: DriverDto = {
  id: driverId,
  displayName: 'Asha Driver',
  cityId,
  verificationStatus: 'APPROVED',
  hourlyRateMinor: 25000,
  currency: 'INR',
  acceptingBookings: true,
  bio: 'Simulated driver for UI verification only.',
  version: 1,
};

const BOOKING: BookingDto = {
  id: '33333333-3333-4333-8333-333333333333',
  passengerId: PASSENGER.id,
  service: 'DRIVER_HIRE',
  vehicleId: '44444444-4444-4444-8444-444444444444',
  driverId,
  tripId: '55555555-5555-4555-8555-555555555555',
  status: 'CONFIRMED',
  startsAt: '2026-11-01T09:00:00.000Z',
  endsAt: '2026-11-01T12:00:00.000Z',
  totalMinor: 135000,
  currency: 'INR',
  expiresAt: '2026-10-31T09:00:00.000Z',
  version: 2,
  paymentStatus: 'NOT_COLLECTED',
  decisions: [
    {
      providerId: driverId,
      kind: 'DRIVER',
      status: 'ACCEPTED',
      decidedAt: '2026-10-21T09:00:00.000Z',
    },
  ],
};

const RIDE: CarpoolDto = {
  id: '66666666-6666-4666-8666-666666666666',
  hostId: '77777777-7777-4777-8777-777777777777',
  vehicleId: '44444444-4444-4444-8444-444444444444',
  tripId: '55555555-5555-4555-8555-555555555555',
  originCityId: cityId,
  destinationCityId: '88888888-8888-4888-8888-888888888888',
  pickupNote: 'Main entrance',
  dropoffNote: 'Station entrance',
  startsAt: '2026-11-02T09:00:00.000Z',
  endsAt: '2026-11-02T12:00:00.000Z',
  seatsOffered: 3,
  confirmedSeats: 1,
  availableSeats: 2,
  pricePerSeatMinor: 12550,
  currency: 'INR',
  joinMode: 'INSTANT',
  status: 'PUBLISHED',
  version: 3,
  hostDisplayName: 'Approved Host',
  vehicleSummary: { make: 'Maruti', model: 'Swift', seats: 4 },
};

const TRIP: TripDto = {
  id: '55555555-5555-4555-8555-555555555555',
  kind: 'BOOKING',
  status: 'ASSIGNED',
  driverId,
  vehicleId: '44444444-4444-4444-8444-444444444444',
  startsAt: '2026-11-01T09:00:00.000Z',
  endsAt: '2026-11-01T12:00:00.000Z',
  version: 1,
  incidentFlag: false,
};

const page = <T,>(data: T[], pageSize = 20, total = data.length) => ({
  success: true,
  data,
  meta: { page: 1, pageSize, total },
});

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-search">{location.search}</span>;
}

beforeEach(() => {
  request.mockReset();
  requestPage.mockReset();
  authState.user = PASSENGER;
  requestPage.mockResolvedValue(page([]));
});

afterEach(cleanup);

it('driver search restores URL filters, labels status and hides single-page controls', async () => {
  requestPage.mockImplementation((path: string) =>
    path.startsWith('/drivers')
      ? Promise.resolve(page([DRIVER]))
      : Promise.resolve(
          page(
            [
              {
                id: cityId,
                name: 'Bengaluru',
                region: 'Karnataka',
                country: 'IN',
                timezone: 'Asia/Kolkata',
              },
            ],
            100,
          ),
        ),
  );

  render(
    <MemoryRouter
      initialEntries={[
        `/drivers?cityId=${cityId}&maxHourlyRateMinor=25000&startsAt=2026-11-01T09%3A00%3A00.000Z&endsAt=2026-11-01T12%3A00%3A00.000Z`,
      ]}
    >
      <DriversPage />
    </MemoryRouter>,
  );

  await screen.findByRole('heading', { name: 'Asha Driver' });
  expect(screen.getByText('Approved')).toBeTruthy();
  expect(screen.getByText('1 driver')).toBeTruthy();
  expect((screen.getByLabelText('City') as HTMLSelectElement).value).toBe(cityId);
  expect((screen.getByLabelText('Maximum hourly rate') as HTMLInputElement).value).toBe('250');
  expect((screen.getByLabelText('Starts at') as HTMLInputElement).value).not.toBe('');
  expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
});

it('booking list explains human status and keeps the status filter in the URL', async () => {
  requestPage.mockResolvedValue(page([BOOKING]));

  render(
    <MemoryRouter initialEntries={['/app/bookings?status=CONFIRMED']}>
      <BookingsPage />
      <LocationProbe />
    </MemoryRouter>,
  );

  await screen.findByText('The driver accepted this request. The journey is confirmed.');
  expect(screen.getByText('1 booking')).toBeTruthy();
  expect((screen.getByLabelText('Booking status') as HTMLSelectElement).value).toBe('CONFIRMED');
  expect(screen.getByTestId('location-search').textContent).toContain('status=CONFIRMED');
  expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();

  fireEvent.change(screen.getByLabelText('Booking status'), {
    target: { value: 'PENDING' },
  });
  await waitFor(() =>
    expect(screen.getByTestId('location-search').textContent).toContain('status=PENDING'),
  );
});

it('missing booking shows an unavailable state with a return action', async () => {
  request.mockRejectedValue(new ApiError('This booking is unavailable.', 404));

  render(
    <MemoryRouter initialEntries={[`/app/bookings/${BOOKING.id}`]}>
      <Routes>
        <Route path="/app/bookings/:id" element={<BookingDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

  await screen.findByRole('heading', { name: 'Booking unavailable' });
  expect(screen.getByRole('link', { name: 'Return to your bookings' }).getAttribute('href')).toBe(
    '/app/bookings',
  );
});

it('missing carpool shows an unavailable state with a return action', async () => {
  request.mockRejectedValue(new ApiError('This ride is unavailable.', 404));

  render(
    <MemoryRouter initialEntries={[`/carpools/${RIDE.id}`]}>
      <Routes>
        <Route path="/carpools/:id" element={<CarpoolDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

  await screen.findByRole('heading', { name: 'Carpool unavailable' });
  expect(screen.getByRole('link', { name: 'Return to carpool search' }).getAttribute('href')).toBe(
    '/carpools',
  );
});

it('missing trip shows an unavailable state with a return action', async () => {
  request.mockRejectedValue(new ApiError('This trip is unavailable.', 404));

  render(
    <MemoryRouter initialEntries={[`/app/trips/${TRIP.id}`]}>
      <Routes>
        <Route path="/app/trips/:id" element={<TripPage />} />
      </Routes>
    </MemoryRouter>,
  );

  await screen.findByRole('heading', { name: 'Trip unavailable' });
  expect(screen.getByRole('link', { name: 'Return to your bookings' }).getAttribute('href')).toBe(
    '/app/bookings',
  );
});

it('missing carpool draft shows an unavailable state before any edit form', async () => {
  authState.user = { ...PASSENGER, roles: ['PASSENGER', 'DRIVER'] };
  requestPage.mockResolvedValue(
    page([
      {
        id: '99999999-9999-4999-8999-999999999999',
        ownerId: PASSENGER.id,
        make: 'Toyota',
        model: 'Glanza',
        year: 2024,
        category: 'HATCHBACK',
        seats: 5,
        transmission: 'MANUAL',
        fuelType: 'PETROL',
        cityId,
        verificationStatus: 'APPROVED',
        registrationNumber: 'TEST-01',
        version: 1,
      },
    ]),
  );
  request.mockRejectedValue(new ApiError('This draft is unavailable.', 404));

  render(
    <MemoryRouter initialEntries={[`/app/carpools/${RIDE.id}/edit`]}>
      <Routes>
        <Route path="/app/carpools/:id/edit" element={<CarpoolNewPage />} />
      </Routes>
    </MemoryRouter>,
  );

  await screen.findByRole('heading', { name: 'Carpool draft unavailable' });
  expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
});
