// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const { auth, request } = vi.hoisted(() => ({
  auth: {
    user: null as null | Record<string, unknown>,
    setUser: vi.fn(),
    logout: vi.fn(),
  },
  request: vi.fn(),
}));

vi.mock('../../auth/AuthProvider.js', () => ({
  useAuth: () => ({
    user: auth.user,
    ready: true,
    login: vi.fn(),
    logout: auth.logout,
    setUser: auth.setUser,
  }),
}));

vi.mock('../../api/client.js', () => ({
  api: { request },
  ApiError: class ApiError extends Error {},
}));

import { ProfilePage } from './ProfilePage.js';

const PASSENGER = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Alex Example',
  email: 'alex@example.test',
  emailVerified: true,
  roles: ['PASSENGER'],
  status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00Z',
};

const DRIVER = { ...PASSENGER, roles: ['PASSENGER', 'DRIVER'] };
const ADMIN = { ...PASSENGER, roles: ['PASSENGER', 'ADMIN'] };

function renderPage() {
  render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.user = PASSENGER;
  auth.setUser.mockReset();
  auth.logout.mockReset();
  request.mockReset();
});

afterEach(cleanup);

it('puts personal details first and shows journey links to a passenger', () => {
  renderPage();
  const headings = screen.getAllByRole('heading').map((heading) => heading.textContent);
  expect(headings.indexOf('Personal details')).toBeLessThan(headings.indexOf('Your journeys'));
  expect(screen.getByRole('link', { name: 'Find a driver' }).getAttribute('href')).toBe('/drivers');
  expect(screen.getByRole('link', { name: 'Your bookings' }).getAttribute('href')).toBe(
    '/app/bookings',
  );
  expect(screen.queryByRole('link', { name: 'Qualification' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Manage your personal vehicles' })).toBeDefined();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
});

it('replaces customer shortcuts with driver tools for a driver', () => {
  auth.user = DRIVER;
  renderPage();
  expect(screen.queryByRole('link', { name: 'Find a driver' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Your bookings' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Qualification' }).getAttribute('href')).toBe(
    '/driver/qualification',
  );
  expect(screen.getByRole('link', { name: 'Availability' }).getAttribute('href')).toBe(
    '/driver/availability',
  );
  expect(screen.getByRole('link', { name: 'Driver requests' }).getAttribute('href')).toBe(
    '/app/driver/bookings',
  );
});

it('retains administration links for an administrator', () => {
  auth.user = ADMIN;
  renderPage();
  expect(screen.getByRole('link', { name: 'Qualification reviews' }).getAttribute('href')).toBe(
    '/admin/verifications',
  );
  expect(screen.getByRole('link', { name: 'Audit log' }).getAttribute('href')).toBe('/admin/audit');
});

it('saves edited personal details and reports success', async () => {
  const saved = {
    ...PASSENGER,
    displayName: 'Alex Updated',
    phone: '+919876543210',
  };
  request.mockResolvedValue(saved);
  renderPage();
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Alex Updated' } });
  fireEvent.change(screen.getByLabelText('Phone number (optional)'), {
    target: { value: '+919876543210' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  expect(await screen.findByText('Your profile has been saved.')).toBeDefined();
  expect(request).toHaveBeenCalledWith('/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ displayName: 'Alex Updated', phone: '+919876543210' }),
  });
  expect(auth.setUser).toHaveBeenCalledWith(saved);
  expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Alex Updated');
});

it('keeps entered details when the profile save fails', async () => {
  request.mockRejectedValue(new Error('Profile service unavailable.'));
  renderPage();
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Alex Retained' } });
  fireEvent.change(screen.getByLabelText('Phone number (optional)'), {
    target: { value: '+919876543210' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => {
    expect(screen.getByRole('alert').textContent).toContain('Profile service unavailable.');
  });
  expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Alex Retained');
  expect((screen.getByLabelText('Phone number (optional)') as HTMLInputElement).value).toBe(
    '+919876543210',
  );
});
