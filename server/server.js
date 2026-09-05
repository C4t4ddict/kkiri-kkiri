console.log('끼리끼리 서버 시작...');

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (error) {
  // dotenv는 개발 편의용입니다. 설치되어 있지 않으면 환경변수만 사용합니다.
}

const { attachAuth, getAuthenticatedUserId, issueAuthToken } = require('./lib/auth');
const { getRequestMetrics, logger, requestLogger } = require('./lib/logger');
const { createSecureImageUpload } = require('./lib/secureImageUpload');
const { createTtlCache } = require('./lib/ttlCache');
const { extractPrizeDetails, extractPrizeSummary } = require('./lib/activityPrize');
const { buildMonthTodoCalendar, findPeriodGoalCapacityConflict } = require('./lib/todoCalendar');
const {
  ensureAwardsSchema,
  listAwards,
  upsertAward,
} = require('./awards/service');
const {
  buildApplicationTimeline,
  ensureApplicationSchema,
  getApplicationTimeline,
  recordApplicationEvent,
  sanitizeTemplate,
} = require('./applications/service');
const {
  archiveExpiredTeams,
  archiveTeam,
  ensurePortfolioSchema,
  getMiniPortfolio,
  listPastActivities,
  updateMiniPortfolio,
} = require('./portfolio/service');
const { createMiniPortfolioPdf } = require('./portfolio/pdf');
const { startCrawlerScheduler } = require('./crawler/scheduler');
const {
  canAccessRecruitment,
  getAccountIdentity,
  isValidEmail,
  normalizeEmail,
} = require('./auth/accountPolicy');
const {
  consumeSignupVerification,
  createPasswordResetToken,
  ensureAuthVerificationSchema,
  getRegisteredSchool,
  hasVerifiedSignup,
  requestEmailCode,
  resetPasswordWithToken,
  verifyEmailCode,
} = require('./auth/verificationService');
const { createRequireAdmin } = require('./auth/adminAuthorization');
const {
  attachReplies,
  createFeedbackReply,
  ensureDeveloperFeedbackSchema,
  normalizeFeedback,
  normalizeFeedbackReply,
} = require('./feedback/service');
const {
  createCurriculum,
  ensureCurriculumSchema,
  enrollCurriculum,
  getCurriculum,
  getEnrollment,
  listCurricula,
  previewCurriculum,
  provisionCurriculumGoalsForMember,
} = require('./curricula/service');
const {
  areFriends,
  ensureMessagingSchema,
  normalizeFriendshipPair,
} = require('./messaging/service');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BCRYPT_SALT_ROUNDS = 10;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const isPasswordValid = (inputPassword, savedPassword) => {
  if (!savedPassword) {
    return false;
  }

  if (savedPassword.startsWith('$2')) {
    return bcrypt.compareSync(inputPassword, savedPassword);
  }

  return inputPassword === savedPassword;
};

const hashPassword = (password) => bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);

const normalizeLocalUrl = (url) =>
  url ? url.replace('http://localhost:3000', 'http://10.0.2.2:3000') : url;

const getActivityImageUrl = (url) => {
  const normalizedUrl = normalizeLocalUrl(url);

  if (!normalizedUrl) {
    return normalizedUrl;
  }

  const uploadMatch = normalizedUrl.match(/\/uploads\/([^/?#]+)/);

  if (!uploadMatch) {
    return normalizedUrl;
  }

  const fileName = decodeURIComponent(uploadMatch[1]);
  const filePath = path.join(UPLOADS_DIR, fileName);

  if (fs.existsSync(filePath)) {
    return normalizedUrl;
  }

  return null;
};

const normalizeActivity = (activity) => {
  if (!activity) {
    return activity;
  }

  let sourceCategories = activity.source_categories;
  if (typeof sourceCategories === 'string') {
    try {
      const parsed = JSON.parse(sourceCategories);
      sourceCategories = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      sourceCategories = sourceCategories
        .split(',')
        .map((category) => category.trim())
        .filter(Boolean);
    }
  }

  return {
    ...activity,
    source_categories: Array.isArray(sourceCategories) ? sourceCategories : [],
    main_image_url: getActivityImageUrl(activity.main_image_url),
    prize_details: activity.prize_details || extractPrizeDetails(activity.details),
    prize_summary: extractPrizeSummary(activity.prize_details || activity.details),
  };
};

const parseIdList = (value) => {
  if (Array.isArray(value)) {
    return value.map(Number).filter(Number.isFinite);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(Number).filter(Number.isFinite);
      }
    } catch (error) {
      return value
        .split(',')
        .map((item) => Number(item.trim()))
        .filter(Number.isFinite);
    }
  }

  return [];
};

const parsePagination = (query) => {
  if (query.page === undefined && query.limit === undefined) return null;
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit };
};

const sendActivityList = (res, activities, pagination) => {
  const normalized = activities.map(normalizeActivity);
  if (!pagination) return res.status(200).json(normalized);
  const start = (pagination.page - 1) * pagination.limit;
  return res.status(200).json({
    items: normalized.slice(start, start + pagination.limit),
    pagination: {
      ...pagination,
      total: normalized.length,
      totalPages: Math.ceil(normalized.length / pagination.limit),
    },
  });
};

const getRequestUserId = getAuthenticatedUserId;

const formatDateOnly = (value) => {
  if (!value) {
    return value;
  }

  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }

  return String(value).slice(0, 10);
};

const queryWithLockRetry = async (database, sql, params = [], maximumAttempts = 3) => {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await database.query(sql, params);
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') return [[], []];
      if (!['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code) || attempt === maximumAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw new Error('데이터베이스 스키마 변경 재시도에 실패했습니다');
};

const parseStrictDateOnly = (value) => {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? date
    : null;
};

const listDateRange = (startDate, endDate, maximumDays = 366) => {
  const dates = [];
  const current = new Date(startDate);
  while (current <= endDate && dates.length < maximumDays) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

const normalizeTodo = (todo, fallbackScope, fallbackStart, fallbackEnd) => ({
  ...todo,
  scope_type: fallbackScope || todo.scope_type,
  scope_start_date: fallbackStart || formatDateOnly(todo.scope_start_date),
  scope_end_date: fallbackEnd || formatDateOnly(todo.scope_end_date),
});

const toClientUser = (user) => ({
  id: user.user_id,
  user_id: user.user_id,
  email: user.email,
  name: user.name,
  department: user.department,
  student_number: user.student_number,
  studentId: user.student_number,
  birth: formatDateOnly(user.birth_date || user.birth),
  birth_date: formatDateOnly(user.birth_date || user.birth),
  profile_picture: normalizeLocalUrl(user.profile_picture),
  self_intro: user.self_intro,
  is_admin: Boolean(user.is_admin),
  email_verified: Boolean(user.email_verified),
  emailVerified: Boolean(user.email_verified),
  account_type: user.account_type || 'GENERAL',
  accountType: user.account_type || 'GENERAL',
  school_domain: user.school_domain || null,
  schoolDomain: user.school_domain || null,
  school_name: user.school_name || null,
  schoolName: user.school_name || null,
});

// Middleware 설정
app.use(cors());
app.use(bodyParser.json());
app.use(attachAuth);
app.use(requestLogger);

const privateApiPattern = /^(?:\/api\/(?:user(?:\/|$)|delete-user(?:\/|$)|upload(?:\/|$)|favorite-activities(?:\/|$)|application-templates(?:\/|$)|developer-feedback(?:\/|$)|friends(?:\/|$)|messages(?:\/|$)|my-(?:recruitments|applications)(?:\/|$)|applications(?:\/|$)|reviews(?:\/|$)|participations(?:\/|$)|team-join-offers(?:\/|$)|curriculum-enrollments(?:\/|$))|\/(?:users|teams|todos|notifications)(?:\/|$))/;
app.use((req, res, next) => {
  if (!privateApiPattern.test(req.path)) return next();
  if (!getRequestUserId(req)) return res.status(401).json({ message: '로그인이 필요합니다' });
  next();
});

// 검증된 이미지 업로드만 브라우저에서 표시하고 MIME 스니핑을 차단합니다.
app.use('/uploads', express.static(UPLOADS_DIR, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

// MySQL 연결 설정
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'myappdb', // 범수 프로젝트 DB
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  maxIdle: Number(process.env.DB_MAX_IDLE || 10),
  idleTimeout: Number(process.env.DB_IDLE_TIMEOUT_MS || 60_000),
  queueLimit: Number(process.env.DB_QUEUE_LIMIT || 0),
  charset: 'utf8mb4',
});
db.state = 'connecting';
const portfolioDb = db.promise();
const activityCache = createTtlCache({
  ttlMs: Number(process.env.ACTIVITY_CACHE_TTL_MS || 30_000),
  maxEntries: 20,
});
let portfolioQueue = Promise.resolve();
let matchingSchemaReady = Promise.resolve();
let adminSchemaReady = Promise.resolve();
let awardSchemaReady = Promise.resolve();
let todoCalendarSchemaReady = Promise.resolve();
let authSchemaReady = Promise.resolve();
let feedbackSchemaReady = Promise.resolve();
let curriculumSchemaReady = Promise.resolve();
let activityDiscoverySchemaReady = Promise.resolve();
let messagingSchemaReady = Promise.resolve();
let crawlerScheduler = null;

const queuePortfolioJob = (job) => {
  const result = portfolioQueue.then(job, job);
  portfolioQueue = result.catch(() => undefined);
  return result;
};

const runArchiveMaintenance = () =>
  queuePortfolioJob(() => archiveExpiredTeams(portfolioDb)).then((result) => {
    activityCache.clear();
    return result;
  });

const runTeamArchive = (teamId, reason) =>
  queuePortfolioJob(() => archiveTeam(portfolioDb, teamId, reason)).then((result) => {
    activityCache.clear();
    return result;
  });

const ensureActivityTables = () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS team_notices (
      notice_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      author_id INT NOT NULL,
      title VARCHAR(160) NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_team_notices_team_created (team_id, created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS notice_comments (
      comment_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      notice_id INT NOT NULL,
      author_id INT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notice_comments_notice_created (notice_id, created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS user_notifications (
      notification_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      team_id INT NULL,
      notice_id INT NULL,
      type VARCHAR(32) NOT NULL,
      title VARCHAR(160) NOT NULL,
      content VARCHAR(255) NOT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_notifications_user_created (user_id, created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS user_favorite_activities (
      user_id INT NOT NULL,
      activity_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, activity_id),
      INDEX idx_favorite_activities_user_created (user_id, created_at),
      INDEX idx_favorite_activities_activity (activity_id)
    )`,
    `CREATE TABLE IF NOT EXISTS team_issues (
      issue_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      reporter_id INT NOT NULL,
      assignee_id INT NULL,
      title VARCHAR(180) NOT NULL,
      description TEXT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
      priority VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
      due_date DATE NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_team_issues_team_status (team_id, status, updated_at),
      INDEX idx_team_issues_assignee (assignee_id, status)
    )`,
  ];

  const createNext = (index) => {
    if (index >= statements.length) return;
    db.query(statements[index], (err) => {
      if (err) {
        console.error('활동 위젯 테이블 준비 오류:', err);
        return;
      }
      createNext(index + 1);
    });
  };

  createNext(0);
};

const ensureActivityDiscoverySchema = async () => {
  await portfolioDb.query(`CREATE TABLE IF NOT EXISTS activity_view_events (
    activity_id INT NOT NULL,
    user_id INT NOT NULL,
    view_date DATE NOT NULL,
    view_count INT NOT NULL DEFAULT 1,
    first_viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (activity_id, user_id, view_date),
    INDEX idx_activity_views_recent (view_date, activity_id)
  )`);
};

const ensureTodoCompletionColumn = () => {
  db.query('SHOW COLUMNS FROM todos LIKE \'completed_at\'', (columnErr, columns) => {
    if (columnErr || columns?.length) return;
    db.query('ALTER TABLE todos ADD COLUMN completed_at DATETIME NULL', (alterErr) => {
      if (alterErr) console.error('투두 완료 시각 컬럼 준비 오류:', alterErr);
    });
  });
};

const ensureTodoCalendarSchema = async () => {
  const [columns] = await portfolioDb.query('SHOW COLUMNS FROM todos');
  const existingColumns = new Set(columns.map((column) => column.Field));
  const requiredColumns = [
    ['range_group_id', 'VARCHAR(36) NULL AFTER scope_end_date'],
    ['range_start_date', 'DATE NULL AFTER range_group_id'],
    ['range_end_date', 'DATE NULL AFTER range_start_date'],
    ['range_color', 'VARCHAR(7) NULL AFTER range_end_date'],
  ];
  for (const [columnName, definition] of requiredColumns) {
    if (!existingColumns.has(columnName)) {
      await portfolioDb.query(`ALTER TABLE todos ADD COLUMN \`${columnName}\` ${definition}`);
    }
  }
  const [indexes] = await portfolioDb.query(
    "SHOW INDEX FROM todos WHERE Key_name = 'idx_todos_calendar_range'"
  );
  if (!indexes.length) {
    await portfolioDb.query(
      'ALTER TABLE todos ADD INDEX idx_todos_calendar_range (team_id, assigned_user_id, scope_start_date, scope_end_date)'
    );
  }
};

const ensureActivityPrizeSchema = async () => {
  const [columns] = await portfolioDb.query("SHOW COLUMNS FROM activitys LIKE 'prize_details'");
  if (!columns.length) {
    await portfolioDb.query('ALTER TABLE activitys ADD COLUMN prize_details TEXT NULL AFTER points');
  }

  const [activities] = await portfolioDb.query(
    `SELECT activity_id, details
     FROM activitys
     WHERE (prize_details IS NULL OR TRIM(prize_details) = '')
       AND details IS NOT NULL`
  );
  for (const activity of activities) {
    const prizeDetails = extractPrizeDetails(activity.details);
    if (prizeDetails) {
      await portfolioDb.query(
        'UPDATE activitys SET prize_details = ? WHERE activity_id = ?',
        [prizeDetails, activity.activity_id]
      );
    }
  }
  activityCache.clear();
};

const ensureRecruitmentActivityColumns = async () => {
  const requiredColumns = [
    ['activity_id', 'INT NULL AFTER team_id'],
    ['activity_start_date', 'DATE NULL AFTER required_members'],
    ['activity_end_date', 'DATE NULL AFTER activity_start_date'],
    ['deleted_at', 'DATETIME NULL AFTER created_at'],
    ['recruitment_scope', "VARCHAR(20) NOT NULL DEFAULT 'NATIONWIDE' AFTER meeting_type"],
    ['school_domain', 'VARCHAR(255) NULL AFTER recruitment_scope'],
  ];

  const [columns] = await portfolioDb.query('SHOW COLUMNS FROM team_recruitments');
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const [columnName, definition] of requiredColumns) {
    if (!existingColumns.has(columnName)) {
      await queryWithLockRetry(
        portfolioDb,
        `ALTER TABLE team_recruitments ADD COLUMN \`${columnName}\` ${definition}`,
      );
    }
  }

  const [indexes] = await portfolioDb.query(
    "SHOW INDEX FROM team_recruitments WHERE Key_name = 'idx_team_recruitments_activity_status'"
  );
  if (!indexes.length) {
    await portfolioDb.query(
      'ALTER TABLE team_recruitments ADD INDEX idx_team_recruitments_activity_status (activity_id, status)'
    );
  }

  const [deletedIndexes] = await portfolioDb.query(
    "SHOW INDEX FROM team_recruitments WHERE Key_name = 'idx_team_recruitments_owner_deleted'"
  );
  if (!deletedIndexes.length) {
    await portfolioDb.query(
      'ALTER TABLE team_recruitments ADD INDEX idx_team_recruitments_owner_deleted (owner_user_id, deleted_at)'
    );
  }

  await portfolioDb.query(`
    UPDATE team_recruitments tr
    JOIN activitys a ON TRIM(a.title) = TRIM(tr.activity_name)
    SET tr.activity_id = a.activity_id
    WHERE tr.activity_id IS NULL
  `);
};

const getMatchingUserProfile = async (database, userId) => {
  if (!userId) return null;
  const [rows] = await database.query(
    `SELECT id, email_verified, account_type, school_domain, school_name
     FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
};

const ensureMatchingInvitationSchema = async () => {
  await portfolioDb.query(`CREATE TABLE IF NOT EXISTS team_join_offers (
    offer_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    recruitment_id INT NOT NULL,
    team_id INT NOT NULL,
    inviter_id INT NOT NULL,
    invitee_id INT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME NULL,
    UNIQUE KEY uq_team_join_offers_application (application_id),
    INDEX idx_team_join_offers_invitee_status (invitee_id, status),
    INDEX idx_team_join_offers_recruitment (recruitment_id)
  )`);

  await portfolioDb.query(`CREATE TABLE IF NOT EXISTS user_notifications (
    notification_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    team_id INT NULL,
    notice_id INT NULL,
    offer_id INT NULL,
    type VARCHAR(32) NOT NULL,
    title VARCHAR(160) NOT NULL,
    content VARCHAR(255) NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_notifications_user_created (user_id, created_at),
    INDEX idx_user_notifications_user_read (user_id, is_read)
  )`);

  const [notificationColumns] = await portfolioDb.query('SHOW COLUMNS FROM user_notifications');
  const existingColumns = new Set(notificationColumns.map((column) => column.Field));
  if (!existingColumns.has('offer_id')) {
    await portfolioDb.query('ALTER TABLE user_notifications ADD COLUMN offer_id INT NULL AFTER notice_id');
  }
  const teamIdColumn = notificationColumns.find((column) => column.Field === 'team_id');
  if (teamIdColumn?.Null === 'NO') {
    await portfolioDb.query('ALTER TABLE user_notifications MODIFY COLUMN team_id INT NULL');
  }

  const [notificationIndexes] = await portfolioDb.query(
    "SHOW INDEX FROM user_notifications WHERE Key_name = 'idx_user_notifications_user_read'"
  );
  if (!notificationIndexes.length) {
    await portfolioDb.query(
      'ALTER TABLE user_notifications ADD INDEX idx_user_notifications_user_read (user_id, is_read)'
    );
  }
};

const ensureAdminSchema = async () => {
  const [userColumns] = await portfolioDb.query("SHOW COLUMNS FROM users LIKE 'is_admin'");
  if (!userColumns.length) {
    await portfolioDb.query('ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER self_intro');
  }

  const [activityColumns] = await portfolioDb.query("SHOW COLUMNS FROM activitys LIKE 'is_hidden'");
  if (!activityColumns.length) {
    await portfolioDb.query('ALTER TABLE activitys ADD COLUMN is_hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER last_crawled_at');
  }
  const [activityIndexes] = await portfolioDb.query(
    "SHOW INDEX FROM activitys WHERE Key_name = 'idx_activitys_hidden_updated'"
  );
  if (!activityIndexes.length) {
    await portfolioDb.query('ALTER TABLE activitys ADD INDEX idx_activitys_hidden_updated (is_hidden, updated_at)');
  }

  const adminEmails = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length) {
    await portfolioDb.query(
      `UPDATE users SET is_admin = 1 WHERE LOWER(email) IN (${adminEmails.map(() => '?').join(', ')})`,
      adminEmails,
    );
  }
};

const requireAdmin = createRequireAdmin({
  database: portfolioDb,
  getRequestUserId,
  getSchemaReady: () => adminSchemaReady,
});

const ensureRecruitmentTeam = async (connection, recruitment) => {
  let teamId = Number(recruitment.team_id || 0);

  if (!teamId) {
    const [result] = await connection.query(
      `INSERT INTO teams
        (recruitment_id, team_name, leader_user_id, required_members, status, due_date, activity_status)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, 'IN_PROGRESS')`,
      [
        recruitment.recruitment_id,
        String(recruitment.activity_name || recruitment.post_name || '새 팀').slice(0, 255),
        recruitment.owner_user_id,
        recruitment.required_members,
        recruitment.activity_end_date || null,
      ],
    );
    teamId = Number(result.insertId);
    await connection.query(
      'UPDATE team_recruitments SET team_id = ? WHERE recruitment_id = ?',
      [teamId, recruitment.recruitment_id],
    );
  }

  await connection.query(
    `INSERT INTO team_members (team_id, user_id, role, part)
     VALUES (?, ?, 'LEADER', '팀장')
     ON DUPLICATE KEY UPDATE role = 'LEADER', part = COALESCE(part, VALUES(part))`,
    [teamId, recruitment.owner_user_id],
  );

  return teamId;
};

// 데이터베이스 연결 테스트
db.getConnection((err, connection) => {
  if (err) {
    db.state = 'disconnected';
    console.error('❌ MySQL 연결 실패:', err.message);
    console.log('DB가 복구될 때까지 데이터 API는 503을 반환합니다.');
  } else {
    connection.release();
    db.state = 'connected';
    console.log('✅ MySQL 연결 성공!');
    ensureActivityTables();
    ensureTodoCompletionColumn();
    todoCalendarSchemaReady = ensureTodoCalendarSchema();
    authSchemaReady = ensureAuthVerificationSchema(portfolioDb);
    feedbackSchemaReady = ensureDeveloperFeedbackSchema(portfolioDb);
    activityDiscoverySchemaReady = ensureActivityDiscoverySchema();
    messagingSchemaReady = ensureMessagingSchema(portfolioDb);
    crawlerScheduler = startCrawlerScheduler();
    curriculumSchemaReady = Promise.all([
      ensureRecruitmentActivityColumns(),
      ensureActivityPrizeSchema(),
      todoCalendarSchemaReady,
      authSchemaReady,
    ])
      .then(() => ensureCurriculumSchema(portfolioDb));
    matchingSchemaReady = curriculumSchemaReady
      .then(() => ensureMatchingInvitationSchema())
      .then(() => ensureApplicationSchema(portfolioDb));
    adminSchemaReady = ensureAdminSchema();
    awardSchemaReady = matchingSchemaReady
      .then(() => adminSchemaReady)
      .then(() => ensurePortfolioSchema(portfolioDb))
      .then(() => ensureAwardsSchema(portfolioDb));
    awardSchemaReady
      .then(() => runArchiveMaintenance())
      .then((archived) => {
        if (archived.length) {
          console.log(`✅ 지난 활동 자동 아카이브 ${archived.length}개 팀 완료`);
        }
      })
      .catch((portfolioError) => console.error('DB 스키마 초기화 오류:', portfolioError));
  }
});

const portfolioArchiveTimer = setInterval(() => {
  if (db.state === 'connected') {
    runArchiveMaintenance().catch((error) => console.error('지난 활동 정기 아카이브 오류:', error));
  }
}, 60 * 60 * 1000);
portfolioArchiveTimer.unref();

// 기본 라우트
app.get('/', (req, res) => {
  res.json({
    message: '끼리끼리 API 서버입니다!',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Health 체크
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime_seconds: Math.round(process.uptime()),
    database: db.state,
    activity_cache_entries: activityCache.size(),
    timestamp: new Date().toISOString()
  });
});

// 데이터베이스 연결 상태 확인
app.get('/api/db-health', async (req, res) => {
  const databaseName = process.env.DB_NAME || 'myappdb';
  const requiredTables = ['users', 'activitys', 'teams', 'team_members', 'todos'];
  try {
    const [[connection]] = await portfolioDb.query(
      'SELECT DATABASE() AS database_name, @@port AS port, CURRENT_USER() AS account',
    );
    const [tableRows] = await portfolioDb.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = ? AND table_name IN (${requiredTables.map(() => '?').join(', ')})`,
      [databaseName, ...requiredTables],
    );
    const existingTables = new Set(tableRows.map((row) => row.TABLE_NAME || row.table_name));
    const missingTables = requiredTables.filter((table) => !existingTables.has(table));
    const [[stats]] = await portfolioDb.query(`
      SELECT
        COUNT(*) AS activities,
        SUM(CASE WHEN source_name IN ('위비티', '씽굿') THEN 1 ELSE 0 END) AS sourced_activities,
        SUM(CASE WHEN source_name IN ('위비티', '씽굿')
          AND main_image_url IS NOT NULL AND TRIM(main_image_url) <> '' THEN 1 ELSE 0 END) AS sourced_activities_with_images,
        SUM(CASE WHEN source_name = 'local-demo' THEN 1 ELSE 0 END) AS fixture_activities,
        SUM(CASE WHEN source_name = 'local-demo' AND COALESCE(is_hidden, 0) = 1 THEN 1 ELSE 0 END) AS hidden_fixture_activities,
        SUM(CASE WHEN main_image_url IS NOT NULL AND TRIM(main_image_url) <> '' THEN 1 ELSE 0 END) AS activities_with_images,
        SUM(CASE WHEN COALESCE(is_hidden, 0) = 0
          AND (application_period_end IS NULL OR application_period_end >= CURDATE()) THEN 1 ELSE 0 END) AS open_activities
      FROM activitys
    `);
    const [[teamStats]] = await portfolioDb.query(`
      SELECT
        SUM(CASE WHEN activity_status = 'IN_PROGRESS' AND status <> 'ARCHIVED' THEN 1 ELSE 0 END) AS active_teams,
        (SELECT COUNT(*) FROM team_members) AS memberships,
        (SELECT COUNT(*) FROM team_members tm LEFT JOIN teams t ON t.team_id = tm.team_id WHERE t.team_id IS NULL) AS orphan_memberships
      FROM teams
    `);
    const [[crawlerTable]] = await portfolioDb.query(
      `SELECT COUNT(*) AS table_count FROM information_schema.tables
       WHERE table_schema = ? AND table_name = 'crawler_runs'`,
      [databaseName],
    );
    let crawler = null;
    if (Number(crawlerTable.table_count) > 0) {
      const [runs] = await portfolioDb.query(
        `SELECT run_id, source_name, status, discovered_count, saved_count, error_count,
                started_at, finished_at
         FROM crawler_runs ORDER BY run_id DESC LIMIT 1`,
      );
      crawler = runs[0] || null;
    }
    const schemaOk = missingTables.length === 0;
    const sourcedActivities = Number(stats.sourced_activities || 0);
    const dataOk = sourcedActivities > 0
      && Number(stats.sourced_activities_with_images || 0) === sourcedActivities
      && Number(teamStats.orphan_memberships || 0) === 0
      && crawler?.status === 'completed'
      && Number(crawler?.error_count || 0) === 0;
    const healthy = schemaOk && dataOk;
    db.state = 'connected';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      message: healthy ? '데이터베이스 연결·스키마·수집 데이터 품질을 확인했습니다' : '데이터베이스 검증 항목을 확인해주세요',
      database: connection.database_name,
      port: Number(connection.port),
      account: connection.account,
      checks: { connection: true, schema: schemaOk, data: dataOk, missing_tables: missingTables },
      stats: {
        activities: Number(stats.activities || 0),
        sourced_activities: sourcedActivities,
        sourced_activities_with_images: Number(stats.sourced_activities_with_images || 0),
        fixture_activities: Number(stats.fixture_activities || 0),
        hidden_fixture_activities: Number(stats.hidden_fixture_activities || 0),
        activities_with_images: Number(stats.activities_with_images || 0),
        open_activities: Number(stats.open_activities || 0),
        active_teams: Number(teamStats.active_teams || 0),
        memberships: Number(teamStats.memberships || 0),
        orphan_memberships: Number(teamStats.orphan_memberships || 0),
      },
      crawler,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    db.state = 'disconnected';
    res.status(503).json({
      status: 'error',
      message: '데이터베이스 연결 또는 검증 쿼리에 실패했습니다',
      database: databaseName,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      requestId: res.getHeader('x-request-id'),
    });
  }
});

