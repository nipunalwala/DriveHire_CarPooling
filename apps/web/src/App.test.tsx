// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App.js';
afterEach(cleanup);
it('makes an unknown route recoverable through a home link', () => {
  render(
    <MemoryRouter initialEntries={['/unknown']}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeDefined();
  expect(screen.getByRole('link', { name: 'Return home' }).getAttribute('href')).toBe('/');
});
