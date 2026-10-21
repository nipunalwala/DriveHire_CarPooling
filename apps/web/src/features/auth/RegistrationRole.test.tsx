// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthForm } from './AuthForm.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../api/client.js', () => ({ api: { request } }));
vi.mock('../../auth/AuthProvider.js', () => ({ useAuth: () => ({}) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function showForm() {
  render(
    <MemoryRouter>
      <AuthForm mode="register" />
    </MemoryRouter>,
  );
}

it('uses one native radio group for customer and driver keyboard navigation', () => {
  showForm();
  const customer = screen.getByRole('radio', { name: 'Customer' }) as HTMLInputElement;
  const driver = screen.getByRole('radio', { name: 'Driver' }) as HTMLInputElement;
  expect(customer.name).toBe(driver.name);
  expect(customer.checked).toBe(true);
  expect(driver.checked).toBe(false);
});

it.each(['CUSTOMER', 'DRIVER'])('submits only the selected %s registration role', async (role) => {
  request.mockResolvedValue({ acknowledged: true });
  showForm();
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Test Account' } });
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'account@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'CorrectHorseAccount1!' },
  });
  fireEvent.click(screen.getByRole('radio', { name: 'Driver' }));
  if (role === 'CUSTOMER') fireEvent.click(screen.getByRole('radio', { name: 'Customer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0]?.[0]).toBe('/auth/register');
  expect(JSON.parse(request.mock.calls[0]?.[1].body)).toEqual({
    displayName: 'Test Account',
    email: 'account@example.test',
    password: 'CorrectHorseAccount1!',
    role,
  });
});
