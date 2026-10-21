// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { JourneyStatus } from '../../features/bookings/JourneyLayout.js';
import { StatusBadge } from './index.js';

afterEach(cleanup);

it.each([
  ['PENDING', 'Pending'],
  ['CANCELLED', 'Cancelled'],
  ['EXPIRED', 'Expired'],
  ['CONFIRMED', 'Confirmed'],
])('preserves the canonical %s state behind its readable label', (status, label) => {
  render(<JourneyStatus status={status} />);
  expect(screen.getByText(label).getAttribute('data-status')).toBe(status);
});

it('retains existing raw status labels for current provider screens', () => {
  render(<StatusBadge>APPROVED</StatusBadge>);
  expect(screen.getByText('APPROVED').getAttribute('data-status')).toBe('APPROVED');
});
