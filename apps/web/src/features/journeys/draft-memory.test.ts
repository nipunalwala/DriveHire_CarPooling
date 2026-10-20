import { afterEach, expect, it, vi } from 'vitest';
import {
  clearJourneyDrafts,
  forgetJourneyDraft,
  readJourneyDraft,
  rememberJourneyDraft,
} from './draft-memory.js';
afterEach(() => {
  clearJourneyDrafts();
  vi.useRealTimers();
});
it('recovers_only_allowlisted_inputs_for_the_same_account_and_journey', () => {
  const form = new FormData();
  form.set('vehicleId', 'vehicle');
  form.set('startsAt', '2030-01-01T09:00');
  form.set('password', 'must-not-be-copied');
  form.set('accessToken', 'must-not-be-copied');
  rememberJourneyDraft('alice', 'hire:driver-a', form);
  expect(readJourneyDraft('alice', 'hire:driver-a')).toEqual({
    vehicleId: 'vehicle',
    startsAt: '2030-01-01T09:00',
  });
  expect(readJourneyDraft('bob', 'hire:driver-a')).toEqual({});
  expect(readJourneyDraft('alice', 'hire:driver-b')).toEqual({});
  const copy = readJourneyDraft('alice', 'hire:driver-a');
  copy.vehicleId = 'tampered';
  expect(readJourneyDraft('alice', 'hire:driver-a').vehicleId).toBe('vehicle');
});
it('expires_after_thirty_minutes_and_clears_on_success_or_signout', () => {
  vi.useFakeTimers();
  const form = new FormData();
  form.set('passengers', '2');
  rememberJourneyDraft('alice', 'hire:a', form);
  vi.advanceTimersByTime(30 * 60 * 1000);
  expect(readJourneyDraft('alice', 'hire:a')).toEqual({});
  rememberJourneyDraft('alice', 'hire:a', form);
  forgetJourneyDraft('alice', 'hire:a');
  expect(readJourneyDraft('alice', 'hire:a')).toEqual({});
  rememberJourneyDraft('alice', 'hire:a', form);
  clearJourneyDrafts();
  expect(readJourneyDraft('alice', 'hire:a')).toEqual({});
});
