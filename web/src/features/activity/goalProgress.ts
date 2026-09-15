import type { Todo } from '../../shared/types/domain';
import type { GoalScope } from './goalPeriod';

export type GoalGroups = Record<GoalScope, Todo[]>;

export function summarizeGoals(items: Todo[]) {
  const unique = [...new Map(items.map(item => [item.todo_id, item])).values()];
  const total = unique.length;
  const completed = unique.filter(item => item.status === '완료').length;
  const inProgress = unique.filter(item => item.status === '진행중').length;
  return {
    total,
    completed,
    inProgress,
    remaining: total - completed,
    percent: total ? Math.round(completed / total * 100) : 0,
  };
}

// The overview uses the current month/week, independently of the goal editor's date.
// Daily goals can span dates: include goals covering today, not only starting today.
export function goalProgress(groups: GoalGroups, today: string) {
  const todayGoals = groups.일일.filter(item =>
    item.scope_start_date.slice(0, 10) <= today && item.scope_end_date.slice(0, 10) >= today);
  return [
    { label: '현재 기간 전체', ...summarizeGoals([...groups.월간, ...groups.주간, ...groups.일일]) },
    { label: '이번 달', ...summarizeGoals(groups.월간) },
    { label: '이번 주', ...summarizeGoals(groups.주간) },
    { label: '오늘', ...summarizeGoals(todayGoals) },
  ];
}
