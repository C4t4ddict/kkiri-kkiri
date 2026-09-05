const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateNetPrize,
  normalizeAward,
  normalizePrizeAmount,
  sanitizeAwardInput,
  upsertAward,
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

test('저장 레코드가 있으면 수상 여부와 별개로 작성 완료 상태가 된다', () => {
  assert.equal(normalizeAward({ award_id: 12, is_awarded: 0 }).is_recorded, true);
  assert.equal(normalizeAward({ award_id: null, is_awarded: 0 }).is_recorded, false);
});

test('미수상 기록도 삭제하지 않고 작성 완료 레코드로 저장한다', async () => {
  const queries = [];
  const db = {
    query: async (sql) => {
      queries.push(sql);
      if (sql.startsWith('SELECT portfolio_id')) return [[{ portfolio_id: 7 }]];
      if (sql.includes('FROM miniportfolios mp')) return [[]];
      return [{}];
    },
  };

  await upsertAward(db, 3, 7, { is_awarded: false });

  assert.equal(queries.some((sql) => sql.includes('INSERT INTO user_awards')), true);
  assert.equal(queries.some((sql) => sql.includes('DELETE FROM user_awards')), false);
});
