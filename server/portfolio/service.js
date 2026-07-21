const PORTFOLIO_COLUMNS = {
  activity_name: 'VARCHAR(255) NULL AFTER recruitment_id',
  activity_type: 'VARCHAR(100) NULL AFTER activity_name',
  period_start: 'DATE NULL AFTER period',
  period_end: 'DATE NULL AFTER period_start',
  completed_tasks: 'JSON NULL AFTER period_end',
  summary: 'TEXT NULL AFTER completed_tasks',
  archived_reason: 'VARCHAR(30) NULL AFTER summary',
  archived_at: 'DATETIME NULL AFTER archived_reason',
  updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
};

const formatDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }
  return String(value).slice(0, 10);
};

const safeJson = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const groupCompletedTasks = (todos = []) => {
  const groups = { monthly: [], weekly: [], daily: [], overall: [] };
  const scopeKeys = {
    월간: 'monthly',
    주간: 'weekly',
    일일: 'daily',
    전체: 'overall',
  };

  todos.forEach((todo) => {
    const key = scopeKeys[todo.scope_type] || 'overall';
    groups[key].push({
      todo_id: Number(todo.todo_id),
      title: todo.title,
      scope_start_date: formatDateOnly(todo.scope_start_date),
      scope_end_date: formatDateOnly(todo.scope_end_date),
      completed_at: todo.completed_at || todo.updated_at || null,
    });
  });

  return groups;
};

const countCompletedTasks = (groups) =>
  Object.values(groups || {}).reduce(
    (total, items) => total + (Array.isArray(items) ? items.length : 0),
    0,
  );

const getRelativePeriodEnd = (createdAt, activityPeriod) => {
  const match = String(activityPeriod || '').match(/^(\d+)주$/);
  if (!createdAt || !match) return null;
  const end = new Date(createdAt);
  end.setDate(end.getDate() + (Number(match[1]) * 7));
  return formatDateOnly(end);
};

