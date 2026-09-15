const assert = require('node:assert/strict');
const test = require('node:test');
const { createRateLimiter } = require('../rateLimiter');

const createResponse = () => {
  const headers = {};
  return {
    headers,
    set(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
};

test('제한 횟수를 초과한 동일 키 요청을 429로 차단한다', () => {
  let currentTime = 1_000;
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: () => currentTime });
  const req = { ip: '127.0.0.1' };

  for (let count = 0; count < 2; count += 1) {
    let continued = false;
    limiter(req, createResponse(), () => { continued = true; });
    assert.equal(continued, true);
  }

  const blocked = createResponse();
  limiter(req, blocked, () => assert.fail('제한된 요청이 통과했습니다'));
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'], '60');

  currentTime += 60_001;
  let continued = false;
  limiter(req, createResponse(), () => { continued = true; });
  assert.equal(continued, true);
});

test('서로 다른 키의 요청 횟수는 독립적으로 계산한다', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  let continued = 0;
  limiter({ ip: '127.0.0.1' }, createResponse(), () => { continued += 1; });
  limiter({ ip: '127.0.0.2' }, createResponse(), () => { continued += 1; });
  assert.equal(continued, 2);
});
