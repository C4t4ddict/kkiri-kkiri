const path = require('path');
const mysql = require('mysql2/promise');
const { ensureAwardsSchema, upsertAward } = require('../awards/service');
const {
  archiveTeam,
  ensurePortfolioSchema,
  updateMiniPortfolio,
} = require('../portfolio/service');
const {
  createHistoryFixture,
  selectHistoryActivities,
} = require('./pastActivityFixtures');

require('dotenv').config({
  path: process.env.KKIRI_HISTORY_ENV_FILE || path.join(__dirname, '..', '.env'),
});

const getScopeRange = (period, scope) => {
  const end = new Date(`${period.end}T12:00:00`);
  if (scope === '일일') return { start: period.end, end: period.end };
  const days = scope === '주간' ? 6 : 27;
  const start = new Date(end);
  start.setDate(end.getDate() - days);
  const limitedStart = start < new Date(`${period.start}T12:00:00`)
    ? period.start
    : [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, '0'),
      String(start.getDate()).padStart(2, '0'),
    ].join('-');
  return { start: limitedStart, end: period.end };
};

const upsertCompletedTodo = async (connection, teamId, todo, period) => {
  const [userId, scope, title] = todo;
  const range = getScopeRange(period, scope);
  const [rows] = await connection.execute(
    `SELECT todo_id FROM todos
     WHERE team_id = ? AND assigned_user_id = ? AND title = ? AND scope_type = ?
     LIMIT 1`,
    [teamId, userId, title, scope],
  );
  const completedAt = `${range.end} 18:00:00`;

  if (rows.length) {
    await connection.execute(
      `UPDATE todos
       SET status = '완료', scope_start_date = ?, scope_end_date = ?, completed_at = ?
       WHERE todo_id = ?`,
      [range.start, range.end, completedAt, rows[0].todo_id],
    );
    return rows[0].todo_id;
  }

  const [result] = await connection.execute(
    `INSERT INTO todos
      (team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date, completed_at)
     VALUES (?, ?, ?, '완료', ?, ?, ?, ?)`,
    [teamId, userId, title, scope, range.start, range.end, completedAt],
  );
  return result.insertId;
};

const upsertRecruitment = async (connection, fixture) => {
  const { activity, marker, period } = fixture;
  const [rows] = await connection.execute(
    `SELECT recruitment_id, team_id
     FROM team_recruitments
     WHERE memo LIKE ?
     ORDER BY recruitment_id
     LIMIT 1`,
    [`${marker}%`],
  );
  const postName = `${activity.title} 완료 활동 기록`.slice(0, 255);
  const memo = `${marker}\n${activity.source_name}에서 수집한 실제 공고를 기반으로 만든 지난 활동 예시입니다.`;
  let recruitmentId = rows[0]?.recruitment_id;

  if (!recruitmentId) {
    const [result] = await connection.execute(
      `INSERT INTO team_recruitments
        (owner_user_id, activity_id, post_name, activity_name, activity_type,
         required_members, activity_start_date, activity_end_date, activity_period,
         meeting_type, recruitment_scope, memo, status)
       VALUES (1, ?, ?, ?, ?, 3, ?, ?, ?, ?, 'NATIONWIDE', ?, 'CLOSED')`,
      [
        activity.activity_id,
        postName,
        activity.title,
        fixture.activityType,
        period.start,
        period.end,
        `${period.start} ~ ${period.end}`,
        fixture.meetingType,
        memo,
      ],
    );
    recruitmentId = result.insertId;
  } else {
    await connection.execute(
      `UPDATE team_recruitments
       SET owner_user_id = 1, activity_id = ?, post_name = ?, activity_name = ?,
           activity_type = ?, required_members = 3, activity_start_date = ?,
           activity_end_date = ?, activity_period = ?, meeting_type = ?,
           recruitment_scope = 'NATIONWIDE', memo = ?, status = 'CLOSED', deleted_at = NULL
       WHERE recruitment_id = ?`,
      [
        activity.activity_id,
        postName,
        activity.title,
        fixture.activityType,
        period.start,
        period.end,
        `${period.start} ~ ${period.end}`,
        fixture.meetingType,
        memo,
        recruitmentId,
      ],
    );
  }

  return { recruitmentId, teamId: rows[0]?.team_id };
};