// DB 장애를 더미 데이터로 감추지 않습니다. 상태 확인을 제외한 모든 데이터 API는
// 명확한 503 응답을 반환해 웹과 앱이 실제 연결 오류를 표시할 수 있게 합니다.
app.use((req, res, next) => {
  if (db.state === 'connected') return next();
  return res.status(503).json({
    message: '데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
    database: process.env.DB_NAME || 'myappdb',
  });
});

app.get('/api/curricula', async (req, res) => {
  if (!db || db.state === 'disconnected') return res.json([]);
  try {
    await curriculumSchemaReady;
    const curricula = await listCurricula(portfolioDb, {
      search: req.query.search,
      difficulty: req.query.difficulty,
    });
    res.json(curricula);
  } catch (error) {
    logger.error('curriculum_list_failed', { error: error.message });
    res.status(500).json({ message: '기업 커리큘럼을 불러오지 못했습니다' });
  }
});

app.get('/api/curricula/:id', async (req, res) => {
  const curriculumId = Number(req.params.id);
  if (!Number.isInteger(curriculumId) || curriculumId <= 0) {
    return res.status(400).json({ message: '올바른 커리큘럼 ID가 필요합니다' });
  }
  try {
    await curriculumSchemaReady;
    const curriculum = await getCurriculum(portfolioDb, curriculumId);
    if (!curriculum) return res.status(404).json({ message: '커리큘럼을 찾을 수 없습니다' });
    res.json(curriculum);
  } catch (error) {
    logger.error('curriculum_detail_failed', { curriculumId, error: error.message });
    res.status(500).json({ message: '커리큘럼을 불러오지 못했습니다' });
  }
});

app.post('/api/curricula/:id/preview', async (req, res) => {
  const curriculumId = Number(req.params.id);
  if (!Number.isInteger(curriculumId) || curriculumId <= 0) {
    return res.status(400).json({ message: '올바른 커리큘럼 ID가 필요합니다' });
  }
  try {
    await curriculumSchemaReady;
    const preview = await previewCurriculum(portfolioDb, curriculumId, req.body);
    if (!preview) return res.status(404).json({ message: '커리큘럼을 찾을 수 없습니다' });
    res.json(preview);
  } catch (error) {
    logger.warn('curriculum_preview_failed', { curriculumId, error: error.message });
    res.status(error.code === 'INVALID_START_DATE' ? 400 : 500).json({
      message: error.code === 'INVALID_START_DATE' ? error.message : '개인 일정을 만들지 못했습니다',
    });
  }
});

app.post('/api/curricula/:id/enroll', async (req, res) => {
  const curriculumId = Number(req.params.id);
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!Number.isInteger(curriculumId) || curriculumId <= 0) {
    return res.status(400).json({ message: '올바른 커리큘럼 ID가 필요합니다' });
  }
  try {
    await curriculumSchemaReady;
    const enrollment = await enrollCurriculum(portfolioDb, userId, curriculumId, req.body);
    if (!enrollment) return res.status(404).json({ message: '커리큘럼을 찾을 수 없습니다' });
    activityCache.clear();
    res.status(201).json(enrollment);
  } catch (error) {
    logger.error('curriculum_enroll_failed', { curriculumId, userId, error: error.message });
    res.status(error.statusCode || 500).json({ message: error.message || '활동에 커리큘럼을 추가하지 못했습니다' });
  }
});

app.get('/api/curriculum-enrollments/:id', async (req, res) => {
  const enrollmentId = Number(req.params.id);
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
    return res.status(400).json({ message: '올바른 학습 활동 ID가 필요합니다' });
  }
  try {
    await curriculumSchemaReady;
    const enrollment = await getEnrollment(portfolioDb, enrollmentId, userId);
    if (!enrollment) return res.status(404).json({ message: '학습 활동을 찾을 수 없습니다' });
    res.json(enrollment);
  } catch (error) {
    logger.error('curriculum_enrollment_detail_failed', { enrollmentId, userId, error: error.message });
    res.status(500).json({ message: '학습 활동을 불러오지 못했습니다' });
  }
});

const requireOpsToken = (req, res, next) => {
  const configuredToken = String(process.env.OPS_API_TOKEN || '');
  if (!configuredToken || req.get('x-ops-token') !== configuredToken) {
    return res.status(403).json({ message: '운영 API 접근 권한이 없습니다' });
  }
  next();
};

app.get('/api/ops/status', requireOpsToken, async (req, res) => {
  try {
    const [crawlerRuns] = await portfolioDb.query(
      `SELECT run_id, source_name, status, discovered_count, saved_count, error_count, started_at, finished_at
       FROM crawler_runs ORDER BY started_at DESC LIMIT 10`
    );
    res.json({
      server: {
        uptimeSeconds: Math.round(process.uptime()),
        memory: process.memoryUsage(),
        requests: getRequestMetrics(),
      },
      database: { state: db.state, pool: db.pool?._allConnections?.length ?? null },
      cache: { activityEntries: activityCache.size() },
      crawlerRuns,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('ops_status_failed', { error: error.message });
    res.status(503).json({ message: '운영 상태를 조회하지 못했습니다' });
  }
});

// ===== 인증 관련 API =====

const handleAuthError = (res, error, fallbackMessage) => {
  logger.error('auth_request_failed', { error: error.message, code: error.code });
  if (error.code === 'EMAIL_NOT_CONFIGURED') {
    return res.status(503).json({ message: '이메일 발송 설정이 완료되지 않았습니다' });
  }
  return res.status(500).json({ message: fallbackMessage });
};

app.post('/auth/email-verification/request', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ message: '올바른 이메일을 입력해주세요' });
  if (db.state !== 'connected') return res.status(503).json({ message: '데이터베이스에 연결할 수 없습니다' });

  try {
    await authSchemaReady;
    const [existing] = await portfolioDb.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) return res.status(409).json({ message: '이미 가입된 이메일입니다' });

    const identity = getAccountIdentity(email);
    if (identity.schoolDomain && !(await getRegisteredSchool(portfolioDb, email))) {
      return res.status(400).json({ message: '등록되지 않은 학교 이메일 도메인입니다' });
    }

    const result = await requestEmailCode(portfolioDb, {
      email,
      purpose: 'SIGNUP',
      requestedIp: req.ip,
    });
    if (result.rateLimited) {
      res.set('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({ message: `${result.retryAfterSeconds}초 후 다시 요청해주세요` });
    }
    res.json({
      success: true,
      message: '인증 코드를 전송했습니다',
      account_type: identity.accountType,
      school_domain: identity.schoolDomain,
      ...(process.env.NODE_ENV === 'development' && result.developmentCode
        ? { development_code: result.developmentCode }
        : {}),
    });
  } catch (error) {
    handleAuthError(res, error, '인증 코드를 전송하지 못했습니다');
  }
});

app.post('/auth/email-verification/verify', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || '').trim();
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: '이메일과 6자리 인증 코드를 확인해주세요' });
  }
  try {
    await authSchemaReady;
    const result = await verifyEmailCode(portfolioDb, { email, purpose: 'SIGNUP', code });
    if (!result.verified) return res.status(400).json({ message: '인증 코드가 올바르지 않거나 만료되었습니다' });
    res.json({ success: true, message: '이메일 인증이 완료되었습니다' });
  } catch (error) {
    handleAuthError(res, error, '이메일 인증을 완료하지 못했습니다');
  }
});

app.post('/auth/password-reset/request', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ message: '올바른 이메일을 입력해주세요' });
  const genericResponse = { success: true, message: '가입된 이메일이면 인증 코드가 전송됩니다' };
  try {
    await authSchemaReady;
    const [users] = await portfolioDb.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (!users.length) return res.json(genericResponse);
    const result = await requestEmailCode(portfolioDb, {
      email,
      purpose: 'PASSWORD_RESET',
      requestedIp: req.ip,
    });
    if (result.rateLimited) {
      res.set('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({ message: `${result.retryAfterSeconds}초 후 다시 요청해주세요` });
    }
    res.json({
      ...genericResponse,
      ...(process.env.NODE_ENV === 'development' && result.developmentCode
        ? { development_code: result.developmentCode }
        : {}),
    });
  } catch (error) {
    handleAuthError(res, error, '비밀번호 재설정 메일을 전송하지 못했습니다');
  }
});

app.post('/auth/password-reset/verify', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || '').trim();
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: '이메일과 6자리 인증 코드를 확인해주세요' });
  }
  try {
    await authSchemaReady;
    const [users] = await portfolioDb.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (!users.length) return res.status(400).json({ message: '인증 코드가 올바르지 않거나 만료되었습니다' });
    const verification = await verifyEmailCode(portfolioDb, {
      email,
      purpose: 'PASSWORD_RESET',
      code,
      consume: true,
    });
    if (!verification.verified) {
      return res.status(400).json({ message: '인증 코드가 올바르지 않거나 만료되었습니다' });
    }
    const resetToken = await createPasswordResetToken(portfolioDb, users[0].id);
    res.json({ success: true, reset_token: resetToken });
  } catch (error) {
    handleAuthError(res, error, '인증 코드를 확인하지 못했습니다');
  }
});

app.post('/auth/password-reset/confirm', async (req, res) => {
  const token = String(req.body?.reset_token || '');
  const password = String(req.body?.password || '');
  if (!token || password.length < 4) {
    return res.status(400).json({ message: '비밀번호는 4자 이상 입력해주세요' });
  }
  try {
    await authSchemaReady;
    const reset = await resetPasswordWithToken(portfolioDb, {
      token,
      passwordHash: hashPassword(password),
    });
    if (!reset) return res.status(400).json({ message: '재설정 요청이 만료되었습니다. 다시 인증해주세요' });
    res.json({ success: true, message: '비밀번호가 변경되었습니다' });
  } catch (error) {
    handleAuthError(res, error, '비밀번호를 변경하지 못했습니다');
  }
});

// 새로운 로그인 API (LoginScreen0에서 사용)
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: '이메일과 비밀번호를 입력해주세요'
    });
  }

  // 더미 데이터로 테스트 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 로그인 처리 (MySQL 미연결)');
    
    // 테스트용 계정
    if (email === 'test@test.com' && password === 'test123') {
      const dummyUser = toClientUser({
        user_id: 1,
        email: 'test@test.com',
        name: '테스트 사용자',
        department: '컴퓨터공학과',
        student_number: '202012345',
        birth: '2000-01-01',
        profile_picture: null,
        self_intro: '',
        is_admin: false,
      });
      
      return res.json({
        success: true,
        message: '로그인 성공',
        user: dummyUser,
        token: issueAuthToken(dummyUser.id),
      });
    } else {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 잘못되었습니다'
      });
    }
  }

  // 실제 DB 쿼리
  const query = `
    SELECT
      id AS user_id,
      email,
      password,
      name,
      department,
      student_number,
      birth AS birth_date,
      profile_picture,
      self_intro,
      is_admin,
      email_verified,
      account_type,
      school_domain,
      school_name
    FROM users
    WHERE email = ?
  `;
  
  db.query(query, [email], (err, results) => {
    if (err) {
      console.error('로그인 DB 에러:', err);
      return res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }

    if (results.length === 0) {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 잘못되었습니다'
      });
    }

    const user = results[0];

    if (!isPasswordValid(password, user.password)) {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호가 잘못되었습니다'
      });
    }

    res.json({
      success: true,
      message: '로그인 성공',
      user: toClientUser(user),
      token: issueAuthToken(user.user_id),
    });
  });
});

// 기존 로그인 API 호환성 (기존 LoginScreen에서 사용)
app.post('/login', (req, res) => {
  console.log('기존 로그인 API 호출 - /login 라우트');
  
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: '이메일과 비밀번호를 모두 입력해주세요.'
    });
  }

  // 더미 데이터로 테스트 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 로그인 처리 (MySQL 미연결) - 기존 API');
    
    // 테스트용 계정
    if (email === 'test@test.com' && password === 'test123') {
      const dummyUser = toClientUser({
        user_id: 1,
        email: 'test@test.com',
        name: '테스트 사용자',
        department: '컴퓨터공학과',
        student_number: '202012345',
        birth: '2000-01-01',
        profile_picture: null,
        self_intro: '',
        is_admin: false,
      });
      
      return res.json({
        success: true,
        message: '로그인 성공',
        user: dummyUser,
        token: issueAuthToken(dummyUser.id),
      });
    } else {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호를 확인해주세요.'
      });
    }
  }

  // 실제 DB 쿼리 (기존 API와 동일)
  const query = `
    SELECT
      id AS user_id,
      email,
      password,
      name,
      department,
      student_number,
      birth AS birth_date,
      profile_picture,
      self_intro,
      is_admin,
      email_verified,
      account_type,
      school_domain,
      school_name
    FROM users
    WHERE email = ?
  `;
  
  db.query(query, [email], (err, results) => {
    if (err) {
      console.error('로그인 DB 에러:', err);
      return res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }

    if (results.length === 0) {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호를 확인해주세요.'
      });
    }

    const user = results[0];

    if (!isPasswordValid(password, user.password)) {
      return res.status(401).json({
        success: false,
        message: '이메일 또는 비밀번호를 확인해주세요.'
      });
    }

    res.json({
      success: true,
      message: '로그인 성공',
      user: toClientUser(user),
      token: issueAuthToken(user.user_id),
    });
  });
});

