import { dateKey, goalPeriod, moveGoalDate, stableGoals } from '../web/src/features/activity/goalPeriod';
import type { Todo } from '../web/src/shared/types/domain';

describe('활동 목표 기간', () => {
  it('일일은 선택한 날짜 하나만 조회한다', () => {
    expect(goalPeriod('2026-09-09', '일일')).toEqual({ start: '2026-09-09', end: '2026-09-09' });
  });
  it('주간은 연도가 달라도 월요일부터 일요일까지다', () => {
    expect(goalPeriod('2026-01-01', '주간')).toEqual({ start: '2025-12-29', end: '2026-01-04' });
  });
  it('윤년 2월과 12월의 마지막 날을 계산한다', () => {
    expect(goalPeriod('2024-02-10', '월간')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(goalPeriod('2026-12-31', '월간')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });
  it('월말에서 다음 달로 이동해도 한 달을 건너뛰지 않는다', () => {
    expect(moveGoalDate('2026-01-31', '월간', 1)).toBe('2026-02-28');
    expect(moveGoalDate('2024-03-31', '월간', -1)).toBe('2024-02-29');
    expect(moveGoalDate('2026-12-31', '월간', 1)).toBe('2027-01-31');
  });
  it('이전·다음 일자와 주를 달 경계에서도 이동한다', () => {
    expect(moveGoalDate('2026-09-01', '일일', -1)).toBe('2026-08-31');
    expect(moveGoalDate('2026-09-28', '주간', 1)).toBe('2026-10-05');
    expect(dateKey(new Date(2026, 8, 7, 0))).toBe('2026-09-07');
  });
  it('상태와 API 응답 순서가 달라도 등록 순서는 유지한다', () => {
    const todos: Todo[] = [3, 1, 2].map(id => ({ todo_id: id, title: `${id}`, status: '미진행', scope_type: '일일', scope_start_date: '2026-09-07', scope_end_date: '2026-09-07' }));
    const original = stableGoals(todos);
    const updated = stableGoals([{ ...todos[2], status: '완료' }, { ...todos[0], status: '진행중' }, todos[1]]);
    expect(original.map(todo => todo.todo_id)).toEqual([1, 2, 3]);
    expect(updated.map(todo => todo.todo_id)).toEqual([1, 2, 3]);
    expect(todos.map(todo => todo.todo_id)).toEqual([3, 1, 2]);
  });
});
