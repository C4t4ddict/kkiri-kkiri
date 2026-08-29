const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const databaseName = process.env.DB_NAME || 'myappdb';
const databaseUser = process.env.DB_USER || 'kkiri_app';
if (!/^[A-Za-z0-9_]+$/.test(databaseName) || !/^[A-Za-z0-9_]+$/.test(databaseUser)) {
  throw new Error('DB_NAME과 DB_USER에는 영문, 숫자, 밑줄만 사용할 수 있습니다.');
}

const dateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const readSchemaStatements = () => fs
  .readFileSync(path.join(__dirname, '..', 'schema', 'base.sql'), 'utf8')
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

const upsertUser = async (connection, user) => {
  const passwordHash = bcrypt.hashSync(user.password, 10);
  await connection.execute(
    `INSERT INTO users
      (id, email, email_verified, account_type, password, name, department,
       student_number, birth, self_intro, is_admin)
     VALUES (?, ?, 1, 'GENERAL', ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       email = VALUES(email), password = VALUES(password), name = VALUES(name),
       department = VALUES(department), student_number = VALUES(student_number),
       birth = VALUES(birth), self_intro = VALUES(self_intro), is_admin = VALUES(is_admin)`,
    [
      user.id,
      user.email,
      passwordHash,
      user.name,
      user.department,
      user.studentNumber,
      user.birth,
      user.intro,
      user.isAdmin ? 1 : 0,
    ],
  );
};

