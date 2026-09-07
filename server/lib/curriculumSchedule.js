const DAY_MS = 24 * 60 * 60 * 1000;

const parseDateOnly = (value) => {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
};

const formatDateOnly = (date) => date.toISOString().slice(0, 10);

const addDays = (date, amount) => new Date(date.getTime() + (Number(amount) || 0) * DAY_MS);

const normalizeAvailableWeekdays = (value) => {
  const source = Array.isArray(value) ? value : [1, 2, 3, 4, 5];
  const normalized = source
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 7)
    .map((day) => day === 7 ? 0 : day);
  return [...new Set(normalized)].length ? [...new Set(normalized)] : [1, 2, 3, 4, 5];
};

const invalidSchedule = (message) => Object.assign(new Error(message), { code: 'INVALID_SCHEDULE', statusCode: 400 });

const mapLevelToScope = (level) => ({
  MONTHLY: '월간',
  WEEKLY: '주간',
  DAILY: '일일',
}[String(level || '').toUpperCase()] || '일일');

const buildCurriculumPlan = (nodes, options = {}) => {
  const startDate = parseDateOnly(options.startDate);
  if (!startDate) {
    const error = new Error('시작일은 YYYY-MM-DD 형식이어야 합니다');
    error.code = 'INVALID_START_DATE';
    throw error;
  }

  const weekdays = normalizeAvailableWeekdays(options.availableWeekdays);
  if (options.availableWeekdays !== undefined && (!Array.isArray(options.availableWeekdays)
    || !options.availableWeekdays.length || options.availableWeekdays.length > 7
    || options.availableWeekdays.some(day => !Number.isInteger(Number(day)) || Number(day) < 0 || Number(day) > 7))) {
    throw invalidSchedule('학습할 요일을 하나 이상 선택해주세요');
  }
  const dailyMinutes = options.dailyMinutes == null ? null : Number(options.dailyMinutes);
  if (dailyMinutes !== null && (!Number.isInteger(dailyMinutes) || dailyMinutes < 30 || dailyMinutes > 480)) {
    throw invalidSchedule('하루 학습량은 30~480분으로 설정해주세요');
  }
  const excludedDates = options.excludedDates ?? [];
  if (!Array.isArray(excludedDates) || excludedDates.length > 120 || excludedDates.some(day => !parseDateOnly(day))) {
    throw invalidSchedule('쉬는 날짜는 올바른 날짜로 최대 120개까지 선택해주세요');
  }
  const excluded = new Set(excludedDates);
  const sortedNodes = [...(Array.isArray(nodes) ? nodes : [])].sort((first, second) => (
    Number(first.sort_order || 0) - Number(second.sort_order || 0)
    || Number(first.relative_start_day || 0) - Number(second.relative_start_day || 0)
  ));

  const goals = sortedNodes.map((node) => {
    const relativeStart = Math.max(0, Number(node.relative_start_day || 0));
    const relativeEnd = Math.max(relativeStart, Number(node.relative_end_day ?? relativeStart));
    const scheduledStart = addDays(startDate, relativeStart);
    const scheduledEnd = addDays(startDate, relativeEnd);
    const scopeType = mapLevelToScope(node.level);

    return {
      curriculum_node_id: Number(node.node_id),
      stable_key: node.stable_key,
      parent_node_id: node.parent_node_id ? Number(node.parent_node_id) : null,
      title: node.title,
      description: node.description || '',
      scope_type: scopeType,
      scope_start_date: formatDateOnly(scheduledStart),
      scope_end_date: formatDateOnly(scheduledEnd),
      estimated_minutes: Math.max(0, Number(node.estimated_minutes || 0)),
      is_required: Boolean(node.is_required),
      assignment_mode: node.assignment_mode || 'ALL_MEMBERS',
      sort_order: Number(node.sort_order || 0),
    };
  });

  // Preserve learning order, move only forward, and never fall back to an unavailable day.
  const dailyGoals = goals.filter(goal => goal.scope_type === '일일').sort((a, b) =>
    a.scope_start_date.localeCompare(b.scope_start_date) || a.sort_order - b.sort_order);
  const sessions = new Map();
  let previousDay = formatDateOnly(startDate);
  let movedGoals = 0;
  let oversizedGoals = 0;
  for (const goal of dailyGoals) {
    const originalDay = goal.scope_start_date;
    let candidate = parseDateOnly(originalDay > previousDay ? originalDay : previousDay);
    const minutes = goal.estimated_minutes || 60;
    let placed = false;
    for (let attempt = 0; attempt < 1095; attempt += 1) {
      const key = formatDateOnly(candidate);
      const used = sessions.get(key)?.minutes || 0;
      if (weekdays.includes(candidate.getUTCDay()) && !excluded.has(key)
        && (!dailyMinutes || used === 0 || used + minutes <= dailyMinutes)) {
        goal.scope_start_date = key;
        goal.scope_end_date = key;
        previousDay = key;
        if (key !== originalDay) movedGoals += 1;
        if (dailyMinutes && minutes > dailyMinutes) oversizedGoals += 1;
        const session = sessions.get(key) || { date: key, minutes: 0, goal_count: 0 };
        session.minutes += minutes;
        session.goal_count += 1;
        sessions.set(key, session);
        placed = true;
        break;
      }
      candidate = addDays(candidate, 1);
    }
    if (!placed) throw invalidSchedule('일정을 배치할 수 없습니다. 학습 요일이나 쉬는 날짜를 조정해주세요');
  }
  // If a daily task moves beyond its parent, expand the weekly/monthly goal with it.
  const byId = new Map(goals.map(goal => [goal.curriculum_node_id, goal]));
  for (const goal of dailyGoals) {
    let parent = byId.get(goal.parent_node_id);
    const visited = new Set([goal.curriculum_node_id]);
    while (parent && !visited.has(parent.curriculum_node_id)) {
      visited.add(parent.curriculum_node_id);
      if (parent.scope_start_date > goal.scope_start_date) parent.scope_start_date = goal.scope_start_date;
      if (parent.scope_end_date < goal.scope_end_date) parent.scope_end_date = goal.scope_end_date;
      parent = byId.get(parent.parent_node_id);
    }
  }

  const estimatedMinutes = goals.reduce((sum, goal) => sum + goal.estimated_minutes, 0);
  const recommendedMinutes = Number(options.weeklyHours) > 0 && Number(options.durationWeeks) > 0
    ? Math.round(Number(options.weeklyHours) * Number(options.durationWeeks) * 60)
    : 0;
  const totalMinutes = recommendedMinutes || estimatedMinutes;
  const endDate = goals.reduce(
    (latest, goal) => goal.scope_end_date > latest ? goal.scope_end_date : latest,
    formatDateOnly(startDate),
  );
  const levelCounts = goals.reduce((counts, goal) => {
    counts[goal.scope_type] = (counts[goal.scope_type] || 0) + 1;
    return counts;
  }, { 월간: 0, 주간: 0, 일일: 0 });

  return {
    start_date: formatDateOnly(startDate),
    end_date: endDate,
    available_weekdays: weekdays,
    daily_minutes: dailyMinutes,
    excluded_dates: [...excluded].sort(),
    moved_goal_count: movedGoals,
    oversized_goal_count: oversizedGoals,
    sessions: [...sessions.values()],
    warnings: [
      ...(oversizedGoals ? [`하루 학습량보다 긴 과제 ${oversizedGoals}개는 나누지 않고 단독 배치했습니다.`] : []),
      ...(dailyGoals.some(goal => !goal.estimated_minutes) ? ['시간이 지정되지 않은 과제는 배치 계산에 60분을 사용했습니다.'] : []),
    ],
    total_minutes: totalMinutes,
    total_hours: Math.round((totalMinutes / 60) * 10) / 10,
    level_counts: levelCounts,
    goals,
  };
};

module.exports = {
  addDays,
  buildCurriculumPlan,
  formatDateOnly,
  mapLevelToScope,
  normalizeAvailableWeekdays,
  parseDateOnly,
};
