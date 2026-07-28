const formatDateKey = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
};

const toDate = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDay = (dateKey) => {
  const date = toDate(dateKey);
  date.setDate(date.getDate() + 1);
  return formatDateKey(date);
};

const buildMonthTodoCalendar = (year, month, rows = []) => {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = formatDateKey(new Date(year, month, 0));
  const days = [];
  const dayMap = new Map();

  for (let day = 1; day <= Number(monthEnd.slice(-2)); day += 1) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = { date, count: 0, todos: [] };
    days.push(entry);
    dayMap.set(date, entry);
  }

  const rangeMap = new Map();
  rows.forEach((row) => {
    const scopeStart = formatDateKey(row.scope_start_date);
    const scopeEnd = formatDateKey(row.scope_end_date);
    if (!scopeStart || !scopeEnd) return;

    const todo = {
      todo_id: Number(row.todo_id),
      title: row.title,
      status: row.status,
      scope_type: row.scope_type,
      scope_start_date: scopeStart,
      scope_end_date: scopeEnd,
      range_group_id: row.range_group_id || null,
      range_start_date: formatDateKey(row.range_start_date),
      range_end_date: formatDateKey(row.range_end_date),
    };
    let currentDate = scopeStart < monthStart ? monthStart : scopeStart;
    const finalDate = scopeEnd > monthEnd ? monthEnd : scopeEnd;
    while (currentDate <= finalDate) {
      const day = dayMap.get(currentDate);
      if (day) {
        day.todos.push(todo);
        if (todo.scope_type === '일일' && todo.status !== '완료') day.count += 1;
      }
      currentDate = addDay(currentDate);
    }

    if (todo.range_group_id && todo.range_start_date && todo.range_end_date) {
      const existing = rangeMap.get(todo.range_group_id);
      if (!existing) {
        rangeMap.set(todo.range_group_id, {
          range_group_id: todo.range_group_id,
          title: todo.title,
          scope_type: todo.scope_type,
          start_date: todo.range_start_date,
          end_date: todo.range_end_date,
          total_count: 1,
          completed_count: todo.status === '완료' ? 1 : 0,
          status_counts: {
            미진행: todo.status === '미진행' ? 1 : 0,
            진행중: todo.status === '진행중' ? 1 : 0,
            완료: todo.status === '완료' ? 1 : 0,
          },
        });
      } else {
        existing.total_count += 1;
        if (todo.status === '완료') existing.completed_count += 1;
        if (Object.prototype.hasOwnProperty.call(existing.status_counts, todo.status)) {
          existing.status_counts[todo.status] += 1;
        }
      }
    }
  });

  days.forEach((day) => {
    day.todos.sort((first, second) => {
      const statusOrder = { 진행중: 0, 미진행: 1, 완료: 2 };
      return (statusOrder[first.status] ?? 3) - (statusOrder[second.status] ?? 3);
    });
  });

  return {
    year,
    month,
    days,
    ranges: [...rangeMap.values()].sort((first, second) =>
      first.start_date.localeCompare(second.start_date)
    ),
  };
};

module.exports = { buildMonthTodoCalendar, formatDateKey };
