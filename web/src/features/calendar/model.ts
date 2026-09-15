export type CalendarItem = {
  id: string; kind: 'goal' | 'deadline' | 'issue' | 'event'; title: string;
  team_id: number | null; team_name: string; start_date: string; end_date: string;
  all_day: boolean; start_time?: string | null; end_time?: string | null;
  important: boolean; completed: boolean; in_progress?: boolean; notes?: string;
  scope?: string; is_range?: boolean; total_count?: number; completed_count?: number;
  href?: string; event_id?: number; version?: number;
};
export type CalendarData = {
  start: string; end: string; timezone: string;
  teams: { team_id: number; team_name: string }[]; events: CalendarItem[];
};
export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const dateOf = (key: string) => new Date(`${key}T12:00:00`);
export const addDays = (key: string, amount: number) => { const date = dateOf(key); date.setDate(date.getDate() + amount); return dayKey(date); };
export function monthDays(month: string) {
  const first = dateOf(`${month}-01`);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12);
  const start = addDays(dayKey(first), -(first.getDay() + 6) % 7);
  const end = addDays(dayKey(last), 6 - (last.getDay() + 6) % 7);
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}
export const onDay = (item: CalendarItem, day: string) => item.start_date <= day && item.end_date >= day
  && !(item.all_day === false && item.end_date === day && item.end_time === '00:00');
export const kindLabel = (item: CalendarItem) => item.kind === 'goal' ? (item.is_range ? '구간 목표' : `${item.scope || ''} 목표`)
  : item.kind === 'deadline' ? '활동 마감' : item.kind === 'issue' ? '이슈 마감' : '내 일정';
export const whenLabel = (item: CalendarItem) => item.all_day ? '종일' : `${item.start_time}–${item.end_time}${item.start_date !== item.end_date ? ' · 여러 날' : ''}`;
export const shortDate = (key: string) => `${Number(key.slice(5, 7))}.${Number(key.slice(8, 10))}`;
export const itemOrder = (a: CalendarItem, b: CalendarItem) => Number(a.completed) - Number(b.completed)
  || Number(b.important) - Number(a.important) || (a.start_time || '').localeCompare(b.start_time || '') || a.id.localeCompare(b.id);

// 시간 일정은 [시작, 종료)로 비교합니다. 종일 목표가 겹쳐도 시간 충돌로 세지 않습니다.
export function daySignals(day: string, items: CalendarItem[]) {
  const active = items.filter(item => !item.completed && onDay(item, day));
  const timed = active.filter(item => !item.all_day).sort((a, b) => `${a.start_date}T${a.start_time}`.localeCompare(`${b.start_date}T${b.start_time}`));
  const collisions: [CalendarItem, CalendarItem][] = [];
  // 표시용 충돌 쌍은 제한하여 일정이 과도하게 많은 날에도 화면을 멈추지 않습니다.
  for (let i = 0; i < timed.length && collisions.length < 100; i++) for (let j = i + 1; j < timed.length && collisions.length < 100; j++) {
    const a = timed[i], b = timed[j];
    if (`${b.start_date}T${b.start_time}` >= `${a.end_date}T${a.end_time}`) break;
    if (`${a.start_date}T${a.start_time}` < `${b.end_date}T${b.end_time}`
      && `${b.start_date}T${b.start_time}` < `${a.end_date}T${a.end_time}`) collisions.push([a, b]);
  }
  return { collisions, deadlines: active.filter(item => item.kind === 'deadline' || item.kind === 'issue'),
    parallelTeams: new Set(active.filter(item => item.kind === 'goal').map(item => item.team_id)).size };
}

// 한 주 안에서 막대가 차지하는 날짜 칸을 예약하여 서로 덮이지 않게 합니다.
export function weekRanges(days: string[], items: CalendarItem[]) {
  const occupied: boolean[][] = [];
  return items.filter(item => item.start_date !== item.end_date && days.some(day => onDay(item, day)))
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || b.end_date.localeCompare(a.end_date) || a.id.localeCompare(b.id))
    .map(item => {
      const indexes = days.flatMap((day, index) => onDay(item, day) ? [index] : []);
      const start = indexes[0], end = indexes[indexes.length - 1];
      let lane = occupied.findIndex(row => indexes.every(index => !row[index]));
      if (lane < 0) { lane = occupied.length; occupied.push(Array(7).fill(false)); }
      indexes.forEach(index => { occupied[lane][index] = true; });
      return { item, start, end, lane };
    });
}
