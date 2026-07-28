import type { User } from '../types/domain';

export const getStoredSession = () => {
  try {
    const token = localStorage.getItem('kkiri_token');
    const user = JSON.parse(localStorage.getItem('kkiri_user') || 'null') as User | null;
    return token && user ? { token, user } : null;
  } catch {
    return null;
  }
};

export const setStoredSession = (token: string, user: User) => {
  localStorage.setItem('kkiri_token', token);
  localStorage.setItem('kkiri_user', JSON.stringify(user));
};

export const clearStoredSession = () => {
  localStorage.removeItem('kkiri_token');
  localStorage.removeItem('kkiri_user');
};
