const ROADMAP_SOURCE = 'EXISTING_TODOS';
const VALID_STATUSES = new Set(['미진행', '진행중', '완료']);
const STATUS_SCORES = {
  미진행: 0,
  진행중: 0.5,
  완료: 1,
};
const SCOPE_ORDER = {
  월간: 0,
  주간: 1,
  일일: 2,
  전체: 3,
};

const pad = (value) => String(value).padStart(2, '0');

const formatLocalDate = (date) => (
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
);

const isValidDateKey = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const toDateKey = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : formatLocalDate(value);
  }

  const candidate = String(value).slice(0, 10);
  return isValidDateKey(candidate) ? candidate : null;
};

const toDayNumber = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
};

const fromDayNumber = (dayNumber) => {
  const date = new Date(dayNumber * 86400000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const clampTitle = (value, fallback = '이름 없는 목표') => {
  const title = String(value || '').trim();
  return (title || fallback).slice(0, 120);
};

const normalizeTodo = (todo, index) => {
  const startDate = toDateKey(todo?.scope_start_date);
  const endDate = toDateKey(todo?.scope_end_date) || startDate;
  const normalizedStart = startDate && endDate && startDate > endDate ? endDate : startDate;
  const normalizedEnd = startDate && endDate && startDate > endDate ? startDate : endDate;
  const scopeType = Object.prototype.hasOwnProperty.call(SCOPE_ORDER, todo?.scope_type)
    ? todo.scope_type
    : '전체';
  const status = VALID_STATUSES.has(todo?.status) ? todo.status : '미진행';
  const numericId = Number(todo?.todo_id);

  return {
    todo_id: Number.isInteger(numericId) && numericId > 0 ? numericId : `generated-${index}`,
    title: clampTitle(todo?.title),
    status,
    scope_type: scopeType,
    scope_start_date: normalizedStart,
    scope_end_date: normalizedEnd,
  };
};

const compareTodos = (first, second) => (
  (first.scope_start_date || '9999-12-31').localeCompare(second.scope_start_date || '9999-12-31')
  || (SCOPE_ORDER[first.scope_type] ?? 99) - (SCOPE_ORDER[second.scope_type] ?? 99)
  || String(first.todo_id).localeCompare(String(second.todo_id))
);

const calculateProgress = (todos) => {
  if (!todos.length) return 0;
  const score = todos.reduce((total, todo) => total + STATUS_SCORES[todo.status], 0);
  return Math.round((score / todos.length) * 100);
};

const summarizeTodos = (todos) => {
  const summary = {
    total_count: todos.length,
    completed_count: 0,
    in_progress_count: 0,
    pending_count: 0,
    percent: calculateProgress(todos),
  };

  todos.forEach((todo) => {
    if (todo.status === '완료') summary.completed_count += 1;
    else if (todo.status === '진행중') summary.in_progress_count += 1;
    else summary.pending_count += 1;
  });

  return summary;
};

const getWeekRange = (dateKey) => {
  const dayNumber = toDayNumber(dateKey);
  const weekday = new Date(dayNumber * 86400000).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  return {
    start_date: fromDayNumber(dayNumber - mondayOffset),
    end_date: fromDayNumber(dayNumber - mondayOffset + 6),
  };
};

const getWeekOfMonthTitle = (dateKey) => {
  if (!dateKey) return '기간 미정 목표';
  const [year, month, day] = dateKey.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const mondayOffset = (firstWeekday + 6) % 7;
  const weekOfMonth = Math.ceil((day + mondayOffset) / 7);
  return `${month}월 ${weekOfMonth}주차`;
};

const rangesOverlap = (first, second) => (
  Boolean(first.start_date && first.end_date && second.scope_start_date && second.scope_end_date)
  && first.start_date <= second.scope_end_date
  && first.end_date >= second.scope_start_date
);

const overlapDays = (segment, todo) => {
  if (!rangesOverlap(segment, todo)) return 0;
  const start = Math.max(toDayNumber(segment.start_date), toDayNumber(todo.scope_start_date));
  const end = Math.min(toDayNumber(segment.end_date), toDayNumber(todo.scope_end_date));
  return end - start + 1;
};

const groupAnchors = (anchors, sourceScope) => {
  const byRange = new Map();

  anchors.forEach((todo) => {
    const range = todo.scope_start_date && todo.scope_end_date
      ? { start_date: todo.scope_start_date, end_date: todo.scope_end_date }
      : { start_date: null, end_date: null };
    const key = `${range.start_date || 'undated'}:${range.end_date || 'undated'}`;
    const current = byRange.get(key) || {
      id: `${sourceScope === '주간' ? 'weekly' : 'monthly'}:${key}`,
      source_scope_type: sourceScope,
      start_date: range.start_date,
      end_date: range.end_date,
      anchor_todos: [],
      todos: [],
    };
    current.anchor_todos.push(todo);
    current.todos.push(todo);
    byRange.set(key, current);
  });

  return [...byRange.values()];
};

const buildDerivedSegment = (todo) => {
  if (!todo.scope_start_date) {
    return {
      id: 'derived:undated',
      source_scope_type: '일일',
      start_date: null,
      end_date: null,
      anchor_todos: [],
      todos: [],
    };
  }

  const range = getWeekRange(todo.scope_start_date);
  return {
    id: `derived:${range.start_date}:${range.end_date}`,
    source_scope_type: '일일',
    ...range,
    anchor_todos: [],
    todos: [],
  };
};

const findBestSegment = (segments, todo) => {
  const candidates = segments
    .map((segment, index) => ({ segment, index, overlap: overlapDays(segment, todo) }))
    .filter((candidate) => candidate.overlap > 0)
    .sort((first, second) => (
      second.overlap - first.overlap
      || (toDayNumber(first.segment.end_date) - toDayNumber(first.segment.start_date))
        - (toDayNumber(second.segment.end_date) - toDayNumber(second.segment.start_date))
      || first.index - second.index
    ));

  return candidates[0]?.segment || null;
};

const getSegmentStatus = (segment, today) => {
  if (segment.summary.total_count > 0 && segment.summary.completed_count === segment.summary.total_count) {
    return '완료';
  }
  if (segment.end_date && segment.end_date < today) return '지연';
  if (segment.start_date && segment.start_date > today) return '예정';
  if (segment.summary.in_progress_count > 0 || segment.summary.completed_count > 0) return '진행중';
  if (segment.start_date && segment.end_date && segment.start_date <= today && segment.end_date >= today) {
    return '진행중';
  }
  return '미진행';
};

const finalizeSegments = (segments, today) => segments
  .map((segment) => {
    const todos = [...segment.todos].sort(compareTodos);
    const anchorTitles = segment.anchor_todos.map((todo) => todo.title);
    const fallbackDate = getWeekOfMonthTitle(segment.start_date);
    const title = anchorTitles.length > 1
      ? `${anchorTitles[0]} 외 ${anchorTitles.length - 1}개`
      : anchorTitles[0] || fallbackDate;
    const summary = summarizeTodos(todos);
    const next = {
      id: segment.id,
      title,
      source_scope_type: segment.source_scope_type,
      start_date: segment.start_date,
      end_date: segment.end_date,
      status: '미진행',
      summary,
      todos,
    };
    next.status = getSegmentStatus(next, today);
    return next;
  })
  .sort((first, second) => (
    (first.start_date || '9999-12-31').localeCompare(second.start_date || '9999-12-31')
    || first.title.localeCompare(second.title, 'ko')
  ));

const findCurrentSegmentIndex = (segments, today) => {
  const activeIndex = segments.findIndex((segment) => (
    segment.status !== '완료'
    && segment.start_date
    && segment.end_date
    && segment.start_date <= today
    && segment.end_date >= today
  ));
  if (activeIndex >= 0) return activeIndex;

  const upcomingIndex = segments.findIndex((segment) => (
    segment.status !== '완료' && segment.start_date && segment.start_date > today
  ));
  if (upcomingIndex >= 0) return upcomingIndex;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].status !== '완료') return index;
  }

  return segments.length ? segments.length - 1 : -1;
};

