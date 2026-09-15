import axios from 'axios';
import { API_BASE_URL } from '../config/api';

let authToken: string | null = null;
let fetchInstalled = false;

const isAppApiUrl = (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url === API_BASE_URL || url.startsWith(`${API_BASE_URL}/`);
};

export const configureAuthTransport = (token?: string | null) => {
  authToken = token || null;
  if (authToken) axios.defaults.headers.common.Authorization = `Bearer ${authToken}`;
  else delete axios.defaults.headers.common.Authorization;

  if (fetchInstalled) return;
  fetchInstalled = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const requestInput = input instanceof URL ? input.href : input;
    if (!authToken || !isAppApiUrl(requestInput)) return originalFetch(requestInput, init);
    const requestHeaders = typeof Request !== 'undefined' && requestInput instanceof Request ? requestInput.headers : undefined;
    const headers = new Headers(init.headers || requestHeaders);
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${authToken}`);
    return originalFetch(requestInput, { ...init, headers });
  };
};
