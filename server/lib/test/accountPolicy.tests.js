const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canAccessRecruitment,
  getAccountIdentity,
  getSchoolDomain,
  hasVerifiedSchool,
  normalizeEmail,
} = require('../../auth/accountPolicy');

test('이메일을 소문자로 정규화하고 학교 도메인을 판별한다', () => {
  assert.equal(normalizeEmail(' Student@SCHOOL.AC.KR '), 'student@school.ac.kr');
  assert.equal(getSchoolDomain('student@school.ac.kr'), 'school.ac.kr');
  assert.equal(getSchoolDomain('person@gmail.com'), null);
});

test('학교 이메일과 일반 이메일의 계정 유형을 구분한다', () => {
  assert.deepEqual(getAccountIdentity('student@school.ac.kr'), {
    accountType: 'STUDENT',
    schoolDomain: 'school.ac.kr',
    schoolName: 'school.ac.kr',
  });
  assert.equal(getAccountIdentity('person@gmail.com').accountType, 'GENERAL');
});

test('본교 모집은 인증된 같은 학교 사용자만 접근한다', () => {
  const recruitment = { recruitment_scope: 'SCHOOL', school_domain: 'school.ac.kr' };
  assert.equal(canAccessRecruitment({
    school_email_verified: true,
    school_domain: 'school.ac.kr',
  }, recruitment), true);
  assert.equal(canAccessRecruitment({
    school_email_verified: true,
    school_domain: 'other.ac.kr',
  }, recruitment), false);
  assert.equal(canAccessRecruitment({ school_email_verified: false }, recruitment), false);
  assert.equal(canAccessRecruitment({
    account_type: 'GENERAL',
    school_email_verified: true,
    school_domain: 'school.ac.kr',
  }, recruitment), true);
  assert.equal(canAccessRecruitment({}, { recruitment_scope: 'NATIONWIDE' }), true);
});

test('계정 유형과 무관하게 학교 이메일 인증 상태로 본교 권한을 판단한다', () => {
  assert.equal(hasVerifiedSchool({
    account_type: 'GENERAL',
    school_email_verified: true,
    school_domain: 'SCHOOL.AC.KR',
  }), true);
  assert.equal(hasVerifiedSchool({
    account_type: 'STUDENT',
    school_email_verified: false,
    school_domain: 'school.ac.kr',
  }), false);
  assert.equal(canAccessRecruitment({
    is_admin: true,
    school_email_verified: false,
  }, {
    recruitment_scope: 'SCHOOL',
    school_domain: 'school.ac.kr',
  }), false);
});

test('학교 도메인 비교는 대소문자와 공백에 영향받지 않는다', () => {
  assert.equal(canAccessRecruitment({
    school_email_verified: true,
    school_domain: ' School.AC.KR ',
  }, {
    recruitment_scope: 'SCHOOL',
    school_domain: 'school.ac.kr',
  }), true);
});
