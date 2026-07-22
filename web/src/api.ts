export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export type User = {
  id: number;
  email: string;
  name: string;
  department?: string;
  studentId?: string;
  profile_picture?: string;
  is_admin?: boolean;
};

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

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('kkiri_token');
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || '요청을 처리하지 못했습니다');
  return data as T;
}
