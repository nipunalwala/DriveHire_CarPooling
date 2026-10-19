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
        {
          onClick: () => {
            void login(NEW_EMAIL, 'password123456').catch(() => {});
          },
        },
        'login',
      ),
      React.createElement(
        'button',
        {
          onClick: () => {
            void logout().catch(() => {});
          },
        },
        'logout',
      ),
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

it('serializes login behind a held startup refresh and ignores a late 401', async () => {
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
  await settle(rtl);
  expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.anything());

  startup.resolve(
    json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHENTICATED' } }, 401),
  );
  await rtl.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.anything()),
  );

  login.resolve(json({ success: true, data: token('new-token', NEW_EMAIL, NEW_USER_ID) }));
  await rtl.waitFor(() => expect(rtl.screen.getByTestId('user').textContent).toBe(NEW_EMAIL));

  expect(rtl.screen.getByTestId('user').textContent).toBe(NEW_EMAIL);
  expect(rtl.screen.getByTestId('ready').textContent).toBe('true');
});

it('serializes login behind a held startup refresh and ignores the old account', async () => {
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
  await settle(rtl);
  expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.anything());

  startup.resolve(json({ success: true, data: token('old-token', OLD_EMAIL, OLD_USER_ID) }));
  await rtl.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.anything()),
  );
  expect(rtl.screen.getByTestId('user').textContent).not.toBe(OLD_EMAIL);

  login.resolve(json({ success: true, data: token('new-token', NEW_EMAIL, NEW_USER_ID) }));
  await rtl.waitFor(() => expect(rtl.screen.getByTestId('user').textContent).toBe(NEW_EMAIL));

  expect(rtl.screen.getByTestId('user').textContent).toBe(NEW_EMAIL);
  expect(rtl.screen.getByTestId('ready').textContent).toBe('true');
});

it('serializes logout behind a held startup refresh and does not resurrect the old account', async () => {
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
  await settle(rtl);
  expect(fetch).not.toHaveBeenCalledWith(
    expect.stringContaining('/auth/logout'),
    expect.anything(),
  );

  startup.resolve(json({ success: true, data: token('old-token', OLD_EMAIL, OLD_USER_ID) }));
  await rtl.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/logout'), expect.anything()),
  );
  await rtl.waitFor(() => expect(rtl.screen.getByTestId('ready').textContent).toBe('true'));

  expect(rtl.screen.getByTestId('user').textContent).toBe('none');
  expect(rtl.screen.getByTestId('ready').textContent).toBe('true');
});

it('lets a valid login retry proceed after an earlier login fails', async () => {
  let attempts = 0;
  const { rtl, fetch } = await setup((input) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh'))
      return Promise.resolve(
        json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHENTICATED' } }, 401),
      );
    if (url.endsWith('/auth/login')) {
      attempts += 1;
      if (attempts === 1)
        return Promise.resolve(
          json(
            { success: false, error: { message: 'Invalid credentials', code: 'UNAUTHENTICATED' } },
            401,
          ),
        );
      return Promise.resolve(
        json({ success: true, data: token('new-token', NEW_EMAIL, NEW_USER_ID) }),
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await rtl.waitFor(() => expect(rtl.screen.getByTestId('ready').textContent).toBe('true'));
  expect(rtl.screen.getByTestId('user').textContent).toBe('none');

  rtl.fireEvent.click(rtl.screen.getByText('login'));
  await rtl.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/login'), expect.anything()),
  );
  await settle(rtl);
  expect(rtl.screen.getByTestId('user').textContent).toBe('none');
  expect(rtl.screen.getByTestId('ready').textContent).toBe('true');

  rtl.fireEvent.click(rtl.screen.getByText('login'));
  await rtl.waitFor(() => expect(rtl.screen.getByTestId('user').textContent).toBe(NEW_EMAIL));
  expect(rtl.screen.getByTestId('ready').textContent).toBe('true');
});
