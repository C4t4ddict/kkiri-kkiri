import { configureAuthTransport } from '../src/api/authTransport';
import { API_BASE_URL } from '../src/config/api';

test('앱 origin의 문자열·URL·Request에만 인증을 전달한다', async () => {
  const originalFetch = globalThis.fetch;
  const transport = jest.fn(async () => new Response('{}'));
  globalThis.fetch = transport;
  try {
    configureAuthTransport('qa-token');
    for (const input of [`${API_BASE_URL}/api/me`, new URL(`${API_BASE_URL}/api/me`), new Request(`${API_BASE_URL}/api/me`)]) {
      await (fetch as (value: RequestInfo | URL) => Promise<Response>)(input);
      const call = transport.mock.calls.at(-1) as unknown as [RequestInfo, RequestInit];
      expect(new Headers(call[1].headers).get('Authorization')).toBe('Bearer qa-token');
    }
    for (const url of ['https://example.com', `${API_BASE_URL}.evil.test/api/me`]) {
      await fetch(url);
      const call = transport.mock.calls.at(-1) as unknown as [RequestInfo, RequestInit];
      expect(new Headers(call[1]?.headers).get('Authorization')).toBeNull();
    }
    configureAuthTransport(null);
    await fetch(`${API_BASE_URL}/api/me`);
    const call = transport.mock.calls.at(-1) as unknown as [RequestInfo, RequestInit];
    expect(new Headers(call[1]?.headers).get('Authorization')).toBeNull();
  } finally { configureAuthTransport(null); globalThis.fetch = originalFetch; }
});
