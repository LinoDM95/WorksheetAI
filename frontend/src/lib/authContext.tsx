import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import {
  registerAuthSessionExpiredHandler,
  resetAuthSessionExpiredFlag,
} from './authSessionBridge';

export type AuthUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  credits_balance: number;
  credits_reference_cap: number;
  is_staff: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  bootstrapped: boolean;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const refreshAuth = useCallback(async () => {
    try {
      const r = await api.get<AuthUser>('/auth/me/');
      setUser(r.data);
      resetAuthSessionExpiredFlag();
    } catch {
      setUser(null);
    } finally {
      setBootstrapped(true);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      queryClient.clear();
      void api.post('/auth/logout/').catch(() => undefined);
      setUser(null);
      setBootstrapped(true);
      const params = new URLSearchParams();
      params.set('reason', 'session_expired');
      const path = `${location.pathname}${location.search}`;
      if (path.startsWith('/app') && !path.startsWith('/login')) {
        params.set('next', path);
      }
      navigate(`/login?${params.toString()}`, { replace: true });
    };
    registerAuthSessionExpiredHandler(handler);
    return () => registerAuthSessionExpiredHandler(null);
  }, [navigate, queryClient, location.pathname, location.search]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout/');
    } catch {
      /* ungültige/abgelaufene Session */
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, bootstrapped, refreshAuth, logout }),
    [user, bootstrapped, refreshAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth außerhalb von AuthProvider');
  return ctx;
};
