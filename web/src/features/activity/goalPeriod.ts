import type { Todo } from '../../shared/types/domain';

export type GoalScope = Todo['scope_type'];

export const dateKey = (date: Date) => [
  date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0'),
].join('-');

export function goalPeriod(value: string, scope: GoalScope) {
  const date = new Date(`${value}T12:00:00`);
  const start = new Date(date);
  const end = new Date(date);
  if (scope === '주간') {
    start.setDate(date.getDate() - (date.getDay() + 6) % 7);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (scope === '월간') {
    start.setDate(1);
    end.setMonth(date.getMonth() + 1, 0);
  }
  return { start: dateKey(start), end: dateKey(end) };
}

export function moveGoalDate(value: string, scope: GoalScope, direction: number) {
  const date = new Date(`${value}T12:00:00`);
  if (scope === '월간') {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + direction);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
  } else {
    date.setDate(date.getDate() + direction * (scope === '주간' ? 7 : 1));
  }
  return dateKey(date);
}

// 수정 시각과 상태는 행의 위치를 결정하지 않습니다.
export const stableGoals = (items: Todo[]) => [...items].sort((a, b) => a.todo_id - b.todo_id);
