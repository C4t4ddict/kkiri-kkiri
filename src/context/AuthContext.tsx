import React, { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { User } from '../types';
import { configureAuthTransport } from '../api/authTransport';

type AuthContextValue = {
  user: User | null;
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const updateUser = useCallback((nextUser: User | null) => {
    configureAuthTransport(nextUser?.authToken);
    setUser(nextUser);
  }, []);
  return <AuthContext.Provider value={{ user, setUser: updateUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
