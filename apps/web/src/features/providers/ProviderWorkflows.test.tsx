// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

vi.setConfig({ testTimeout: 20000 });

const { request, requestPage, DRIVER_USER } = vi.hoisted(() => ({
  request: vi.fn(),
  requestPage: vi.fn(),
  DRIVER_USER: {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Alex Example',
    email: 'alex@example.test',
    emailVerified: true,
    roles: ['PASSENGER', 'DRIVER'],
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00Z',
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
import { DriverAvailabilityPage } from './DriverAvailabilityPage.js';

const CITY = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Pune',
  region: 'Maharashtra',
  country: 'IN',
  timezone: 'Asia/Kolkata',
};

const DRIVER = {
  id: '22222222-2222-4222-8222-222222222222',
  displayName: 'Alex Example',
  cityId: CITY.id,
  verificationStatus: 'DRAFT',
  hourlyRateMinor: 25000,
  currency: 'INR',
  acceptingBookings: false,
  version: 2,
  licenseNumber: 'MH0120230001234',
  licenseCountry: 'IN',
  licenseExpiresOn: '2030-04-30',
};

const VEHICLE = {
  id: '33333333-3333-4333-8333-333333333333',
  ownerId: DRIVER_USER.id,
  make: 'Toyota',
  model: 'Glanza',
  year: 2024,
  category: 'HATCHBACK',
  seats: 5,
  transmission: 'MANUAL',
  fuelType: 'PETROL',
  cityId: CITY.id,
  verificationStatus: 'DRAFT',
  archivedAt: null,
  version: 1,
  registrationNumber: 'MH12AB1234',
};

const WINDOW = {
  id: '55555555-5555-4555-8555-555555555555',
  startsAt: '2026-11-01T10:00:00.000Z',
  endsAt: '2026-11-01T12:00:00.000Z',
  kind: 'BLOCKED',
};

const page = (data: unknown[]) => ({
  success: true as const,
  data,
  meta: { page: 1, pageSize: 20, total: data.length },
});

function renderPage(pageComponent: ReactNode) {
  render(<MemoryRouter>{pageComponent}</MemoryRouter>);
}

async function selectServiceCity(value: string) {
  await waitFor(() =>
    expect((screen.getByLabelText('Service city') as HTMLSelectElement).matches(':disabled')).toBe(
      false,
    ),
  );
  fireEvent.change(screen.getByLabelText('Service city'), { target: { value } });
}

beforeEach(() => {
  request.mockReset();
  requestPage.mockReset();
  requestPage.mockImplementation((path: string) => {
    if (path.startsWith('/cities?')) return Promise.resolve(page([CITY]));
    if (path.includes('/documents?')) return Promise.resolve(page([]));
    return Promise.reject(new Error(`Unexpected request page ${path}`));
  });
});

afterEach(cleanup);

it.each([
  ['DRAFT', 'Draft saved'],
  ['PENDING', 'Under review'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Changes requested'],
  ['EXPIRED', 'Approval expired'],
])('shows the %s qualification state with explicit guidance', async (status, title) => {
  request.mockResolvedValue({
    ...DRIVER,
    verificationStatus: status,
    verificationReason:
      status === 'REJECTED' ? 'The uploaded license image is unreadable.' : undefined,
  });
  renderPage(<DriverQualificationPage />);

  expect(await screen.findByText(title)).toBeDefined();
  expect(screen.getAllByText(status).length).toBeGreaterThan(0);
  if (status === 'PENDING') {
    expect((screen.getByLabelText('License number') as HTMLInputElement).matches(':disabled')).toBe(
      true,
    );
  }
  if (status === 'REJECTED') {
    expect(screen.getByText('The uploaded license image is unreadable.')).toBeDefined();
  }
});

it('saves qualification details with the current version', async () => {
  request.mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/drivers/me' && init?.method === 'PUT') {
      return Promise.resolve({
        ...DRIVER,
        version: 3,
        licenseNumber: 'KA0120230009999',
        hourlyRateMinor: 45000,
      });
    }
    return Promise.resolve(DRIVER);
  });
  renderPage(<DriverQualificationPage />);
  await screen.findByText('Draft saved');

  fireEvent.change(screen.getByLabelText('License number'), {
    target: { value: 'KA0120230009999' },
  });
  fireEvent.change(screen.getByLabelText('License expiry date'), {
    target: { value: '2031-05-31' },
  });
  fireEvent.change(screen.getByLabelText('Hourly rate (INR)'), { target: { value: '450.00' } });
  await selectServiceCity(CITY.id);
  fireEvent.click(screen.getByRole('button', { name: 'Save driver details' }));

  expect(
    await screen.findByText('Driver details saved. Upload your license and submit for review.'),
  ).toBeDefined();
  const saveCall = request.mock.calls.find(
    ([path, init]) => path === '/drivers/me' && (init as RequestInit | undefined)?.method === 'PUT',
  );
  expect(saveCall).toBeDefined();
  const body = JSON.parse(String((saveCall?.[1] as RequestInit).body));
  expect(body).toMatchObject({
    version: 2,
    licenseNumber: 'KA0120230009999',
    licenseExpiresOn: '2031-05-31',
    serviceCityId: CITY.id,
    hourlyRateMinor: 45000,
  });
});

it('keeps the qualification draft when the server rejects the save', async () => {
  request.mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/drivers/me' && init?.method === 'PUT') {
      return Promise.reject(new Error('This qualification changed. Reload before retrying.'));
    }
    return Promise.resolve(DRIVER);
  });
  renderPage(<DriverQualificationPage />);
  await screen.findByText('Draft saved');

  fireEvent.change(screen.getByLabelText('License number'), {
    target: { value: 'KA0120230007777' },
  });
  fireEvent.change(screen.getByLabelText('Hourly rate (INR)'), { target: { value: '525.00' } });
  await selectServiceCity(CITY.id);
  fireEvent.click(screen.getByRole('button', { name: 'Save driver details' }));

  await waitFor(() => {
    expect(screen.getByRole('alert').textContent).toContain('This qualification changed.');
  });
  expect((screen.getByLabelText('License number') as HTMLInputElement).value).toBe(
    'KA0120230007777',
  );
  expect((screen.getByLabelText('Hourly rate (INR)') as HTMLInputElement).value).toBe('525.00');
  expect((screen.getByLabelText('Service city') as HTMLSelectElement).value).toBe(CITY.id);
});