const registerUser = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim();
  const department = String(req.body?.department || '').trim() || null;
  const studentNumber = String(req.body?.student_number ?? req.body?.studentId ?? '').trim() || null;
  const birth = String(req.body?.birth_date ?? req.body?.birth ?? '').trim() || null;

  if (!isValidEmail(email) || password.length < 4 || !name) {
    return res.status(400).json({ success: false, message: '이메일, 비밀번호, 이름을 확인해주세요' });
  }
  if (db.state !== 'connected') {
    return res.status(503).json({ success: false, message: '데이터베이스에 연결할 수 없습니다' });
  }

  try {
    await authSchemaReady;
    const verificationId = await hasVerifiedSignup(portfolioDb, email);
    if (!verificationId) {
      return res.status(400).json({ success: false, message: '이메일 인증을 먼저 완료해주세요' });
    }

    const identity = getAccountIdentity(email);
    const school = identity.schoolDomain ? await getRegisteredSchool(portfolioDb, email) : null;
    if (identity.schoolDomain && !school) {
      return res.status(400).json({ success: false, message: '등록되지 않은 학교 이메일 도메인입니다' });
    }

    const [registrationResult] = await portfolioDb.query(
      `INSERT INTO users
        (email, email_verified, account_type, school_domain, school_name, password, name, department, student_number, birth)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email,
        school ? 'STUDENT' : 'GENERAL',
        school?.school_domain || null,
        school?.school_name || null,
        hashPassword(password),
        name,
        department,
        studentNumber,
        birth,
      ],
    );
    await consumeSignupVerification(portfolioDb, verificationId);
    return res.status(201).json({
      success: true,
      message: '회원가입 성공',
      user_id: registrationResult.insertId,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '이미 존재하는 이메일입니다' });
    }
    return handleAuthError(res, error, '회원가입을 완료하지 못했습니다');
  }
};

app.post('/api/register', registerUser);
app.post('/register', registerUser);

app.get('/api/developer-feedback/mine', async (req, res) => {
  const userId = getRequestUserId(req);
  try {
    await feedbackSchemaReady;
    const [rows] = await portfolioDb.query(
      `SELECT feedback_id, category, content, platform, status, created_at
       FROM developer_feedback
       WHERE user_id = ?
       ORDER BY created_at DESC, feedback_id DESC
       LIMIT 20`,
      [userId],
    );
    if (!rows.length) return res.json([]);
    const [replies] = await portfolioDb.query(
      `SELECT reply_id, feedback_id, content, created_at
       FROM developer_feedback_replies
       WHERE feedback_id IN (${rows.map(() => '?').join(', ')})
       ORDER BY created_at ASC, reply_id ASC`,
      rows.map((row) => row.feedback_id),
    );
    res.json(attachReplies(rows, replies));
  } catch (error) {
    logger.error('developer_feedback_list_failed', { userId, error: error.message });
    res.status(500).json({ message: '전달 내역을 불러오지 못했습니다' });
  }
});

app.get('/api/admin/developer-feedback', requireAdmin, async (req, res) => {
  try {
    await feedbackSchemaReady;
    const [rows] = await portfolioDb.query(
      `SELECT feedback.feedback_id, feedback.user_id, feedback.category, feedback.content,
              feedback.platform, feedback.status, feedback.created_at,
              users.name AS user_name, users.email AS user_email,
              (SELECT COUNT(*) FROM developer_feedback_replies reply
               WHERE reply.feedback_id = feedback.feedback_id) AS reply_count
       FROM developer_feedback feedback
       JOIN users ON users.id = feedback.user_id
       ORDER BY feedback.created_at DESC, feedback.feedback_id DESC
       LIMIT 100`,
    );
    res.json(rows || []);
  } catch (error) {
    logger.error('admin_feedback_list_failed', { error: error.message });
    res.status(500).json({ message: '사용자 의견을 불러오지 못했습니다' });
  }
});

app.get('/api/admin/developer-feedback/:feedbackId', requireAdmin, async (req, res) => {
  const feedbackId = Number(req.params.feedbackId);
  if (!Number.isInteger(feedbackId) || feedbackId <= 0) {
    return res.status(400).json({ message: '올바른 의견 번호가 필요합니다' });
  }
  try {
    await feedbackSchemaReady;
    const [[feedback]] = await portfolioDb.query(
      `SELECT feedback.feedback_id, feedback.user_id, feedback.category, feedback.content,
              feedback.platform, feedback.status, feedback.created_at,
              users.name AS user_name, users.email AS user_email
       FROM developer_feedback feedback
       JOIN users ON users.id = feedback.user_id
       WHERE feedback.feedback_id = ?`,
      [feedbackId],
    );
    if (!feedback) return res.status(404).json({ message: '전달된 의견을 찾을 수 없습니다' });
    const [replies] = await portfolioDb.query(
      `SELECT reply_id, content, created_at
       FROM developer_feedback_replies
       WHERE feedback_id = ?
       ORDER BY created_at ASC, reply_id ASC`,
      [feedbackId],
    );
    res.json({ ...feedback, replies });
  } catch (error) {
    logger.error('admin_feedback_detail_failed', { feedbackId, error: error.message });
    res.status(500).json({ message: '사용자 의견을 불러오지 못했습니다' });
  }
});

app.post('/api/admin/developer-feedback/:feedbackId/replies', requireAdmin, async (req, res) => {
  const adminUserId = getRequestUserId(req);
  const feedbackId = Number(req.params.feedbackId);
  const rawContent = String(req.body?.content || '').trim();
  const content = normalizeFeedbackReply(rawContent);
  if (!Number.isInteger(feedbackId) || feedbackId <= 0 || !content || Array.from(rawContent).length > 2000) {
    return res.status(400).json({ message: '답장 내용을 1자 이상 2,000자 이하로 입력해주세요' });
  }

  await Promise.all([feedbackSchemaReady, matchingSchemaReady]);
  try {
    const result = await createFeedbackReply(portfolioDb, { feedbackId, adminUserId, content });
    if (!result) {
      return res.status(404).json({ message: '전달된 의견을 찾을 수 없습니다' });
    }
    res.status(201).json({ success: true, reply_id: result.replyId });
  } catch (error) {
    logger.error('admin_feedback_reply_failed', { feedbackId, error: error.message });
    res.status(500).json({ message: '답장을 전송하지 못했습니다' });
  }
});

app.post('/api/developer-feedback', async (req, res) => {
  const userId = getRequestUserId(req);
  const feedback = normalizeFeedback(req.body || {});
  if (feedback.content.length < 10 || feedback.content.length > 2000) {
    return res.status(400).json({ message: '내용은 10자 이상 2,000자 이하로 입력해주세요' });
  }
  try {
    await feedbackSchemaReady;
    const [result] = await portfolioDb.query(
      `INSERT INTO developer_feedback (user_id, category, content, platform)
       VALUES (?, ?, ?, ?)`,
      [userId, feedback.category, feedback.content, feedback.platform],
    );
    res.status(201).json({ success: true, feedback_id: result.insertId });
  } catch (error) {
    logger.error('developer_feedback_create_failed', { userId, error: error.message });
    res.status(500).json({ message: '의견을 전달하지 못했습니다' });
  }
});

// ===== 활동 관련 API =====

// 활동 목록 조회 API
app.get('/api/activities', async (req, res) => {
  const pagination = parsePagination(req.query);
  try {
  await matchingSchemaReady;
  const profile = await getMatchingUserProfile(portfolioDb, getRequestUserId(req));
  const schoolDomain = profile?.email_verified && profile?.account_type === 'STUDENT'
    ? profile.school_domain
    : null;
  const cacheKey = `activities:all:${schoolDomain || 'nationwide'}`;
  const cached = activityCache.get(cacheKey);
  if (cached) return sendActivityList(res, cached, pagination);

  // 실제 DB 쿼리
  const sql = `
    SELECT
      a.*,
      COALESCE(rc.open_recruitment_count, 0) AS open_recruitment_count
    FROM activitys a
    LEFT JOIN (
      SELECT activity_id, COUNT(*) AS open_recruitment_count
      FROM team_recruitments
      WHERE status = 'OPEN' AND deleted_at IS NULL AND activity_id IS NOT NULL
        AND (
          COALESCE(recruitment_scope, 'NATIONWIDE') = 'NATIONWIDE'
          OR (recruitment_scope = 'SCHOOL' AND school_domain = ?)
        )
      GROUP BY activity_id
    ) rc ON rc.activity_id = a.activity_id
    WHERE COALESCE(a.is_hidden, 0) = 0
      AND COALESCE(a.source_name, '') <> 'local-demo'
    ORDER BY a.created_at DESC
  `;

    const [results] = await portfolioDb.query(sql, [schoolDomain]);
    const activities = results || [];
    activityCache.set(cacheKey, activities);
    sendActivityList(res, activities, pagination);
  } catch (error) {
    console.error('활동 조회 오류:', error);
    res.status(500).json({ message: '서버 오류' });
  }
});

app.get('/api/activities/open', async (req, res) => {
  const pagination = parsePagination(req.query);
  try {
  await matchingSchemaReady;
  const profile = await getMatchingUserProfile(portfolioDb, getRequestUserId(req));
  const schoolDomain = profile?.email_verified && profile?.account_type === 'STUDENT'
    ? profile.school_domain
    : null;
  const cacheKey = `activities:open:${schoolDomain || 'nationwide'}`;
  const cached = activityCache.get(cacheKey);
  if (cached) return sendActivityList(res, cached, pagination);

  const sql = `
    SELECT
      a.*,
      COALESCE(rc.open_recruitment_count, 0) AS open_recruitment_count
    FROM activitys a
    LEFT JOIN (
      SELECT activity_id, COUNT(*) AS open_recruitment_count
      FROM team_recruitments
      WHERE status = 'OPEN' AND deleted_at IS NULL AND activity_id IS NOT NULL
        AND (
          COALESCE(recruitment_scope, 'NATIONWIDE') = 'NATIONWIDE'
          OR (recruitment_scope = 'SCHOOL' AND school_domain = ?)
        )
      GROUP BY activity_id
    ) rc ON rc.activity_id = a.activity_id
    WHERE COALESCE(a.is_hidden, 0) = 0
      AND COALESCE(a.source_name, '') <> 'local-demo'
      AND (a.application_period_start IS NULL OR a.application_period_start <= NOW())
      AND (a.application_period_end IS NULL OR a.application_period_end >= CURDATE())
    ORDER BY a.application_period_end ASC, a.created_at DESC
  `;

    const [results] = await portfolioDb.query(sql, [schoolDomain]);
    const activities = results || [];
    activityCache.set(cacheKey, activities);
    sendActivityList(res, activities, pagination);
  } catch (error) {
    console.error('모집 중 활동 조회 오류:', error);
    res.status(500).json({ message: '서버 오류' });
  }
});

app.get('/api/activities/trending', async (req, res) => {
  const limit = Math.min(24, Math.max(4, Number.parseInt(req.query.limit, 10) || 12));
  try {
    await Promise.all([matchingSchemaReady, activityDiscoverySchemaReady]);
    const [rows] = await portfolioDb.query(`
      SELECT
        a.*,
        COALESCE(views.view_count, 0) AS recent_view_count,
        COALESCE(favorites.favorite_count, 0) AS favorite_count,
        COALESCE(recruitments.open_recruitment_count, 0) AS open_recruitment_count,
        (
          COALESCE(views.view_count, 0) * 3
          + COALESCE(favorites.favorite_count, 0) * 5
          + COALESCE(recruitments.open_recruitment_count, 0) * 2
          + CASE WHEN a.last_crawled_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END
        ) AS popularity_score
      FROM activitys a
      LEFT JOIN (
        SELECT activity_id, SUM(view_count) AS view_count
        FROM activity_view_events
        WHERE view_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY activity_id
      ) views ON views.activity_id = a.activity_id
      LEFT JOIN (
        SELECT activity_id, COUNT(*) AS favorite_count
        FROM user_favorite_activities
        GROUP BY activity_id
      ) favorites ON favorites.activity_id = a.activity_id
      LEFT JOIN (
        SELECT activity_id, COUNT(*) AS open_recruitment_count
        FROM team_recruitments
        WHERE status = 'OPEN' AND deleted_at IS NULL AND activity_id IS NOT NULL
        GROUP BY activity_id
      ) recruitments ON recruitments.activity_id = a.activity_id
      WHERE COALESCE(a.is_hidden, 0) = 0
        AND a.source_name IN ('위비티', '씽굿')
        AND a.main_image_url IS NOT NULL
        AND TRIM(a.main_image_url) <> ''
        AND (a.application_period_end IS NULL OR a.application_period_end >= CURDATE())
      ORDER BY popularity_score DESC,
               COALESCE(a.last_crawled_at, a.updated_at) DESC,
               a.application_period_end ASC,
               a.activity_id DESC
      LIMIT ?
    `, [limit]);
    res.json((rows || []).map(normalizeActivity));
  } catch (error) {
    logger.error('trending_activities_failed', { error: error.message });
    res.status(500).json({ message: '주목받는 활동을 불러오지 못했습니다' });
  }
});

// 활동 상세 조회 API
app.get('/api/activities/:id', async (req, res) => {
  const activityId = req.params.id;

  try {
  await matchingSchemaReady;
  const profile = await getMatchingUserProfile(portfolioDb, getRequestUserId(req));
  const schoolDomain = profile?.email_verified && profile?.account_type === 'STUDENT'
    ? profile.school_domain
    : null;
  // 실제 DB 쿼리
  const sql = `
    SELECT
      a.*,
      (
        SELECT COUNT(*)
        FROM team_recruitments tr
        WHERE tr.activity_id = a.activity_id AND tr.status = 'OPEN' AND tr.deleted_at IS NULL
          AND (
            COALESCE(tr.recruitment_scope, 'NATIONWIDE') = 'NATIONWIDE'
            OR (tr.recruitment_scope = 'SCHOOL' AND tr.school_domain = ?)
          )
      ) AS open_recruitment_count
    FROM activitys a
    WHERE a.activity_id = ? AND COALESCE(a.is_hidden, 0) = 0
  `;
    const [results] = await portfolioDb.query(sql, [schoolDomain, activityId]);
    if (results.length === 0) {
      return res.status(404).json({ message: '활동을 찾을 수 없습니다.' });
    }

    const userId = getRequestUserId(req);
    if (userId) {
      await activityDiscoverySchemaReady;
      await portfolioDb.query(
        `INSERT INTO activity_view_events (activity_id, user_id, view_date, view_count)
         VALUES (?, ?, CURDATE(), 1)
         ON DUPLICATE KEY UPDATE view_count = view_count + 1, last_viewed_at = CURRENT_TIMESTAMP`,
        [activityId, userId],
      );
    }

    res.status(200).json(normalizeActivity(results[0]));
  } catch (error) {
    console.error('활동 상세 조회 오류:', error);
    res.status(500).json({ message: '서버 오류' });
  }
});

app.get('/api/activities/:id/recruitments', async (req, res) => {
  const activityId = Number(req.params.id);
  const userId = getRequestUserId(req);

  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ message: '올바른 활동 ID가 필요합니다' });
  }

  try {
    await matchingSchemaReady;
    const profile = await getMatchingUserProfile(portfolioDb, userId);
    const canSeeSchool = Boolean(profile?.email_verified && profile?.account_type === 'STUDENT');
    const sql = `
    SELECT
      recruitment_id,
      owner_user_id,
      team_id,
      activity_id,
      post_name,
      activity_name,
      activity_type,
      qualification_department,
      required_members,
      activity_start_date,
      activity_end_date,
      activity_period,
      meeting_type,
      recruitment_scope,
      school_domain,
      memo,
      status,
      created_at
    FROM team_recruitments
    WHERE activity_id = ? AND status = 'OPEN' AND deleted_at IS NULL
      AND (
        COALESCE(recruitment_scope, 'NATIONWIDE') = 'NATIONWIDE'
        OR (? = 1 AND recruitment_scope = 'SCHOOL' AND school_domain = ?)
      )
    ORDER BY created_at DESC, recruitment_id DESC
  `;
    const [results] = await portfolioDb.query(sql, [
      activityId,
      canSeeSchool ? 1 : 0,
      profile?.school_domain || null,
    ]);
    res.json(results || []);
  } catch (error) {
    console.error('활동별 모집글 조회 오류:', error);
    res.status(500).json({ message: '서버 오류' });
  }
});

app.get('/api/favorite-activities', (req, res) => {
  const userId = getRequestUserId(req);

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  const sql = `
    SELECT a.*, ufa.created_at AS favorited_at
    FROM user_favorite_activities ufa
    JOIN activitys a ON a.activity_id = ufa.activity_id
    WHERE ufa.user_id = ? AND COALESCE(a.is_hidden, 0) = 0
    ORDER BY ufa.created_at DESC, a.activity_id DESC
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('관심 활동 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    res.json((results || []).map(normalizeActivity));
  });
});

app.get('/api/favorite-activities/ids', (req, res) => {
  const userId = getRequestUserId(req);

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  db.query(
    'SELECT activity_id FROM user_favorite_activities WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
    (err, results) => {
      if (err) {
        console.error('관심 활동 ID 조회 오류:', err);
        return res.status(500).json({ message: '서버 오류' });
      }

      res.json((results || []).map((item) => Number(item.activity_id)));
    }
  );
});

app.post('/api/favorite-activities/:activityId', (req, res) => {
  const userId = getRequestUserId(req);
  const activityId = Number(req.params.activityId);

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ message: '올바른 활동 ID가 필요합니다' });
  }

  db.query('SELECT activity_id FROM activitys WHERE activity_id = ?', [activityId], (findErr, rows) => {
    if (findErr) {
      console.error('관심 활동 대상 조회 오류:', findErr);
      return res.status(500).json({ message: '서버 오류' });
    }

    if (!rows.length) {
      return res.status(404).json({ message: '활동을 찾을 수 없습니다' });
    }

    db.query(
      'INSERT IGNORE INTO user_favorite_activities (user_id, activity_id) VALUES (?, ?)',
      [userId, activityId],
      (insertErr) => {
        if (insertErr) {
          console.error('관심 활동 저장 오류:', insertErr);
          return res.status(500).json({ message: '서버 오류' });
        }

        res.status(201).json({ success: true, activity_id: activityId });
      }
    );
  });
});

app.delete('/api/favorite-activities/:activityId', (req, res) => {
  const userId = getRequestUserId(req);
  const activityId = Number(req.params.activityId);

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ message: '올바른 활동 ID가 필요합니다' });
  }

  db.query(
    'DELETE FROM user_favorite_activities WHERE user_id = ? AND activity_id = ?',
    [userId, activityId],
    (err) => {
      if (err) {
        console.error('관심 활동 삭제 오류:', err);
        return res.status(500).json({ message: '서버 오류' });
      }

      res.json({ success: true, activity_id: activityId });
    }
  );
});

// ===== 매칭/활동 탭 API =====

app.get('/api/application-templates', async (req, res) => {
  const userId = getRequestUserId(req);
  try {
    await matchingSchemaReady;
    const [templates] = await portfolioDb.query(
      `SELECT template_id, title, content, is_default, created_at, updated_at
       FROM application_templates
       WHERE user_id = ?
       ORDER BY is_default DESC, updated_at DESC, template_id DESC`,
      [userId],
    );
    res.json(templates);
  } catch (error) {
    logger.error('application_templates_list_failed', { userId, error: error.message });
    res.status(500).json({ message: '지원서 템플릿을 불러오지 못했습니다' });
  }
});

app.post('/api/application-templates', async (req, res) => {
  const userId = getRequestUserId(req);
  const template = sanitizeTemplate(req.body);
  if (!template.title || !template.content) {
    return res.status(400).json({ message: '템플릿 제목과 내용을 입력해주세요' });
  }

  const connection = await portfolioDb.getConnection();
  try {
    await matchingSchemaReady;
    await connection.beginTransaction();
    const [[countRow]] = await connection.query(
      'SELECT COUNT(*) AS template_count FROM application_templates WHERE user_id = ?',
      [userId],
    );
    const shouldDefault = template.isDefault || Number(countRow.template_count) === 0;
    if (shouldDefault) {
      await connection.query('UPDATE application_templates SET is_default = 0 WHERE user_id = ?', [userId]);
    }
    const [result] = await connection.query(
      `INSERT INTO application_templates (user_id, title, content, is_default)
       VALUES (?, ?, ?, ?)`,
      [userId, template.title, template.content, shouldDefault ? 1 : 0],
    );
    await connection.commit();
    res.status(201).json({ success: true, template_id: result.insertId, is_default: shouldDefault });
  } catch (error) {
    await connection.rollback();
    logger.error('application_template_create_failed', { userId, error: error.message });
    res.status(500).json({ message: '지원서 템플릿을 저장하지 못했습니다' });
  } finally {
    connection.release();
  }
});

app.put('/api/application-templates/:templateId', async (req, res) => {
  const userId = getRequestUserId(req);
  const templateId = Number(req.params.templateId);
  const template = sanitizeTemplate(req.body);
  if (!Number.isInteger(templateId) || templateId <= 0 || !template.title || !template.content) {
    return res.status(400).json({ message: '템플릿 제목과 내용을 확인해주세요' });
  }

  const connection = await portfolioDb.getConnection();
  try {
    await matchingSchemaReady;
    await connection.beginTransaction();
    if (template.isDefault) {
      await connection.query('UPDATE application_templates SET is_default = 0 WHERE user_id = ?', [userId]);
    }
    const [result] = await connection.query(
      `UPDATE application_templates
       SET title = ?, content = ?, is_default = IF(?, 1, is_default)
       WHERE template_id = ? AND user_id = ?`,
      [template.title, template.content, template.isDefault ? 1 : 0, templateId, userId],
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ message: '지원서 템플릿을 찾을 수 없습니다' });
    }
    await connection.commit();
    res.json({ success: true, template_id: templateId });
  } catch (error) {
    await connection.rollback();
    logger.error('application_template_update_failed', { userId, templateId, error: error.message });
    res.status(500).json({ message: '지원서 템플릿을 수정하지 못했습니다' });
  } finally {
    connection.release();
  }
});

app.delete('/api/application-templates/:templateId', async (req, res) => {
  const userId = getRequestUserId(req);
  const templateId = Number(req.params.templateId);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return res.status(400).json({ message: '올바른 템플릿 ID가 필요합니다' });
  }

  const connection = await portfolioDb.getConnection();
  try {
    await matchingSchemaReady;
    await connection.beginTransaction();
    const [[template]] = await connection.query(
      'SELECT is_default FROM application_templates WHERE template_id = ? AND user_id = ? FOR UPDATE',
      [templateId, userId],
    );
    if (!template) {
      await connection.rollback();
      return res.status(404).json({ message: '지원서 템플릿을 찾을 수 없습니다' });
    }
    await connection.query('DELETE FROM application_templates WHERE template_id = ? AND user_id = ?', [templateId, userId]);
    if (template.is_default) {
      await connection.query(
        `UPDATE application_templates SET is_default = 1
         WHERE template_id = (
           SELECT template_id FROM (
             SELECT template_id FROM application_templates WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1
           ) latest
         )`,
        [userId],
      );
    }
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    logger.error('application_template_delete_failed', { userId, templateId, error: error.message });
    res.status(500).json({ message: '지원서 템플릿을 삭제하지 못했습니다' });
  } finally {
    connection.release();
  }
});

app.get('/api/team-recruitments', async (req, res) => {
  if (!db || db.state === 'disconnected') {
    return res.json([]);
  }

  const userId = getRequestUserId(req);

  try {
    await matchingSchemaReady;
    const profile = await getMatchingUserProfile(portfolioDb, userId);
    const canSeeSchool = Boolean(profile?.email_verified && profile?.account_type === 'STUDENT');
    const sql = `
    SELECT
      recruitment_id,
      owner_user_id,
      tr.team_id,
      tr.activity_id,
      tr.curriculum_id,
      tr.post_name,
      COALESCE(a.title, c.title, tr.activity_name) AS activity_name,
      tr.activity_type,
      COALESCE(a.category, CASE WHEN c.curriculum_id IS NOT NULL THEN '기업 커리큘럼' END) AS activity_category,
      COALESCE(a.topic_category, c.role_title) AS activity_topic_category,
      COALESCE(a.organizer, o.name) AS activity_organizer,
      qualification_department,
      qualification_student_number,
      qualification_age,
      tr.required_members,
      DATE_FORMAT(tr.activity_start_date, '%Y-%m-%d') AS activity_start_date,
      DATE_FORMAT(tr.activity_end_date, '%Y-%m-%d') AS activity_end_date,
      tr.activity_period,
      tr.meeting_type,
      tr.recruitment_scope,
      tr.school_domain,
      tr.memo,
      tr.status,
      tr.created_at
    FROM team_recruitments tr
    LEFT JOIN activitys a ON a.activity_id = tr.activity_id
    LEFT JOIN enterprise_curricula c ON c.curriculum_id = tr.curriculum_id
    LEFT JOIN enterprise_organizations o ON o.organization_id = c.organization_id
    WHERE tr.status = 'OPEN' AND tr.deleted_at IS NULL
      AND (
        COALESCE(tr.recruitment_scope, 'NATIONWIDE') = 'NATIONWIDE'
        OR (? = 1 AND tr.recruitment_scope = 'SCHOOL' AND tr.school_domain = ?)
      )
    ORDER BY tr.created_at DESC, tr.recruitment_id DESC
  `;
    const [results] = await portfolioDb.query(sql, [
      canSeeSchool ? 1 : 0,
      profile?.school_domain || null,
    ]);
    res.json(results || []);
  } catch (error) {
    console.error('팀 모집글 조회 오류:', error);
    res.status(500).json({ message: '서버 오류' });
  }
});

