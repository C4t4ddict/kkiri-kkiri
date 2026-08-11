const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCode, hashSecret } = require('../../auth/verificationService');
const { normalizeFeedback } = require('../../feedback/service');

test('이메일 인증 코드는 항상 6자리 숫자로 생성된다', () => {
  for (let index = 0; index < 20; index += 1) {
    assert.match(generateCode(), /^\d{6}$/);
  }
});

test('인증 비밀값은 원문 대신 고정 길이 해시로 저장한다', () => {
  assert.equal(hashSecret('123456').length, 64);
  assert.equal(hashSecret('123456'), hashSecret('123456'));
  assert.notEqual(hashSecret('123456'), hashSecret('654321'));
});

test('개발자 피드백 입력을 허용된 범위로 정규화한다', () => {
  assert.deepEqual(normalizeFeedback({ category: 'bug', content: '  오류가 발생합니다.  ', platform: 'IOS' }), {
    category: 'BUG',
    content: '오류가 발생합니다.',
    platform: 'ios',
  });
  assert.equal(normalizeFeedback({ category: 'unknown' }).category, 'OTHER');
});