it('adds a vehicle, saves the entered details and shows the selected result', async () => {
  let vehicles: unknown[] = [];
  requestPage.mockImplementation((path: string) => {
    if (path.startsWith('/cities?')) return Promise.resolve(page([CITY]));
    if (path.startsWith('/users/me/vehicles?')) return Promise.resolve(page(vehicles));
    if (path.includes('/documents?')) return Promise.resolve(page([]));
    return Promise.reject(new Error(`Unexpected request page ${path}`));
  });
  request.mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/vehicles' && init?.method === 'POST') {
      vehicles = [VEHICLE];
      return Promise.resolve(VEHICLE);
    }
    return Promise.reject(new Error(`Unexpected request ${path}`));
  });
  renderPage(<VehiclesPage />);

  expect(await screen.findByText('No personal vehicles yet')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));
  fireEvent.change(screen.getByLabelText('Registration number'), {
    target: { value: 'MH12AB1234' },
  });
  fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Toyota' } });
  fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Glanza' } });
  fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2024' } });
  fireEvent.change(screen.getByLabelText('Total seats, including driver'), {
    target: { value: '5' },
  });
  await waitFor(() =>
    expect((screen.getByLabelText('Service city') as HTMLSelectElement).matches(':disabled')).toBe(
      false,
    ),
  );
  fireEvent.change(screen.getByLabelText('Service city'), { target: { value: CITY.id } });
  fireEvent.click(screen.getByRole('button', { name: 'Save vehicle' }));

  expect(
    await screen.findByText(
      'Vehicle details saved. Add current evidence before submitting for approval.',
    ),
  ).toBeDefined();
  const saveCall = request.mock.calls.find(
    ([path, init]) => path === '/vehicles' && (init as RequestInit | undefined)?.method === 'POST',
  );
  expect(saveCall).toBeDefined();
  expect(JSON.parse(String((saveCall?.[1] as RequestInit).body))).toMatchObject({
    registrationNumber: 'MH12AB1234',
    make: 'Toyota',
    model: 'Glanza',
    year: 2024,
    seats: 5,
    cityId: CITY.id,
  });
  expect(await screen.findByRole('heading', { name: 'Toyota Glanza' })).toBeDefined();
});