app.post('/api/team-recruitments', async (req, res) => {
  const ownerUserId = getRequestUserId(req);
  const activityId = Number(req.body?.activity_id);
  const postName = String(req.body?.post_name || '').trim();
  const activityType = String(req.body?.activity_type || '').trim();
  const department = String(req.body?.qualification_department || '').trim();
  const requiredMembers = Number(req.body?.required_members);
  const startDate = String(req.body?.activity_start_date || '').slice(0, 10);
  const endDate = String(req.body?.activity_end_date || '').slice(0, 10);
  const meetingType = String(req.body?.meeting_type || '대면');
  const recruitmentScope = String(req.body?.recruitment_scope || 'NATIONWIDE').toUpperCase();
  const memo = String(req.body?.memo || '').trim();

  if (!ownerUserId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }
  if (!postName || !activityType || !department) {
    return res.status(400).json({ message: '글 제목, 카테고리, 모집학과를 입력해주세요' });
  }
  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ message: '모집 중인 활동을 선택해주세요' });
  }
  if (!Number.isInteger(requiredMembers) || requiredMembers < 2 || requiredMembers > 99) {
    return res.status(400).json({ message: '모집 인원은 2명에서 99명 사이로 입력해주세요' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({ message: '활동 시작일과 종료일을 선택해주세요' });
  }
  if (startDate > endDate) {
    return res.status(400).json({ message: '종료일은 시작일 이후여야 합니다' });
  }
  if (!['대면', '비대면', '혼합'].includes(meetingType)) {
    return res.status(400).json({ message: '올바른 모임 방식을 선택해주세요' });
  }
  if (!['NATIONWIDE', 'SCHOOL'].includes(recruitmentScope)) {
    return res.status(400).json({ message: '올바른 모집 범위를 선택해주세요' });
  }

  try {
    await matchingSchemaReady;
    const ownerProfile = await getMatchingUserProfile(portfolioDb, ownerUserId);
    if (recruitmentScope === 'SCHOOL' && !canAccessRecruitment(ownerProfile, {
      recruitment_scope: 'SCHOOL',
      school_domain: ownerProfile?.school_domain,
    })) {
      return res.status(403).json({ message: '인증된 학교 계정만 본교 모집을 만들 수 있습니다' });
    }
    const [activities] = await portfolioDb.query(
      `SELECT activity_id, title, category, topic_category
       FROM activitys
       WHERE activity_id = ?
         AND (application_period_start IS NULL OR application_period_start <= NOW())
         AND (application_period_end IS NULL OR application_period_end >= CURDATE())`,
      [activityId]
    );

    if (!activities.length) {
      return res.status(400).json({ message: '현재 모집 중인 활동만 팀 활동으로 지정할 수 있습니다' });
    }

    const activity = activities[0];
    const activityPeriod = `${startDate} ~ ${endDate}`;
    const [result] = await portfolioDb.query(
      `INSERT INTO team_recruitments (
        owner_user_id,
        team_id,
        activity_id,
        post_name,
        activity_name,
        activity_type,
        qualification_department,
        qualification_student_number,
        qualification_age,
        required_members,
        activity_start_date,
        activity_end_date,
        activity_period,
        meeting_type,
        recruitment_scope,
        school_domain,
        memo,
        status
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [
        ownerUserId,
        activityId,
        postName,
        activity.title,
        activityType || activity.topic_category || activity.category || '기타',
        department,
        requiredMembers,
        startDate,
        endDate,
        activityPeriod,
        meetingType,
        recruitmentScope,
        recruitmentScope === 'SCHOOL' ? ownerProfile.school_domain : null,
        memo,
      ]
    );

    activityCache.clear();
    res.status(201).json({
      success: true,
      recruitment_id: result.insertId,
      activity_id: activityId,
    });
  } catch (error) {
    console.error('팀 모집글 등록 오류:', error);
    res.status(500).json({ message: '서버 오류' });
  }
});

app.get('/api/my-recruitments', async (req, res) => {
  const userId = getRequestUserId(req);

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  const sql = `
    SELECT
      tr.recruitment_id,
      tr.owner_user_id,
      tr.activity_id,
      tr.post_name,
      COALESCE(a.title, tr.activity_name) AS activity_name,
      tr.activity_type,
      tr.required_members,
      DATE_FORMAT(tr.activity_start_date, '%Y-%m-%d') AS activity_start_date,
      DATE_FORMAT(tr.activity_end_date, '%Y-%m-%d') AS activity_end_date,
      tr.activity_period,
      tr.meeting_type,
      tr.status,
      tr.created_at,
      (
        SELECT COUNT(*)
        FROM applications ap
        WHERE ap.recruitment_id = tr.recruitment_id
          AND ap.status IN ('PENDING', 'APPROVED')
      ) AS application_count,
      CASE
        WHEN tr.status = 'OPEN'
          AND (a.application_period_end IS NULL OR a.application_period_end >= NOW())
        THEN 1 ELSE 0
      END AS can_edit
    FROM team_recruitments tr
    LEFT JOIN activitys a ON a.activity_id = tr.activity_id
    WHERE tr.owner_user_id = ? AND tr.deleted_at IS NULL
    ORDER BY tr.created_at DESC, tr.recruitment_id DESC
  `;

  try {
    await matchingSchemaReady;
    const [results] = await portfolioDb.query(sql, [userId]);
    res.json(results || []);
  } catch (error) {
    console.error('나의 모집 조회 오류:', error);
    res.status(500).json({ message: '작성한 모집글을 불러오지 못했습니다' });
  }
});

app.put('/api/team-recruitments/:id', async (req, res) => {
  const recruitmentId = Number(req.params.id);
  const ownerUserId = getRequestUserId(req);
  const activityId = Number(req.body?.activity_id);
  const postName = String(req.body?.post_name || '').trim();
  const activityType = String(req.body?.activity_type || '').trim();
  const department = String(req.body?.qualification_department || '').trim();
  const requiredMembers = Number(req.body?.required_members);
  const startDate = String(req.body?.activity_start_date || '').slice(0, 10);
  const endDate = String(req.body?.activity_end_date || '').slice(0, 10);
  const meetingType = String(req.body?.meeting_type || '대면');
  const recruitmentScope = String(req.body?.recruitment_scope || 'NATIONWIDE').toUpperCase();
  const memo = String(req.body?.memo || '').trim();

  if (!ownerUserId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }
  if (!Number.isInteger(recruitmentId) || recruitmentId <= 0) {
    return res.status(400).json({ message: '올바른 모집글 ID가 필요합니다' });
  }
  if (!postName || !activityType || !department) {
    return res.status(400).json({ message: '글 제목, 카테고리, 모집학과를 입력해주세요' });
  }
  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ message: '모집 중인 활동을 선택해주세요' });
  }
  if (!Number.isInteger(requiredMembers) || requiredMembers < 2 || requiredMembers > 99) {
    return res.status(400).json({ message: '모집 인원은 2명에서 99명 사이로 입력해주세요' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({ message: '활동 시작일과 종료일을 선택해주세요' });
  }
  if (startDate > endDate) {
    return res.status(400).json({ message: '종료일은 시작일 이후여야 합니다' });
  }
  if (!['대면', '비대면', '혼합'].includes(meetingType)) {
    return res.status(400).json({ message: '올바른 모임 방식을 선택해주세요' });
  }
  if (!['NATIONWIDE', 'SCHOOL'].includes(recruitmentScope)) {
    return res.status(400).json({ message: '올바른 모집 범위를 선택해주세요' });
  }

  try {
    await matchingSchemaReady;
    const ownerProfile = await getMatchingUserProfile(portfolioDb, ownerUserId);
    if (recruitmentScope === 'SCHOOL' && !canAccessRecruitment(ownerProfile, {
      recruitment_scope: 'SCHOOL',
      school_domain: ownerProfile?.school_domain,
    })) {
      return res.status(403).json({ message: '인증된 학교 계정만 본교 모집을 선택할 수 있습니다' });
    }
    const [recruitments] = await portfolioDb.query(
      `SELECT
        tr.recruitment_id,
        tr.owner_user_id,
        tr.status,
        tr.deleted_at,
        a.application_period_end
       FROM team_recruitments tr
       LEFT JOIN activitys a ON a.activity_id = tr.activity_id
       WHERE tr.recruitment_id = ?`,
      [recruitmentId]
    );

    if (!recruitments.length || recruitments[0].deleted_at) {
      return res.status(404).json({ message: '모집글을 찾을 수 없습니다' });
    }
    if (Number(recruitments[0].owner_user_id) !== ownerUserId) {
      return res.status(403).json({ message: '작성자만 모집글을 수정할 수 있습니다' });
    }
    if (recruitments[0].status !== 'OPEN') {
      return res.status(409).json({ message: '모집 중인 글만 수정할 수 있습니다' });
    }
    if (recruitments[0].application_period_end && new Date(recruitments[0].application_period_end) < new Date()) {
      return res.status(409).json({ message: '접수 마감이 지난 모집글은 수정할 수 없습니다' });
    }

    const [activities] = await portfolioDb.query(
      `SELECT activity_id, title, category, topic_category
       FROM activitys
       WHERE activity_id = ?
         AND (application_period_start IS NULL OR application_period_start <= NOW())
         AND (application_period_end IS NULL OR application_period_end >= NOW())`,
      [activityId]
    );
    if (!activities.length) {
      return res.status(400).json({ message: '현재 모집 중인 활동만 팀 활동으로 지정할 수 있습니다' });
    }

    const activity = activities[0];
    const [result] = await portfolioDb.query(
      `UPDATE team_recruitments
       SET activity_id = ?,
           post_name = ?,
           activity_name = ?,
           activity_type = ?,
           qualification_department = ?,
           required_members = ?,
           activity_start_date = ?,
           activity_end_date = ?,
           activity_period = ?,
           meeting_type = ?,
           recruitment_scope = ?,
           school_domain = ?,
           memo = ?
       WHERE recruitment_id = ? AND owner_user_id = ? AND deleted_at IS NULL`,
      [
        activityId,
        postName,
        activity.title,
        activityType || activity.topic_category || activity.category || '기타',
        department,
        requiredMembers,
        startDate,
        endDate,
        `${startDate} ~ ${endDate}`,
        meetingType,
        recruitmentScope,
        recruitmentScope === 'SCHOOL' ? ownerProfile.school_domain : null,
        memo,
        recruitmentId,
        ownerUserId,
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: '모집글을 찾을 수 없습니다' });
    }
    activityCache.clear();
    res.json({ success: true, recruitment_id: recruitmentId });
  } catch (error) {
    console.error('팀 모집글 수정 오류:', error);
    res.status(500).json({ message: '서버 오류' });
  }
});

app.delete('/api/team-recruitments/:id', (req, res) => {
  const recruitmentId = Number(req.params.id);
  const ownerUserId = getRequestUserId(req);

  if (!ownerUserId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }
  if (!Number.isInteger(recruitmentId) || recruitmentId <= 0) {
    return res.status(400).json({ message: '올바른 모집글 ID가 필요합니다' });
  }

  db.query(
    `UPDATE team_recruitments
     SET deleted_at = NOW()
     WHERE recruitment_id = ? AND owner_user_id = ? AND deleted_at IS NULL`,
    [recruitmentId, ownerUserId],
    (err, result) => {
      if (err) {
        console.error('팀 모집글 삭제 오류:', err);
        return res.status(500).json({ message: '서버 오류' });
      }
      if (!result.affectedRows) {
        return res.status(404).json({ message: '삭제할 모집글을 찾을 수 없습니다' });
      }
      activityCache.clear();
      res.json({ success: true, recruitment_id: recruitmentId });
    }
  );
});

app.get('/api/team-recruitments/:id', async (req, res) => {
  const recruitmentId = Number(req.params.id);
  const userId = getRequestUserId(req);

  if (!Number.isInteger(recruitmentId) || recruitmentId <= 0) {
    return res.status(400).json({ message: '올바른 모집글 ID가 필요합니다' });
  }

  const sql = `
    SELECT
      tr.*,
      COALESCE(a.title, c.title, tr.activity_name) AS activity_name,
      COALESCE(a.category, CASE WHEN c.curriculum_id IS NOT NULL THEN '기업 커리큘럼' END) AS activity_category,
      COALESCE(a.topic_category, c.role_title) AS activity_topic_category,
      COALESCE(a.organizer, o.name) AS activity_organizer,
      DATE_FORMAT(a.application_period_end, '%Y-%m-%d') AS activity_application_period_end,
      DATE_FORMAT(tr.activity_start_date, '%Y-%m-%d') AS activity_start_date,
      DATE_FORMAT(tr.activity_end_date, '%Y-%m-%d') AS activity_end_date
    FROM team_recruitments tr
    LEFT JOIN activitys a ON a.activity_id = tr.activity_id
    LEFT JOIN enterprise_curricula c ON c.curriculum_id = tr.curriculum_id
    LEFT JOIN enterprise_organizations o ON o.organization_id = c.organization_id
    WHERE tr.recruitment_id = ? AND tr.deleted_at IS NULL
  `;

  try {
    await matchingSchemaReady;
    const [results] = await portfolioDb.query(sql, [recruitmentId]);
    if (!results.length) {
      return res.status(404).json({ message: '모집글을 찾을 수 없습니다' });
    }
    const profile = await getMatchingUserProfile(portfolioDb, userId);
    if (Number(results[0].owner_user_id) !== userId && !canAccessRecruitment(profile, results[0])) {
      return res.status(403).json({ message: '이 모집글은 같은 학교의 인증된 사용자만 볼 수 있습니다' });
    }
    res.json(results[0]);
  } catch (error) {
    console.error('팀 모집글 상세 조회 오류:', error);
    res.status(500).json({ message: '서버 오류' });
  }
});

app.get('/api/team-recruitments/:id/applications', async (req, res) => {
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });

  try {
    await matchingSchemaReady;
    const [results] = await portfolioDb.query(
      `SELECT
        ap.application_id,
        ap.recruitment_id,
        ap.applicant_id,
        ap.memo,
        ap.status,
        ap.created_at,
        offer.offer_id,
        offer.status AS offer_status
       FROM applications ap
       JOIN team_recruitments tr ON tr.recruitment_id = ap.recruitment_id
       LEFT JOIN team_join_offers offer ON offer.application_id = ap.application_id
       WHERE ap.recruitment_id = ?
         AND tr.deleted_at IS NULL
         AND (tr.owner_user_id = ? OR ap.applicant_id = ?)
       ORDER BY ap.created_at DESC, ap.application_id DESC`,
      [req.params.id, userId, userId],
    );
    res.json(results || []);
  } catch (error) {
    console.error('모집글 지원 목록 조회 오류:', error);
    res.status(500).json({ message: '지원 목록을 불러오지 못했습니다' });
  }
});

app.post('/api/applications', async (req, res) => {
  const recruitmentId = Number(req.body?.recruitment_id);
  const applicantId = getRequestUserId(req);
  const templateId = Number(req.body?.template_id) || null;
  const memo = String(req.body?.memo || '').trim().slice(0, 2000);

  if (!applicantId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }
  if (!Number.isInteger(recruitmentId) || recruitmentId <= 0) {
    return res.status(400).json({ message: '올바른 모집글 ID가 필요합니다' });
  }

  if (!memo) return res.status(400).json({ message: '지원 내용을 입력해주세요' });

  const connection = await portfolioDb.getConnection();
  try {
    await matchingSchemaReady;
    await connection.beginTransaction();
    const [[recruitment]] = await connection.query(
      `SELECT recruitment_id, owner_user_id, recruitment_scope, school_domain, status, deleted_at
       FROM team_recruitments WHERE recruitment_id = ? FOR UPDATE`,
      [recruitmentId],
    );
    if (!recruitment || recruitment.deleted_at || recruitment.status !== 'OPEN') {
      await connection.rollback();
      return res.status(409).json({ message: '현재 지원할 수 없는 모집글입니다' });
    }
    const applicantProfile = await getMatchingUserProfile(connection, applicantId);
    if (!canAccessRecruitment(applicantProfile, recruitment)) {
      await connection.rollback();
      return res.status(403).json({ message: '본교 모집에는 같은 학교의 인증된 계정만 지원할 수 있습니다' });
    }
    if (templateId) {
      const [[template]] = await connection.query(
        'SELECT template_id FROM application_templates WHERE template_id = ? AND user_id = ?',
        [templateId, applicantId],
      );
      if (!template) {
        await connection.rollback();
        return res.status(400).json({ message: '사용할 수 없는 지원서 템플릿입니다' });
      }
    }
    const [result] = await connection.query(
      `INSERT INTO applications (recruitment_id, applicant_id, template_id, memo, status)
       SELECT ?, ?, ?, ?, 'PENDING'
       WHERE EXISTS (
         SELECT 1 FROM team_recruitments
         WHERE recruitment_id = ? AND status = 'OPEN' AND deleted_at IS NULL AND owner_user_id <> ?
       )
         AND NOT EXISTS (
           SELECT 1 FROM applications
           WHERE recruitment_id = ? AND applicant_id = ? AND status IN ('PENDING', 'APPROVED')
         )`,
      [recruitmentId, applicantId, templateId, memo, recruitmentId, applicantId, recruitmentId, applicantId],
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(409).json({ message: '지원할 수 없거나 이미 지원한 모집글입니다' });
    }
    await recordApplicationEvent(connection, result.insertId, 'APPLIED', applicantId);
    await recordApplicationEvent(connection, result.insertId, 'REVIEWING', applicantId);
    await connection.commit();
    res.status(201).json({ success: true, application_id: result.insertId });
  } catch (error) {
    await connection.rollback();
    logger.error('application_create_failed', { applicantId, recruitmentId, error: error.message });
    res.status(500).json({ message: '지원서를 등록하지 못했습니다' });
  } finally {
    connection.release();
  }
});

app.post('/api/team-recruitments/:recruitmentId/applications/:applicationId/invite', async (req, res) => {
  const recruitmentId = Number(req.params.recruitmentId);
  const applicationId = Number(req.params.applicationId);
  const ownerUserId = getRequestUserId(req);

  if (!ownerUserId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!Number.isInteger(recruitmentId) || !Number.isInteger(applicationId)) {
    return res.status(400).json({ message: '모집글과 지원 정보가 올바르지 않습니다' });
  }

  const connection = await portfolioDb.getConnection();
  try {
    await matchingSchemaReady;
    await connection.beginTransaction();

    const [applications] = await connection.query(
      `SELECT
        ap.application_id,
        ap.applicant_id,
        ap.status AS application_status,
        tr.recruitment_id,
        tr.team_id,
        tr.owner_user_id,
        tr.post_name,
        tr.activity_name,
        tr.activity_end_date,
        tr.required_members,
        tr.status AS recruitment_status,
        tr.deleted_at,
        offer.offer_id,
        offer.status AS offer_status
       FROM applications ap
       JOIN team_recruitments tr ON tr.recruitment_id = ap.recruitment_id
       LEFT JOIN team_join_offers offer ON offer.application_id = ap.application_id
       WHERE ap.application_id = ? AND tr.recruitment_id = ?
       FOR UPDATE`,
      [applicationId, recruitmentId],
    );
    const application = applications[0];

    if (!application || application.deleted_at) {
      await connection.rollback();
      return res.status(404).json({ message: '지원 정보를 찾을 수 없습니다' });
    }
    if (Number(application.owner_user_id) !== ownerUserId) {
      await connection.rollback();
      return res.status(403).json({ message: '모집글 작성자만 합류 제안을 보낼 수 있습니다' });
    }
    if (application.recruitment_status !== 'OPEN') {
      await connection.rollback();
      return res.status(409).json({ message: '모집 중인 글에만 합류 제안을 보낼 수 있습니다' });
    }
    if (application.application_status !== 'PENDING') {
      await connection.rollback();
      return res.status(409).json({ message: '검토 중인 지원에만 합류 제안을 보낼 수 있습니다' });
    }
    if (application.offer_id) {
      await connection.rollback();
      return res.status(409).json({
        message: application.offer_status === 'PENDING' ? '이미 합류 제안을 보냈습니다' : '처리된 합류 제안입니다',
      });
    }

    const teamId = await ensureRecruitmentTeam(connection, application);
    const [offerResult] = await connection.query(
      `INSERT INTO team_join_offers
        (application_id, recruitment_id, team_id, inviter_id, invitee_id, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [applicationId, recruitmentId, teamId, ownerUserId, application.applicant_id],
    );
    await connection.query(
      `INSERT INTO user_notifications
        (user_id, team_id, offer_id, type, title, content)
       VALUES (?, ?, ?, 'team_invitation', '팀 합류 제안이 도착했어요', ?)`,
      [
        application.applicant_id,
        teamId,
        offerResult.insertId,
        `${application.post_name} 팀에서 함께 활동할지 선택해주세요.`,
      ],
    );

    await recordApplicationEvent(connection, applicationId, 'JOIN_OFFERED', ownerUserId);
    await connection.commit();
    res.status(201).json({ success: true, offer_id: offerResult.insertId, team_id: teamId });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    console.error('팀 합류 제안 생성 오류:', error);
    res.status(500).json({ message: '팀 합류 제안을 보내지 못했습니다' });
  } finally {
    connection.release();
  }
});

app.put('/api/applications/:id/status', async (req, res) => {
  const applicationId = Number(req.params.id);
  const ownerUserId = getRequestUserId(req);
  const status = String(req.body?.status || '');

  if (!ownerUserId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }
  if (status !== 'REJECTED') {
    return res.status(400).json({ message: '올바른 지원 상태가 필요합니다' });
  }

  const connection = await portfolioDb.getConnection();
  try {
    await matchingSchemaReady;
    await connection.beginTransaction();
    const [result] = await connection.query(
      `UPDATE applications a
       JOIN team_recruitments tr ON tr.recruitment_id = a.recruitment_id
       SET a.status = ?
       WHERE a.application_id = ? AND tr.owner_user_id = ? AND tr.deleted_at IS NULL`,
      [status, applicationId, ownerUserId],
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(403).json({ message: '모집글 작성자만 지원 상태를 변경할 수 있습니다' });
    }
    await recordApplicationEvent(connection, applicationId, status, ownerUserId);
    await connection.commit();
    res.json({ success: true, status });
  } catch (error) {
    await connection.rollback();
    logger.error('application_status_update_failed', { applicationId, ownerUserId, error: error.message });
    res.status(500).json({ message: '지원 상태를 변경하지 못했습니다' });
  } finally {
    connection.release();
  }
});

app.get('/api/my-applications', async (req, res) => {
  const userId = getRequestUserId(req);

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  const sql = `
    SELECT
      ap.application_id,
      ap.recruitment_id,
      ap.template_id,
      ap.memo,
      ap.status AS application_status,
      ap.created_at AS applied_at,
      tr.post_name,
      COALESCE(a.title, tr.activity_name) AS activity_name,
      tr.activity_type,
      tr.meeting_type,
      tr.status AS recruitment_status,
      tr.required_members,
      tr.activity_period,
      offer.offer_id,
      offer.status AS offer_status,
      offer.created_at AS offer_created_at,
      offer.responded_at AS offer_responded_at
    FROM applications ap
    JOIN team_recruitments tr ON tr.recruitment_id = ap.recruitment_id
    LEFT JOIN activitys a ON a.activity_id = tr.activity_id
    LEFT JOIN team_join_offers offer ON offer.application_id = ap.application_id
    WHERE ap.applicant_id = ? AND tr.deleted_at IS NULL
    ORDER BY ap.created_at DESC, ap.application_id DESC
  `;

  try {
    await matchingSchemaReady;
    const [results] = await portfolioDb.query(sql, [userId]);
    res.json(results || []);
  } catch (error) {
    console.error('나의 지원 조회 오류:', error);
    res.status(500).json({ message: '지원한 모집글을 불러오지 못했습니다' });
  }
});

app.get('/api/my-applications/:applicationId', async (req, res) => {
  const userId = getRequestUserId(req);
  const applicationId = Number(req.params.applicationId);
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return res.status(400).json({ message: '올바른 지원 ID가 필요합니다' });
  }

  try {
    await matchingSchemaReady;
    const [rows] = await portfolioDb.query(
      `SELECT
        ap.application_id,
        ap.recruitment_id,
        ap.template_id,
        ap.memo,
        ap.status AS application_status,
        ap.created_at AS applied_at,
        tr.post_name,
        COALESCE(a.title, tr.activity_name) AS activity_name,
        tr.activity_type,
        tr.meeting_type,
        tr.status AS recruitment_status,
        tr.required_members,
        tr.activity_period,
        tr.activity_start_date,
        tr.activity_end_date,
        offer.offer_id,
        offer.status AS offer_status,
        offer.created_at AS offer_created_at,
        offer.responded_at AS offer_responded_at
       FROM applications ap
       JOIN team_recruitments tr ON tr.recruitment_id = ap.recruitment_id
       LEFT JOIN activitys a ON a.activity_id = tr.activity_id
       LEFT JOIN team_join_offers offer ON offer.application_id = ap.application_id
       WHERE ap.application_id = ? AND ap.applicant_id = ? AND tr.deleted_at IS NULL`,
      [applicationId, userId],
    );
    if (!rows.length) return res.status(404).json({ message: '지원 내역을 찾을 수 없습니다' });
    const application = rows[0];
    const events = await getApplicationTimeline(portfolioDb, applicationId);
    res.json({ ...application, timeline: buildApplicationTimeline(application, events) });
  } catch (error) {
    logger.error('application_detail_failed', { applicationId, userId, error: error.message });
    res.status(500).json({ message: '지원 현황을 불러오지 못했습니다' });
  }
});

