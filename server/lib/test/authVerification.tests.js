const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCode, hashSecret } = require('../../auth/verificationService');
const { getVerificationSubject, resetMailerForTests, sendVerificationCode } = require('../../auth/mailer');
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

test('인증 이메일 제목은 목적별로 고정된다', () => {
  assert.equal(getVerificationSubject('SIGNUP'), '[끼리끼리] 회원가입 이메일 인증 코드');
  assert.equal(getVerificationSubject('SCHOOL_LINK'), '[끼리끼리] 학교 이메일 인증 코드');
  assert.equal(getVerificationSubject('PASSWORD_RESET'), '[끼리끼리] 비밀번호 재설정 인증 코드');
});

test('SMTP가 없으면 개발 환경에서만 인증 코드를 반환한다', async () => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalHost = process.env.SMTP_HOST;
  const originalFrom = process.env.SMTP_FROM;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;

  try {
    process.env.NODE_ENV = 'development';
    resetMailerForTests();
    const developmentResult = await sendVerificationCode({
      email: 'user@example.com', code: '123456', purpose: 'SIGNUP',
    });
    assert.equal(developmentResult.developmentCode, '123456');

    process.env.NODE_ENV = 'staging';
    resetMailerForTests();
    await assert.rejects(
      sendVerificationCode({ email: 'user@example.com', code: '123456', purpose: 'SIGNUP' }),
      { code: 'EMAIL_NOT_CONFIGURED' },
    );
  } finally {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = originalHost;
    if (originalFrom === undefined) delete process.env.SMTP_FROM;
    else process.env.SMTP_FROM = originalFrom;
    resetMailerForTests();
  }
});

test('개발자 피드백 입력을 허용된 범위로 정규화한다', () => {
  assert.deepEqual(normalizeFeedback({ category: 'bug', content: '  오류가 발생합니다.  ', platform: 'IOS' }), {
    category: 'BUG',
    content: '오류가 발생합니다.',
    platform: 'ios',
  });
  assert.equal(normalizeFeedback({ category: 'unknown' }).category, 'OTHER');
});
