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

test('날짜가 고정된 과제도 선택한 요일 이후로 옮기고 부모 기간을 확장한다', () => {
  const plan = buildCurriculumPlan([
    { node_id: 1, level: 'MONTHLY', relative_start_day: 0, relative_end_day: 0 },
    { node_id: 2, parent_node_id: 1, level: 'WEEKLY', relative_start_day: 0, relative_end_day: 0 },
    { node_id: 3, parent_node_id: 2, level: 'DAILY', relative_start_day: 0, estimated_minutes: 60 },
  ], { startDate: '2026-09-08', availableWeekdays: [6], excludedDates: ['2026-09-12'], dailyMinutes: 60 });
  assert.equal(plan.goals[2].scope_start_date, '2026-09-19');
  assert.equal(plan.goals[0].scope_end_date, '2026-09-19');
  assert.equal(plan.goals[1].scope_end_date, '2026-09-19');
  assert.equal(plan.moved_goal_count, 1);
});

test('하루 학습량을 넘기면 다음 학습일로 넘기고 과제 순서를 보존한다', () => {
  const tasks = [1, 2, 3, 4].map(node_id => ({ node_id, level: 'DAILY', relative_start_day: 0, estimated_minutes: 60, sort_order: node_id }));
  const plan = buildCurriculumPlan(tasks, { startDate: '2026-09-08', availableWeekdays: [2, 4], dailyMinutes: 120 });
  assert.deepEqual(plan.goals.map(goal => goal.scope_start_date), ['2026-09-08', '2026-09-08', '2026-09-10', '2026-09-10']);
  assert.ok(plan.sessions.every(session => session.minutes <= 120));
});

test('긴 단일 과제는 단독 배치하고 과제 분할을 하지 않았음을 알린다', () => {
  const tasks = [180, 30].map((minutes, index) => ({ node_id: index + 1, level: 'DAILY', estimated_minutes: minutes, relative_start_day: 0, sort_order: index }));
  const plan = buildCurriculumPlan(tasks, { startDate: '2026-09-08', availableWeekdays: [2, 3], dailyMinutes: 60 });
  assert.equal(plan.sessions.length, 2);
  assert.equal(plan.oversized_goal_count, 1);
  assert.match(plan.warnings[0], /단독 배치/);
});

test('빈 요일·잘못된 휴일·잘못된 학습량은 조용히 보정하지 않고 거절한다', () => {
  for (const option of [{ availableWeekdays: [] }, { availableWeekdays: [9] }, { excludedDates: ['2026-02-30'] }, { excludedDates: '2026-09-08' }, { dailyMinutes: 0 }, { dailyMinutes: 481 }]) {
    assert.throws(() => buildCurriculumPlan(nodes, { startDate: '2026-09-08', ...option }), error => error.code === 'INVALID_SCHEDULE' && error.statusCode === 400);
  }
});

test('연말 휴일을 넘어도 사용 가능한 날짜만 배치하고 입력은 변경하지 않는다', () => {
  const original = JSON.stringify(nodes);
  const options = { startDate: '2026-12-31', availableWeekdays: [1], excludedDates: ['2027-01-04'], dailyMinutes: 90 };
  const a = buildCurriculumPlan(nodes, options);
  assert.equal(a.goals[2].scope_start_date, '2027-01-11');
  assert.deepEqual(a, buildCurriculumPlan(nodes, options));
  assert.equal(JSON.stringify(nodes), original);
});

test('추가 예시 과정은 학습 과제와 상위 목표가 빠짐없이 연결된다', () => {
  const examples = require('../../seeds/curriculumExamples');
  assert.equal(examples.length, 5);
  for (const example of examples) {
    assert.equal(example.organization_verified, false);
    assert.equal(example.nodes.filter(node => node.level === 'DAILY').length, 12);
    assert.equal(new Set(example.nodes.map(node => node.stable_key)).size, example.nodes.length);
    const known = new Set();
    for (const node of example.nodes) {
      if (node.parent_stable_key) assert.ok(known.has(node.parent_stable_key));
      known.add(node.stable_key);
    }
    assert.equal(example.nodes.filter(node => node.level === 'DAILY').reduce((sum, node) => sum + node.estimated_minutes, 0), example.weekly_hours * example.duration_weeks * 60);
  }
});
