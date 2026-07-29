const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPrizeDetails, extractPrizeSummary } = require('../activityPrize');

test('시상 내역 구간만 상금 정보로 추출한다', () => {
  const details = [
    '● 참가 자격',
    '- 누구나',
    '● 시상 내역',
    '- 대상 300만원',
    '- 우수상 각 100만원',
    '● 공모 일정',
    '- 8월 마감',
  ].join('\n');

  assert.equal(extractPrizeDetails(details), '- 대상 300만원\n- 우수상 각 100만원');
});

test('명시적인 제목이 없으면 총상금 문장을 추출한다', () => {
  assert.equal(extractPrizeDetails('안내\n총 4,800만 원 / 총 10팀 시상\n접수 방법'), '총 4,800만 원 / 총 10팀 시상');
});

test('상금 정보가 없으면 null을 반환한다', () => {
  assert.equal(extractPrizeDetails('참가자격 누구나\n접수는 온라인'), null);
});

test('상금 정보를 만원 단위 요약으로 변환한다', () => {
  assert.equal(extractPrizeSummary('총상금: 1억원\n대상 500만원'), '10,000만원');
  assert.equal(extractPrizeSummary('최우수상 1명 700만 원'), '700만원');
});
