import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';

export type AuthUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  credits_balance: number;
  credits_reference_cap: number;
};

type AuthContextValue = {
  user: AuthUser | null;
  bootstrapped: boolean;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const refreshAuth = useCallback(async () => {
    try {
      const r = await api.get<AuthUser>('/auth/me/');
      setUser(r.data);
    } catch {
      setUser(null);
    } finally {
      setBootstrapped(true);
    }
  }, []);

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
