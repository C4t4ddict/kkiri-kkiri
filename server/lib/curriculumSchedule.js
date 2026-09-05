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

const findAvailableDate = (candidate, weekdays, latest) => {
  let current = candidate;
  for (let offset = 0; offset < 14; offset += 1) {
    if (weekdays.includes(current.getUTCDay()) && (!latest || current <= latest)) return current;
    current = addDays(current, 1);
  }
  return candidate;
};

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
  const sortedNodes = [...(Array.isArray(nodes) ? nodes : [])].sort((first, second) => (
    Number(first.sort_order || 0) - Number(second.sort_order || 0)
    || Number(first.relative_start_day || 0) - Number(second.relative_start_day || 0)
  ));

  const goals = sortedNodes.map((node) => {
    const relativeStart = Math.max(0, Number(node.relative_start_day || 0));
    const relativeEnd = Math.max(relativeStart, Number(node.relative_end_day ?? relativeStart));
    let scheduledStart = addDays(startDate, relativeStart);
    let scheduledEnd = addDays(startDate, relativeEnd);
    const scopeType = mapLevelToScope(node.level);

    if (scopeType === '일일') {
      scheduledStart = findAvailableDate(scheduledStart, weekdays, scheduledEnd);
      scheduledEnd = scheduledStart;
    }

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
