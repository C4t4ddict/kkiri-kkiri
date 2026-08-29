import { API_BASE_URL } from './client';

export function resolveApiMediaUrl(value?: string | null) {
  if (!value) return '';

  if (value.startsWith('/')) {
    return new URL(value, `${API_BASE_URL.replace(/\/$/, '')}/`).toString();
  }

  try {
    const url = new URL(value);
    if (url.hostname === '10.0.2.2') {
      const apiUrl = new URL(API_BASE_URL);
      url.protocol = apiUrl.protocol;
      url.hostname = apiUrl.hostname;
      url.port = apiUrl.port;
    }
    return url.toString();
  } catch {
    return value;
  }
}