const buildLearningRoadmap = ({
  teamId = null,
  teamName = '',
  activityStartDate = null,
  activityEndDate = null,
  today = formatLocalDate(new Date()),
  todos = [],
} = {}) => {
  const todayKey = toDateKey(today) || formatLocalDate(new Date());
  const uniqueTodos = new Map();
  (Array.isArray(todos) ? todos : []).forEach((todo, index) => {
    const normalized = normalizeTodo(todo, index);
    uniqueTodos.set(String(normalized.todo_id), normalized);
  });
  const normalizedTodos = [...uniqueTodos.values()].sort(compareTodos);
  const monthlyTodos = normalizedTodos.filter((todo) => todo.scope_type === '월간');
  const weeklyTodos = normalizedTodos.filter((todo) => todo.scope_type === '주간');
  const dailyTodos = normalizedTodos.filter((todo) => todo.scope_type === '일일');
  const otherTodos = normalizedTodos.filter((todo) => todo.scope_type === '전체');

  let segments = weeklyTodos.length
    ? groupAnchors(weeklyTodos, '주간')
    : monthlyTodos.length
      ? groupAnchors(monthlyTodos, '월간')
      : [];

  const assignedTodoIds = new Set(segments.flatMap((segment) => segment.todos.map((todo) => String(todo.todo_id))));
  const childTodos = [...dailyTodos, ...otherTodos];

  childTodos.forEach((todo) => {
    if (assignedTodoIds.has(String(todo.todo_id))) return;
    let segment = findBestSegment(segments, todo);
    if (!segment) {
      const derived = buildDerivedSegment(todo);
      segment = segments.find((candidate) => candidate.id === derived.id);
      if (!segment) {
        segment = derived;
        segments.push(segment);
      }
    }
    segment.todos.push(todo);
    assignedTodoIds.add(String(todo.todo_id));
  });

  if (!segments.length && normalizedTodos.length) {
    normalizedTodos.forEach((todo) => {
      const derived = buildDerivedSegment(todo);
      let segment = segments.find((candidate) => candidate.id === derived.id);
      if (!segment) {
        segment = derived;
        segments.push(segment);
      }
      segment.todos.push(todo);
    });
  }

  segments = finalizeSegments(segments, todayKey);
  const currentIndex = findCurrentSegmentIndex(segments, todayKey);
  const currentSegment = currentIndex >= 0 ? segments[currentIndex] : null;
  const nextSegment = currentIndex >= 0
    ? segments.slice(currentIndex + 1).find((segment) => segment.status !== '완료') || null
    : null;
  const activeMilestone = monthlyTodos.find((todo) => (
    todo.status !== '완료'
    && todo.scope_start_date
    && todo.scope_end_date
    && todo.scope_start_date <= todayKey
    && todo.scope_end_date >= todayKey
  )) || monthlyTodos.find((todo) => todo.status !== '완료') || monthlyTodos[0];
  const validStarts = normalizedTodos.map((todo) => todo.scope_start_date).filter(Boolean);
  const validEnds = normalizedTodos.map((todo) => todo.scope_end_date).filter(Boolean);
  const fallbackStart = toDateKey(activityStartDate);
  const fallbackEnd = toDateKey(activityEndDate);
  const summary = summarizeTodos(normalizedTodos);

  return {
    team_id: Number.isInteger(Number(teamId)) ? Number(teamId) : null,
    title: activeMilestone?.title || `${clampTitle(teamName, '현재 활동')} 학습 로드맵`,
    source: ROADMAP_SOURCE,
    is_generated: true,
    period: {
      start_date: validStarts.length ? validStarts.sort()[0] : fallbackStart,
      end_date: validEnds.length ? validEnds.sort().at(-1) : fallbackEnd,
    },
    summary,
    today_remaining_count: normalizedTodos.filter((todo) => (
      todo.status !== '완료'
      && todo.scope_start_date
      && todo.scope_end_date
      && todo.scope_start_date <= todayKey
      && todo.scope_end_date >= todayKey
    )).length,
    milestones: monthlyTodos,
    current_segment_id: currentSegment?.id || null,
    current_segment: currentSegment,
    next_segment: nextSegment,
    segments,
  };
};

module.exports = {
  ROADMAP_SOURCE,
  buildLearningRoadmap,
  calculateProgress,
  toDateKey,
};
