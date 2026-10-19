// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const { request, requestPage, DRIVER_USER } = vi.hoisted(() => ({
  request: vi.fn(),
  requestPage: vi.fn(),
  DRIVER_USER: {
    id: '00000000-0000-4000-8000-000000000001',
    displayName: 'Driver',
    email: 'driver@example.com',
    emailVerified: true,
    roles: ['DRIVER'],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
}));

vi.mock('../../auth/AuthProvider.js', () => ({
  useAuth: () => ({
    user: DRIVER_USER,
    ready: true,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
}));

vi.mock('../../api/client.js', () => ({
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

import { DriverQualificationPage } from './DriverQualificationPage.js';
import { VehiclesPage } from './VehiclesPage.js';

const CITY = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Pune',
  region: 'Maharashtra',
  country: 'IN',
  timezone: 'Asia/Kolkata',
};

const DRIVER_REASON = 'License photo is unreadable. Upload a clearer scan of the front page.';
const VEHICLE_REASON = 'Registration certificate does not match the entered registration number.';

const DRIVER = {
  id: '22222222-2222-4222-8222-222222222222',
  displayName: 'Driver',
  cityId: CITY.id,
  verificationStatus: 'REJECTED',
  hourlyRateMinor: 45000,
  currency: 'INR',
  acceptingBookings: false,
  version: 2,
  licenseNumber: 'MH0120230001234',
  licenseCountry: 'IN',
  licenseExpiresOn: '2030-04-30',
  verificationReason: DRIVER_REASON,
};

const VEHICLE = {
  id: '33333333-3333-4333-8333-333333333333',
  ownerId: DRIVER_USER.id,
  make: 'Honda',
  model: 'City',
  year: 2021,
  category: 'SEDAN',
  seats: 5,
  transmission: 'AUTOMATIC',
  fuelType: 'PETROL',
  cityId: CITY.id,
  verificationStatus: 'REJECTED',
  archivedAt: null,
  version: 3,
  registrationNumber: 'MH12AB1234',
  verificationReason: VEHICLE_REASON,
};

function page(data: unknown[]) {
  return { success: true as const, data, meta: { page: 1, pageSize: 20, total: data.length } };
}

beforeEach(() => {
  request.mockReset();
  requestPage.mockReset();
  request.mockImplementation((path: string) => {
    if (path === '/drivers/me') return Promise.resolve(DRIVER);
    return Promise.reject(new Error(`Unexpected request ${path}`));
  });
  requestPage.mockImplementation((path: string) => {
    if (path.startsWith('/cities?')) return Promise.resolve(page([CITY]));
    if (path.startsWith('/users/me/vehicles?')) return Promise.resolve(page([VEHICLE]));
    if (path.endsWith('/documents?page=1&pageSize=20')) return Promise.resolve(page([]));
    return Promise.reject(new Error(`Unexpected request page ${path}`));
  });
});

afterEach(cleanup);

it('shows the persisted rejection reason for a rejected driver qualification', async () => {
  render(
    <MemoryRouter>
      <DriverQualificationPage />
    </MemoryRouter>,
  );

  await screen.findByText('REJECTED');

  expect(screen.getByText(DRIVER_REASON)).toBeTruthy();
});

it('shows the persisted rejection reason for a rejected vehicle after managing it', async () => {
  render(
    <MemoryRouter>
      <VehiclesPage />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Manage Honda City' }));

  expect(await screen.findByText(VEHICLE_REASON)).toBeTruthy();
});
