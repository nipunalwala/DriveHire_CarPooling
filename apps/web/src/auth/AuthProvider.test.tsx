// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function user(id: string, email: string) {
  return {
    id,
    displayName: email.split('@')[0],
    email,
    emailVerified: true,
    roles: ['PASSENGER'],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function token(accessToken: string, email: string, id: string) {
  return { accessToken, expiresIn: 900, user: user(id, email) };
}

const NEW_USER_ID = '11111111-1111-4111-8111-111111111111';
const OLD_USER_ID = '22222222-2222-4222-8222-222222222222';
const NEW_EMAIL = 'new@example.com';
const OLD_EMAIL = 'old@example.com';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});

async function setup(fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(fetcher));
  const React = await import('react');
  const rtl = await import('@testing-library/react');
  const auth = await import('./AuthProvider.js');
  cleanup = rtl.cleanup;

  const Consumer = () => {
    const { user: current, ready, login, logout } = auth.useAuth();
    return React.createElement(
      'div',
      null,
      React.createElement('span', { 'data-testid': 'user' }, current?.email ?? 'none'),
      React.createElement('span', { 'data-testid': 'ready' }, String(ready)),
      React.createElement(
        'button',
        { onClick: () => void login(NEW_EMAIL, 'password123456') },
        'login',
      ),
      React.createElement('button', { onClick: () => void logout() }, 'logout'),
    );
  };

  rtl.render(React.createElement(auth.AuthProvider, null, React.createElement(Consumer)));

  return { React, rtl, fetch: vi.mocked(fetch) };
}

async function settle(rtl: typeof import('@testing-library/react')) {
  await rtl.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it('keeps the new user when a late startup refresh 401 arrives after login', async () => {
  const startup = deferred<Response>();
  const login = deferred<Response>();
  const { rtl, fetch } = await setup((input) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh')) return startup.promise;
    if (url.endsWith('/auth/login')) return login.promise;
    throw new Error(`Unexpected request: ${url}`);
  });

  await rtl.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), expect.anything()),
  );
  rtl.fireEvent.click(rtl.screen.getByText('login'));
  await rtl.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.anything()),
  );

  login.resolve(json({ success: true, data: token('new-token', NEW_EMAIL, NEW_USER_ID) }));
  await rtl.waitFor(() => expect(rtl.screen.getByTestId('user').textContent).toBe(NEW_EMAIL));

  startup.resolve(
    json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHENTICATED' } }, 401),
  );
  await settle(rtl);

  expect(rtl.screen.getByTestId('user').textContent).toBe(NEW_EMAIL);
  expect(rtl.screen.getByTestId('ready').textContent).toBe('true');
});

it('keeps the new user when a late old-account startup refresh succeeds after login', async () => {
  const startup = deferred<Response>();
  const login = deferred<Response>();
  const { rtl, fetch } = await setup((input) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh')) return startup.promise;
    if (url.endsWith('/auth/login')) return login.promise;
    throw new Error(`Unexpected request: ${url}`);
  });

  await rtl.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), expect.anything()),
  );
  rtl.fireEvent.click(rtl.screen.getByText('login'));
  await rtl.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.anything()),
  );

  login.resolve(json({ success: true, data: token('new-token', NEW_EMAIL, NEW_USER_ID) }));
  await rtl.waitFor(() => expect(rtl.screen.getByTestId('user').textContent).toBe(NEW_EMAIL));

  startup.resolve(json({ success: true, data: token('old-token', OLD_EMAIL, OLD_USER_ID) }));
  await settle(rtl);

  expect(rtl.screen.getByTestId('user').textContent).toBe(NEW_EMAIL);
  expect(rtl.screen.getByTestId('ready').textContent).toBe('true');
});

it('does not resurrect a user when a late startup refresh succeeds after logout', async () => {
  const startup = deferred<Response>();
  const { rtl, fetch } = await setup((input) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh')) return startup.promise;
    if (url.endsWith('/auth/logout'))
      return Promise.resolve(json({ success: true, data: { acknowledged: true } }));
    throw new Error(`Unexpected request: ${url}`);
  });

  await rtl.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), expect.anything()),
  );
  rtl.fireEvent.click(rtl.screen.getByText('logout'));
  await rtl.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/logout'), expect.anything()),
  );
  await settle(rtl);
  expect(rtl.screen.getByTestId('ready').textContent).toBe('true');
  expect(rtl.screen.getByTestId('user').textContent).toBe('none');

  startup.resolve(json({ success: true, data: token('old-token', OLD_EMAIL, OLD_USER_ID) }));
  await settle(rtl);

  expect(rtl.screen.getByTestId('user').textContent).toBe('none');
  expect(rtl.screen.getByTestId('ready').textContent).toBe('true');
});
