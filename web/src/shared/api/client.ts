export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  code?: string;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    if (payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string') {
      this.code = payload.code;
    }
  }
}

const getApiErrorMessage = (payload: unknown) => {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (payload && typeof payload === 'object' && 'message' in payload
    && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  return '요청을 처리하지 못했습니다';
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('kkiri_token');
  const headers = new Headers(init.headers);

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(getApiErrorMessage(data), response.status, data);
  return data as T;
}
