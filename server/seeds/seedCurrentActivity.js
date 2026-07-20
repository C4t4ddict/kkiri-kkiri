const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MARKER = '[demo-current-competition]';
const DAY_MS = 24 * 60 * 60 * 1000;

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const monthRange = (now) => ({
  start: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
  end: toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
});

const weekRange = (now) => {
  const mondayOffset = (now.getDay() + 6) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toDateKey(start), end: toDateKey(end) };
};

const addTodo = async (connection, todo) => {
  const [existing] = await connection.execute(
    `SELECT todo_id FROM todos
     WHERE team_id = ? AND assigned_user_id = ? AND title = ? AND scope_type = ?
     LIMIT 1`,
    [todo.teamId, todo.userId, todo.title, todo.scope]
  );

  if (existing.length) {
    await connection.execute(
      `UPDATE todos
       SET status = ?, scope_start_date = ?, scope_end_date = ?,
           completed_at = IF(? = '완료', COALESCE(completed_at, NOW()), NULL)
       WHERE todo_id = ?`,
      [todo.status, todo.start, todo.end, todo.status, existing[0].todo_id]
    );
    return existing[0].todo_id;
  }

  const [result] = await connection.execute(
    `INSERT INTO todos
      (team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, IF(? = '완료', NOW(), NULL))`,
    [todo.teamId, todo.userId, todo.title, todo.status, todo.scope, todo.start, todo.end, todo.status]
  );
  return result.insertId;
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
    await connection.beginTransaction();
    const [activities] = await connection.execute(
      `SELECT activity_id, title, category, topic_category,
              application_period_end, operation_period_end
       FROM activitys
       WHERE application_period_start <= NOW()
         AND application_period_end >= NOW()
       ORDER BY (activity_id = 89) DESC, application_period_end ASC, activity_id DESC
       LIMIT 1`
    );
    if (!activities.length) throw new Error('현재 접수 중인 공모전이 없어 예시 활동을 만들 수 없습니다.');

    const activity = activities[0];
    const [users] = await connection.execute(
      'SELECT id, name FROM users WHERE id IN (1, 2, 3) ORDER BY id'
    );
    if (!users.some((user) => user.id === 1)) throw new Error('예시 활동의 리더로 사용할 1번 사용자가 없습니다.');

    const today = new Date();
    const sourceEnd = activity.operation_period_end || activity.application_period_end;
    const sourceEndDate = sourceEnd ? new Date(sourceEnd) : new Date(today);
    const minimumDueDate = new Date(today.getTime() + 90 * DAY_MS);
    const dueDate = sourceEndDate > minimumDueDate ? sourceEndDate : minimumDueDate;
    const postName = `[예시] ${activity.title}`.slice(0, 255);
    const activityType = (activity.topic_category || activity.category || '공모전').slice(0, 50);
    const memo = `${MARKER}\n현재 접수 중인 공모전 정보를 기반으로 활동·할 일 기능을 확인하기 위한 예시 팀입니다.`;

    const [existingRecruitments] = await connection.execute(
      'SELECT recruitment_id, team_id FROM team_recruitments WHERE memo LIKE ? ORDER BY recruitment_id LIMIT 1',
      [`${MARKER}%`]
    );
    let recruitmentId = existingRecruitments[0]?.recruitment_id;
    let teamId = existingRecruitments[0]?.team_id;

    if (!recruitmentId) {
      const [result] = await connection.execute(
        `INSERT INTO team_recruitments
          (owner_user_id, post_name, activity_name, activity_type, required_members,
           activity_period, meeting_type, memo, status)
         VALUES (1, ?, ?, ?, 3, ?, '혼합', ?, 'CLOSED')`,
        [postName, activity.title, activityType, `~ ${toDateKey(dueDate)}`, memo]
      );
      recruitmentId = result.insertId;
    } else {
      await connection.execute(
        `UPDATE team_recruitments
         SET owner_user_id = 1, post_name = ?, activity_name = ?, activity_type = ?,
             required_members = 3, activity_period = ?, meeting_type = '혼합', memo = ?, status = 'CLOSED'
         WHERE recruitment_id = ?`,
        [postName, activity.title, activityType, `~ ${toDateKey(dueDate)}`, memo, recruitmentId]
      );
    }

    if (!teamId) {
      const [teamRows] = await connection.execute(
        'SELECT team_id FROM teams WHERE recruitment_id = ? LIMIT 1',
        [recruitmentId]
      );
      teamId = teamRows[0]?.team_id;
    }
    if (!teamId) {
      const [result] = await connection.execute(
        `INSERT INTO teams
          (recruitment_id, team_name, leader_user_id, required_members, status, due_date, activity_status)
         VALUES (?, ?, 1, 3, 'ACTIVE', ?, 'IN_PROGRESS')`,
        [recruitmentId, `${activity.title} 팀`.slice(0, 255), toDateKey(dueDate)]
      );
      teamId = result.insertId;
    } else {
      await connection.execute(
        `UPDATE teams
         SET team_name = ?, leader_user_id = 1, required_members = 3,
             status = 'ACTIVE', due_date = ?, activity_status = 'IN_PROGRESS'
         WHERE team_id = ?`,
        [`${activity.title} 팀`.slice(0, 255), toDateKey(dueDate), teamId]
      );
    }
    await connection.execute(
      'UPDATE team_recruitments SET team_id = ? WHERE recruitment_id = ?',
      [teamId, recruitmentId]
    );

    const roles = new Map([
      [1, ['LEADER', '서비스 기획·프론트엔드']],
      [2, ['MEMBER', '리서치·UX']],
      [3, ['MEMBER', '백엔드·데이터']],
    ]);
    for (const user of users) {
      const [role, part] = roles.get(user.id);
      await connection.execute(
        `INSERT INTO team_members (team_id, user_id, role, part)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role), part = VALUES(part)`,
        [teamId, user.id, role, part]
      );
    }

    const month = monthRange(today);
    const week = weekRange(today);
    const day = toDateKey(today);
    const todos = [
      [1, '월간', '서비스 콘셉트와 핵심 기능 확정', '완료', month.start, month.end],
      [1, '월간', '해커톤 제출용 MVP 완성', '진행중', month.start, month.end],
      [1, '주간', '사용자 흐름과 화면 설계 정리', '완료', week.start, week.end],
      [1, '주간', '핵심 화면 API 연동', '진행중', week.start, week.end],
      [1, '일일', '공모전 요구사항 체크리스트 정리', '완료', day, day],
      [1, '일일', '메인 화면 프로토타입 구현', '진행중', day, day],
      [1, '일일', '팀 회의 결과 공유', '미진행', day, day],
      [2, '주간', '장애인 사용자 인터뷰 질문지 작성', '진행중', week.start, week.end],
      [2, '일일', '유사 서비스 UX 사례 조사', '미진행', day, day],
      [3, '주간', '데이터 모델과 API 명세 초안 작성', '진행중', week.start, week.end],
    ];
    for (const [userId, scope, title, status, start, end] of todos) {
      if (!users.some((user) => user.id === userId)) continue;
      await addTodo(connection, { teamId, userId, scope, title, status, start, end });
    }

    await connection.commit();
    console.log(JSON.stringify({ activityId: activity.activity_id, activityTitle: activity.title, recruitmentId, teamId }, null, 2));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('진행 공모전 예시 활동 생성 실패:', error.message);
  process.exitCode = 1;
});
