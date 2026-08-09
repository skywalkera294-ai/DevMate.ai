'use client';

import type { AuthResponse, UserSummary } from '@devmate/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

interface AuthContextValue {
  user: UserSummary | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserSummary>;
  register: (email: string, password: string, name?: string) => Promise<UserSummary>;
  logout: () => void;
  setAuth: (res: AuthResponse) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await api<UserSummary>('/auth/me');
        if (active) setUser(me);
      } catch {
        setToken(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const setAuth = useCallback((res: AuthResponse) => {
    setToken(res.token);
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } });
      setAuth(res);
      return res.user;
    },
    [setAuth],
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const res = await api<AuthResponse>('/auth/register', { method: 'POST', body: { email, password, name } });
      setAuth(res);
      return res.user;
    },
    [setAuth],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, setAuth }),
    [user, loading, login, register, logout, setAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