app.put('/api/applications/:id/cancel', async (req, res) => {
  const applicationId = Number(req.params.id);
  const applicantId = getRequestUserId(req);

  if (!applicantId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return res.status(400).json({ message: '올바른 지원 ID가 필요합니다' });
  }

  const connection = await portfolioDb.getConnection();
  try {
    await matchingSchemaReady;
    await connection.beginTransaction();
    const [result] = await connection.query(
      `UPDATE applications ap
       JOIN team_recruitments tr ON tr.recruitment_id = ap.recruitment_id
       SET ap.status = 'CANCELED'
       WHERE ap.application_id = ?
         AND ap.applicant_id = ?
         AND ap.status IN ('PENDING', 'APPROVED')
         AND tr.deleted_at IS NULL`,
      [applicationId, applicantId],
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(409).json({ message: '취소할 수 있는 지원 내역이 없습니다' });
    }
    await connection.query(
      `UPDATE team_join_offers offer
       JOIN applications ap ON ap.application_id = offer.application_id
       SET offer.status = 'CANCELED', offer.responded_at = NOW()
       WHERE ap.application_id = ?
         AND ap.applicant_id = ?
         AND offer.status = 'PENDING'`,
      [applicationId, applicantId],
    );
    await recordApplicationEvent(connection, applicationId, 'CANCELED', applicantId);
    await connection.commit();
    res.json({ success: true, status: 'CANCELED' });
  } catch (error) {
    await connection.rollback();
    logger.error('application_cancel_failed', { applicationId, applicantId, error: error.message });
    res.status(500).json({ message: '지원을 취소하지 못했습니다' });
  } finally {
    connection.release();
  }
});

app.put('/api/team-join-offers/:id/respond', async (req, res) => {
  const offerId = Number(req.params.id);
  const userId = getRequestUserId(req);
  const decision = String(req.body?.decision || '').toUpperCase();

  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!Number.isInteger(offerId) || offerId <= 0) {
    return res.status(400).json({ message: '합류 제안 정보가 올바르지 않습니다' });
  }
  if (!['ACCEPTED', 'REJECTED'].includes(decision)) {
    return res.status(400).json({ message: '수락 또는 거절을 선택해주세요' });
  }

  const connection = await portfolioDb.getConnection();
  try {
    await matchingSchemaReady;
    await connection.beginTransaction();

    const [offers] = await connection.query(
      `SELECT
        offer.offer_id,
        offer.application_id,
        offer.recruitment_id,
        offer.team_id,
        offer.invitee_id,
        offer.status AS offer_status,
        ap.status AS application_status,
        tr.status AS recruitment_status,
        tr.deleted_at
       FROM team_join_offers offer
       JOIN applications ap ON ap.application_id = offer.application_id
       JOIN team_recruitments tr ON tr.recruitment_id = offer.recruitment_id
       WHERE offer.offer_id = ?
       FOR UPDATE`,
      [offerId],
    );
    const offer = offers[0];

    if (!offer || offer.deleted_at) {
      await connection.rollback();
      return res.status(404).json({ message: '합류 제안을 찾을 수 없습니다' });
    }
    if (Number(offer.invitee_id) !== userId) {
      await connection.rollback();
      return res.status(403).json({ message: '본인에게 온 합류 제안만 처리할 수 있습니다' });
    }
    if (offer.offer_status !== 'PENDING' || offer.application_status !== 'PENDING') {
      await connection.rollback();
      return res.status(409).json({ message: '이미 처리된 합류 제안입니다' });
    }
    if (offer.recruitment_status !== 'OPEN') {
      await connection.rollback();
      return res.status(409).json({ message: '마감된 모집글에는 합류할 수 없습니다' });
    }

    if (decision === 'ACCEPTED') {
      await connection.query(
        `INSERT INTO team_members (team_id, user_id, role, part)
         VALUES (?, ?, 'MEMBER', NULL)
         ON DUPLICATE KEY UPDATE role = role`,
        [offer.team_id, userId],
      );
      await provisionCurriculumGoalsForMember(connection, offer.team_id, userId);
    }

    await connection.query(
      `UPDATE team_join_offers
       SET status = ?, responded_at = NOW()
       WHERE offer_id = ?`,
      [decision, offerId],
    );
    await connection.query(
      'UPDATE applications SET status = ? WHERE application_id = ?',
      [decision === 'ACCEPTED' ? 'APPROVED' : 'REJECTED', offer.application_id],
    );
    await connection.query(
      'UPDATE user_notifications SET is_read = 1 WHERE offer_id = ?',
      [offerId],
    );

    await recordApplicationEvent(connection, offer.application_id, decision, userId);
    await connection.commit();
    res.json({ success: true, status: decision, team_id: offer.team_id });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    console.error('팀 합류 제안 처리 오류:', error);
    res.status(500).json({ message: '팀 합류 제안을 처리하지 못했습니다' });
  } finally {
    connection.release();
  }
});

app.get('/api/applications', (req, res) => {
  if (!db || db.state === 'disconnected') {
    return res.json([]);
  }

  const sql = `
    SELECT application_id, recruitment_id, applicant_id, memo, status, created_at
    FROM applications
    ORDER BY created_at DESC, application_id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('지원 목록 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    res.json(results || []);
  });
});

app.get('/my-teams', (req, res) => {
  const userId = getRequestUserId(req);

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  const sql = `
    SELECT t.team_id, t.team_name, tm.part, t.leader_user_id, t.due_date, t.activity_status,
           t.source_type, t.source_id, t.source_version_id, t.participation_mode, t.visibility,
           CASE
             WHEN t.source_type = 'ENTERPRISE_CURRICULUM' THEN '기업 커리큘럼'
             ELSE COALESCE(a.category, tr.activity_type, '팀 활동')
           END AS activity_category,
           COALESCE(a.topic_category, c.role_title) AS topic_category,
           COALESCE(a.main_image_url, c.cover_image_url) AS activity_image_url,
           COALESCE(a.source_name, o.name) AS source_name
    FROM team_members tm
    JOIN teams t ON t.team_id = tm.team_id
    LEFT JOIN team_recruitments tr ON tr.recruitment_id = t.recruitment_id
    LEFT JOIN activitys a ON t.source_type <> 'ENTERPRISE_CURRICULUM'
      AND a.activity_id = COALESCE(t.source_id, tr.activity_id)
    LEFT JOIN enterprise_curricula c ON c.curriculum_id = CASE WHEN t.source_type = 'ENTERPRISE_CURRICULUM' THEN t.source_id ELSE NULL END
    LEFT JOIN enterprise_organizations o ON o.organization_id = c.organization_id
    WHERE tm.user_id = ?
      AND t.activity_status = 'IN_PROGRESS'
      AND t.status <> 'ARCHIVED'
    ORDER BY t.created_at DESC, t.team_id DESC
  `;

  runArchiveMaintenance()
    .catch((error) => console.error('내 팀 조회 전 아카이브 오류:', error))
    .finally(() => {
      db.query(sql, [userId], (err, results) => {
        if (err) {
          console.error('내 팀 조회 오류:', err);
          return res.status(500).json({ message: '서버 오류' });
        }

        res.json(results || []);
      });
    });
});

app.get('/users/:userId/teams', (req, res) => {
  const { userId } = req.params;

  const sql = `
    SELECT
      t.team_id AS teamId,
      t.team_name AS teamName,
      tm.part,
      t.leader_user_id AS leaderUserId,
      t.due_date AS dueDate,
      t.activity_status AS activityStatus,
      t.source_type AS sourceType,
      t.source_id AS sourceId,
      t.source_version_id AS sourceVersionId,
      t.participation_mode AS participationMode,
      t.visibility,
      (t.leader_user_id = ?) AS isLeader
    FROM team_members tm
    JOIN teams t ON t.team_id = tm.team_id
    WHERE tm.user_id = ?
      AND t.activity_status = 'IN_PROGRESS'
      AND t.status <> 'ARCHIVED'
    ORDER BY t.created_at DESC, t.team_id DESC
  `;

  runArchiveMaintenance()
    .catch((error) => console.error('활동 탭 조회 전 아카이브 오류:', error))
    .finally(() => {
      db.query(sql, [userId, userId], (err, results) => {
        if (err) {
          console.error('활동 탭 팀 조회 오류:', err);
          return res.status(500).json({ message: '서버 오류' });
        }

        res.json(results || []);
      });
    });
});

app.post('/teams/:teamId/complete', async (req, res) => {
  const userId = getRequestUserId(req);
  const teamId = Number(req.params.teamId);

  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!teamId) return res.status(400).json({ message: '팀 정보가 올바르지 않습니다' });

  try {
    const [teams] = await portfolioDb.query(
      'SELECT leader_user_id, activity_status FROM teams WHERE team_id = ?',
      [teamId],
    );
    if (!teams.length) return res.status(404).json({ message: '팀을 찾을 수 없습니다' });
    if (Number(teams[0].leader_user_id) !== userId) {
      return res.status(403).json({ message: '팀장만 활동을 마무리할 수 있습니다' });
    }

    const result = await runTeamArchive(teamId, 'LEADER_COMPLETED');
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('활동 마무리 오류:', error);
    res.status(error.statusCode || 500).json({ message: error.message || '서버 오류' });
  }
});

app.get('/users/:userId/past-activities', async (req, res) => {
  const userId = Number(req.params.userId);
  const requestUserId = getRequestUserId(req);
  if (!userId) return res.status(400).json({ message: '사용자 정보가 올바르지 않습니다' });
  if (requestUserId !== userId) return res.status(403).json({ message: '본인의 지난 활동만 볼 수 있습니다' });

  try {
    await runArchiveMaintenance();
    const portfolios = await listPastActivities(portfolioDb, userId);
    res.json(portfolios);
  } catch (error) {
    console.error('지난 활동 목록 조회 오류:', error);
    res.status(500).json({ message: '지난 활동을 불러오지 못했습니다' });
  }
});

app.get('/users/:userId/awards', async (req, res) => {
  const userId = Number(req.params.userId);
  const requestUserId = getRequestUserId(req);
  if (!userId) return res.status(400).json({ message: '사용자 정보가 올바르지 않습니다' });
  if (requestUserId !== userId) return res.status(403).json({ message: '본인의 수상내역만 볼 수 있습니다' });

  try {
    await awardSchemaReady;
    await runArchiveMaintenance();
    res.json(await listAwards(portfolioDb, userId));
  } catch (error) {
    console.error('수상내역 조회 오류:', error);
    res.status(500).json({ message: '수상내역을 불러오지 못했습니다' });
  }
});

app.put('/users/:userId/awards/:portfolioId', async (req, res) => {
  const userId = Number(req.params.userId);
  const portfolioId = Number(req.params.portfolioId);
  const requestUserId = getRequestUserId(req);
  if (!userId || !portfolioId) return res.status(400).json({ message: '요청 정보가 올바르지 않습니다' });
  if (requestUserId !== userId) return res.status(403).json({ message: '본인의 수상내역만 수정할 수 있습니다' });

  try {
    await awardSchemaReady;
    const result = await upsertAward(portfolioDb, userId, portfolioId, req.body);
    if (!result) return res.status(404).json({ message: '참여 활동을 찾을 수 없습니다' });
    res.json(result);
  } catch (error) {
    console.error('수상내역 저장 오류:', error);
    res.status(500).json({ message: '수상내역을 저장하지 못했습니다' });
  }
});

app.get('/users/:userId/past-activities/:portfolioId', async (req, res) => {
  const userId = Number(req.params.userId);
  const portfolioId = Number(req.params.portfolioId);
  const requestUserId = getRequestUserId(req);
  if (!userId || !portfolioId) return res.status(400).json({ message: '요청 정보가 올바르지 않습니다' });
  if (requestUserId !== userId) return res.status(403).json({ message: '본인의 미니포트폴리오만 볼 수 있습니다' });

  try {
    const portfolio = await getMiniPortfolio(portfolioDb, userId, portfolioId);
    if (!portfolio) return res.status(404).json({ message: '미니포트폴리오를 찾을 수 없습니다' });
    res.json(portfolio);
  } catch (error) {
    console.error('미니포트폴리오 조회 오류:', error);
    res.status(500).json({ message: '미니포트폴리오를 불러오지 못했습니다' });
  }
});

app.put('/users/:userId/past-activities/:portfolioId', async (req, res) => {
  const userId = Number(req.params.userId);
  const portfolioId = Number(req.params.portfolioId);
  const requestUserId = getRequestUserId(req);
  if (!userId || !portfolioId) return res.status(400).json({ message: '요청 정보가 올바르지 않습니다' });
  if (requestUserId !== userId) return res.status(403).json({ message: '본인의 미니포트폴리오만 편집할 수 있습니다' });

  try {
    const portfolio = await updateMiniPortfolio(portfolioDb, userId, portfolioId, req.body);
    if (!portfolio) return res.status(404).json({ message: '미니포트폴리오를 찾을 수 없습니다' });
    res.json(portfolio);
  } catch (error) {
    console.error('미니포트폴리오 편집 오류:', error);
    res.status(500).json({ message: '미니포트폴리오를 저장하지 못했습니다' });
  }
});

app.get('/users/:userId/past-activities/:portfolioId/pdf', async (req, res) => {
  const userId = Number(req.params.userId);
  const portfolioId = Number(req.params.portfolioId);
  const requestUserId = getRequestUserId(req);
  if (!userId || !portfolioId) return res.status(400).json({ message: '요청 정보가 올바르지 않습니다' });
  if (requestUserId !== userId) return res.status(403).json({ message: '본인의 미니포트폴리오만 받을 수 있습니다' });

  try {
    const portfolio = await getMiniPortfolio(portfolioDb, userId, portfolioId);
    if (!portfolio) return res.status(404).json({ message: '미니포트폴리오를 찾을 수 없습니다' });
    portfolio.activity_image_paths = (portfolio.image_urls || []).flatMap((imageUrl) => {
      const uploadMatch = String(imageUrl).match(/\/uploads\/([^/?#]+)/);
      if (!uploadMatch) return [];
      const fileName = decodeURIComponent(uploadMatch[1]);
      if (path.basename(fileName) !== fileName || !/\.(?:jpe?g|png|webp)$/i.test(fileName)) return [];
      const filePath = path.join(UPLOADS_DIR, fileName);
      return fs.existsSync(filePath) ? [filePath] : [];
    });

    const fileName = `mini-portfolio-${portfolioId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    createMiniPortfolioPdf(portfolio).pipe(res);
  } catch (error) {
    console.error('미니포트폴리오 PDF 생성 오류:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'PDF를 생성하지 못했습니다' });
    } else {
      res.end();
    }
  }
});

app.get('/teams/:teamId/members', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId } = req.params;

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  const sql = `
    SELECT
      u.id AS user_id,
      u.name,
      u.department,
      u.profile_picture,
      tm.part,
      tm.role
    FROM team_members requester
    JOIN team_members tm ON tm.team_id = requester.team_id
    JOIN users u ON u.id = tm.user_id
    WHERE requester.team_id = ?
      AND requester.user_id = ?
    ORDER BY tm.user_id ASC
  `;

  db.query(sql, [teamId, userId], (err, results) => {
    if (err) {
      console.error('팀원 목록 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    res.json((results || []).map((member) => ({
      ...member,
      profile_picture: normalizeLocalUrl(member.profile_picture),
    })));
  });
});

const requireTeamMember = (teamId, userId, callback) => {
  db.query(
    'SELECT COUNT(*) AS count FROM team_members WHERE team_id = ? AND user_id = ?',
    [teamId, userId],
    (err, rows) => {
      if (err) return callback(err, false);
      callback(null, Number(rows?.[0]?.count || 0) > 0);
    }
  );
};

const createNoticeNotifications = ({ teamId, noticeId, actorId, type, title, content }) => {
  const recipientSql = `
    SELECT user_id
    FROM team_members
    WHERE team_id = ?
      AND user_id <> ?
  `;

  db.query(recipientSql, [teamId, actorId], (memberErr, members) => {
    if (memberErr || !members?.length) {
      if (memberErr) console.error('공지 알림 대상 조회 오류:', memberErr);
      return;
    }

    const rows = members.map((member) => [member.user_id, teamId, noticeId, type, title, content]);
    db.query(
      'INSERT INTO user_notifications (user_id, team_id, notice_id, type, title, content) VALUES ?',
      [rows],
      (insertErr) => insertErr && console.error('공지 알림 생성 오류:', insertErr)
    );
  });
};

app.get('/teams/:teamId/notices', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId } = req.params;
  const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 100);

  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });

  requireTeamMember(teamId, userId, (memberErr, isMember) => {
    if (memberErr) return res.status(500).json({ message: '서버 오류' });
    if (!isMember) return res.status(403).json({ message: '팀원만 공지사항을 볼 수 있습니다' });

    const sql = `
      SELECT n.notice_id, n.team_id, n.author_id, n.title, n.content, n.created_at, n.updated_at,
        COALESCE(u.name, '알 수 없음') AS author_name,
        COUNT(c.comment_id) AS comment_count
      FROM team_notices n
      LEFT JOIN users u ON u.id = n.author_id
      LEFT JOIN notice_comments c ON c.notice_id = n.notice_id
      WHERE n.team_id = ?
      GROUP BY n.notice_id
      ORDER BY n.created_at DESC, n.notice_id DESC
      LIMIT ?
    `;
    db.query(sql, [teamId, limit], (err, rows) => {
      if (err) {
        console.error('공지사항 조회 오류:', err);
        return res.status(500).json({ message: '서버 오류' });
      }
      res.json(rows || []);
    });
  });
});

app.get('/teams/:teamId/notices/:noticeId', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId, noticeId } = req.params;
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });

  requireTeamMember(teamId, userId, (memberErr, isMember) => {
    if (memberErr) return res.status(500).json({ message: '서버 오류' });
    if (!isMember) return res.status(403).json({ message: '팀원만 공지사항을 볼 수 있습니다' });

    const noticeSql = `
      SELECT n.notice_id, n.team_id, n.author_id, n.title, n.content, n.created_at, n.updated_at,
        COALESCE(u.name, '알 수 없음') AS author_name
      FROM team_notices n
      LEFT JOIN users u ON u.id = n.author_id
      WHERE n.notice_id = ? AND n.team_id = ?
    `;
    db.query(noticeSql, [noticeId, teamId], (noticeErr, noticeRows) => {
      if (noticeErr) return res.status(500).json({ message: '서버 오류' });
      const notice = noticeRows?.[0];
      if (!notice) return res.status(404).json({ message: '공지사항을 찾을 수 없습니다' });

      const commentsSql = `
        SELECT c.comment_id, c.notice_id, c.author_id, c.content, c.created_at,
          COALESCE(u.name, '알 수 없음') AS author_name
        FROM notice_comments c
        LEFT JOIN users u ON u.id = c.author_id
        WHERE c.notice_id = ?
        ORDER BY c.created_at ASC, c.comment_id ASC
      `;
      db.query(commentsSql, [noticeId], (commentsErr, comments) => {
        if (commentsErr) return res.status(500).json({ message: '서버 오류' });
        res.json({ ...notice, comments: comments || [] });
      });
    });
  });
});

app.post('/teams/:teamId/notices', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId } = req.params;
  const title = String(req.body.title || '').trim();
  const content = String(req.body.content || '').trim();
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!title || !content) return res.status(400).json({ message: '제목과 내용을 입력해주세요' });

  requireTeamMember(teamId, userId, (memberErr, isMember) => {
    if (memberErr) return res.status(500).json({ message: '서버 오류' });
    if (!isMember) return res.status(403).json({ message: '팀원만 공지사항을 작성할 수 있습니다' });
    db.query(
      'INSERT INTO team_notices (team_id, author_id, title, content) VALUES (?, ?, ?, ?)',
      [teamId, userId, title, content],
      (err, result) => {
        if (err) return res.status(500).json({ message: '서버 오류' });
        createNoticeNotifications({ teamId, noticeId: result.insertId, actorId: userId, type: 'notice', title: '새 공지사항', content: title });
        res.status(201).json({ notice_id: result.insertId });
      }
    );
  });
});

app.put('/teams/:teamId/notices/:noticeId', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId, noticeId } = req.params;
  const title = String(req.body.title || '').trim();
  const content = String(req.body.content || '').trim();
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!title || !content) return res.status(400).json({ message: '제목과 내용을 입력해주세요' });

  db.query(
    'UPDATE team_notices SET title = ?, content = ? WHERE notice_id = ? AND team_id = ? AND author_id = ?',
    [title, content, noticeId, teamId, userId],
    (err, result) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      if (!result.affectedRows) return res.status(403).json({ message: '작성자만 공지사항을 수정할 수 있습니다' });
      res.json({ success: true });
    }
  );
});

