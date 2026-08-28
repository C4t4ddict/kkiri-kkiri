const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCurriculumPlan,
  normalizeAvailableWeekdays,
} = require('../curriculumSchedule');

const nodes = [
  {
    node_id: 1,
    stable_key: 'month-1',
    level: 'MONTHLY',
    title: '컨테이너 기초 완성',
    relative_start_day: 0,
    relative_end_day: 27,
    estimated_minutes: 120,
    is_required: 1,
    sort_order: 10,
  },
  {
    node_id: 2,
    stable_key: 'week-1',
    level: 'WEEKLY',
    title: 'Docker 핵심 명령 익히기',
    relative_start_day: 0,
    relative_end_day: 6,
    estimated_minutes: 180,
    is_required: 1,
    sort_order: 20,
  },
  {
    node_id: 3,
    stable_key: 'day-1',
    level: 'DAILY',
    title: '로컬 이미지 빌드',
    relative_start_day: 1,
    relative_end_day: 3,
    estimated_minutes: 60,
    is_required: 1,
    sort_order: 30,
  },
];

test('기업 커리큘럼의 상대 일정을 월간·주간·일일 목표로 변환한다', () => {
  const plan = buildCurriculumPlan(nodes, {
    startDate: '2026-08-30',
    availableWeekdays: [1, 3, 5],
  });

  assert.equal(plan.start_date, '2026-08-30');
  assert.equal(plan.end_date, '2026-09-26');
  assert.deepEqual(plan.level_counts, { 월간: 1, 주간: 1, 일일: 1 });
  assert.equal(plan.goals[0].scope_type, '월간');
  assert.equal(plan.goals[2].scope_start_date, '2026-08-31');
  assert.equal(plan.total_minutes, 360);
});

test('일일 목표는 사용자가 선택한 학습 가능 요일로 이동한다', () => {
  const plan = buildCurriculumPlan([{
    node_id: 5,
    stable_key: 'practice',
    level: 'DAILY',
    title: '실습',
    relative_start_day: 0,
    relative_end_day: 4,
  }], {
    startDate: '2026-08-30',
    availableWeekdays: [2, 4],
  });

  assert.equal(plan.goals[0].scope_start_date, '2026-09-01');
});

test('목표 계층의 시간이 중복되어도 권장 주당 학습시간을 우선한다', () => {
  const plan = buildCurriculumPlan(nodes, {
    startDate: '2026-08-30',
    weeklyHours: 5,
    durationWeeks: 8,
  });

  assert.equal(plan.total_minutes, 2400);
  assert.equal(plan.total_hours, 40);
});

test('요일 7은 일요일로 정규화하고 잘못된 입력은 기본 평일을 사용한다', () => {
  assert.deepEqual(normalizeAvailableWeekdays([7, 1, 1]), [0, 1]);
  assert.deepEqual(normalizeAvailableWeekdays(['x']), [1, 2, 3, 4, 5]);
});

test('잘못된 시작일은 계획 생성을 거절한다', () => {
  assert.throws(
    () => buildCurriculumPlan(nodes, { startDate: '2026-02-30' }),
    /시작일은 YYYY-MM-DD 형식이어야 합니다/,
  );
});
