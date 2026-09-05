import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { clearStoredSession, getStoredSession, setStoredSession } from '../shared/auth/session';
import { api } from '../shared/api/client';
import type { User } from '../shared/types/domain';

type AuthContextValue = {
  user: User | null;
  login: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  refreshUser: () => Promise<User | null>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredSession()?.user || null);
  const value = useMemo(() => ({
    user,
    login: (token: string, nextUser: User) => {
      setStoredSession(token, nextUser);
      setUser(nextUser);
    },
    updateUser: (nextUser: User) => {
      const token = localStorage.getItem('kkiri_token');
      if (token) setStoredSession(token, nextUser);
      setUser(nextUser);
    },
    refreshUser: async () => {
      if (!user) return null;
      const response = await api<{ user: User }>(`/api/user/${user.id}`);
      const token = localStorage.getItem('kkiri_token');
      if (token) setStoredSession(token, response.user);
      setUser(response.user);
      return response.user;
    },
    logout: () => {
      clearStoredSession();
      setUser(null);
    },
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth는 AuthProvider 안에서 사용해야 합니다.');
  return context;
}