app.delete('/teams/:teamId/notices/:noticeId', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId, noticeId } = req.params;
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });

  db.query(
    `DELETE n FROM team_notices n
     JOIN teams t ON t.team_id = n.team_id
     WHERE n.notice_id = ? AND n.team_id = ?
       AND (n.author_id = ? OR t.leader_user_id = ?)`,
    [noticeId, teamId, userId, userId],
    (err, result) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      if (!result.affectedRows) return res.status(403).json({ message: '작성자 또는 팀장만 삭제할 수 있습니다' });
      res.json({ success: true });
    },
  );
});

app.post('/teams/:teamId/notices/:noticeId/comments', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId, noticeId } = req.params;
  const content = String(req.body.content || '').trim();
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!content) return res.status(400).json({ message: '댓글을 입력해주세요' });

  requireTeamMember(teamId, userId, (memberErr, isMember) => {
    if (memberErr) return res.status(500).json({ message: '서버 오류' });
    if (!isMember) return res.status(403).json({ message: '팀원만 댓글을 작성할 수 있습니다' });
    db.query('SELECT title FROM team_notices WHERE notice_id = ? AND team_id = ?', [noticeId, teamId], (noticeErr, rows) => {
      if (noticeErr) return res.status(500).json({ message: '서버 오류' });
      if (!rows?.[0]) return res.status(404).json({ message: '공지사항을 찾을 수 없습니다' });
      db.query('INSERT INTO notice_comments (notice_id, author_id, content) VALUES (?, ?, ?)', [noticeId, userId, content], (err, result) => {
        if (err) return res.status(500).json({ message: '서버 오류' });
        createNoticeNotifications({ teamId, noticeId, actorId: userId, type: 'notice_comment', title: '공지사항에 새 댓글', content: rows[0].title });
        res.status(201).json({ comment_id: result.insertId });
      });
    });
  });
});

app.get('/notifications/unread-count', async (req, res) => {
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });

  try {
    const [rows] = await portfolioDb.query(
      'SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ? AND is_read = 0',
      [userId],
    );
    res.json({ count: Number(rows?.[0]?.count || 0) });
  } catch (error) {
    console.error('읽지 않은 알림 수 조회 오류:', error);
    res.status(500).json({ message: '읽지 않은 알림 수를 불러오지 못했습니다' });
  }
});

app.put('/notifications/read', async (req, res) => {
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });

  try {
    await portfolioDb.query(
      'UPDATE user_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [userId],
    );
    res.json({ success: true });
  } catch (error) {
    console.error('알림 읽음 처리 오류:', error);
    res.status(500).json({ message: '알림을 읽음 처리하지 못했습니다' });
  }
});

app.get('/notifications', async (req, res) => {
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  try {
    await matchingSchemaReady;
    const [rows] = await portfolioDb.query(
      `SELECT
        notification.notification_id,
        notification.team_id,
        notification.notice_id,
        notification.offer_id,
        notification.type,
        notification.title,
        notification.content,
        notification.is_read,
        notification.created_at,
        offer.status AS offer_status,
        offer.recruitment_id
       FROM user_notifications notification
       LEFT JOIN team_join_offers offer ON offer.offer_id = notification.offer_id
       WHERE notification.user_id = ?
       ORDER BY notification.created_at DESC, notification.notification_id DESC
       LIMIT 100`,
      [userId],
    );
    res.json(rows || []);
  } catch (error) {
    console.error('알림 조회 오류:', error);
    res.status(500).json({ message: '알림을 불러오지 못했습니다' });
  }
});

app.get('/api/friends', async (req, res) => {
  const userId = getRequestUserId(req);
  try {
    await messagingSchemaReady;
    const [rows] = await portfolioDb.query(
      `SELECT
        friendship.friendship_id,
        friendship.requester_id,
        friendship.status,
        user.id AS user_id,
        user.name,
        user.department,
        user.email,
        user.profile_picture
       FROM user_friendships friendship
       JOIN users user
         ON user.id = CASE
           WHEN friendship.user_low_id = ? THEN friendship.user_high_id
           ELSE friendship.user_low_id
         END
       WHERE (friendship.user_low_id = ? OR friendship.user_high_id = ?)
         AND friendship.status IN ('PENDING', 'ACCEPTED')
       ORDER BY friendship.status = 'PENDING' DESC, friendship.updated_at DESC`,
      [userId, userId, userId],
    );
    const normalized = rows.map((row) => ({
      ...row,
      profile_picture: normalizeLocalUrl(row.profile_picture),
    }));
    res.json({
      friends: normalized.filter((row) => row.status === 'ACCEPTED'),
      incoming: normalized.filter((row) => row.status === 'PENDING' && Number(row.requester_id) !== userId),
      outgoing: normalized.filter((row) => row.status === 'PENDING' && Number(row.requester_id) === userId),
    });
  } catch (error) {
    logger.error('friend_list_failed', { userId, error: error.message });
    res.status(500).json({ message: '친구 목록을 불러오지 못했습니다' });
  }
});

app.get('/api/friends/search', async (req, res) => {
  const userId = getRequestUserId(req);
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json([]);
  try {
    await messagingSchemaReady;
    const searchTerm = `%${query.slice(0, 80)}%`;
    const [rows] = await portfolioDb.query(
      `SELECT
        user.id AS user_id,
        user.name,
        user.department,
        user.email,
        user.profile_picture,
        friendship.friendship_id,
        friendship.requester_id,
        friendship.status
       FROM users user
       LEFT JOIN user_friendships friendship
         ON friendship.user_low_id = LEAST(user.id, ?)
        AND friendship.user_high_id = GREATEST(user.id, ?)
       WHERE user.id <> ?
         AND (user.name LIKE ? OR user.email LIKE ? OR COALESCE(user.department, '') LIKE ?)
       ORDER BY user.name ASC
       LIMIT 20`,
      [userId, userId, userId, searchTerm, searchTerm, searchTerm],
    );
    res.json(rows.map((row) => ({
      ...row,
      profile_picture: normalizeLocalUrl(row.profile_picture),
      relationship: row.status === 'ACCEPTED'
        ? 'FRIEND'
        : row.status === 'PENDING'
          ? Number(row.requester_id) === userId ? 'OUTGOING' : 'INCOMING'
          : 'NONE',
    })));
  } catch (error) {
    logger.error('friend_search_failed', { userId, error: error.message });
    res.status(500).json({ message: '사용자를 검색하지 못했습니다' });
  }
});

app.post('/api/friends/requests', async (req, res) => {
  const requesterId = getRequestUserId(req);
  const recipientId = Number(req.body.recipient_id);
  if (!recipientId || recipientId === requesterId) {
    return res.status(400).json({ message: '친구 요청 대상이 올바르지 않습니다' });
  }
  const [userLowId, userHighId] = normalizeFriendshipPair(requesterId, recipientId);
  try {
    await messagingSchemaReady;
    const [users] = await portfolioDb.query('SELECT id FROM users WHERE id = ? LIMIT 1', [recipientId]);
    if (!users.length) return res.status(404).json({ message: '사용자를 찾을 수 없습니다' });
    const [existingRows] = await portfolioDb.query(
      'SELECT friendship_id, requester_id, status FROM user_friendships WHERE user_low_id = ? AND user_high_id = ? LIMIT 1',
      [userLowId, userHighId],
    );
    const existing = existingRows[0];
    if (existing?.status === 'ACCEPTED') return res.status(409).json({ message: '이미 친구입니다' });
    if (existing?.status === 'PENDING') {
      const message = Number(existing.requester_id) === requesterId
        ? '이미 친구 요청을 보냈습니다'
        : '상대방이 보낸 친구 요청을 먼저 확인해주세요';
      return res.status(409).json({ message });
    }
    if (existing) {
      await portfolioDb.query(
        `UPDATE user_friendships
         SET requester_id = ?, status = 'PENDING', updated_at = CURRENT_TIMESTAMP
         WHERE friendship_id = ?`,
        [requesterId, existing.friendship_id],
      );
      return res.status(201).json({ friendship_id: existing.friendship_id });
    }
    const [result] = await portfolioDb.query(
      `INSERT INTO user_friendships (user_low_id, user_high_id, requester_id, status)
       VALUES (?, ?, ?, 'PENDING')`,
      [userLowId, userHighId, requesterId],
    );
    res.status(201).json({ friendship_id: result.insertId });
  } catch (error) {
    logger.error('friend_request_failed', { requesterId, recipientId, error: error.message });
    res.status(500).json({ message: '친구 요청을 보내지 못했습니다' });
  }
});

app.put('/api/friends/requests/:friendshipId', async (req, res) => {
  const userId = getRequestUserId(req);
  const friendshipId = Number(req.params.friendshipId);
  const status = String(req.body.status || '').toUpperCase();
  if (!friendshipId || !['ACCEPTED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ message: '친구 요청 처리 정보가 올바르지 않습니다' });
  }
  try {
    await messagingSchemaReady;
    const [result] = await portfolioDb.query(
      `UPDATE user_friendships
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE friendship_id = ?
         AND status = 'PENDING'
         AND requester_id <> ?
         AND (user_low_id = ? OR user_high_id = ?)`,
      [status, friendshipId, userId, userId, userId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: '처리할 친구 요청을 찾을 수 없습니다' });
    res.json({ success: true, status });
  } catch (error) {
    logger.error('friend_request_update_failed', { userId, friendshipId, error: error.message });
    res.status(500).json({ message: '친구 요청을 처리하지 못했습니다' });
  }
});

app.delete('/api/friends/:friendId', async (req, res) => {
  const userId = getRequestUserId(req);
  const friendId = Number(req.params.friendId);
  if (!friendId || friendId === userId) return res.status(400).json({ message: '친구 정보가 올바르지 않습니다' });
  const [userLowId, userHighId] = normalizeFriendshipPair(userId, friendId);
  try {
    await messagingSchemaReady;
    const [result] = await portfolioDb.query(
      'DELETE FROM user_friendships WHERE user_low_id = ? AND user_high_id = ?',
      [userLowId, userHighId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: '친구 관계를 찾을 수 없습니다' });
    res.json({ success: true });
  } catch (error) {
    logger.error('friend_delete_failed', { userId, friendId, error: error.message });
    res.status(500).json({ message: '친구 관계를 삭제하지 못했습니다' });
  }
});

app.get('/api/messages/unread-count', async (req, res) => {
  const userId = getRequestUserId(req);
  try {
    await messagingSchemaReady;
    const [rows] = await portfolioDb.query(
      'SELECT COUNT(*) AS count FROM direct_messages WHERE recipient_id = ? AND read_at IS NULL',
      [userId],
    );
    res.json({ count: Number(rows[0]?.count || 0) });
  } catch (error) {
    logger.error('message_unread_count_failed', { userId, error: error.message });
    res.status(500).json({ message: '읽지 않은 쪽지 수를 불러오지 못했습니다' });
  }
});

app.get('/api/messages/conversations', async (req, res) => {
  const userId = getRequestUserId(req);
  try {
    await messagingSchemaReady;
    const [rows] = await portfolioDb.query(
      `SELECT
        user.id AS friend_id,
        user.name,
        user.department,
        user.profile_picture,
        (SELECT message.content
         FROM direct_messages message
         WHERE (message.sender_id = ? AND message.recipient_id = user.id)
            OR (message.sender_id = user.id AND message.recipient_id = ?)
         ORDER BY message.created_at DESC, message.message_id DESC
         LIMIT 1) AS last_message,
        (SELECT message.created_at
         FROM direct_messages message
         WHERE (message.sender_id = ? AND message.recipient_id = user.id)
            OR (message.sender_id = user.id AND message.recipient_id = ?)
         ORDER BY message.created_at DESC, message.message_id DESC
         LIMIT 1) AS last_message_at,
        (SELECT COUNT(*)
         FROM direct_messages message
         WHERE message.sender_id = user.id
           AND message.recipient_id = ?
           AND message.read_at IS NULL) AS unread_count
       FROM user_friendships friendship
       JOIN users user
         ON user.id = CASE
           WHEN friendship.user_low_id = ? THEN friendship.user_high_id
           ELSE friendship.user_low_id
         END
       WHERE friendship.status = 'ACCEPTED'
         AND (friendship.user_low_id = ? OR friendship.user_high_id = ?)
       ORDER BY last_message_at IS NULL, last_message_at DESC, user.name ASC`,
      [userId, userId, userId, userId, userId, userId, userId, userId],
    );
    res.json(rows.map((row) => ({
      ...row,
      unread_count: Number(row.unread_count || 0),
      profile_picture: normalizeLocalUrl(row.profile_picture),
    })));
  } catch (error) {
    logger.error('message_conversation_list_failed', { userId, error: error.message });
    res.status(500).json({ message: '쪽지함을 불러오지 못했습니다' });
  }
});

app.get('/api/messages/:friendId', async (req, res) => {
  const userId = getRequestUserId(req);
  const friendId = Number(req.params.friendId);
  if (!friendId || friendId === userId) return res.status(400).json({ message: '대화 상대가 올바르지 않습니다' });
  try {
    await messagingSchemaReady;
    if (!await areFriends(portfolioDb, userId, friendId)) {
      return res.status(403).json({ message: '친구와만 쪽지를 주고받을 수 있습니다' });
    }
    const [friendRows] = await portfolioDb.query(
      'SELECT id AS user_id, name, department, profile_picture FROM users WHERE id = ? LIMIT 1',
      [friendId],
    );
    const [messages] = await portfolioDb.query(
      `SELECT message_id, sender_id, recipient_id, content, read_at, created_at
       FROM direct_messages
       WHERE (sender_id = ? AND recipient_id = ?)
          OR (sender_id = ? AND recipient_id = ?)
       ORDER BY created_at ASC, message_id ASC
       LIMIT 300`,
      [userId, friendId, friendId, userId],
    );
    await portfolioDb.query(
      `UPDATE direct_messages SET read_at = CURRENT_TIMESTAMP
       WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL`,
      [friendId, userId],
    );
    const friend = friendRows[0];
    res.json({
      friend: friend ? { ...friend, profile_picture: normalizeLocalUrl(friend.profile_picture) } : null,
      messages,
    });
  } catch (error) {
    logger.error('message_list_failed', { userId, friendId, error: error.message });
    res.status(500).json({ message: '대화를 불러오지 못했습니다' });
  }
});

app.post('/api/messages/:friendId', async (req, res) => {
  const senderId = getRequestUserId(req);
  const recipientId = Number(req.params.friendId);
  const content = String(req.body.content || '').trim();
  if (!recipientId || recipientId === senderId) return res.status(400).json({ message: '대화 상대가 올바르지 않습니다' });
  if (!content || content.length > 2000) return res.status(400).json({ message: '쪽지는 1자 이상 2,000자 이하로 입력해주세요' });
  try {
    await messagingSchemaReady;
    if (!await areFriends(portfolioDb, senderId, recipientId)) {
      return res.status(403).json({ message: '친구와만 쪽지를 주고받을 수 있습니다' });
    }
    const [result] = await portfolioDb.query(
      'INSERT INTO direct_messages (sender_id, recipient_id, content) VALUES (?, ?, ?)',
      [senderId, recipientId, content],
    );
    res.status(201).json({ message_id: Number(result.insertId) });
  } catch (error) {
    logger.error('message_send_failed', { senderId, recipientId, error: error.message });
    res.status(500).json({ message: '쪽지를 보내지 못했습니다' });
  }
});

app.get('/teams/:teamId/progress', (req, res) => {
  const { teamId } = req.params;
  const { scope_type, start, end } = req.query;

  const exactSql = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = '완료' THEN 1 ELSE 0 END) AS done
    FROM todos
    WHERE team_id = ?
      AND scope_type = ?
      AND scope_start_date <= ?
      AND scope_end_date >= ?
  `;

  db.query(exactSql, [teamId, scope_type, end, start], (err, rows) => {
    if (err) {
      console.error('진행률 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    const exact = rows?.[0] || { total: 0, done: 0 };
    if (Number(exact.total) > 0) {
      const total = Number(exact.total);
      const done = Number(exact.done || 0);
      return res.json({ total, done, percent: Math.round((done / total) * 100) });
    }

    const fallbackSql = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = '완료' THEN 1 ELSE 0 END) AS done
      FROM todos
      WHERE team_id = ?
        AND scope_type = '전체'
    `;

    db.query(fallbackSql, [teamId], (fallbackErr, fallbackRows) => {
      if (fallbackErr) {
        console.error('진행률 fallback 조회 오류:', fallbackErr);
        return res.status(500).json({ message: '서버 오류' });
      }

      const fallback = fallbackRows?.[0] || { total: 0, done: 0 };
      const total = Number(fallback.total || 0);
      const done = Number(fallback.done || 0);

      res.json({
        total,
        done,
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
      });
    });
  });
});

app.get('/teams/:teamId/daily-todos', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId } = req.params;

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  if (!db || db.state === 'disconnected') {
    return res.json([]);
  }

  const sql = `
    SELECT
      td.todo_id,
      td.title,
      td.status,
      td.scope_type,
      td.scope_start_date,
      td.scope_end_date,
      COALESCE(u.name, '이름 없음') AS assigned_user_name
    FROM todos td
    LEFT JOIN users u ON u.id = td.assigned_user_id
    WHERE td.team_id = ?
      AND DATE(td.scope_start_date) <= CURDATE()
      AND DATE(td.scope_end_date) >= CURDATE()
      AND EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = td.team_id AND tm.user_id = ?
      )
    ORDER BY FIELD(td.status, '진행중', '미진행', '완료'), td.updated_at DESC, td.todo_id DESC
    LIMIT 100
  `;

  db.query(sql, [teamId, userId], (err, results) => {
    if (err) {
      console.error('일일 투두 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    res.json(results || []);
  });
});

app.get('/teams/:teamId/calendar', async (req, res) => {
  const userId = getRequestUserId(req);
  const teamId = Number(req.params.teamId);
  const requestedYear = Number(req.query.year);
  const requestedMonth = Number(req.query.month);
  const today = new Date();
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
    ? requestedYear
    : today.getFullYear();
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
    ? requestedMonth
    : today.getMonth() + 1;

  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!teamId) return res.status(400).json({ message: '활동 정보가 올바르지 않습니다' });

  try {
    await todoCalendarSchemaReady;
    const monthStart = formatDateOnly(new Date(year, month - 1, 1));
    const monthEnd = formatDateOnly(new Date(year, month, 0));
    const [rows] = await portfolioDb.query(
      `SELECT
        td.todo_id,
        td.title,
        td.status,
        td.scope_type,
        td.scope_start_date,
        td.scope_end_date,
        td.range_group_id,
        td.range_start_date,
        td.range_end_date,
        td.range_color
      FROM todos td
      JOIN team_members requester ON requester.team_id = td.team_id
      WHERE td.team_id = ?
        AND requester.user_id = ?
        AND td.assigned_user_id = ?
        AND td.scope_start_date <= ?
        AND td.scope_end_date >= ?
      ORDER BY td.scope_start_date, td.todo_id`,
      [teamId, userId, userId, monthEnd, monthStart],
    );
    res.json(buildMonthTodoCalendar(year, month, rows));
  } catch (error) {
    console.error('일정 캘린더 조회 오류:', error);
    res.status(500).json({ message: '일정 캘린더를 불러오지 못했습니다' });
  }
});

app.get('/teams/:teamId/heatmap', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId } = req.params;
  const requestedYear = Number(req.query.year);
  const requestedMonth = Number(req.query.month);
  const today = new Date();
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
    ? requestedYear
    : today.getFullYear();
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
    ? requestedMonth
    : today.getMonth() + 1;
  const monthStart = new Date(year, month - 1, 1);
  const nextMonthStart = new Date(year, month, 1);
  const monthStartKey = formatDateOnly(monthStart);
  const nextMonthStartKey = formatDateOnly(nextMonthStart);

  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });

  const buildMonthHeatmap = (countByDate = new Map()) => {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const payload = [];

    for (let day = 1; day <= end.getDate(); day += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), day);
      const key = formatDateOnly(date);
      payload.push({
        date: key,
        count: countByDate.get(key) || 0,
      });
    }

    return payload;
  };

  if (!db || db.state === 'disconnected') {
    return res.json(buildMonthHeatmap());
  }

  const sql = `
    SELECT
      DATE(COALESCE(completed_at, updated_at)) AS activity_date,
      COUNT(*) AS count
    FROM todos td
    WHERE td.team_id = ?
      AND EXISTS (
        SELECT 1 FROM team_members tm WHERE tm.team_id = td.team_id AND tm.user_id = ?
      )
      AND status = '완료'
      AND COALESCE(completed_at, updated_at) >= ?
      AND COALESCE(completed_at, updated_at) < ?
    GROUP BY DATE(COALESCE(completed_at, updated_at))
    ORDER BY activity_date ASC
  `;

  db.query(sql, [teamId, userId, monthStartKey, nextMonthStartKey], (err, results) => {
    if (err) {
      console.error('히트맵 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    const countByDate = new Map(
      (results || []).map((row) => [formatDateOnly(row.activity_date), Number(row.count || 0)])
    );
    res.json(buildMonthHeatmap(countByDate));
  });
});

app.get('/teams/:teamId/todos', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId } = req.params;
  const { user_id, scope_type, start, end } = req.query;
  const assignedUserId = Number(user_id || userId);

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  if (!assignedUserId || !scope_type || !start || !end) {
    return res.status(400).json({ message: '필수 값이 누락되었습니다' });
  }

  const exactSql = `
    SELECT td.todo_id, td.team_id, td.assigned_user_id, td.title, td.status, td.scope_type, td.scope_start_date, td.scope_end_date, td.created_at, td.updated_at
    FROM todos td
    JOIN team_members requester ON requester.team_id = td.team_id
    WHERE td.team_id = ?
      AND requester.user_id = ?
      AND td.assigned_user_id = ?
      AND td.scope_type = ?
      AND td.scope_start_date <= ?
      AND td.scope_end_date >= ?
    ORDER BY td.updated_at DESC, td.todo_id DESC
  `;

  db.query(exactSql, [teamId, userId, assignedUserId, scope_type, end, start], (err, results) => {
    if (err) {
      console.error('팀원 투두 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    if ((results || []).length > 0) {
      return res.json(results.map(todo => normalizeTodo(todo)));
    }

    const fallbackSql = `
      SELECT td.todo_id, td.team_id, td.assigned_user_id, td.title, td.status, td.scope_type, td.scope_start_date, td.scope_end_date, td.created_at, td.updated_at
      FROM todos td
      JOIN team_members requester ON requester.team_id = td.team_id
      WHERE td.team_id = ?
        AND requester.user_id = ?
        AND td.assigned_user_id = ?
        AND td.scope_type = '전체'
      ORDER BY td.updated_at DESC, td.todo_id DESC
      LIMIT 30
    `;

    db.query(fallbackSql, [teamId, userId, assignedUserId], (fallbackErr, fallbackResults) => {
      if (fallbackErr) {
        console.error('팀원 투두 fallback 조회 오류:', fallbackErr);
        return res.status(500).json({ message: '서버 오류' });
      }

      res.json((fallbackResults || []).map(todo =>
        normalizeTodo(todo, scope_type, start, end)
      ));
    });
  });
});

