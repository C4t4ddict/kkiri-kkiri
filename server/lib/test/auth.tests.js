const assert = require('node:assert/strict');
const test = require('node:test');
const { getAuthenticatedUserId, isLoopbackAddress, issueAuthToken, verifyAuthToken } = require('../auth');

test('로그인 토큰은 사용자 ID를 서명하고 검증한다', () => {
  const token = issueAuthToken(17);
  assert.equal(verifyAuthToken(token).sub, 17);
});

test('변조된 로그인 토큰을 거부한다', () => {
  const token = issueAuthToken(17);
  assert.equal(verifyAuthToken(`${token}tampered`), null);
});

test('토큰 뒤에 서명 세그먼트를 추가한 값은 거부한다', () => {
  const token = issueAuthToken(17);
  assert.equal(verifyAuthToken(`${token}.extra`), null);
});

test('루프백 주소만 개발용 호환 인증 주소로 판별한다', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.0.10'), false);
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

test('기본 설정에서는 사용자 ID 헤더만으로 인증할 수 없다', () => {
  const req = {
    authUserId: null,
    ip: '127.0.0.1',
    get: () => '99',
    body: { user_id: 99 },
    query: { user_id: 99 },
  };
  assert.equal(getAuthenticatedUserId(req), 0);
});