const upsertTeam = async (connection, fixture, recruitmentId, linkedTeamId) => {
  let teamId = linkedTeamId;
  if (!teamId) {
    const [rows] = await connection.execute(
      'SELECT team_id FROM teams WHERE recruitment_id = ? ORDER BY team_id LIMIT 1',
      [recruitmentId],
    );
    teamId = rows[0]?.team_id;
  }

  const teamName = `${fixture.activity.title} 팀`.slice(0, 255);
  if (!teamId) {
    const [result] = await connection.execute(
      `INSERT INTO teams
        (recruitment_id, team_name, leader_user_id, required_members, status, due_date,
         activity_status, source_type, source_id, participation_mode, visibility)
       VALUES (?, ?, 1, 3, 'ACTIVE', ?, 'IN_PROGRESS', 'COMPETITION', ?, 'TEAM', 'CLOSED')`,
      [recruitmentId, teamName, fixture.period.end, fixture.activity.activity_id],
    );
    teamId = result.insertId;
  } else {
    await connection.execute(
      `UPDATE teams
       SET recruitment_id = ?, team_name = ?, leader_user_id = 1, required_members = 3,
           status = 'ACTIVE', due_date = ?, activity_status = 'IN_PROGRESS',
           source_type = 'COMPETITION', source_id = ?, participation_mode = 'TEAM', visibility = 'CLOSED'
       WHERE team_id = ?`,
      [recruitmentId, teamName, fixture.period.end, fixture.activity.activity_id, teamId],
    );
  }

  await connection.execute(
    'UPDATE team_recruitments SET team_id = ? WHERE recruitment_id = ?',
    [teamId, recruitmentId],
  );
  return teamId;
};

const seedFixture = async (connection, fixture, users) => {
  const { recruitmentId, teamId: linkedTeamId } = await upsertRecruitment(connection, fixture);
  const teamId = await upsertTeam(connection, fixture, recruitmentId, linkedTeamId);

  for (const user of users) {
    const [role, part] = fixture.memberParts.get(Number(user.id));
    await connection.execute(
      `INSERT INTO team_members (team_id, user_id, role, part)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role), part = VALUES(part)`,
      [teamId, user.id, role, part],
    );
  }

  for (const todo of fixture.todos) {
    await upsertCompletedTodo(connection, teamId, todo, fixture.period);
  }

  await archiveTeam(connection, teamId, 'SEED_EXAMPLE', { useTransaction: false });
  const [portfolios] = await connection.execute(
    'SELECT portfolio_id FROM miniportfolios WHERE user_id = 1 AND team_id = ? LIMIT 1',
    [teamId],
  );
  if (!portfolios.length) throw new Error(`팀 ${teamId}의 미니포트폴리오 생성에 실패했습니다.`);

  const portfolioId = portfolios[0].portfolio_id;
  await updateMiniPortfolio(connection, 1, portfolioId, {
    title: fixture.activity.title,
    activity_type: fixture.activityType,
    role: fixture.portfolio.role,
    summary: fixture.portfolio.summary,
    achievements: fixture.portfolio.achievements,
    reflection: fixture.portfolio.reflection,
    image_urls: [],
    links: fixture.sourceLink
      ? [{ title: `${fixture.activity.source_name} 공고 원문`, url: fixture.sourceLink }]
      : [],
  });
  await upsertAward(connection, 1, portfolioId, fixture.award);

  return {
    marker: fixture.marker,
    activityId: Number(fixture.activity.activity_id),
    activityTitle: fixture.activity.title,
    sourceName: fixture.activity.source_name,
    recruitmentId: Number(recruitmentId),
    teamId: Number(teamId),
    portfolioId: Number(portfolioId),
    awarded: Boolean(fixture.award.is_awarded),
  };
};