app.post('/teams/:teamId/todos', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId } = req.params;
  const { assigned_user_id, title, scope_type, scope_start_date, scope_end_date } = req.body;

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  if (!assigned_user_id || !title || !scope_type || !scope_start_date || !scope_end_date) {
    return res.status(400).json({ message: '필수 값이 누락되었습니다' });
  }

  const memberSql = `
    SELECT COUNT(*) AS count
    FROM team_members
    WHERE team_id = ?
      AND user_id IN (?, ?)
  `;

  db.query(memberSql, [teamId, userId, assigned_user_id], (memberErr, memberRows) => {
    if (memberErr) {
      console.error('팀원 투두 생성 권한 확인 오류:', memberErr);
      return res.status(500).json({ message: '서버 오류' });
    }

    if (Number(memberRows?.[0]?.count || 0) < 2 && Number(userId) !== Number(assigned_user_id)) {
      return res.status(403).json({ message: '팀원에게만 할 일을 추가할 수 있습니다' });
    }

    const insertSql = `
      INSERT INTO todos (team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date)
      VALUES (?, ?, ?, '미진행', ?, ?, ?)
    `;

    db.query(insertSql, [teamId, assigned_user_id, title, scope_type, scope_start_date, scope_end_date], (err, result) => {
      if (err) {
        console.error('팀원 투두 생성 오류:', err);
        return res.status(500).json({ message: '서버 오류' });
      }

      const selectSql = `
        SELECT todo_id, team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date, created_at, updated_at
        FROM todos
        WHERE todo_id = ?
      `;

      db.query(selectSql, [result.insertId], (selectErr, rows) => {
        if (selectErr) {
          console.error('생성 팀원 투두 조회 오류:', selectErr);
          return res.status(500).json({ message: '서버 오류' });
        }

        res.status(201).json(normalizeTodo(rows[0]));
      });
    });
  });
});

app.get('/todos/:teamId', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId } = req.params;
  const { scope_type, start, end } = req.query;

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  const exactSql = `
    SELECT todo_id, team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date, created_at, updated_at
    FROM todos
    WHERE team_id = ?
      AND assigned_user_id = ?
      AND scope_type = ?
      AND scope_start_date <= ?
      AND scope_end_date >= ?
    ORDER BY updated_at DESC, todo_id DESC
  `;

  db.query(exactSql, [teamId, userId, scope_type, end, start], (err, results) => {
    if (err) {
      console.error('투두 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    if ((results || []).length > 0) {
      return res.json(results.map(todo => normalizeTodo(todo)));
    }

    const fallbackSql = `
      SELECT todo_id, team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date, created_at, updated_at
      FROM todos
      WHERE team_id = ?
        AND assigned_user_id = ?
        AND scope_type = '전체'
      ORDER BY updated_at DESC, todo_id DESC
      LIMIT 30
    `;

    db.query(fallbackSql, [teamId, userId], (fallbackErr, fallbackResults) => {
      if (fallbackErr) {
        console.error('투두 fallback 조회 오류:', fallbackErr);
        return res.status(500).json({ message: '서버 오류' });
      }

      res.json((fallbackResults || []).map(todo =>
        normalizeTodo(todo, scope_type, start, end)
      ));
    });
  });
});

app.post('/todos/period', async (req, res) => {
  const periodGoalColors = ['#53389E', '#6941C6', '#7A5AF8', '#7F56D9', '#9E77ED', '#B692F6'];
  const userId = getRequestUserId(req);
  const teamId = Number(req.body?.team_id);
  const title = String(req.body?.title || '').trim();
  const startDate = parseStrictDateOnly(req.body?.start_date);
  const endDate = parseStrictDateOnly(req.body?.end_date);
  const requestedColor = String(req.body?.color || '').trim().toUpperCase();
  const rangeColor = requestedColor || '#7A5AF8';

  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!Number.isInteger(teamId) || teamId <= 0 || !title || !startDate || !endDate) {
    return res.status(400).json({ message: '팀, 목표, 시작일, 종료일을 확인해주세요' });
  }
  if (title.length > 255) return res.status(400).json({ message: '목표는 255자 이하로 입력해주세요' });
  if (endDate < startDate) return res.status(400).json({ message: '종료일은 시작일 이후여야 합니다' });
  if (!periodGoalColors.includes(rangeColor)) {
    return res.status(400).json({ message: '지원하지 않는 기간 목표 색상입니다' });
  }

  const dayCount = Math.floor((endDate - startDate) / 86_400_000) + 1;
  if (dayCount > 366) return res.status(400).json({ message: '기간 목표는 최대 366일까지 설정할 수 있습니다' });

  const dates = listDateRange(startDate, endDate);
  const rangeGroupId = crypto.randomUUID();
  await todoCalendarSchemaReady;
  const connection = await portfolioDb.getConnection();
  try {
    await connection.beginTransaction();
    const [members] = await connection.query(
      'SELECT team_id FROM team_members WHERE team_id = ? AND user_id = ? FOR UPDATE',
      [teamId, userId],
    );
    if (!members.length) {
      await connection.rollback();
      return res.status(403).json({ message: '참여 중인 활동에만 목표를 추가할 수 있습니다' });
    }

    const [existing] = await connection.query(
      `SELECT DATE_FORMAT(scope_start_date, '%Y-%m-%d') AS goal_date
       FROM todos
       WHERE team_id = ? AND assigned_user_id = ? AND scope_type = '일일'
         AND title = ? AND scope_start_date BETWEEN ? AND ?`,
      [teamId, userId, title, dates[0], dates[dates.length - 1]],
    );
    const existingDates = new Set(existing.map((row) => row.goal_date));
    const datesToCreate = dates.filter((date) => !existingDates.has(date));

    if (datesToCreate.length) {
      const [activePeriodGoals] = await connection.query(
        `SELECT
          range_group_id,
          DATE_FORMAT(MIN(range_start_date), '%Y-%m-%d') AS start_date,
          DATE_FORMAT(MAX(range_end_date), '%Y-%m-%d') AS end_date,
          SUM(CASE WHEN status <> '완료' THEN 1 ELSE 0 END) AS incomplete_count
         FROM todos
         WHERE team_id = ? AND assigned_user_id = ? AND range_group_id IS NOT NULL
           AND range_start_date <= ? AND range_end_date >= ?
         GROUP BY range_group_id
         HAVING incomplete_count > 0`,
        [teamId, userId, dates[dates.length - 1], dates[0]],
      );
      const capacityConflict = findPeriodGoalCapacityConflict(dates, activePeriodGoals, 3);
      if (capacityConflict) {
        await connection.rollback();
        return res.status(409).json({
          message: '선택한 기간에는 진행 중인 기간 목표가 이미 3개입니다. 하나를 완료한 뒤 추가해주세요.',
          conflict_date: capacityConflict.date,
          active_count: capacityConflict.active_count,
          maximum_active_goals: 3,
        });
      }
    }

    if (datesToCreate.length) {
      const placeholders = datesToCreate
        .map(() => "(?, ?, ?, '미진행', '일일', ?, ?, ?, ?, ?, ?)")
        .join(', ');
      const values = datesToCreate.flatMap((date) => [
        teamId,
        userId,
        title,
        date,
        date,
        rangeGroupId,
        dates[0],
        dates[dates.length - 1],
        rangeColor,
      ]);
      await connection.query(
        `INSERT INTO todos
          (team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date,
           range_group_id, range_start_date, range_end_date, range_color)
         VALUES ${placeholders}`,
        values,
      );
    }

    await connection.commit();
    res.status(201).json({
      success: true,
      scope_type: '일일',
      created_count: datesToCreate.length,
      skipped_count: dates.length - datesToCreate.length,
      start_date: dates[0],
      end_date: dates[dates.length - 1],
      range_group_id: rangeGroupId,
      color: rangeColor,
    });
  } catch (error) {
    await connection.rollback();
    console.error('기간 목표 생성 오류:', error);
    res.status(500).json({ message: '기간 목표를 생성하지 못했습니다' });
  } finally {
    connection.release();
  }
});

app.post('/todos', (req, res) => {
  const userId = getRequestUserId(req);
  const { team_id, title, scope_type, scope_start_date, scope_end_date } = req.body;

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  if (!team_id || !title || !scope_type || !scope_start_date || !scope_end_date) {
    return res.status(400).json({ message: '필수 값이 누락되었습니다' });
  }

  const insertSql = `
    INSERT INTO todos (team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date)
    VALUES (?, ?, ?, '미진행', ?, ?, ?)
  `;

  db.query(insertSql, [team_id, userId, title, scope_type, scope_start_date, scope_end_date], (err, result) => {
    if (err) {
      console.error('투두 생성 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    const selectSql = `
      SELECT todo_id, team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date, created_at, updated_at
      FROM todos
      WHERE todo_id = ?
    `;

    db.query(selectSql, [result.insertId], (selectErr, rows) => {
      if (selectErr) {
        console.error('생성 투두 조회 오류:', selectErr);
        return res.status(500).json({ message: '서버 오류' });
      }

      res.status(201).json(normalizeTodo(rows[0]));
    });
  });
});

app.put('/todos/:todoId', (req, res) => {
  const userId = getRequestUserId(req);
  const { todoId } = req.params;
  const allowedFields = ['title', 'status'];
  const updates = allowedFields.filter(field => req.body[field] !== undefined);

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: '수정할 값이 없습니다' });
  }

  const setClause = updates.map(field => `${field} = ?`).join(', ');
  const values = updates.map(field => req.body[field]);
  const completionClause = req.body.status === undefined
    ? ''
    : req.body.status === '완료'
      ? ', completed_at = COALESCE(completed_at, NOW())'
      : ', completed_at = NULL';

  const sql = `
    UPDATE todos
    SET ${setClause}${completionClause}
    WHERE todo_id = ?
      AND team_id IN (
        SELECT team_id FROM team_members WHERE user_id = ?
      )
  `;

  db.query(sql, [...values, todoId, userId], (err, result) => {
    if (err) {
      console.error('투두 수정 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '투두를 찾을 수 없습니다' });
    }

    res.json({ success: true });
  });
});

app.delete('/todos/:todoId', (req, res) => {
  const userId = getRequestUserId(req);
  const { todoId } = req.params;

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  db.query(`
    DELETE FROM todos
    WHERE todo_id = ?
      AND team_id IN (
        SELECT team_id FROM team_members WHERE user_id = ?
      )
  `, [todoId, userId], (err, result) => {
    if (err) {
      console.error('투두 삭제 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '투두를 찾을 수 없습니다' });
    }

    res.json({ success: true });
  });
});

app.get('/teams/:teamId/issues', async (req, res) => {
  const userId = getRequestUserId(req);
  const teamId = Number(req.params.teamId);
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!teamId) return res.status(400).json({ message: '활동 정보가 올바르지 않습니다' });

  try {
    const [rows] = await portfolioDb.query(
      `SELECT i.issue_id, i.team_id, i.reporter_id, i.assignee_id, i.title, i.description,
        i.status, i.priority, i.due_date, i.created_at, i.updated_at,
        reporter.name AS reporter_name, assignee.name AS assignee_name
       FROM team_issues i
       JOIN team_members requester ON requester.team_id = i.team_id AND requester.user_id = ?
       LEFT JOIN users reporter ON reporter.id = i.reporter_id
       LEFT JOIN users assignee ON assignee.id = i.assignee_id
       WHERE i.team_id = ?
       ORDER BY FIELD(i.status, 'OPEN', 'IN_PROGRESS', 'DONE'),
         FIELD(i.priority, 'HIGH', 'MEDIUM', 'LOW'), i.updated_at DESC`,
      [userId, teamId],
    );
    res.json(rows);
  } catch (error) {
    console.error('팀 이슈 조회 오류:', error);
    res.status(500).json({ message: '이슈를 불러오지 못했습니다' });
  }
});

app.post('/teams/:teamId/issues', async (req, res) => {
  const userId = getRequestUserId(req);
  const teamId = Number(req.params.teamId);
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const assigneeId = Number(req.body?.assignee_id) || null;
  const priority = ['LOW', 'MEDIUM', 'HIGH'].includes(req.body?.priority) ? req.body.priority : 'MEDIUM';
  const dueDate = req.body?.due_date || null;
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!teamId || !title) return res.status(400).json({ message: '이슈 제목을 입력해주세요' });

  try {
    const [members] = await portfolioDb.query(
      'SELECT user_id FROM team_members WHERE team_id = ? AND user_id IN (?, ?)',
      [teamId, userId, assigneeId || userId],
    );
    const memberIds = new Set(members.map((member) => Number(member.user_id)));
    if (!memberIds.has(userId) || (assigneeId && !memberIds.has(assigneeId))) {
      return res.status(403).json({ message: '같은 팀의 팀원에게만 이슈를 할당할 수 있습니다' });
    }
    const [result] = await portfolioDb.query(
      `INSERT INTO team_issues
        (team_id, reporter_id, assignee_id, title, description, priority, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [teamId, userId, assigneeId, title.slice(0, 180), description || null, priority, dueDate],
    );
    res.status(201).json({ issue_id: result.insertId });
  } catch (error) {
    console.error('팀 이슈 생성 오류:', error);
    res.status(500).json({ message: '이슈를 등록하지 못했습니다' });
  }
});

app.put('/teams/:teamId/issues/:issueId', async (req, res) => {
  const userId = getRequestUserId(req);
  const teamId = Number(req.params.teamId);
  const issueId = Number(req.params.issueId);
  const status = String(req.body?.status || '');
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!['OPEN', 'IN_PROGRESS', 'DONE'].includes(status)) {
    return res.status(400).json({ message: '올바른 이슈 상태가 필요합니다' });
  }

  try {
    const [result] = await portfolioDb.query(
      `UPDATE team_issues i
       JOIN team_members tm ON tm.team_id = i.team_id AND tm.user_id = ?
       SET i.status = ?
       WHERE i.issue_id = ? AND i.team_id = ?`,
      [userId, status, issueId, teamId],
    );
    if (!result.affectedRows) return res.status(404).json({ message: '이슈를 찾을 수 없습니다' });
    res.json({ success: true });
  } catch (error) {
    console.error('팀 이슈 수정 오류:', error);
    res.status(500).json({ message: '이슈 상태를 변경하지 못했습니다' });
  }
});

app.delete('/teams/:teamId/issues/:issueId', async (req, res) => {
  const userId = getRequestUserId(req);
  const teamId = Number(req.params.teamId);
  const issueId = Number(req.params.issueId);
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });

  try {
    const [result] = await portfolioDb.query(
      `DELETE i FROM team_issues i
       JOIN teams t ON t.team_id = i.team_id
       WHERE i.issue_id = ? AND i.team_id = ?
         AND (i.reporter_id = ? OR t.leader_user_id = ?)`,
      [issueId, teamId, userId, userId],
    );
    if (!result.affectedRows) return res.status(403).json({ message: '작성자 또는 팀장만 삭제할 수 있습니다' });
    res.json({ success: true });
  } catch (error) {
    console.error('팀 이슈 삭제 오류:', error);
    res.status(500).json({ message: '이슈를 삭제하지 못했습니다' });
  }
});

app.put('/team-members/:teamId/part', (req, res) => {
  const userId = getRequestUserId(req);
  const { teamId } = req.params;
  const { part } = req.body;

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  if (!part) {
    return res.status(400).json({ message: '역할을 입력해주세요' });
  }

  db.query(
    'UPDATE team_members SET part = ? WHERE team_id = ? AND user_id = ?',
    [part, teamId, userId],
    (err, result) => {
      if (err) {
        console.error('팀 역할 수정 오류:', err);
        return res.status(500).json({ message: '서버 오류' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '팀원을 찾을 수 없습니다' });
      }

      res.json({ success: true, part });
    }
  );
});

app.put('/teams/:teamId/members/:memberId/part', async (req, res) => {
  const userId = getRequestUserId(req);
  const teamId = Number(req.params.teamId);
  const memberId = Number(req.params.memberId);
  const part = String(req.body?.part || '').trim();
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!teamId || !memberId || !part) return res.status(400).json({ message: '팀원과 역할을 입력해주세요' });

  try {
    const [result] = await portfolioDb.query(
      `UPDATE team_members tm
       JOIN teams t ON t.team_id = tm.team_id
       SET tm.part = ?
       WHERE tm.team_id = ? AND tm.user_id = ? AND t.leader_user_id = ?`,
      [part.slice(0, 120), teamId, memberId, userId],
    );
    if (!result.affectedRows) return res.status(403).json({ message: '팀장만 팀원 역할을 변경할 수 있습니다' });
    res.json({ success: true, part });
  } catch (error) {
    console.error('팀원 역할 분배 오류:', error);
    res.status(500).json({ message: '팀원 역할을 저장하지 못했습니다' });
  }
});

app.put('/teams/:teamId/name', (req, res) => {
  const userId = getRequestUserId(req);
  const teamId = Number(req.params.teamId);
  const teamName = String(req.body?.team_name || '').trim();

  if (!userId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }

  if (!Number.isInteger(teamId) || teamId <= 0) {
    return res.status(400).json({ message: '올바른 팀 ID가 필요합니다' });
  }

  if (!teamName) {
    return res.status(400).json({ message: '활동 프로젝트명을 입력해주세요' });
  }

  if (teamName.length > 255) {
    return res.status(400).json({ message: '활동 프로젝트명은 255자 이하로 입력해주세요' });
  }

  db.query(
    `UPDATE teams
     SET team_name = ?
     WHERE team_id = ?
       AND leader_user_id = ?
       AND status <> 'ARCHIVED'
       AND activity_status = 'IN_PROGRESS'`,
    [teamName, teamId, userId],
    (err, result) => {
      if (err) {
        console.error('활동 프로젝트명 수정 오류:', err);
        return res.status(500).json({ message: '서버 오류' });
      }

      if (result.affectedRows === 0) {
        return res.status(403).json({ message: '진행 중인 활동의 팀장만 프로젝트명을 수정할 수 있습니다' });
      }

      res.json({ success: true, team_id: teamId, team_name: teamName });
    }
  );
});

// ===== 사용자 관련 API =====

// 사용자 정보 조회 API
app.get('/api/user/:id', (req, res) => {
  const userId = req.params.id;
  
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: '사용자 ID가 필요합니다'
    });
  }

  // 더미 데이터 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 사용자 데이터 (MySQL 미연결)');
    const dummyUser = toClientUser({
      user_id: parseInt(userId),
      email: 'test@test.com',
      name: '테스트 사용자',
      department: '컴퓨터공학과',
      student_number: '202012345',
      birth: '2000-01-01',
      profile_picture: null,
      self_intro: '안녕하세요!',
      is_admin: false,
    });
    
    return res.json({
      success: true,
      user: dummyUser
    });
  }
  
  // 실제 DB 쿼리
  const userQuery = `SELECT id AS user_id, email, name, department, student_number,
    birth AS birth_date, profile_picture, self_intro, is_admin, email_verified,
    account_type, school_domain, school_name FROM users WHERE id = ?`;
  
  db.query(userQuery, [userId], (err, results) => {
    if (err) {
      console.error('사용자 정보 조회 에러:', err);
      return res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다'
      });
    }
    
    const userData = toClientUser(results[0]);
    
    res.json({
      success: true,
      user: userData
    });
  });
});

// ===== MyPage 관련 API =====

