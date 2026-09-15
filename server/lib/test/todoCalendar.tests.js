const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMonthTodoCalendar, findPeriodGoalCapacityConflict } = require('../todoCalendar');

test('일별 할 일 개수와 목록을 월 달력으로 구성한다', () => {
  const calendar = buildMonthTodoCalendar(2026, 7, [
    {
      todo_id: 1,
      title: '기획안 작성',
      status: '미진행',
      scope_type: '일일',
      scope_start_date: '2026-07-12',
      scope_end_date: '2026-07-12',
    },
    {
      todo_id: 2,
      title: '팀 회의',
      status: '진행중',
      scope_type: '주간',
      scope_start_date: '2026-07-12',
      scope_end_date: '2026-07-14',
    },
  ]);

  assert.equal(calendar.days.find((day) => day.date === '2026-07-12').count, 1);
  assert.equal(calendar.days.find((day) => day.date === '2026-07-13').count, 0);
  assert.equal(calendar.days.find((day) => day.date === '2026-07-15').count, 0);
});

test('기간 목표를 하나의 시작일과 종료일 구간으로 묶는다', () => {
  const calendar = buildMonthTodoCalendar(2026, 7, [
    {
      todo_id: 10,
      title: '매일 자료 조사',
      status: '완료',
      scope_type: '일일',
      scope_start_date: '2026-07-20',
      scope_end_date: '2026-07-20',
      range_group_id: 'range-1',
      range_start_date: '2026-07-20',
      range_end_date: '2026-07-22',
      range_color: '#6941C6',
    },
    {
      todo_id: 11,
      title: '매일 자료 조사',
      status: '미진행',
      scope_type: '일일',
      scope_start_date: '2026-07-21',
      scope_end_date: '2026-07-21',
      range_group_id: 'range-1',
      range_start_date: '2026-07-20',
      range_end_date: '2026-07-22',
      range_color: '#6941C6',
    },
  ]);

  assert.deepEqual(calendar.ranges, [{
    range_group_id: 'range-1',
    title: '매일 자료 조사',
    scope_type: '일일',
    color: '#6941C6',
    start_date: '2026-07-20',
    end_date: '2026-07-22',
    total_count: 2,
    completed_count: 1,
    status_counts: {
      미진행: 1,
      진행중: 0,
      완료: 1,
    },
  }]);
});

test('같은 날짜에 미완료 기간 목표가 3개면 추가를 차단한다', () => {
  const conflict = findPeriodGoalCapacityConflict(
    ['2026-07-20', '2026-07-21', '2026-07-22'],
    [
      { start_date: '2026-07-19', end_date: '2026-07-21', incomplete_count: 2 },
      { start_date: '2026-07-20', end_date: '2026-07-23', incomplete_count: 4 },
      { start_date: '2026-07-21', end_date: '2026-07-24', incomplete_count: 1 },
      { start_date: '2026-08-01', end_date: '2026-08-03', incomplete_count: 3 },
    ],
  );

  assert.deepEqual(conflict, { date: '2026-07-21', active_count: 3 });
});

test('완료된 기간 목표는 새 목표의 자리를 차지하지 않는다', () => {
  const conflict = findPeriodGoalCapacityConflict(
    ['2026-07-21'],
    [
      { start_date: '2026-07-20', end_date: '2026-07-22', incomplete_count: 2 },
      { start_date: '2026-07-20', end_date: '2026-07-22', incomplete_count: 1 },
      { start_date: '2026-07-20', end_date: '2026-07-22', incomplete_count: 0 },
    ],
  );

  assert.equal(conflict, null);
});
