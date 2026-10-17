import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { TokenResultSchema, type UserDto } from '@drivehire/contracts';
import { api } from '../api/client.js';

type AuthState = { user: UserDto | null; ready: boolean };
type AuthContextValue = AuthState & {
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  setUser(user: UserDto): void;
};
const AuthContext = createContext<AuthContextValue | null>(null);
let state: AuthState = { user: null, ready: false };
const listeners = new Set<(state: AuthState) => void>();
let refreshPromise: Promise<boolean> | undefined;
let channel: BroadcastChannel | undefined;
function publish(next: AuthState) {
  state = next;
  for (const listener of listeners) listener(next);
}
function acceptSession(value: unknown) {
  const session = TokenResultSchema.parse(value);
  api.setAccessToken(session.accessToken);
  publish({ user: session.user, ready: true });
}
function clearSession() {
  api.setAccessToken(null);
  publish({ user: null, ready: true });
}
async function refresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const perform = async () => {
    try {
      acceptSession(await api.request('/auth/refresh', { method: 'POST' }));
      return true;
    } catch {
      clearSession();
      return false;
    }
  };
  // Web Locks serialize cookie rotation across tabs. Each request sees the
  // latest HttpOnly cookie; tokens never enter persistent browser storage.
  const coordinated = async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request('drivehire-refresh', perform);
    }
    return await perform();
  };
  refreshPromise = coordinated().finally(() => {
    refreshPromise = undefined;
  });
  return refreshPromise;
}
api.setRefreshHandler(refresh);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    if (typeof BroadcastChannel !== 'undefined' && !channel) {
      channel = new BroadcastChannel('drivehire-auth');
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === 'signed-out') clearSession();
      };
    }
    if (!state.ready) void refresh();
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);
  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      async login(email, password) {
        acceptSession(
          await api.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          }),
        );
      },
      async logout() {
        // Keep the session visible if server logout fails; never promise revocation
        // until the backend has acknowledged it.
        await api.request('/auth/logout', { method: 'POST' });
        clearSession();
        channel?.postMessage('signed-out');
      },
      setUser(user) {
        publish({ user, ready: true });
      },
    }),
    [snapshot],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p role="status">Restoring your session…</p>;
  if (!user)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  return children;
}