// 사용자 참여 활동 조회 (MyPage2에서 사용)
app.get('/api/participations/user/:userId', (req, res) => {
  const userId = req.params.userId;
  
  
  // 더미 데이터 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 참여 활동 데이터 (MySQL 미연결)');
    const dummyParticipations = [
      {
        participation_id: 1,
        user_id: parseInt(userId),
        activity_id: 1,
        participated_with: [2, 3, 4] // 함께 참여한 사용자 ID들
      },
      {
        participation_id: 2,
        user_id: parseInt(userId),
        activity_id: 2,
        participated_with: [3, 5]
      }
    ];
    
    return res.json({
      success: true,
      participations: dummyParticipations
    });
  }

  // 실제 DB 쿼리 (참여 활동 조회)
  const query = `
    SELECT
      p.participation_id,
      p.user_id,
      p.team_id AS activity_id,
      p.participated_at,
      p.participated_with,
      GROUP_CONCAT(DISTINCT team.user_id ORDER BY team.user_id) AS team_user_ids,
      p.created_at,
      p.updated_at
    FROM user_activity_participations p
    LEFT JOIN user_activity_participations team ON team.team_id = p.team_id
    WHERE p.user_id = ?
    GROUP BY
      p.participation_id,
      p.user_id,
      p.team_id,
      p.participated_at,
      p.participated_with,
      p.created_at,
      p.updated_at
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('참여 활동 조회 에러:', err);
      return res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
    
    const participations = (results || []).map((participation) => {
      const storedIds = parseIdList(participation.participated_with);
      const teamIds = parseIdList(participation.team_user_ids);
      const participatedWith = storedIds.length > 0 ? storedIds : teamIds;

      return {
        ...participation,
        participated_with: participatedWith,
        team_user_ids: undefined
      };
    });

    res.json({
      success: true,
      participations
    });
  });
});

// 여러 사용자 정보 조회 (MyPage2에서 사용)
app.post('/api/users/batch', (req, res) => {
  const user_ids = req.body.user_ids || req.body.userIds;
  
  
  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: '사용자 ID 배열이 필요합니다'
    });
  }

  // 더미 데이터 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 배치 사용자 데이터 (MySQL 미연결)');
    const dummyUsers = user_ids.map(id => ({
      id: parseInt(id),
      user_id: parseInt(id),
      email: `user${id}@test.com`,
      name: `사용자 ${id}`,
      department: '컴퓨터공학과',
      student_number: `20201234${id}`,
      studentId: `20201234${id}`,
    }));
    
    return res.json({
      success: true,
      users: dummyUsers
    });
  }

  // 실제 DB 쿼리
  const placeholders = user_ids.map(() => '?').join(',');
  const query = `SELECT id, id AS user_id, email, name, department, student_number, student_number AS studentId, birth AS birth_date FROM users WHERE id IN (${placeholders})`;
  
  db.query(query, user_ids, (err, results) => {
    if (err) {
      console.error('배치 사용자 정보 조회 에러:', err);
      return res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
    
    res.json({
      success: true,
      users: results || []
    });
  });
});

// 기존 평가 조회 (MyPage3에서 사용)
app.get('/api/reviews/existing/:reviewerId/:revieweeId/:activityId', (req, res) => {
  const { reviewerId, revieweeId, activityId } = req.params;
  
  console.log(`기존 평가 조회: 평가자 ${reviewerId}, 피평가자 ${revieweeId}, 활동 ${activityId}`);
  
  // 더미 데이터 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 기존 평가 데이터 (MySQL 미연결)');
    // 기존 평가가 없다고 가정
    return res.json({
      success: true,
      existingReview: null
    });
  }

  // 실제 DB 쿼리
  const query = 'SELECT * FROM reviews WHERE reviewer_id = ? AND reviewee_id = ? AND related_team_id = ?';
  
  db.query(query, [reviewerId, revieweeId, activityId], (err, results) => {
    if (err) {
      console.error('기존 평가 조회 에러:', err);
      return res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
    
    const existingReview = results.length > 0 ? results[0] : null;
    
    res.json({
      success: true,
      existingReview: existingReview
    });
  });
});

// 평가 저장/수정 (MyPage3에서 사용)
app.post('/api/reviews', (req, res) => {
  const { reviewer_id, reviewee_id, related_team_id, review_high, review_medium, review_low, comment, is_update } = req.body;
  const requestUserId = getRequestUserId(req);

  if (!requestUserId) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다' });
  }
  if (Number(reviewer_id) !== requestUserId) {
    return res.status(403).json({ success: false, message: '본인의 평가만 작성할 수 있습니다' });
  }
  
  // 더미 응답 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 평가 저장 (MySQL 미연결)');
    return res.json({
      success: true,
      message: is_update ? '평가가 수정되었습니다' : '평가가 저장되었습니다'
    });
  }

  if (is_update) {
    // 기존 평가 수정
    const updateQuery = `
      UPDATE reviews 
      SET review_high = ?, review_medium = ?, review_low = ?, comment = ?, updated_at = NOW()
      WHERE reviewer_id = ? AND reviewee_id = ? AND related_team_id = ?
    `;
    
    db.query(updateQuery, [review_high, review_medium, review_low, comment, reviewer_id, reviewee_id, related_team_id], (err, result) => {
      if (err) {
        console.error('평가 수정 에러:', err);
        return res.status(500).json({
          success: false,
          message: '평가 수정 실패'
        });
      }
      
      res.json({
        success: true,
        message: '평가가 수정되었습니다'
      });
    });
  } else {
    // 새 평가 저장
    const insertQuery = `
      INSERT INTO reviews (reviewer_id, reviewee_id, related_team_id, review_high, review_medium, review_low, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    
    db.query(insertQuery, [reviewer_id, reviewee_id, related_team_id, review_high, review_medium, review_low, comment], (err, result) => {
      if (err) {
        console.error('평가 저장 에러:', err);
        return res.status(500).json({
          success: false,
          message: '평가 저장 실패'
        });
      }
      
      res.json({
        success: true,
        message: '평가가 저장되었습니다'
      });
    });
  }
});

// 사용자의 평가 통계 조회 (MyPage4에서 사용)
app.get('/api/user/:id/evaluations', (req, res) => {
  const userId = req.params.id;
  
  
  // 더미 데이터 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 평가 통계 데이터 (MySQL 미연결)');
    const dummyEvaluations = {
      review_low: 1,
      review_medium: 3,
      review_high: 2
    };
    
    return res.json({
      success: true,
      evaluations: dummyEvaluations,
      debug: `사용자 ${userId}의 더미 평가 통계`
    });
  }

  // 실제 DB 쿼리 - 사용자가 받은 평가들의 합계
  const query = `
    SELECT 
      SUM(review_low) as review_low,
      SUM(review_medium) as review_medium,
      SUM(review_high) as review_high
    FROM reviews 
    WHERE reviewee_id = ?
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('평가 통계 조회 에러:', err);
      return res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
    
    const evaluations = results[0] || {
      review_low: 0,
      review_medium: 0,
      review_high: 0
    };
    
    res.json({
      success: true,
      evaluations: evaluations
    });
  });
});

app.get('/api/user/:id/reviews', (req, res) => {
  const userId = req.params.id;

  if (!db || db.state === 'disconnected') {
    return res.json({
      success: true,
      reviews: [],
    });
  }

  const query = `
    SELECT
      r.review_id,
      r.reviewer_id,
      r.reviewee_id,
      r.related_team_id,
      r.review_high,
      r.review_medium,
      r.review_low,
      r.comment,
      r.created_at,
      COALESCE(u.name, '이름 없음') AS reviewer_name,
      COALESCE(tr.activity_name, tr.post_name, CONCAT('활동 ', r.related_team_id)) AS activity_title
    FROM reviews r
    LEFT JOIN users u ON u.id = r.reviewer_id
    LEFT JOIN team_recruitments tr ON tr.team_id = r.related_team_id
    WHERE r.reviewee_id = ?
    ORDER BY r.created_at DESC, r.review_id DESC
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('받은 리뷰 조회 에러:', err);
      return res.status(500).json({
        success: false,
        message: '서버 오류',
      });
    }

    res.json({
      success: true,
      reviews: results || [],
    });
  });
});

// 사용자의 활동 이력 조회 (MyPage4에서 사용)
app.get('/api/user/:id/activities', (req, res) => {
  const userId = req.params.id;
  
  
  // 더미 데이터 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 활동 이력 데이터 (MySQL 미연결)');
    const dummyActivities = [
      {
        id: 1,
        title: '2024 프로그래밍 대회',
        comment: '열정적으로 참여해주셨습니다!'
      },
      {
        id: 2,
        title: 'AI 세미나',
        comment: '적극적인 질문과 토론이 인상적이었습니다.'
      }
    ];
    
    return res.json({
      success: true,
      activities: dummyActivities
    });
  }

  // 실제 DB 쿼리 - 사용자가 참여한 활동들과 받은 코멘트들
  const query = `
    SELECT DISTINCT
      a.team_id as id,
      COALESCE(a.activity_name, a.post_name) as title,
      r.comment,
      a.created_at
    FROM team_recruitments a
    JOIN user_activity_participations p ON a.team_id = p.team_id
    LEFT JOIN reviews r ON p.team_id = r.related_team_id AND r.reviewee_id = ?
    WHERE p.user_id = ?
    ORDER BY a.created_at DESC
  `;
  
  db.query(query, [userId, userId], (err, results) => {
    if (err) {
      console.error('활동 이력 조회 에러:', err);
      return res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
    
    res.json({
      success: true,
      activities: results || []
    });
  });
});

// 사용자 정보 업데이트 (MyPage1에서 사용)
app.put('/api/user/:id', (req, res) => {
  const userId = Number(req.params.id);
  const requestUserId = getRequestUserId(req);
  const updateData = req.body;

  if (!requestUserId) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다' });
  }
  if (requestUserId !== userId) {
    return res.status(403).json({ success: false, message: '본인의 정보만 수정할 수 있습니다' });
  }
  
  
  // 더미 응답 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 사용자 정보 업데이트 (MySQL 미연결)');
    return res.json({
      success: true,
      message: '사용자 정보가 업데이트되었습니다'
    });
  }

  // 실제 DB 쿼리
  const allowedFields = ['email', 'name', 'department', 'student_number', 'birth_date', 'profile_picture', 'self_intro'];
  const updateFields = [];
  const updateValues = [];
  
  Object.keys(updateData).forEach(key => {
    if (allowedFields.includes(key) && updateData[key] !== undefined) {
      const columnName = key === 'birth_date' ? 'birth' : key;
      updateFields.push(`${columnName} = ?`);
      updateValues.push(updateData[key]);
    }
  });
  
  if (updateFields.length === 0) {
    return res.status(400).json({
      success: false,
      message: '업데이트할 필드가 없습니다'
    });
  }
  
  updateValues.push(userId);
  const query = `UPDATE users SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`;
  
  db.query(query, updateValues, (err, result) => {
    if (err) {
      console.error('사용자 정보 업데이트 에러:', err);
      return res.status(500).json({
        success: false,
        message: '사용자 정보 업데이트 실패'
      });
    }
    
    res.json({
      success: true,
      message: '사용자 정보가 업데이트되었습니다'
    });
  });
});

app.put('/api/user/:id/password', (req, res) => {
  const userId = Number(req.params.id);
  const requestUserId = getRequestUserId(req);
  const currentPassword = String(req.body?.current_password || '');
  const newPassword = String(req.body?.new_password || '');

  if (!requestUserId) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다' });
  }

  if (requestUserId !== userId) {
    return res.status(403).json({ success: false, message: '본인의 비밀번호만 변경할 수 있습니다' });
  }

  if (!currentPassword || newPassword.length < 4) {
    return res.status(400).json({ success: false, message: '현재 비밀번호와 4자 이상의 새 비밀번호를 입력해주세요' });
  }

  db.query('SELECT password FROM users WHERE id = ?', [userId], (findErr, rows) => {
    if (findErr) {
      console.error('비밀번호 변경 사용자 조회 오류:', findErr);
      return res.status(500).json({ success: false, message: '서버 오류' });
    }

    if (!rows.length) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다' });
    }

    if (!isPasswordValid(currentPassword, rows[0].password)) {
      return res.status(400).json({ success: false, message: '현재 비밀번호가 일치하지 않습니다' });
    }

    db.query(
      'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashPassword(newPassword), userId],
      (updateErr) => {
        if (updateErr) {
          console.error('비밀번호 변경 오류:', updateErr);
          return res.status(500).json({ success: false, message: '비밀번호 변경에 실패했습니다' });
        }

        res.json({ success: true, message: '비밀번호가 변경되었습니다' });
      }
    );
  });
});

// 사용자 탈퇴 (Setting에서 사용)
app.delete('/api/delete-user/:id', async (req, res) => {
  const userId = Number(req.params.id);
  const requestUserId = getRequestUserId(req);

  if (!requestUserId) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다' });
  }
  if (requestUserId !== userId) {
    return res.status(403).json({ success: false, message: '본인의 계정만 탈퇴할 수 있습니다' });
  }
  if (db.state !== 'connected') {
    return res.status(503).json({ success: false, message: '데이터베이스 연결을 확인해주세요' });
  }

  const connection = await portfolioDb.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM reviews WHERE reviewer_id = ? OR reviewee_id = ?', [userId, userId]);
    await connection.query('DELETE FROM user_activity_participations WHERE user_id = ?', [userId]);
    await connection.query('DELETE FROM users WHERE id = ?', [userId]);
    await connection.commit();
    logger.info('user_deleted', { userId });
    res.json({ success: true, message: '회원 탈퇴가 완료되었습니다' });
  } catch (error) {
    await connection.rollback();
    logger.error('user_delete_failed', { userId, error: error.message });
    res.status(500).json({ success: false, message: '탈퇴 처리 실패' });
  } finally {
    connection.release();
  }
});

// ===== 파일 업로드 API =====

const secureImageUpload = createSecureImageUpload(UPLOADS_DIR);
const requireUploadUser = (req, res, next) => {
  if (!getRequestUserId(req)) return res.status(401).json({ success: false, message: '로그인이 필요합니다' });
  next();
};
const requireSelfUpload = (parameterName) => (req, res, next) => {
  const requestUserId = getRequestUserId(req);
  if (!requestUserId || Number(requestUserId) !== Number(req.params[parameterName])) {
    return res.status(403).json({ success: false, message: '본인의 이미지만 업로드할 수 있습니다' });
  }
  next();
};

app.post('/api/upload', requireUploadUser, secureImageUpload, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false,
      message: '파일이 없습니다.' 
    });
  }

  const imageUrl = `http://localhost:3000/uploads/${req.file.filename}`;
  res.status(200).json({ 
    success: true,
    imageUrl 
  });
});

app.post('/api/upload/profile/:userId', requireSelfUpload('userId'), secureImageUpload, (req, res) => {
  const requestUserId = getRequestUserId(req);
  const { userId } = req.params;

  if (!requestUserId || Number(requestUserId) !== Number(userId)) {
    return res.status(403).json({ success: false, message: '본인 프로필만 변경할 수 있습니다' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: '이미지 파일이 없습니다' });
  }

  const imageUrl = `http://localhost:3000/uploads/${req.file.filename}`;
  db.query('UPDATE users SET profile_picture = ?, updated_at = NOW() WHERE id = ?', [imageUrl, userId], (err, result) => {
    if (err) {
      console.error('프로필 이미지 저장 오류:', err);
      return res.status(500).json({ success: false, message: '프로필 이미지 저장에 실패했습니다' });
    }
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다' });
    }
    res.status(201).json({ success: true, imageUrl });
  });
});

app.post('/users/:userId/past-activities/:portfolioId/images', requireSelfUpload('userId'), secureImageUpload, async (req, res) => {
  const userId = Number(req.params.userId);
  const portfolioId = Number(req.params.portfolioId);
  const requestUserId = getRequestUserId(req);
  if (requestUserId !== userId) {
    return res.status(403).json({ message: '본인의 미니포트폴리오에만 이미지를 추가할 수 있습니다' });
  }
  if (!req.file) return res.status(400).json({ message: '이미지 파일이 필요합니다' });

  const [rows] = await portfolioDb.query(
    'SELECT portfolio_id FROM miniportfolios WHERE portfolio_id = ? AND user_id = ?',
    [portfolioId, userId],
  );
  if (!rows.length) return res.status(404).json({ message: '미니포트폴리오를 찾을 수 없습니다' });
  res.status(201).json({ imageUrl: `/uploads/${req.file.filename}` });
});

app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  const [[countRows], [crawlerRuns], [crawlerErrors]] = await Promise.all([
    portfolioDb.query(`SELECT
      COUNT(*) AS total_activities,
      SUM(CASE WHEN COALESCE(main_image_url, '') = '' THEN 1 ELSE 0 END) AS missing_image_count,
      SUM(CASE WHEN is_hidden = 1 THEN 1 ELSE 0 END) AS hidden_count,
      (SELECT COUNT(*) FROM (
        SELECT LOWER(TRIM(title)) AS normalized_title
        FROM activitys
        WHERE COALESCE(title, '') <> '' AND COALESCE(source_name, '') <> 'local-demo'
        GROUP BY LOWER(TRIM(title))
        HAVING COUNT(*) > 1
      ) duplicates) AS duplicate_group_count
    FROM activitys
    WHERE COALESCE(source_name, '') <> 'local-demo'`),
    portfolioDb.query(`SELECT run_id, source_name, status, discovered_count, saved_count, error_count,
      started_at, finished_at FROM crawler_runs ORDER BY started_at DESC LIMIT 10`),
    portfolioDb.query(`SELECT error_id, run_id, source_name, source_item_id, source_url, stage,
      error_message, created_at FROM crawler_errors ORDER BY created_at DESC LIMIT 20`),
  ]);
  res.json({ counts: countRows[0] || {}, crawlerRuns, crawlerErrors, crawlerRunning: Boolean(crawlerScheduler?.isRunning()) });
});

app.post('/api/admin/curricula', requireAdmin, async (req, res) => {
  try {
    await curriculumSchemaReady;
    const curriculum = await createCurriculum(portfolioDb, getRequestUserId(req), req.body);
    res.status(201).json(curriculum);
  } catch (error) {
    logger.error('admin_curriculum_create_failed', {
      adminUserId: getRequestUserId(req),
      error: error.message,
    });
    res.status(error.statusCode || 500).json({ message: error.message || '커리큘럼을 등록하지 못했습니다' });
  }
});

app.get('/api/admin/activities', requireAdmin, async (req, res) => {
  const quality = String(req.query.quality || 'all');
  const search = String(req.query.search || '').trim();
  const conditions = [];
  const values = [];

  conditions.push("COALESCE(a.source_name, '') <> 'local-demo'");

  if (quality === 'missing_image') conditions.push("COALESCE(a.main_image_url, '') = ''");
  else if (quality === 'hidden') conditions.push('a.is_hidden = 1');
  else if (quality === 'duplicates') {
    conditions.push(`EXISTS (
      SELECT 1 FROM activitys other
      WHERE other.activity_id <> a.activity_id
        AND LOWER(TRIM(other.title)) = LOWER(TRIM(a.title))
    )`);
  }
  if (search) {
    conditions.push('(a.title LIKE ? OR a.organizer LIKE ? OR a.source_name LIKE ?)');
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const [rows] = await portfolioDb.query(
    `SELECT a.activity_id, a.title, a.organizer, a.category, a.topic_category, a.main_image_url,
      a.source_name, a.source_url, a.is_hidden, a.last_crawled_at, a.updated_at
     FROM activitys a
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY a.updated_at DESC, a.activity_id DESC
     LIMIT 100`,
    values,
  );
  res.json(rows);
});

app.put('/api/admin/activities/:activityId', requireAdmin, async (req, res) => {
  const activityId = Number(req.params.activityId);
  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ message: '올바른 활동 ID가 필요합니다' });
  }
  const fieldMap = {
    title: { column: 'title', maxLength: 255 },
    organizer: { column: 'organizer', maxLength: 255 },
    category: { column: 'category', maxLength: 100 },
    topic_category: { column: 'topic_category', maxLength: 100 },
    main_image_url: { column: 'main_image_url', maxLength: 1000 },
    details: { column: 'details', maxLength: 20_000 },
    is_hidden: { column: 'is_hidden' },
  };
  const updates = [];
  const values = [];
  for (const [inputKey, config] of Object.entries(fieldMap)) {
    if (req.body?.[inputKey] === undefined) continue;
    if (inputKey === 'is_hidden') {
      updates.push(`\`${config.column}\` = ?`);
      values.push(req.body[inputKey] ? 1 : 0);
      continue;
    }
    const value = String(req.body[inputKey] ?? '').trim();
    if (inputKey === 'title' && !value) {
      return res.status(400).json({ message: '활동명은 비워둘 수 없습니다' });
    }
    if (inputKey === 'main_image_url' && value && !/^https?:\/\//i.test(value)) {
      return res.status(400).json({ message: '포스터 URL은 http 또는 https 주소여야 합니다' });
    }
    updates.push(`\`${config.column}\` = ?`);
    values.push(value.slice(0, config.maxLength));
  }
  if (!updates.length) return res.status(400).json({ message: '수정할 항목이 없습니다' });
  values.push(activityId);
  const [result] = await portfolioDb.query(
    `UPDATE activitys SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE activity_id = ?`,
    values,
  );
  if (!result.affectedRows) return res.status(404).json({ message: '활동을 찾을 수 없습니다' });
  activityCache.clear();
  res.json({ success: true, activity_id: activityId });
});

app.post('/api/admin/crawler/run', requireAdmin, async (req, res) => {
  if (!crawlerScheduler) return res.status(503).json({ message: '크롤러가 준비되지 않았습니다' });
  if (crawlerScheduler.isRunning()) return res.status(409).json({ message: '이미 수집이 진행 중입니다' });
  crawlerScheduler.runNow().catch((error) => logger.error('manual_crawler_failed', { error: error.message }));
  res.status(202).json({ success: true, message: '공모전 수집을 시작했습니다' });
});

app.use((error, req, res, next) => {
  logger.error('unhandled_request_error', {
    requestId: res.getHeader('x-request-id'),
    method: req.method,
    path: req.originalUrl,
    error: error.message,
  });
  if (res.headersSent) return next(error);
  return res.status(500).json({
    message: '서버 오류가 발생했습니다',
    requestId: res.getHeader('x-request-id'),
  });
});

// 404 처리
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableRoutes: [
      'GET /',
      'GET /api/health',
      'GET /api/db-health',
      'POST /api/login (새로운 API - LoginScreen0 사용)',
      'POST /login (기존 호환성 API)',
      'POST /api/register (새로운 API)',
      'POST /register (기존 호환성 API - RegisterScreen 사용)',
      'GET /api/activities',
      'GET /api/activities/:id',
      'GET /api/user/:id',
      'PUT /api/user/:id (사용자 정보 업데이트)',
      'GET /api/participations/user/:userId (참여 활동 조회)',
      'POST /api/users/batch (배치 사용자 조회)',
      'GET /api/reviews/existing/:reviewerId/:revieweeId/:activityId (기존 평가 조회)',
      'POST /api/reviews (평가 저장/수정)',
      'GET /api/user/:id/evaluations (평가 통계 조회)',
      'GET /api/user/:id/activities (활동 이력 조회)',
      'DELETE /api/delete-user/:id (사용자 탈퇴)',
      'POST /api/upload'
    ]
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 끼리끼리 서버가 http://localhost:${PORT}에서 실행 중입니다`);
  console.log('');
  console.log('📋 사용 가능한 엔드포인트:');
  console.log('  🔍 GET  http://localhost:3000/api/health');
  console.log('  🔍 GET  http://localhost:3000/api/db-health');
  console.log('  🔐 POST http://localhost:3000/api/login (새로운 API - LoginScreen0)');
  console.log('  🔐 POST http://localhost:3000/login (기존 호환성 API)');
  console.log('  📝 POST http://localhost:3000/api/register (새로운 API)');
  console.log('  📝 POST http://localhost:3000/register (기존 호환성 - RegisterScreen)');
  console.log('  📋 GET  http://localhost:3000/api/activities');
  console.log('  📄 GET  http://localhost:3000/api/activities/:id');
  console.log('  👤 GET  http://localhost:3000/api/user/:id');
  console.log('  ✏️  PUT  http://localhost:3000/api/user/:id');
  console.log('  📊 GET  http://localhost:3000/api/participations/user/:userId');
  console.log('  👥 POST http://localhost:3000/api/users/batch');
  console.log('  🔍 GET  http://localhost:3000/api/reviews/existing/:reviewerId/:revieweeId/:activityId');
  console.log('  ⭐ POST http://localhost:3000/api/reviews');
  console.log('  📈 GET  http://localhost:3000/api/user/:id/evaluations');
  console.log('  📚 GET  http://localhost:3000/api/user/:id/activities');
  console.log('  🗑️  DELETE http://localhost:3000/api/delete-user/:id');
  console.log('  📁 POST http://localhost:3000/api/upload');
  console.log('');
  console.log('✅ 서버 설정 완료!');
});

console.log('서버 준비 중...');
