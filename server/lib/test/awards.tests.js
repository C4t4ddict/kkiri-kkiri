const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateNetPrize,
  normalizePrizeAmount,
  sanitizeAwardInput,
} = require('../../awards/service');

test('제세공과금 적용 시 상금의 22%를 차감한다', () => {
  assert.equal(calculateNetPrize(1000000, true), 780000);
  assert.equal(calculateNetPrize(1000000, false), 1000000);
});

test('수상하지 않은 활동은 상금과 세금 정보를 초기화한다', () => {
  assert.deepEqual(sanitizeAwardInput({
    is_awarded: false,
    award_title: '대상',
    has_prize: true,
    prize_amount: 1000000,
    tax_applied: true,
  }), {
    isAwarded: false,
    awardTitle: null,
    hasPrize: false,
    prizeAmount: 0,
    taxApplied: false,
  });
});

test('상금 입력에서 숫자만 안전하게 정규화한다', () => {
  assert.equal(normalizePrizeAmount('1,500,000원'), 1500000);
  assert.equal(normalizePrizeAmount('-1000'), 0);
});
