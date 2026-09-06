const assert = require('node:assert/strict');
const test = require('node:test');
const { createMemoryRateLimiter } = require('../rateLimit');

const response = () => ({
  headers: {},
  statusCode: 200,
  payload: null,
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
});

test('rate limiter blocks requests above the configured limit', () => {
  const limiter = createMemoryRateLimiter({ maximum: 2, windowMs: 60_000 });
  const req = { ip: '127.0.0.1' };
  let passed = 0;

  limiter(req, response(), () => { passed += 1; });
  limiter(req, response(), () => { passed += 1; });
  const blocked = response();
  limiter(req, blocked, () => { passed += 1; });

  assert.equal(passed, 2);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.payload.code, 'RATE_LIMITED');
  assert.equal(blocked.headers['RateLimit-Remaining'], '0');
  assert.ok(Number(blocked.headers['Retry-After']) >= 1);
});

test('rate limiter isolates clients by generated key', () => {
  const limiter = createMemoryRateLimiter({ maximum: 1 });
  let passed = 0;
  limiter({ ip: 'first' }, response(), () => { passed += 1; });
  limiter({ ip: 'second' }, response(), () => { passed += 1; });
  assert.equal(passed, 2);
  assert.equal(limiter.size(), 2);
});