const run = async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'myappdb',
    port: Number(process.env.DB_PORT || 3306),
    connectionLimit: 2,
    charset: 'utf8mb4',
  });
  const connection = await pool.getConnection();

  try {
    await ensurePortfolioSchema(connection);
    await ensureAwardsSchema(connection);
    await connection.beginTransaction();

    const [users] = await connection.execute(
      'SELECT id, name FROM users WHERE id IN (1, 2, 3) ORDER BY id',
    );
    if (users.length !== 3) {
      throw new Error('지난 활동 예시에 필요한 개발 사용자 1, 2, 3번을 모두 찾을 수 없습니다.');
    }

    const [activities] = await connection.execute(
      `SELECT activity_id, title, category, topic_category, source_name, source_url,
              official_url, prize_details, is_hidden, operation_period_start,
              operation_period_end, application_period_start, application_period_end
       FROM activitys
       WHERE source_name IN ('위비티', '씽굿') AND COALESCE(is_hidden, 0) = 0
       ORDER BY application_period_end DESC, activity_id DESC
       LIMIT 300`,
    );
    const selectedActivities = selectHistoryActivities(activities);
    if (selectedActivities.length !== 2) {
      throw new Error('LH 국토기술대전 수상 공고와 임베디드SW 공고를 실제 수집 데이터에서 모두 찾을 수 없습니다.');
    }

    const today = new Date();
    const results = [];
    for (const [slotIndex, activity] of selectedActivities.entries()) {
      results.push(await seedFixture(
        connection,
        createHistoryFixture(slotIndex, activity, today),
        users,
      ));
    }

    const [[verification]] = await connection.execute(
      `SELECT
        COUNT(DISTINCT tr.recruitment_id) AS recruitment_count,
        COUNT(DISTINCT t.team_id) AS team_count,
        COUNT(DISTINCT mp.portfolio_id) AS portfolio_count,
        COUNT(DISTINCT CASE WHEN ua.is_awarded = 1 THEN ua.award_id END) AS award_count,
        COUNT(DISTINCT CASE WHEN todo.assigned_user_id = 1 AND todo.status = '완료' THEN todo.todo_id END) AS completed_todo_count,
        COUNT(DISTINCT CASE WHEN a.source_name NOT IN ('위비티', '씽굿') THEN a.activity_id END) AS invalid_source_count
       FROM team_recruitments tr
       JOIN teams t ON t.recruitment_id = tr.recruitment_id
       JOIN activitys a ON a.activity_id = tr.activity_id
       LEFT JOIN miniportfolios mp ON mp.team_id = t.team_id AND mp.user_id = 1
       LEFT JOIN user_awards ua ON ua.portfolio_id = mp.portfolio_id AND ua.user_id = 1
       LEFT JOIN todos todo ON todo.team_id = t.team_id
       WHERE tr.memo LIKE '[past-activity-seed:v1:slot-%'`,
    );
    const verified = {
      recruitmentCount: Number(verification.recruitment_count),
      teamCount: Number(verification.team_count),
      portfolioCount: Number(verification.portfolio_count),
      awardCount: Number(verification.award_count),
      completedTodoCount: Number(verification.completed_todo_count),
      invalidSourceCount: Number(verification.invalid_source_count),
    };
    if (
      verified.recruitmentCount !== 2
      || verified.teamCount !== 2
      || verified.portfolioCount !== 2
      || verified.awardCount < 1
      || verified.completedTodoCount < 12
      || verified.invalidSourceCount !== 0
    ) {
      throw new Error(`지난 활동 시드 관계 검증에 실패했습니다: ${JSON.stringify(verified)}`);
    }

    await connection.commit();
    console.log(JSON.stringify({ seeded: results, verification: verified }, null, 2));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('지난 활동·수상 예시 생성 실패:', error.message);
  process.exitCode = 1;
});
