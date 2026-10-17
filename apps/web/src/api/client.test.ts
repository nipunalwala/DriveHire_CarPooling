import { afterEach, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './client.js';

afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

it('sends same-origin cookies and the in-memory bearer and unwraps data', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(json({ success: true, data: { displayName: 'Nipun' } }));
  vi.stubGlobal('fetch', fetcher);
  const client = new ApiClient();
  client.setAccessToken('memory-only');
  expect(await client.request('/users/me')).toEqual({ displayName: 'Nipun' });
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/users/me');
  const options = fetcher.mock.calls[0]?.[1] as RequestInit;
  expect(options.credentials).toBe('same-origin');
  expect(new Headers(options.headers).get('Authorization')).toBe('Bearer memory-only');
});

it('refreshes once and retries an expired authenticated request', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json({ success: false, error: { message: 'Expired' } }, 401))
      .mockResolvedValueOnce(json({ success: true, data: { id: 'self' } })),
  );
  const client = new ApiClient();
  const refresh = vi.fn().mockResolvedValue(true);
  client.setRefreshHandler(refresh);
  expect(await client.request('/users/me')).toEqual({ id: 'self' });
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('does not refresh a failed login or leak a server body as an error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      json(
        {
          success: false,
          error: { code: 'UNAUTHENTICATED', message: 'Email or password is incorrect' },
        },
        401,
      ),
    ),
  );
  const client = new ApiClient();
  const refresh = vi.fn();
  client.setRefreshHandler(refresh);
  await expect(client.request('/auth/login', { method: 'POST' })).rejects.toThrow(
    'Email or password is incorrect',
  );
  expect(refresh).not.toHaveBeenCalled();
});

it('rejects external paths before making a request', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(new ApiClient().request('https://example.com')).rejects.toBeInstanceOf(ApiError);
  expect(fetcher).not.toHaveBeenCalled();
});

it('returns a recoverable message for a network failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(new ApiClient().request('/users/me')).rejects.toThrow('Check your connection');
});

it('preserves pagination metadata for server-backed lists', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        json({ success: true, data: [{ id: 'row' }], meta: { page: 2, pageSize: 20, total: 25 } }),
      ),
  );
  expect(await new ApiClient().requestPage('/users/me/vehicles?page=2')).toEqual({
    success: true,
    data: [{ id: 'row' }],
    meta: { page: 2, pageSize: 20, total: 25 },
  });
});
