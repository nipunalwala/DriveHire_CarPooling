// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App.js';
afterEach(cleanup);

it('offers a labelled login form and password recovery', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 401 })),
  );
  render(
    <MemoryRouter initialEntries={['/login']}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeDefined();
  expect(screen.getByLabelText('Email address')).toBeDefined();
  expect(screen.getByLabelText('Password')).toBeDefined();
  expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe(
    '/forgot-password',
  );
  vi.unstubAllGlobals();
});
it('makes an unknown route recoverable through a home link', () => {
  render(
    <MemoryRouter initialEntries={['/unknown']}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeDefined();
  expect(screen.getByRole('link', { name: 'Return home' }).getAttribute('href')).toBe('/');
});
