import axios from 'axios';

let authToken: string | null = null;
let fetchInstalled = false;

const isAppApiUrl = (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return /^http:\/\/(localhost|10\.0\.2\.2):3000(?:\/|$)/.test(url);
};

export const configureAuthTransport = (token?: string | null) => {
  authToken = token || null;
  if (authToken) axios.defaults.headers.common.Authorization = `Bearer ${authToken}`;
  else delete axios.defaults.headers.common.Authorization;

  if (fetchInstalled) return;
  fetchInstalled = true;
  const originalFetch = global.fetch.bind(global);
  global.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (!authToken || !isAppApiUrl(input)) return originalFetch(input, init);
    const requestHeaders = typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined;
    const headers = new Headers(init.headers || requestHeaders);
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${authToken}`);
    return originalFetch(input, { ...init, headers });
  };
};
