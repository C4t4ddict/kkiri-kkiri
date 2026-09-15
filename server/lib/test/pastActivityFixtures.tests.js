const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HISTORY_SEED_MARKERS,
  buildHistoryPeriod,
  createHistoryFixture,
  hasVerifiedCommendationPrize,
  selectHistoryActivities,
} = require('../../seeds/pastActivityFixtures');

const actualActivities = [
  {
    activity_id: 29,
    title: '제17회 LH 국토기술대전',
    source_name: '위비티',
    source_url: 'https://example.com/lh',
    topic_category: '기획·아이디어',
    prize_details: '장려상 100만원',
    application_period_start: '2026-07-27',
    application_period_end: '2026-08-28',
    is_hidden: 0,
  },
  {
    activity_id: 33,
    title: '제24회 임베디드SW경진대회',
    source_name: '씽굿',
    source_url: 'https://example.com/sw',
    topic_category: 'IT·소프트웨어',
    prize_details: '대상 300만원',
    application_period_start: '2026-05-06',
    application_period_end: '2026-09-03',
    is_hidden: 0,
  },
  {
    activity_id: 99,
    title: '로컬 데모',
    source_name: 'local-demo',
    prize_details: '장려상 100만원',
    is_hidden: 0,
  },
];

test('실제 수집된 수상 공고와 IT 공고를 고정 순서로 선택한다', () => {
  assert.deepEqual(
    selectHistoryActivities(actualActivities).map((activity) => activity.activity_id),
    [29, 33],
  );
});

test('장려상 100만 원이 원문에 있을 때만 수상 예시로 인정한다', () => {
  assert.equal(hasVerifiedCommendationPrize(actualActivities[0]), true);
  assert.equal(hasVerifiedCommendationPrize(actualActivities[1]), false);
});

test('지난 활동 종료일은 오늘보다 미래가 되지 않는다', () => {
  const period = buildHistoryPeriod(actualActivities[1], new Date('2026-08-31T12:00:00'), 1);
  assert.deepEqual(period, { start: '2026-05-06', end: '2026-08-24' });
});

test('두 시드 슬롯은 재실행해도 같은 마커와 수상 정책을 사용한다', () => {
  const first = createHistoryFixture(0, actualActivities[0], new Date('2026-08-31T12:00:00'));
  const second = createHistoryFixture(1, actualActivities[1], new Date('2026-08-31T12:00:00'));

  assert.equal(first.marker, HISTORY_SEED_MARKERS[0]);
  assert.equal(second.marker, HISTORY_SEED_MARKERS[1]);
  assert.deepEqual(first.award, {
    is_awarded: true,
    award_title: '장려상',
    has_prize: true,
    prize_amount: 1000000,
    tax_applied: true,
  });
  assert.deepEqual(second.award, { is_awarded: false });
});
