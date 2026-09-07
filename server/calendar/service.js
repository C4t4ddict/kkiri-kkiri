const { formatDateKey } = require('../lib/todoCalendar');

class CalendarError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && value >= '1999-01-01' && value <= '2100-12-31'
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function parseWindow(start, end) {
  if (!validDate(start) || !validDate(end) || start > end
    || (Date.parse(end) - Date.parse(start)) / 86400000 > 61) {
    throw new CalendarError('조회 기간은 올바른 날짜로 최대 62일까지 선택해주세요.');
  }
  return { start, end };
}

function parseEvent(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CalendarError('일정 내용을 확인해주세요.');
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (!title || title.length > 160 || notes.length > 3000) throw new CalendarError('제목은 1~160자, 메모는 3000자 이내로 입력해주세요.');
  if (!validDate(body.start_date) || !validDate(body.end_date) || body.start_date > body.end_date) {
    throw new CalendarError('시작일과 종료일을 확인해주세요.');
  }
  if (typeof body.all_day !== 'boolean' || typeof body.important !== 'boolean' || typeof body.completed !== 'boolean') {
    throw new CalendarError('일정 표시 설정이 올바르지 않습니다.');
  }
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!body.all_day && (!validTime(body.start_time) || !validTime(body.end_time)
    || `${body.start_date}T${body.start_time}` >= `${body.end_date}T${body.end_time}`)) {
    throw new CalendarError('종료 시간은 시작 시간보다 늦어야 합니다.');
  }
  const teamId = body.team_id === null || body.team_id === undefined ? null : Number(body.team_id);
  if (teamId !== null && (!Number.isSafeInteger(teamId) || teamId < 1)) throw new CalendarError('연결할 활동을 확인해주세요.');
  return {
    title, notes, team_id: teamId, start_date: body.start_date, end_date: body.end_date,
    all_day: body.all_day, start_time: body.all_day ? null : body.start_time,
    end_time: body.all_day ? null : body.end_time, important: body.important, completed: body.completed,
  };
}

const eventSchema = `CREATE TABLE IF NOT EXISTS calendar_events (
  event_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  team_id INT NULL,
  title VARCHAR(160) NOT NULL,
  notes TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  all_day TINYINT(1) NOT NULL DEFAULT 1,
  start_time TIME NULL,
  end_time TIME NULL,
  important TINYINT(1) NOT NULL DEFAULT 0,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  INDEX idx_calendar_events_owner_dates (user_id, deleted_at, start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
const ensureCalendarSchema = database => database.query(eventSchema);

function normalizeEvent(row) {
  return {
    id: `event:${row.event_id}`, event_id: Number(row.event_id), kind: 'event', title: row.title,
    notes: row.notes, team_id: row.team_id ? Number(row.team_id) : null, team_name: row.team_name || '개인 일정',
    start_date: formatDateKey(row.start_date), end_date: formatDateKey(row.end_date),
    all_day: Boolean(row.all_day), start_time: row.start_time?.slice(0, 5) || null,
    end_time: row.end_time?.slice(0, 5) || null, important: Boolean(row.important),
    completed: Boolean(row.completed), version: Number(row.version),
  };
}

function goalEvents(rows) {
  const groups = new Map();
  for (const row of rows) {
    const start = formatDateKey(row.range_start_date || row.scope_start_date);
    const end = formatDateKey(row.range_end_date || row.scope_end_date);
    if (!start || !end) continue;
    const id = `goal:${row.team_id}:${row.range_group_id || row.todo_id}`;
    const existing = groups.get(id);
    if (existing) {
      existing.total_count++;
      if (row.status === '완료') existing.completed_count++;
      existing.completed = existing.total_count === existing.completed_count;
      if (row.status === '진행중') existing.in_progress = true;
      continue;
    }
    groups.set(id, {
      id, kind: 'goal', title: row.title, team_id: Number(row.team_id), team_name: row.team_name,
      start_date: start, end_date: end, all_day: true, important: false, completed: row.status === '완료',
      scope: row.scope_type, is_range: Boolean(row.range_group_id), total_count: 1,
      completed_count: row.status === '완료' ? 1 : 0, in_progress: row.status === '진행중',
      href: `/activity?team=${row.team_id}&date=${start}&scope=${encodeURIComponent(row.scope_type)}#activity-tool-goals`,
    });
  }
  return [...groups.values()];
}

