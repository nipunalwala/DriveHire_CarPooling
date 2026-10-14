import { describe, expect, it } from 'vitest';
import { pageBounds, parsePagination } from '../src/lib/pagination';
import { AppError } from '../src/errors/AppError';
describe('pagination', () => {
  it('applies defaults and bounds', () => {
    const page = parsePagination({}, ['created_at']);
    expect(pageBounds(page)).toEqual({ offset: 0, limit: 20 });
  });
  it('caps page size and validates sort allowlists', () => {
    expect(() => parsePagination({ limit: 101 })).toThrow(AppError);
    expect(() => parsePagination({ sort: 'email:asc' }, ['created_at'])).toThrow(AppError);
  });
});
