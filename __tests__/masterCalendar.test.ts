import { daySignals, monthDays, onDay, weekRanges, type CalendarItem } from '../web/src/features/calendar/model';

const event = (id: string, props: Partial<CalendarItem> = {}): CalendarItem => ({
  id, kind: 'event', title: id, team_id: null, team_name: '개인', start_date: '2026-09-08', end_date: '2026-09-08',
  all_day: false, start_time: '10:00', end_time: '11:00', important: false, completed: false, ...props,
});

test('월 달력은 월요일부터 일요일까지이며 윤년과 연도 경계를 포함한다', () => {
  expect(monthDays('2024-02')).toContain('2024-02-29');
  expect(monthDays('2026-02')).not.toContain('2026-02-29');
  expect(monthDays('2026-01')[0]).toBe('2025-12-29');
  expect(monthDays('2026-01').length % 7).toBe(0);
});
test('연달아 있는 약속은 충돌하지 않고 실제 겹치는 시간만 감지한다', () => {
  const a = event('a'), b = event('b', { start_time: '11:00', end_time: '12:00' });
  expect(daySignals('2026-09-08', [a, b]).collisions).toHaveLength(0);
  expect(daySignals('2026-09-08', [a, event('c', { start_time: '10:30' })]).collisions).toHaveLength(1);
});
test('종일 목표와 완료한 약속은 시간 충돌에서 제외한다', () => {
  expect(daySignals('2026-09-08', [event('a'), event('b', { completed: true }), event('c', { kind: 'goal', all_day: true })]).collisions).toHaveLength(0);
});
test('자정을 넘는 일정과 종료일 00:00 경계를 처리한다', () => {
  const overnight = event('overnight', { start_date: '2026-09-07', start_time: '23:00', end_time: '01:00' });
  expect(daySignals('2026-09-08', [overnight, event('early', { start_time: '00:30', end_time: '02:00' })]).collisions).toHaveLength(1);
  expect(onDay({ ...overnight, end_time: '00:00' }, '2026-09-08')).toBe(false);
});
test('목표의 계층 중첩과 서로 다른 활동의 병행을 구분한다', () => {
  const goals = [event('monthly', { kind: 'goal', all_day: true, team_id: 1 }), event('weekly', { kind: 'goal', all_day: true, team_id: 1 })];
  expect(daySignals('2026-09-08', goals).parallelTeams).toBe(1);
  expect(daySignals('2026-09-08', [...goals, event('other', { kind: 'goal', team_id: 2, all_day: true })]).parallelTeams).toBe(2);
});
test('같은 날짜의 마감 몰림은 시간 충돌과 따로 계산한다', () => {
  const signals = daySignals('2026-09-08', [event('a', { kind: 'deadline', all_day: true }), event('b', { kind: 'issue', all_day: true })]);
  expect(signals.deadlines).toHaveLength(2);
  expect(signals.collisions).toHaveLength(0);
});
test('기간 막대는 주 경계에 맞춰 잘리고 같은 날짜 칸을 덮지 않는다', () => {
  const days = monthDays('2026-09').slice(7, 14);
  const a = event('a', { start_date: '2026-09-01', end_date: '2026-09-09', all_day: true });
  const b = event('b', { start_date: '2026-09-08', end_date: '2026-09-15', all_day: true });
  const ranges = weekRanges(days, [b, a]);
  expect(ranges[0]).toMatchObject({ start: 0, end: 2, lane: 0 });
  expect(ranges[1]).toMatchObject({ start: 1, end: 6, lane: 1 });
});
