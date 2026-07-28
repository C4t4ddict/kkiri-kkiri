const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMonthTodoCalendar } = require('../todoCalendar');

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
    },
  ]);

  assert.deepEqual(calendar.ranges, [{
    range_group_id: 'range-1',
    title: '매일 자료 조사',
    scope_type: '일일',
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
