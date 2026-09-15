import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clearStoredSession, getStoredToken, setStoredSession } from '../shared/auth/session';
import { ApiError, api } from '../shared/api/client';
import type { User } from '../shared/types/domain';

type AuthContextValue = {
  user: User | null;
  initializing: boolean;
  authError: string;
  adminAccess: 'checking' | 'allowed' | 'denied';
  login: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  refreshUser: () => Promise<User | null>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(() => Boolean(getStoredToken()));
  const [authError, setAuthError] = useState('');
  const [adminCheck, setAdminCheck] = useState<{ userId: number; allowed: boolean } | null>(null);
  const requestVersion = useRef(0);

  const logout = useCallback(() => {
    requestVersion.current += 1;
    clearStoredSession();
    setUser(null);
    setAdminCheck(null);
    setAuthError('');
    setInitializing(false);
  }, []);

  const refreshUser = useCallback(async () => {
    const version = ++requestVersion.current;
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setInitializing(false);
      return null;
    }
    setInitializing(true);
    setAuthError('');
    try {
      const result = await api<{ user: User }>('/api/me');
      if (version !== requestVersion.current || token !== getStoredToken()) return null;
      setUser(result.user);
      return result.user;
    } catch (reason) {
      if (version !== requestVersion.current || token !== getStoredToken()) return null;
      if (reason instanceof ApiError && reason.status === 401) {
        clearStoredSession();
        setUser(null);
      } else {
        setUser(null);
        setAuthError(reason instanceof Error ? reason.message : '회원정보를 불러오지 못했습니다.');
      }
      return null;
    } finally {
      if (version === requestVersion.current) setInitializing(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
    return () => { requestVersion.current += 1; };
  }, [refreshUser]);

  useEffect(() => {
    let cancelled = false;
    setAdminCheck(null);
    if (user) api<{ allowed: boolean }>('/api/admin/access')
      .then(result => { if (!cancelled) setAdminCheck({ userId: user.id, allowed: result.allowed }); })
      .catch(() => { if (!cancelled) setAdminCheck({ userId: user.id, allowed: false }); });
    return () => { cancelled = true; };
  }, [user]);
  const adminAccess: AuthContextValue['adminAccess'] = !user ? 'denied'
    : adminCheck?.userId !== user.id ? 'checking' : adminCheck.allowed ? 'allowed' : 'denied';

  const value = useMemo(() => ({
    user, initializing, authError, adminAccess,
    login: (token: string, nextUser: User) => {
      requestVersion.current += 1;
      setStoredSession(token);
      setUser(nextUser);
      setAuthError('');
      setInitializing(false);
    },
    updateUser: (nextUser: User) => setUser(nextUser),
    refreshUser,
    logout,
  }), [user, initializing, authError, adminAccess, refreshUser, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth는 AuthProvider 안에서 사용해야 합니다.');
  return context;
}