const ensureColumn = async (db, table, column, definition) => {
  const [columns] = await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (!columns.length) {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
};

const ensureUniqueIndex = async (db, table, indexName, columns) => {
  const [indexes] = await db.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [indexName]);
  if (!indexes.length) {
    await db.query(
      `ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${indexName}\` (${columns.map((column) => `\`${column}\``).join(', ')})`,
    );
  }
};

const ensurePortfolioSchema = async (db) => {
  await db.query(`CREATE TABLE IF NOT EXISTS user_activity_participations (
    participation_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    team_id INT NOT NULL,
    participated_at VARCHAR(50) NULL,
    participated_with JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_participations_user (user_id)
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS miniportfolios (
    portfolio_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    team_id INT NOT NULL,
    recruitment_id INT NULL,
    activity_name VARCHAR(255) NULL,
    activity_type VARCHAR(100) NULL,
    role VARCHAR(100) NULL,
    goals VARCHAR(255) NULL,
    period VARCHAR(50) NULL,
    period_start DATE NULL,
    period_end DATE NULL,
    completed_tasks JSON NULL,
    summary TEXT NULL,
    archived_reason VARCHAR(30) NULL,
    archived_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_miniportfolios_user (user_id),
    INDEX idx_miniportfolios_team (team_id)
  )`);

  for (const [column, definition] of Object.entries(PORTFOLIO_COLUMNS)) {
    await ensureColumn(db, 'miniportfolios', column, definition);
  }

  await ensureUniqueIndex(db, 'miniportfolios', 'uq_miniportfolio_user_team', ['user_id', 'team_id']);
  await ensureUniqueIndex(
    db,
    'user_activity_participations',
    'uq_participation_user_team',
    ['user_id', 'team_id'],
  );
};

const getArchiveSource = async (db, teamId) => {
  const [teams] = await db.query(
    `SELECT
      t.team_id,
      t.recruitment_id,
      t.team_name,
      t.leader_user_id,
      t.created_at,
      t.due_date,
      t.activity_status,
      tr.activity_name,
      tr.post_name,
      tr.activity_type,
      tr.activity_period,
      tr.memo
    FROM teams t
    LEFT JOIN team_recruitments tr ON tr.recruitment_id = t.recruitment_id
    WHERE t.team_id = ?`,
    [teamId],
  );

  if (!teams.length) return null;

  const [members] = await db.query(
    `SELECT tm.user_id, tm.role, tm.part, u.name
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ?
     ORDER BY tm.user_id`,
    [teamId],
  );
  const [todos] = await db.query(
    `SELECT todo_id, assigned_user_id, title, scope_type, scope_start_date, scope_end_date,
            completed_at, updated_at
     FROM todos
     WHERE team_id = ? AND status = '완료'
     ORDER BY COALESCE(completed_at, updated_at), todo_id`,
    [teamId],
  );

  return { team: teams[0], members, todos };
};

const archiveTeam = async (db, teamId, reason = 'MANUAL', options = {}) => {
  const useTransaction = options.useTransaction !== false;
  if (useTransaction) await db.beginTransaction();

  try {
    const source = await getArchiveSource(db, teamId);
    if (!source) {
      const error = new Error('팀을 찾을 수 없습니다');
      error.statusCode = 404;
      throw error;
    }

  const { team, members, todos } = source;
  const memberIds = members.map((member) => Number(member.user_id));
  const activityName = team.activity_name || team.team_name || team.post_name || `활동 ${team.team_id}`;
  const allStarts = todos.map((todo) => formatDateOnly(todo.scope_start_date)).filter(Boolean);
  const allEnds = todos.map((todo) => formatDateOnly(todo.scope_end_date)).filter(Boolean);
  const periodStart = allStarts.sort()[0] || formatDateOnly(team.created_at);
  const periodEnd = formatDateOnly(team.due_date)
    || getRelativePeriodEnd(team.created_at, team.activity_period)
    || allEnds.sort().at(-1)
    || formatDateOnly(new Date());
  const period = `${periodStart || '-'} ~ ${periodEnd || '-'}`;

  for (const member of members) {
    const memberTodos = todos.filter((todo) => Number(todo.assigned_user_id) === Number(member.user_id));
    const completedTasks = groupCompletedTasks(memberTodos);
    const taskTitles = memberTodos.map((todo) => todo.title);
    const role = member.part || (member.role === 'LEADER' ? '팀장' : '팀원');
    const summary = `${activityName}에서 ${role} 역할을 맡아 완료 작업 ${taskTitles.length}건을 수행했습니다.`;

    await db.query(
      `INSERT INTO miniportfolios (
        user_id, team_id, recruitment_id, activity_name, activity_type, role, goals, period,
        period_start, period_end, completed_tasks, summary, archived_reason, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        recruitment_id = VALUES(recruitment_id),
        activity_name = VALUES(activity_name),
        activity_type = VALUES(activity_type),
        role = VALUES(role),
        goals = IF(VALUES(goals) = '', goals, VALUES(goals)),
        period = VALUES(period),
        period_start = VALUES(period_start),
        period_end = VALUES(period_end),
        completed_tasks = IF(VALUES(goals) = '', completed_tasks, VALUES(completed_tasks)),
        summary = VALUES(summary),
        archived_reason = VALUES(archived_reason),
        archived_at = VALUES(archived_at)`,
      [
        member.user_id,
        team.team_id,
        team.recruitment_id,
        activityName,
        team.activity_type || '팀 활동',
        role,
        taskTitles.join(', ').slice(0, 255),
        period,
        periodStart,
        periodEnd,
        JSON.stringify(completedTasks),
        summary,
        reason,
      ],
    );

    await db.query(
      `INSERT INTO user_activity_participations (
        user_id, team_id, participated_at, participated_with
      ) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        participated_at = VALUES(participated_at),
        participated_with = VALUES(participated_with),
        updated_at = CURRENT_TIMESTAMP`,
      [member.user_id, team.team_id, period, JSON.stringify(memberIds)],
    );
  }

  await db.query(
    `UPDATE teams
     SET activity_status = 'COMPLETED', status = 'ARCHIVED'
     WHERE team_id = ?`,
    [teamId],
  );
  if (team.recruitment_id) {
    await db.query(`UPDATE team_recruitments SET status = 'CLOSED' WHERE recruitment_id = ?`, [team.recruitment_id]);
  }

    if (useTransaction) await db.commit();
    return { teamId: Number(teamId), archivedMembers: members.length };
  } catch (error) {
    if (useTransaction) await db.rollback();
    throw error;
  }
};

const archiveExpiredTeams = async (db) => {
  const [teams] = await db.query(
    `SELECT t.team_id, t.activity_status, t.due_date
     FROM teams t
     LEFT JOIN team_recruitments tr ON tr.recruitment_id = t.recruitment_id
     WHERE t.status <> 'ARCHIVED'
       AND (
         t.activity_status = 'COMPLETED'
         OR (t.due_date IS NOT NULL AND t.due_date < CURDATE())
         OR (
           t.due_date IS NULL
           AND tr.activity_period REGEXP '^[0-9]+주$'
           AND DATE_ADD(
             DATE(t.created_at),
             INTERVAL CAST(REGEXP_SUBSTR(tr.activity_period, '[0-9]+') AS UNSIGNED) WEEK
           ) < CURDATE()
         )
       )
     ORDER BY t.team_id`,
  );

  const results = [];
  for (const team of teams) {
    const reason = team.activity_status === 'COMPLETED' ? 'AUTO_COMPLETED' : 'PERIOD_EXPIRED';
    results.push(await archiveTeam(db, team.team_id, reason));
  }
  return results;
};

const normalizePortfolio = (row) => {
  const fallbackTasks = (row.goals || '')
    .split(',')
    .map((title) => title.trim())
    .filter(Boolean)
    .map((title, index) => ({ todo_id: index + 1, title }));
  const completedTasks = safeJson(row.completed_tasks, {
    monthly: [],
    weekly: [],
    daily: [],
    overall: fallbackTasks,
  });

  return {
    ...row,
    period_start: formatDateOnly(row.period_start),
    period_end: formatDateOnly(row.period_end),
    archived_at: row.archived_at || row.created_at,
    completed_tasks: completedTasks,
    completed_task_count: countCompletedTasks(completedTasks),
  };
};

const listPastActivities = async (db, userId) => {
  const [rows] = await db.query(
    `SELECT
      mp.portfolio_id,
      mp.user_id,
      mp.team_id,
      COALESCE(mp.activity_name, t.team_name, tr.activity_name, tr.post_name, CONCAT('활동 ', mp.team_id)) AS activity_name,
      COALESCE(mp.activity_type, tr.activity_type, '팀 활동') AS activity_type,
      mp.role,
      mp.period,
      mp.period_start,
      mp.period_end,
      mp.completed_tasks,
      mp.goals,
      mp.archived_at,
      mp.created_at
    FROM miniportfolios mp
    LEFT JOIN teams t ON t.team_id = mp.team_id
    LEFT JOIN team_recruitments tr ON tr.recruitment_id = mp.recruitment_id
    WHERE mp.user_id = ?
    ORDER BY COALESCE(mp.archived_at, mp.created_at) DESC, mp.portfolio_id DESC`,
    [userId],
  );
  return rows.map(normalizePortfolio);
};

const getMiniPortfolio = async (db, userId, portfolioId) => {
  const [rows] = await db.query(
    `SELECT
      mp.*,
      u.name AS user_name,
      u.department,
      t.team_name,
      COALESCE(mp.activity_name, t.team_name, tr.activity_name, tr.post_name, CONCAT('활동 ', mp.team_id)) AS resolved_activity_name,
      COALESCE(mp.activity_type, tr.activity_type, '팀 활동') AS resolved_activity_type,
      (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = mp.team_id) AS member_count
    FROM miniportfolios mp
    JOIN users u ON u.id = mp.user_id
    LEFT JOIN teams t ON t.team_id = mp.team_id
    LEFT JOIN team_recruitments tr ON tr.recruitment_id = mp.recruitment_id
    WHERE mp.portfolio_id = ? AND mp.user_id = ?`,
    [portfolioId, userId],
  );

  if (!rows.length) return null;
  const portfolio = normalizePortfolio(rows[0]);
  portfolio.activity_name = portfolio.resolved_activity_name || portfolio.activity_name;
  portfolio.activity_type = portfolio.resolved_activity_type || portfolio.activity_type;
  delete portfolio.resolved_activity_name;
  delete portfolio.resolved_activity_type;
  return portfolio;
};

module.exports = {
  archiveExpiredTeams,
  archiveTeam,
  countCompletedTasks,
  ensurePortfolioSchema,
  formatDateOnly,
  getMiniPortfolio,
  getRelativePeriodEnd,
  groupCompletedTasks,
  listPastActivities,
  normalizePortfolio,
};
