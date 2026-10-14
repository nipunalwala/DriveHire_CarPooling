import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAccessToken } from '../lib/api';
export type SafeUser = {
  id: string;
  email: string;
  full_name: string;
  role: 'passenger' | 'driver' | 'owner' | 'admin';
  status: 'pending' | 'active' | 'suspended';
};
type AuthState = {
  user: SafeUser | null;
  loading: boolean;
  setUser: (user: SafeUser | null) => void;
  logout: () => Promise<void>;
};
const Context = createContext<AuthState | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void api
      .post('/auth/refresh')
      .then((response) => {
        const token = response.data.data.accessToken as string;
        setAccessToken(token);
        return api.get('/users/me');
      })
      .then((response) => {
        if (alive) setUser(response.data.data.user as SafeUser);
      })
      .catch(() => setAccessToken(undefined))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      setUser,
      logout: async () => {
        try {
          await api.post('/auth/logout');
        } finally {
          setAccessToken(undefined);
          setUser(null);
        }
      }
    }),
    [user, loading]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