it('shows selected vehicle evidence requirements after a populated list load', async () => {
  requestPage.mockImplementation((path: string) => {
    if (path.startsWith('/users/me/vehicles?'))
      return Promise.resolve(page([{ ...VEHICLE, verificationStatus: 'APPROVED' }]));
    if (path.includes('/documents?')) return Promise.resolve(page([]));
    return Promise.reject(new Error(`Unexpected request page ${path}`));
  });
  renderPage(<VehiclesPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Manage Toyota Glanza' }));
  expect(await screen.findByRole('heading', { name: 'Toyota Glanza' })).toBeDefined();
  expect(
    screen.getByText('Approved for use. Keep registration and insurance evidence current.'),
  ).toBeDefined();
  expect(
    (
      await screen.findAllByText(
        'Upload registration and insurance evidence to prepare for review.',
      )
    ).length,
  ).toBeGreaterThan(0);
});

it('saves a schedule window and shows the persisted window', async () => {
  let windows: unknown[] = [];
  requestPage.mockImplementation((path: string) => {
    if (path.startsWith('/drivers/me/availability?')) return Promise.resolve(page(windows));
    return Promise.reject(new Error(`Unexpected request page ${path}`));
  });
  request.mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/drivers/me/availability' && init?.method === 'POST') {
      windows = [WINDOW];
      return Promise.resolve({});
    }
    return Promise.reject(new Error(`Unexpected request ${path}`));
  });
  renderPage(<DriverAvailabilityPage />);

  expect(await screen.findByText('No time windows yet')).toBeDefined();
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-11-01T10:00' } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-11-01T12:00' } });
  fireEvent.click(screen.getByRole('radio', { name: /Keep this time free/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save time window' }));

  expect(await screen.findByText('Your schedule window has been saved.')).toBeDefined();
  const saveCall = request.mock.calls.find(
    ([path, init]) =>
      path === '/drivers/me/availability' && (init as RequestInit | undefined)?.method === 'POST',
  );
  expect(saveCall).toBeDefined();
  expect(JSON.parse(String((saveCall?.[1] as RequestInit).body))).toMatchObject({
    startsAt: new Date('2026-11-01T10:00').toISOString(),
    endsAt: new Date('2026-11-01T12:00').toISOString(),
    kind: 'BLOCKED',
  });
  const saved = screen.getByRole('heading', { name: 'Saved windows' }).closest('section');
  expect(saved).not.toBeNull();
  expect(await within(saved as HTMLElement).findByText('Keep this time free')).toBeDefined();
});

it('keeps entered schedule values when the server rejects a conflicting window', async () => {
  requestPage.mockImplementation((path: string) => {
    if (path.startsWith('/drivers/me/availability?')) return Promise.resolve(page([]));
    return Promise.reject(new Error(`Unexpected request page ${path}`));
  });
  request.mockRejectedValue(new Error('This window overlaps an existing booking.'));
  renderPage(<DriverAvailabilityPage />);
  await screen.findByText('No time windows yet');

  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-11-02T09:00' } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-11-02T11:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save time window' }));

  await waitFor(() => {
    expect(screen.getByRole('alert').textContent).toContain(
      'This window overlaps an existing booking.',
    );
  });
  expect((screen.getByLabelText('Starts') as HTMLInputElement).value).toBe('2026-11-02T09:00');
  expect((screen.getByLabelText('Ends') as HTMLInputElement).value).toBe('2026-11-02T11:00');
});
