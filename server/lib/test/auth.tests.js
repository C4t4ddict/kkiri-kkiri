const assert = require('node:assert/strict');
const test = require('node:test');
const { getAuthenticatedUserId, issueAuthToken, verifyAuthToken } = require('../auth');

test('로그인 토큰은 사용자 ID를 서명하고 검증한다', () => {
  const token = issueAuthToken(17);
  assert.equal(verifyAuthToken(token).sub, 17);
});

test('변조된 로그인 토큰을 거부한다', () => {
  const token = issueAuthToken(17);
  assert.equal(verifyAuthToken(`${token}tampered`), null);
});

test('인증된 사용자 ID가 기존 헤더보다 우선한다', () => {
  const req = {
    authUserId: 17,
    get: () => '99',
    body: {},
    query: {},
  };
  assert.equal(getAuthenticatedUserId(req), 17);
});