const run = async () => {
  const adminConnection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_ADMIN_USER || 'root',
    password: process.env.DB_ADMIN_PASSWORD || '',
    port: Number(process.env.DB_PORT || 3307),
    charset: 'utf8mb4',
  });

  await adminConnection.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  for (const host of ['127.0.0.1', 'localhost']) {
    const account = `'${databaseUser}'@'${host}'`;
    await adminConnection.query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ?`, [process.env.DB_PASSWORD || '']);
    await adminConnection.query(`ALTER USER ${account} IDENTIFIED BY ?`, [process.env.DB_PASSWORD || '']);
    await adminConnection.query(`GRANT ALL PRIVILEGES ON \`${databaseName}\`.* TO ${account}`);
  }
  await adminConnection.end();

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: databaseUser,
    password: process.env.DB_PASSWORD || '',
    database: databaseName,
    port: Number(process.env.DB_PORT || 3307),
    charset: 'utf8mb4',
  });

  try {
    for (const statement of readSchemaStatements()) {
      await connection.query(statement);
    }

    await connection.beginTransaction();
    await upsertUser(connection, {
      id: 1,
      email: 'test@test.com',
      password: 'test123',
      name: '김끼리',
      department: '컴퓨터공학과',
      studentNumber: '202612345',
      birth: '2001-05-14',
      intro: '좋은 팀을 만나 끝까지 완주하고 싶어요.',
      isAdmin: true,
    });
    await upsertUser(connection, {
      id: 2,
      email: 'designer@test.com',
      password: 'test123',
      name: '이디자인',
      department: '시각디자인학과',
      studentNumber: '202612346',
      birth: '2002-02-20',
      intro: '사용자 경험과 브랜드 디자인을 맡습니다.',
      isAdmin: false,
    });
    await upsertUser(connection, {
      id: 3,
      email: 'backend@test.com',
      password: 'test123',
      name: '박개발',
      department: '소프트웨어학과',
      studentNumber: '202612347',
      birth: '2000-11-03',
      intro: '안정적인 API와 데이터 모델을 만들어요.',
      isAdmin: false,
    });

    const today = new Date();
    const activities = [
      [1, '2026 대학생 AI 서비스 해커톤', '전국 대학생', '한국AI협회', '서울 코엑스', -20, 45, -14, 24, '대상 500만원, 최우수상 200만원', '생성형 AI로 캠퍼스 문제를 해결하는 서비스를 만듭니다.', '공모전', 'IT·AI', '/uploads/info1.png'],
      [2, '지역문제 해결 UX 챌린지', '대학생 및 대학원생', '서울디자인재단', '온라인·서울', -10, 60, -7, 35, '총상금 1,000만원', '지역 생활 문제를 리서치하고 서비스 경험으로 제안합니다.', '공모전', '기획·디자인', '/uploads/info2.png'],
      [3, '오픈소스 메이커톤 2026', '개발·디자인 직군 대학생', '오픈소스커뮤니티', '판교', -5, 50, -3, 28, '우수팀 장비 및 후속 개발비', '공개 API와 오픈소스를 활용해 작동하는 제품을 완성합니다.', '해커톤', '개발', '/uploads/info3.png'],
      [4, '대학생 데이터 분석 경진대회', '데이터 분석에 관심 있는 대학생', '데이터산업진흥원', '온라인', -25, 70, -12, 18, '대상 300만원', '공공 데이터를 활용해 사회 현상을 분석하고 해결책을 제시합니다.', '공모전', '데이터', '/uploads/info4.png'],
      [5, '소셜 임팩트 콘텐츠 캠프', '콘텐츠 제작에 관심 있는 청년', '임팩트스퀘어', '서울 성수', 5, 40, 1, 30, '제작비 지원 및 우수작 상영', '사회 문제를 알기 쉬운 숏폼 콘텐츠로 제작합니다.', '대외활동', '콘텐츠', '/uploads/info5.png'],
      [6, '캠퍼스 창업 아이디어 리그', '예비 창업 대학생', '청년창업재단', '대전', -30, 90, -20, 42, '사업화 지원금 최대 1,000만원', '대학생의 일상에서 출발한 창업 아이디어를 검증합니다.', '공모전', '창업', '/uploads/info1.png'],
    ];

    for (const [id, title, target, organizer, location, operationStart, operationEnd, applicationStart, applicationEnd, prize, details, category, topic, imageUrl] of activities) {
      await connection.execute(
        `INSERT INTO activitys
          (activity_id, title, target_audience, organizer, location,
           operation_period_start, operation_period_end,
           application_period_start, application_period_end,
           points, prize_details, contact, details, category, topic_category,
           main_image_url, source_name, source_item_id, source_url, official_url,
           source_categories, last_crawled_at, is_hidden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local-demo', ?, ?, ?, ?, NOW(), 1)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title), target_audience = VALUES(target_audience), organizer = VALUES(organizer),
           location = VALUES(location), operation_period_start = VALUES(operation_period_start),
           operation_period_end = VALUES(operation_period_end), application_period_start = VALUES(application_period_start),
           application_period_end = VALUES(application_period_end), points = VALUES(points),
           prize_details = VALUES(prize_details), contact = VALUES(contact), details = VALUES(details),
           category = VALUES(category), topic_category = VALUES(topic_category), main_image_url = VALUES(main_image_url),
           source_url = VALUES(source_url), official_url = VALUES(official_url),
           source_categories = VALUES(source_categories), last_crawled_at = NOW(), is_hidden = 1`,
        [
          id,
          title,
          target,
          organizer,
          location,
          dateKey(addDays(today, operationStart)),
          dateKey(addDays(today, operationEnd)),
          dateKey(addDays(today, applicationStart)),
          dateKey(addDays(today, applicationEnd)),
          prize,
          prize,
          'contact@kkiri.local',
          details,
          category,
          topic,
          imageUrl,
          String(id),
          `https://example.com/activities/${id}`,
          `https://example.com/activities/${id}`,
          JSON.stringify([category, topic]),
        ],
      );
    }

    const teamStart = dateKey(addDays(today, -7));
    const teamEnd = dateKey(addDays(today, 45));
    await connection.execute(
      `INSERT INTO team_recruitments
        (recruitment_id, owner_user_id, team_id, activity_id, post_name, activity_name,
         activity_type, qualification_department, required_members, activity_start_date,
         activity_end_date, activity_period, meeting_type, recruitment_scope, memo, status)
       VALUES (1, 2, NULL, 1, 'AI 해커톤 UX 디자이너 한 분 모셔요',
         '2026 대학생 AI 서비스 해커톤', 'IT·AI', '학과 무관', 4, ?, ?, ?, '혼합',
         'NATIONWIDE', '기획과 개발은 준비되어 있고, 사용자 흐름과 UI를 함께 다듬을 분을 찾습니다.', 'OPEN')
       ON DUPLICATE KEY UPDATE owner_user_id = 2, team_id = NULL, activity_id = 1,
         post_name = VALUES(post_name), activity_name = VALUES(activity_name), activity_type = VALUES(activity_type),
         qualification_department = VALUES(qualification_department), required_members = VALUES(required_members),
         activity_start_date = VALUES(activity_start_date), activity_end_date = VALUES(activity_end_date),
         activity_period = VALUES(activity_period), meeting_type = VALUES(meeting_type),
         recruitment_scope = 'NATIONWIDE', memo = VALUES(memo), status = 'OPEN', deleted_at = NULL`,
      [teamStart, teamEnd, `${teamStart} ~ ${teamEnd}`],
    );
    await connection.execute(
      `INSERT INTO team_recruitments
        (recruitment_id, owner_user_id, team_id, activity_id, post_name, activity_name,
         activity_type, qualification_department, required_members, activity_start_date,
         activity_end_date, activity_period, meeting_type, recruitment_scope, memo, status)
       VALUES (2, 1, 1, 2, 'UX 챌린지 끼리끼리 팀', '지역문제 해결 UX 챌린지',
         '기획·디자인', '학과 무관', 3, ?, ?, ?, '혼합', 'NATIONWIDE',
         '현재 진행 중인 예시 팀입니다.', 'CLOSED')
       ON DUPLICATE KEY UPDATE owner_user_id = 1, team_id = 1, activity_id = 2,
         post_name = VALUES(post_name), activity_name = VALUES(activity_name), activity_type = VALUES(activity_type),
         required_members = 3, activity_start_date = VALUES(activity_start_date), activity_end_date = VALUES(activity_end_date),
         activity_period = VALUES(activity_period), meeting_type = '혼합', status = 'CLOSED', deleted_at = NULL`,
      [teamStart, teamEnd, `${teamStart} ~ ${teamEnd}`],
    );
    await connection.execute(
      `INSERT INTO team_recruitments
        (recruitment_id, owner_user_id, team_id, activity_id, post_name, activity_name,
         activity_type, qualification_department, required_members, activity_start_date,
         activity_end_date, activity_period, meeting_type, recruitment_scope, memo, status)
       VALUES (3, 3, NULL, 3, '오픈소스 메이커톤 프론트엔드 팀원 모집',
         '오픈소스 메이커톤 2026', '개발', '학과 무관', 4, ?, ?, ?, '비대면',
         'NATIONWIDE', '주 2회 저녁 온라인 회의로 빠르게 MVP를 완성합니다.', 'OPEN')
       ON DUPLICATE KEY UPDATE owner_user_id = 3, team_id = NULL, activity_id = 3,
         post_name = VALUES(post_name), activity_name = VALUES(activity_name), activity_type = VALUES(activity_type),
         qualification_department = VALUES(qualification_department), required_members = VALUES(required_members),
         activity_start_date = VALUES(activity_start_date), activity_end_date = VALUES(activity_end_date),
         activity_period = VALUES(activity_period), meeting_type = VALUES(meeting_type),
         recruitment_scope = 'NATIONWIDE', memo = VALUES(memo), status = 'OPEN', deleted_at = NULL`,
      [teamStart, teamEnd, `${teamStart} ~ ${teamEnd}`],
    );

    await connection.execute(
      `INSERT INTO teams
        (team_id, recruitment_id, team_name, leader_user_id, required_members, status,
         due_date, activity_status, source_type, source_id, participation_mode, visibility)
       VALUES (1, 2, '동네한바퀴 UX 개선팀', 1, 3, 'ACTIVE', ?, 'IN_PROGRESS',
         'COMPETITION', 2, 'TEAM', 'CLOSED')
       ON DUPLICATE KEY UPDATE recruitment_id = 2, team_name = VALUES(team_name), leader_user_id = 1,
         required_members = 3, status = 'ACTIVE', due_date = VALUES(due_date),
         activity_status = 'IN_PROGRESS', source_type = 'COMPETITION', source_id = 2,
         participation_mode = 'TEAM', visibility = 'CLOSED'`,
      [teamEnd],
    );
    await connection.execute(
      `INSERT INTO teams
        (team_id, recruitment_id, team_name, leader_user_id, required_members, status,
         due_date, activity_status, source_type, source_id, source_version_id, participation_mode, visibility)
       VALUES (2, NULL, '플랫폼 엔지니어 실전 커리큘럼', 1, 1, 'ACTIVE', ?, 'IN_PROGRESS',
         'ENTERPRISE_CURRICULUM', 1, 1, 'PERSONAL', 'PRIVATE')
       ON DUPLICATE KEY UPDATE recruitment_id = NULL, team_name = VALUES(team_name), leader_user_id = 1,
         required_members = 1, status = 'ACTIVE', due_date = VALUES(due_date),
         activity_status = 'IN_PROGRESS', source_type = 'ENTERPRISE_CURRICULUM', source_id = 1,
         source_version_id = 1, participation_mode = 'PERSONAL', visibility = 'PRIVATE'`,
      [dateKey(addDays(today, 55))],
    );

    const members = [
      [1, 1, 'LEADER', '서비스 기획·프론트엔드'],
      [1, 2, 'MEMBER', 'UX 리서치·디자인'],
      [1, 3, 'MEMBER', '백엔드·데이터'],
      [2, 1, 'LEADER', '플랫폼 엔지니어 학습자'],
    ];
    for (const member of members) {
      await connection.execute(
        `INSERT INTO team_members (team_id, user_id, role, part)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role), part = VALUES(part)`,
        member,
      );
    }

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const day = dateKey(today);
    const todos = [
      [1, 1, 1, '핵심 사용자 흐름 확정', '완료', '월간', dateKey(monthStart), dateKey(monthEnd)],
      [2, 1, 1, '메인 화면 API 연동', '진행중', '주간', dateKey(addDays(today, -3)), dateKey(addDays(today, 3))],
      [3, 1, 1, '팀 회의 결과 공유', '미진행', '일일', day, day],
      [4, 1, 2, '사용자 인터뷰 질문지 작성', '진행중', '주간', dateKey(addDays(today, -3)), dateKey(addDays(today, 3))],
      [5, 1, 3, '활동 데이터 모델 점검', '완료', '주간', dateKey(addDays(today, -3)), dateKey(addDays(today, 3))],
      [6, 2, 1, '컨테이너 이미지 구조 정리', '완료', '월간', dateKey(monthStart), dateKey(monthEnd)],
      [7, 2, 1, '멀티 스테이지 Dockerfile 실습', '진행중', '주간', dateKey(addDays(today, -3)), dateKey(addDays(today, 3))],
      [8, 2, 1, '학습 로그 남기기', '미진행', '일일', day, day],
    ];
    for (const [todoId, teamId, assignedUserId, title, status, scope, start, end] of todos) {
      await connection.execute(
        `INSERT INTO todos
          (todo_id, team_id, assigned_user_id, title, status, scope_type,
           scope_start_date, scope_end_date, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, IF(? = '완료', NOW(), NULL))
         ON DUPLICATE KEY UPDATE team_id = VALUES(team_id), assigned_user_id = VALUES(assigned_user_id), title = VALUES(title),
           status = VALUES(status), scope_type = VALUES(scope_type),
           scope_start_date = VALUES(scope_start_date), scope_end_date = VALUES(scope_end_date),
           completed_at = IF(VALUES(status) = '완료', COALESCE(completed_at, NOW()), NULL)`,
        [todoId, teamId, assignedUserId, title, status, scope, start, end, status],
      );
    }

    await connection.execute(
      `INSERT INTO application_templates (template_id, user_id, title, content, is_default)
       VALUES (1, 1, '기본 지원서', '안녕하세요. 맡은 역할을 끝까지 책임지고, 진행 상황을 꾸준히 공유하겠습니다.', 1)
       ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content), is_default = 1`,
    );
    await connection.execute(
      `INSERT INTO applications (application_id, recruitment_id, applicant_id, template_id, memo, status)
       VALUES (1, 1, 1, 1, '사용자 흐름 설계와 프론트엔드 구현 경험이 있습니다.', 'PENDING')
       ON DUPLICATE KEY UPDATE template_id = 1, memo = VALUES(memo), status = 'PENDING'`,
    );
    await connection.execute(
      `INSERT INTO application_status_events (event_id, application_id, status, actor_id)
       VALUES (1, 1, 'APPLIED', 1)
       ON DUPLICATE KEY UPDATE status = 'APPLIED', actor_id = 1`,
    );

    await connection.execute(
      `INSERT INTO user_favorite_activities (user_id, activity_id)
       VALUES (1, 1) ON DUPLICATE KEY UPDATE created_at = created_at`,
    );
    await connection.execute(
      `INSERT INTO team_notices (notice_id, team_id, author_id, title, content)
       VALUES (1, 1, 1, '이번 주 회의 안내', '목요일 오후 8시에 온라인으로 진행 상황을 공유합니다.')
      ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content)`,
    );
    await connection.execute(
      `INSERT INTO team_notices (notice_id, team_id, author_id, title, content)
       VALUES (2, 2, 1, '이번 주 학습 메모', 'Dockerfile 실습을 마친 뒤 이미지 크기 비교 결과를 기록합니다.')
       ON DUPLICATE KEY UPDATE team_id = 2, author_id = 1, title = VALUES(title), content = VALUES(content)`,
    );
    await connection.execute(
      `INSERT INTO user_notifications
        (notification_id, user_id, team_id, notice_id, type, title, content, is_read)
       VALUES (1, 1, 1, 1, 'TEAM_NOTICE', '새 팀 공지가 등록됐어요', '이번 주 회의 일정을 확인해주세요.', 0)
       ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content), is_read = 0`,
    );

    for (const [userId, companionIds] of [[1, [2, 3]], [2, [1, 3]], [3, [1, 2]]]) {
      await connection.execute(
        `INSERT INTO user_activity_participations (user_id, team_id, participated_at, participated_with)
         VALUES (?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE participated_at = VALUES(participated_at),
           participated_with = VALUES(participated_with), updated_at = NOW()`,
        [userId, `${teamStart} ~ ${teamEnd}`, JSON.stringify(companionIds)],
      );
    }
    await connection.execute(
      `INSERT INTO reviews
        (review_id, reviewer_id, reviewee_id, related_team_id, review_high, review_medium, review_low, comment)
       VALUES (1, 2, 1, 1, 1, 0, 0, '회의 내용을 빠르게 정리하고 팀 진행을 안정적으로 이끌어줬어요.')
       ON DUPLICATE KEY UPDATE review_high = 1, review_medium = 0, review_low = 0,
         comment = VALUES(comment), updated_at = NOW()`,
    );

    await connection.commit();
    console.log(JSON.stringify({
      database: databaseName,
      port: Number(process.env.DB_PORT || 3307),
      login: { email: 'test@test.com', password: 'test123' },
      seeded: { users: 3, activities: activities.length, recruitments: 3, teams: 2, todos: todos.length },
    }, null, 2));
  } catch (error) {
    if (connection.connection?._closing !== true) {
      try { await connection.rollback(); } catch (_) { /* no active transaction */ }
    }
    throw error;
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  console.error('로컬 데이터베이스 초기화 실패:', error.message);
  process.exitCode = 1;
});
