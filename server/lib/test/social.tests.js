const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FRIEND_CODE_LENGTH,
  MESSAGE_MAX_LENGTH,
  createFriendCode,
  getFriendPair,
  normalizeFriendCode,
  normalizeMessage,
} = require('../../social/service');

test('친구 코드는 대문자 고정 길이로 생성된다', () => {
  const code = createFriendCode();
  assert.equal(code.length, FRIEND_CODE_LENGTH);
  assert.match(code, /^[A-Z0-9_-]+$/);
  assert.equal(normalizeFriendCode(` ${code.toLowerCase()} `), code);
});

test('친구 관계 키는 사용자 순서와 무관하다', () => {
  assert.deepEqual(getFriendPair(9, 3), [3, 9]);
  assert.deepEqual(getFriendPair(3, 9), [3, 9]);
});

test('쪽지는 공백을 정리하고 200자로 제한한다', () => {
  assert.equal(normalizeMessage('  안녕하세요  '), '안녕하세요');
  assert.equal(normalizeMessage('가'.repeat(250)).length, MESSAGE_MAX_LENGTH);
});
