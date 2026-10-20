import { clearJourneyDrafts } from '../features/journeys/draft-memory.js';
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
let authGeneration = 0;
let authQueue: Promise<void> = Promise.resolve();
// All cookie-changing actions share one queue, including browsers without Web Locks.
// The existing lock name also coordinates refresh/login/logout across supported tabs.
function coordinateAuth<T>(operation: () => Promise<T>): Promise<T> {
  const execute = async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request('drivehire-refresh', operation);
    }
    return await operation();
  };
  const queued = authQueue.then(execute, execute);
  authQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}
function publish(next: AuthState) {
  state = next;
  for (const listener of listeners) listener(next);
}
function acceptSession(value: unknown) {
  const session = TokenResultSchema.parse(value);
  authGeneration++;
  api.setAccessToken(session.accessToken);
  publish({ user: session.user, ready: true });
}
function clearSession() {
  authGeneration++;
  api.setAccessToken(null);
  publish({ user: null, ready: true });
}
async function refresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const generation = authGeneration;
  const perform = async () => {
    if (generation !== authGeneration) return Boolean(state.user);
    try {
      const result = await api.request('/auth/refresh', { method: 'POST' });
      // A later login, logout or profile update owns the current snapshot.
      if (generation !== authGeneration) return Boolean(state.user);
      acceptSession(result);
      return true;
    } catch {
      if (generation !== authGeneration) return Boolean(state.user);
      clearSession();
      return false;
    }
  };
  refreshPromise = coordinateAuth(perform).finally(() => {
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
        // Invalidate earlier snapshot reads as soon as the user starts a new login.
        authGeneration++;
        await coordinateAuth(async () => {
          try {
            acceptSession(
              await api.request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
              }),
            );
          } catch (cause) {
            if (!state.ready) publish({ user: state.user, ready: true });
            throw cause;
          }
        });
      },
      async logout() {
        authGeneration++;
        await coordinateAuth(async () => {
          try {
            // Revoke the latest cookie after any pending rotation has finished.
            await api.request('/auth/logout', { method: 'POST' });
            clearJourneyDrafts();
            clearSession();
            channel?.postMessage('signed-out');
          } catch (cause) {
            // Keep a live session visible when server revocation fails.
            if (!state.ready) publish({ user: state.user, ready: true });
            throw cause;
          }
        });
      },
      setUser(user) {
        authGeneration++;
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