async function listCalendar(database, userId, start, end) {
  parseWindow(start, end);
  const [[teams], [todos], [issues], [events]] = await Promise.all([
    database.query(`SELECT t.team_id, t.team_name, t.due_date FROM teams t
      JOIN team_members tm ON tm.team_id = t.team_id AND tm.user_id = ?
      WHERE t.activity_status = 'IN_PROGRESS' AND t.status <> 'ARCHIVED' ORDER BY t.team_id`, [userId]),
    database.query(`SELECT td.*, t.team_name FROM todos td
      JOIN teams t ON t.team_id = td.team_id
      JOIN team_members tm ON tm.team_id = td.team_id AND tm.user_id = ?
      WHERE td.assigned_user_id = ? AND t.activity_status = 'IN_PROGRESS' AND t.status <> 'ARCHIVED'
        AND COALESCE(td.range_start_date, td.scope_start_date) <= ?
        AND COALESCE(td.range_end_date, td.scope_end_date) >= ? ORDER BY td.todo_id LIMIT 5001`, [userId, userId, end, start]),
    database.query(`SELECT i.*, t.team_name FROM team_issues i
      JOIN teams t ON t.team_id = i.team_id
      JOIN team_members tm ON tm.team_id = i.team_id AND tm.user_id = ?
      WHERE (i.assignee_id = ? OR (i.assignee_id IS NULL AND i.reporter_id = ?))
        AND t.activity_status = 'IN_PROGRESS' AND t.status <> 'ARCHIVED'
        AND i.due_date BETWEEN ? AND ? ORDER BY i.issue_id LIMIT 5001`, [userId, userId, userId, start, end]),
    database.query(`SELECT e.*, IF(tm.user_id IS NULL, NULL, e.team_id) AS team_id,
        IF(tm.user_id IS NULL, NULL, t.team_name) AS team_name FROM calendar_events e
      LEFT JOIN team_members tm ON tm.team_id = e.team_id AND tm.user_id = e.user_id
      LEFT JOIN teams t ON t.team_id = tm.team_id
      WHERE e.user_id = ? AND e.deleted_at IS NULL AND e.start_date <= ? AND e.end_date >= ?
      ORDER BY e.start_date, e.event_id LIMIT 5001`, [userId, end, start]),
  ]);
  if ([todos, issues, events].some(rows => rows.length > 5000)) throw new CalendarError('일정이 많습니다. 목록에서 더 짧은 기간을 조회해주세요.', 422);
  const deadlines = teams.flatMap(team => {
    const date = formatDateKey(team.due_date);
    return date && date >= start && date <= end ? [{
      id: `deadline:${team.team_id}`, kind: 'deadline', title: `${team.team_name} 마감`,
      team_id: Number(team.team_id), team_name: team.team_name, start_date: date, end_date: date,
      all_day: true, important: true, completed: false, href: `/activity?team=${team.team_id}`,
    }] : [];
  });
  return {
    start, end, timezone: 'Asia/Seoul',
    teams: teams.map(team => ({ team_id: Number(team.team_id), team_name: team.team_name })),
    events: [...goalEvents(todos), ...deadlines, ...issues.map(row => ({
      id: `issue:${row.issue_id}`, kind: 'issue', title: row.title, notes: row.description,
      team_id: Number(row.team_id), team_name: row.team_name, start_date: formatDateKey(row.due_date),
      end_date: formatDateKey(row.due_date), all_day: true, important: row.priority === 'HIGH',
      completed: row.status === 'DONE', in_progress: row.status === 'IN_PROGRESS',
      href: `/activity/${row.team_id}/manage#team-issues`,
    })), ...events.map(normalizeEvent)].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id)),
  };
}

async function saveEvent(database, userId, body, eventId = null) {
  const event = parseEvent(body);
  if (event.team_id) {
    const [members] = await database.query(`SELECT tm.team_id FROM team_members tm JOIN teams t ON t.team_id = tm.team_id
      WHERE tm.team_id = ? AND tm.user_id = ? AND t.activity_status = 'IN_PROGRESS' AND t.status <> 'ARCHIVED'`, [event.team_id, userId]);
    if (!members.length) throw new CalendarError('현재 참여 중인 활동에만 일정을 연결할 수 있습니다.', 403);
  }
  const values = [event.title, event.notes, event.team_id, event.start_date, event.end_date,
    event.all_day, event.start_time, event.end_time, event.important, event.completed];
  if (eventId) {
    if (!Number.isSafeInteger(body.version) || body.version < 1) throw new CalendarError('일정 버전을 확인해주세요.');
    const [result] = await database.query(`UPDATE calendar_events SET title=?, notes=?, team_id=?, start_date=?, end_date=?,
      all_day=?, start_time=?, end_time=?, important=?, completed=?, version=version+1
      WHERE event_id=? AND user_id=? AND deleted_at IS NULL AND version=?`, [...values, eventId, userId, body.version]);
    if (!result.affectedRows) throw new CalendarError('일정이 변경되었거나 삭제되었습니다. 새로고침 후 다시 확인해주세요.', 409);
  } else {
    const [result] = await database.query(`INSERT INTO calendar_events
      (title, notes, team_id, start_date, end_date, all_day, start_time, end_time, important, completed, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...values, userId]);
    eventId = Number(result.insertId);
  }
  return { event_id: eventId };
}

module.exports = { CalendarError, validDate, parseWindow, parseEvent, ensureCalendarSchema, listCalendar, saveEvent, goalEvents };
