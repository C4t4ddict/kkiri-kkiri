console.log('끼리끼리 서버 시작...');

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (error) {
  // dotenv는 개발 편의용입니다. 설치되어 있지 않으면 환경변수만 사용합니다.
}

const { attachAuth, getAuthenticatedUserId, issueAuthToken } = require('./lib/auth');
const { getRequestMetrics, logger, requestLogger } = require('./lib/logger');
const { createTtlCache } = require('./lib/ttlCache');
const {
  archiveExpiredTeams,
  archiveTeam,
  ensurePortfolioSchema,
  getMiniPortfolio,
  listPastActivities,
} = require('./portfolio/service');
const { createMiniPortfolioPdf } = require('./portfolio/pdf');
const { startCrawlerScheduler } = require('./crawler/scheduler');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BCRYPT_SALT_ROUNDS = 10;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const FALLBACK_UPLOAD_IMAGES = ['info1.png', 'info2.png', 'info3.png', 'info4.png', 'info5.png'];

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

const getActivityImageUrl = (url, activityId) => {
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

  const fallbackIndex = Math.abs((Number(activityId) || 1) - 1) % FALLBACK_UPLOAD_IMAGES.length;
  return `http://10.0.2.2:3000/uploads/${FALLBACK_UPLOAD_IMAGES[fallbackIndex]}`;
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
    main_image_url: getActivityImageUrl(activity.main_image_url, activity.activity_id)
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
});

// Middleware 설정
app.use(cors());
app.use(bodyParser.json());
app.use(attachAuth);
app.use(requestLogger);

const privateApiPattern = /^(?:\/api\/(?:user(?:\/|$)|delete-user(?:\/|$)|upload(?:\/|$)|favorite-activities(?:\/|$)|my-(?:recruitments|applications)(?:\/|$)|applications(?:\/|$)|reviews(?:\/|$)|participations(?:\/|$)|team-join-offers(?:\/|$))|\/(?:users|teams|todos|notifications)(?:\/|$))/;
app.use((req, res, next) => {
  if (!privateApiPattern.test(req.path)) return next();
  if (!getRequestUserId(req)) return res.status(401).json({ message: '로그인이 필요합니다' });
  next();
});

// uploads 폴더를 정적으로 서빙
app.use('/uploads', express.static(UPLOADS_DIR));

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

const queuePortfolioJob = (job) => {
  const result = portfolioQueue.then(job, job);
  portfolioQueue = result.catch(() => undefined);
  return result;
};

const runArchiveMaintenance = () =>
  queuePortfolioJob(() => archiveExpiredTeams(portfolioDb));

const runTeamArchive = (teamId, reason) =>
  queuePortfolioJob(() => archiveTeam(portfolioDb, teamId, reason));

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
      team_id INT NOT NULL,
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

const ensureTodoCompletionColumn = () => {
  db.query('SHOW COLUMNS FROM todos LIKE \'completed_at\'', (columnErr, columns) => {
    if (columnErr || columns?.length) return;
    db.query('ALTER TABLE todos ADD COLUMN completed_at DATETIME NULL', (alterErr) => {
      if (alterErr) console.error('투두 완료 시각 컬럼 준비 오류:', alterErr);
    });
  });
};

const ensureRecruitmentActivityColumns = async () => {
  const requiredColumns = [
    ['activity_id', 'INT NULL AFTER team_id'],
    ['activity_start_date', 'DATE NULL AFTER required_members'],
    ['activity_end_date', 'DATE NULL AFTER activity_start_date'],
    ['deleted_at', 'DATETIME NULL AFTER created_at'],
  ];

  const [columns] = await portfolioDb.query('SHOW COLUMNS FROM team_recruitments');
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const [columnName, definition] of requiredColumns) {
    if (!existingColumns.has(columnName)) {
      await portfolioDb.query(`ALTER TABLE team_recruitments ADD COLUMN \`${columnName}\` ${definition}`);
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
    team_id INT NOT NULL,
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

  const [notificationIndexes] = await portfolioDb.query(
    "SHOW INDEX FROM user_notifications WHERE Key_name = 'idx_user_notifications_user_read'"
  );
  if (!notificationIndexes.length) {
    await portfolioDb.query(
      'ALTER TABLE user_notifications ADD INDEX idx_user_notifications_user_read (user_id, is_read)'
    );
  }
};

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
    console.log('MySQL 없이 서버 계속 실행...');
  } else {
    connection.release();
    db.state = 'connected';
    console.log('✅ MySQL 연결 성공!');
    ensureActivityTables();
    ensureTodoCompletionColumn();
    startCrawlerScheduler();
    matchingSchemaReady = ensureRecruitmentActivityColumns()
      .then(() => ensureMatchingInvitationSchema());
    matchingSchemaReady
      .then(() => ensurePortfolioSchema(portfolioDb))
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
  runArchiveMaintenance().catch((error) => console.error('지난 활동 정기 아카이브 오류:', error));
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
app.get('/api/db-health', (req, res) => {
  if (db.state !== 'connected') {
    return res.status(500).json({
      status: 'error',
      message: 'Database not connected'
    });
  }

  db.query('SELECT 1 as test', (err, results) => {
    if (err) {
      res.status(500).json({
        status: 'error',
        message: 'Database query failed',
        requestId: res.getHeader('x-request-id')
      });
    } else {
      res.json({
        status: 'ok',
        message: 'Database connected successfully',
        timestamp: new Date().toISOString()
      });
    }
  });
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
      self_intro
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
      self_intro
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

// 새로운 회원가입 API
app.post('/api/register', (req, res) => {
  const { email, password, name, department, student_number, birth_date } = req.body;

  // 필수값 확인
  if (!email || !password || !name) {
    return res.status(400).json({
      success: false,
      message: '필수 항목이 누락되었습니다.'
    });
  }

  // 더미 응답 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 회원가입 처리 (MySQL 미연결)');
    return res.status(201).json({
      success: true,
      message: '회원가입 성공'
    });
  }

  // 실제 DB 쿼리
  const sql = `INSERT INTO users (email, password, name, department, student_number, birth)
               VALUES (?, ?, ?, ?, ?, ?)`;

  const values = [email, hashPassword(password), name, department, student_number, birth_date];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('회원가입 오류:', err);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          success: false,
          message: '이미 존재하는 이메일입니다.'
        });
      }
      return res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
    
    console.log('회원가입 성공:', email);
    return res.status(201).json({
      success: true,
      message: '회원가입 성공'
    });
  });
});

// 기존 회원가입 API 호환성 (RegisterScreen에서 사용)
app.post('/register', (req, res) => {
  console.log('기존 회원가입 API 호출 - /register 라우트');
  
  const { email, password, name, department, studentId, birth } = req.body;

  // 필수값 확인
  if (!email || !password || !name) {
    return res.status(400).json({
      success: false,
      message: '모든 필수 항목을 입력해주세요.'
    });
  }

  // 더미 응답 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 회원가입 처리 (MySQL 미연결) - 기존 API');
    return res.status(200).json({
      success: true,
      message: '회원가입 성공'
    });
  }

  // 실제 DB 쿼리
  const sql = `INSERT INTO users (email, password, name, department, student_number, birth)
               VALUES (?, ?, ?, ?, ?, ?)`;

  const values = [email, hashPassword(password), name, department, studentId, birth];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('회원가입 오류:', err);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          success: false,
          message: '이미 존재하는 이메일입니다.'
        });
      }
      return res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
    
    console.log('회원가입 성공:', email);
    return res.status(200).json({
      success: true,
      message: '회원가입 성공'
    });
  });
});

// ===== 활동 관련 API =====

// 활동 목록 조회 API
app.get('/api/activities', (req, res) => {
  const pagination = parsePagination(req.query);
  // 더미 데이터 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 활동 데이터 반환 (MySQL 미연결)');
    const dummyActivities = [
      {
        activity_id: 1,
        title: '2024 프로그래밍 대회',
        category: '공모전',
        main_image_url: 'https://picsum.photos/300/200?random=1',
        application_period_end: '2024-12-31',
        created_at: '2024-01-01'
      },
      {
        activity_id: 2,
        title: 'AI 세미나',
        category: '세미나',
        main_image_url: 'https://picsum.photos/300/200?random=2',
        application_period_end: '2024-11-30',
        created_at: '2024-01-02'
      },
      {
        activity_id: 3,
        title: '웹 개발 워크숍',
        category: '워크숍',
        main_image_url: 'https://picsum.photos/300/200?random=3',
        application_period_end: '2024-10-15',
        created_at: '2024-01-03'
      },
      {
        activity_id: 4,
        title: '영어 튜터링',
        category: '튜터링',
        main_image_url: 'https://picsum.photos/300/200?random=4',
        application_period_end: '2024-09-30',
        created_at: '2024-01-04'
      }
    ];
    
    return res.status(200).json(dummyActivities);
  }

  const cached = activityCache.get('activities:all');
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
      GROUP BY activity_id
    ) rc ON rc.activity_id = a.activity_id
    ORDER BY a.created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('활동 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    const activities = results || [];
    activityCache.set('activities:all', activities);
    sendActivityList(res, activities, pagination);
  });
});

app.get('/api/activities/open', (req, res) => {
  if (!db || db.state === 'disconnected') {
    return res.json([]);
  }

  const pagination = parsePagination(req.query);
  const cached = activityCache.get('activities:open');
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
      GROUP BY activity_id
    ) rc ON rc.activity_id = a.activity_id
    WHERE (a.application_period_start IS NULL OR a.application_period_start <= NOW())
      AND (a.application_period_end IS NULL OR a.application_period_end >= CURDATE())
    ORDER BY a.application_period_end ASC, a.created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('모집 중 활동 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    const activities = results || [];
    activityCache.set('activities:open', activities);
    sendActivityList(res, activities, pagination);
  });
});

// 활동 상세 조회 API
app.get('/api/activities/:id', (req, res) => {
  const activityId = req.params.id;

  // 더미 데이터 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log(`더미 활동 상세 데이터 반환: ID ${activityId} (MySQL 미연결)`);
    const dummyActivity = {
      activity_id: parseInt(activityId),
      title: `활동 ${activityId}`,
      category: '공모전',
      description: '이것은 테스트용 활동입니다.',
      main_image_url: `https://picsum.photos/300/200?random=${activityId}`,
      application_period_end: '2024-12-31',
      created_at: '2024-01-01'
    };
    
    return res.status(200).json(dummyActivity);
  }

  // 실제 DB 쿼리
  const sql = `
    SELECT
      a.*,
      (
        SELECT COUNT(*)
        FROM team_recruitments tr
        WHERE tr.activity_id = a.activity_id AND tr.status = 'OPEN' AND tr.deleted_at IS NULL
      ) AS open_recruitment_count
    FROM activitys a
    WHERE a.activity_id = ?
  `;
  db.query(sql, [activityId], (err, results) => {
    if (err) {
      console.error('활동 상세 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: '활동을 찾을 수 없습니다.' });
    }

    res.status(200).json(normalizeActivity(results[0]));
  });
});

app.get('/api/activities/:id/recruitments', (req, res) => {
  const activityId = Number(req.params.id);

  if (!Number.isInteger(activityId) || activityId <= 0) {
    return res.status(400).json({ message: '올바른 활동 ID가 필요합니다' });
  }

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
      memo,
      status,
      created_at
    FROM team_recruitments
    WHERE activity_id = ? AND status = 'OPEN' AND deleted_at IS NULL
    ORDER BY created_at DESC, recruitment_id DESC
  `;

  db.query(sql, [activityId], (err, results) => {
    if (err) {
      console.error('활동별 모집글 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    res.json(results || []);
  });
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
    WHERE ufa.user_id = ?
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

app.get('/api/team-recruitments', (req, res) => {
  if (!db || db.state === 'disconnected') {
    return res.json([]);
  }

  const sql = `
    SELECT
      recruitment_id,
      owner_user_id,
      tr.team_id,
      tr.activity_id,
      tr.post_name,
      COALESCE(a.title, tr.activity_name) AS activity_name,
      tr.activity_type,
      qualification_department,
      qualification_student_number,
      qualification_age,
      tr.required_members,
      DATE_FORMAT(tr.activity_start_date, '%Y-%m-%d') AS activity_start_date,
      DATE_FORMAT(tr.activity_end_date, '%Y-%m-%d') AS activity_end_date,
      tr.activity_period,
      tr.meeting_type,
      tr.memo,
      tr.status,
      tr.created_at
    FROM team_recruitments tr
    LEFT JOIN activitys a ON a.activity_id = tr.activity_id
    WHERE tr.status = 'OPEN' AND tr.deleted_at IS NULL
    ORDER BY tr.created_at DESC, tr.recruitment_id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('팀 모집글 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    res.json(results || []);
  });
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

  try {
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
        memo,
        status
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, 'OPEN')`,
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
        memo,
      ]
    );

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

  try {
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
        memo,
        recruitmentId,
        ownerUserId,
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: '모집글을 찾을 수 없습니다' });
    }
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
      res.json({ success: true, recruitment_id: recruitmentId });
    }
  );
});

app.get('/api/team-recruitments/:id', (req, res) => {
  const recruitmentId = Number(req.params.id);

  if (!Number.isInteger(recruitmentId) || recruitmentId <= 0) {
    return res.status(400).json({ message: '올바른 모집글 ID가 필요합니다' });
  }

  const sql = `
    SELECT
      tr.*,
      COALESCE(a.title, tr.activity_name) AS activity_name,
      a.category AS activity_category,
      a.topic_category AS activity_topic_category,
      a.organizer AS activity_organizer,
      DATE_FORMAT(a.application_period_end, '%Y-%m-%d') AS activity_application_period_end,
      DATE_FORMAT(tr.activity_start_date, '%Y-%m-%d') AS activity_start_date,
      DATE_FORMAT(tr.activity_end_date, '%Y-%m-%d') AS activity_end_date
    FROM team_recruitments tr
    LEFT JOIN activitys a ON a.activity_id = tr.activity_id
    WHERE tr.recruitment_id = ? AND tr.deleted_at IS NULL
  `;

  db.query(sql, [recruitmentId], (err, results) => {
    if (err) {
      console.error('팀 모집글 상세 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }
    if (!results.length) {
      return res.status(404).json({ message: '모집글을 찾을 수 없습니다' });
    }
    res.json(results[0]);
  });
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

app.post('/api/applications', (req, res) => {
  const recruitmentId = Number(req.body?.recruitment_id);
  const applicantId = getRequestUserId(req);
  const memo = String(req.body?.memo || '').trim();

  if (!applicantId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }
  if (!Number.isInteger(recruitmentId) || recruitmentId <= 0) {
    return res.status(400).json({ message: '올바른 모집글 ID가 필요합니다' });
  }

  const sql = `
    INSERT INTO applications (recruitment_id, applicant_id, memo, status)
    SELECT ?, ?, ?, 'PENDING'
    WHERE EXISTS (
      SELECT 1 FROM team_recruitments
      WHERE recruitment_id = ? AND status = 'OPEN' AND deleted_at IS NULL AND owner_user_id <> ?
    )
      AND NOT EXISTS (
        SELECT 1 FROM applications
        WHERE recruitment_id = ? AND applicant_id = ? AND status IN ('PENDING', 'APPROVED')
      )
  `;

  db.query(
    sql,
    [recruitmentId, applicantId, memo, recruitmentId, applicantId, recruitmentId, applicantId],
    (err, result) => {
      if (err) {
        console.error('팀 지원 등록 오류:', err);
        return res.status(500).json({ message: '서버 오류' });
      }
      if (!result.affectedRows) {
        return res.status(409).json({ message: '지원할 수 없거나 이미 지원한 모집글입니다' });
      }
      res.status(201).json({ success: true, application_id: result.insertId });
    }
  );
});

app.post('/api/team-recruitments/:recruitmentId/applications/:applicationId/invite', async (req, res) => {
  const recruitmentId = Number(req.params.recruitmentId);
  const applicationId = Number(req.params.applicationId);
  const ownerUserId = getRequestUserId(req);

  if (!ownerUserId) return res.status(401).json({ message: '로그인이 필요합니다' });
  if (!Number.isInteger(recruitmentId) || !Number.isInteger(applicationId)) {
    return res.status(400).json({ message: '모집글과 지원 정보가 올바르지 않습니다' });
  }

  try {
    await matchingSchemaReady;
    await portfolioDb.beginTransaction();

    const [applications] = await portfolioDb.query(
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
      await portfolioDb.rollback();
      return res.status(404).json({ message: '지원 정보를 찾을 수 없습니다' });
    }
    if (Number(application.owner_user_id) !== ownerUserId) {
      await portfolioDb.rollback();
      return res.status(403).json({ message: '모집글 작성자만 합류 제안을 보낼 수 있습니다' });
    }
    if (application.recruitment_status !== 'OPEN') {
      await portfolioDb.rollback();
      return res.status(409).json({ message: '모집 중인 글에만 합류 제안을 보낼 수 있습니다' });
    }
    if (application.application_status !== 'PENDING') {
      await portfolioDb.rollback();
      return res.status(409).json({ message: '검토 중인 지원에만 합류 제안을 보낼 수 있습니다' });
    }
    if (application.offer_id) {
      await portfolioDb.rollback();
      return res.status(409).json({
        message: application.offer_status === 'PENDING' ? '이미 합류 제안을 보냈습니다' : '처리된 합류 제안입니다',
      });
    }

    const teamId = await ensureRecruitmentTeam(portfolioDb, application);
    const [offerResult] = await portfolioDb.query(
      `INSERT INTO team_join_offers
        (application_id, recruitment_id, team_id, inviter_id, invitee_id, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [applicationId, recruitmentId, teamId, ownerUserId, application.applicant_id],
    );
    await portfolioDb.query(
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

    await portfolioDb.commit();
    res.status(201).json({ success: true, offer_id: offerResult.insertId, team_id: teamId });
  } catch (error) {
    await portfolioDb.rollback().catch(() => undefined);
    console.error('팀 합류 제안 생성 오류:', error);
    res.status(500).json({ message: '팀 합류 제안을 보내지 못했습니다' });
  }
});

app.put('/api/applications/:id/status', (req, res) => {
  const applicationId = Number(req.params.id);
  const ownerUserId = getRequestUserId(req);
  const status = String(req.body?.status || '');

  if (!ownerUserId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }
  if (status !== 'REJECTED') {
    return res.status(400).json({ message: '올바른 지원 상태가 필요합니다' });
  }

  const sql = `
    UPDATE applications a
    JOIN team_recruitments tr ON tr.recruitment_id = a.recruitment_id
    SET a.status = ?
    WHERE a.application_id = ? AND tr.owner_user_id = ? AND tr.deleted_at IS NULL
  `;
  db.query(sql, [status, applicationId, ownerUserId], (err, result) => {
    if (err) {
      console.error('지원 상태 변경 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }
    if (!result.affectedRows) {
      return res.status(403).json({ message: '모집글 작성자만 지원 상태를 변경할 수 있습니다' });
    }
    res.json({ success: true, status });
  });
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
      offer.status AS offer_status
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

app.put('/api/applications/:id/cancel', (req, res) => {
  const applicationId = Number(req.params.id);
  const applicantId = getRequestUserId(req);

  if (!applicantId) {
    return res.status(401).json({ message: '로그인이 필요합니다' });
  }
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return res.status(400).json({ message: '올바른 지원 ID가 필요합니다' });
  }

  db.query(
    `UPDATE applications ap
     JOIN team_recruitments tr ON tr.recruitment_id = ap.recruitment_id
     SET ap.status = 'CANCELED'
     WHERE ap.application_id = ?
       AND ap.applicant_id = ?
       AND ap.status IN ('PENDING', 'APPROVED')
       AND tr.deleted_at IS NULL`,
    [applicationId, applicantId],
    (err, result) => {
      if (err) {
        console.error('지원 취소 오류:', err);
        return res.status(500).json({ message: '서버 오류' });
      }
      if (!result.affectedRows) {
        return res.status(409).json({ message: '취소할 수 있는 지원 내역이 없습니다' });
      }
      db.query(
        `UPDATE team_join_offers offer
         JOIN applications ap ON ap.application_id = offer.application_id
         SET offer.status = 'CANCELED', offer.responded_at = NOW()
         WHERE ap.application_id = ?
           AND ap.applicant_id = ?
           AND offer.status = 'PENDING'`,
        [applicationId, applicantId],
        (offerErr) => {
          if (offerErr) console.error('지원 취소 합류 제안 정리 오류:', offerErr);
          res.json({ success: true, status: 'CANCELED' });
        },
      );
    }
  );
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

  try {
    await matchingSchemaReady;
    await portfolioDb.beginTransaction();

    const [offers] = await portfolioDb.query(
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
      await portfolioDb.rollback();
      return res.status(404).json({ message: '합류 제안을 찾을 수 없습니다' });
    }
    if (Number(offer.invitee_id) !== userId) {
      await portfolioDb.rollback();
      return res.status(403).json({ message: '본인에게 온 합류 제안만 처리할 수 있습니다' });
    }
    if (offer.offer_status !== 'PENDING' || offer.application_status !== 'PENDING') {
      await portfolioDb.rollback();
      return res.status(409).json({ message: '이미 처리된 합류 제안입니다' });
    }
    if (offer.recruitment_status !== 'OPEN') {
      await portfolioDb.rollback();
      return res.status(409).json({ message: '마감된 모집글에는 합류할 수 없습니다' });
    }

    if (decision === 'ACCEPTED') {
      await portfolioDb.query(
        `INSERT INTO team_members (team_id, user_id, role, part)
         VALUES (?, ?, 'MEMBER', NULL)
         ON DUPLICATE KEY UPDATE role = role`,
        [offer.team_id, userId],
      );
    }

    await portfolioDb.query(
      `UPDATE team_join_offers
       SET status = ?, responded_at = NOW()
       WHERE offer_id = ?`,
      [decision, offerId],
    );
    await portfolioDb.query(
      'UPDATE applications SET status = ? WHERE application_id = ?',
      [decision === 'ACCEPTED' ? 'APPROVED' : 'REJECTED', offer.application_id],
    );
    await portfolioDb.query(
      'UPDATE user_notifications SET is_read = 1 WHERE offer_id = ?',
      [offerId],
    );

    await portfolioDb.commit();
    res.json({ success: true, status: decision, team_id: offer.team_id });
  } catch (error) {
    await portfolioDb.rollback().catch(() => undefined);
    console.error('팀 합류 제안 처리 오류:', error);
    res.status(500).json({ message: '팀 합류 제안을 처리하지 못했습니다' });
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
    SELECT t.team_id, t.team_name, tm.part, t.leader_user_id, t.due_date, t.activity_status
    FROM team_members tm
    JOIN teams t ON t.team_id = tm.team_id
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
  if (!userId) return res.status(400).json({ message: '사용자 정보가 올바르지 않습니다' });

  try {
    await runArchiveMaintenance();
    const portfolios = await listPastActivities(portfolioDb, userId);
    res.json(portfolios);
  } catch (error) {
    console.error('지난 활동 목록 조회 오류:', error);
    res.status(500).json({ message: '지난 활동을 불러오지 못했습니다' });
  }
});

app.get('/users/:userId/past-activities/:portfolioId', async (req, res) => {
  const userId = Number(req.params.userId);
  const portfolioId = Number(req.params.portfolioId);
  if (!userId || !portfolioId) return res.status(400).json({ message: '요청 정보가 올바르지 않습니다' });

  try {
    const portfolio = await getMiniPortfolio(portfolioDb, userId, portfolioId);
    if (!portfolio) return res.status(404).json({ message: '미니포트폴리오를 찾을 수 없습니다' });
    res.json(portfolio);
  } catch (error) {
    console.error('미니포트폴리오 조회 오류:', error);
    res.status(500).json({ message: '미니포트폴리오를 불러오지 못했습니다' });
  }
});

app.get('/users/:userId/past-activities/:portfolioId/pdf', async (req, res) => {
  const userId = Number(req.params.userId);
  const portfolioId = Number(req.params.portfolioId);
  if (!userId || !portfolioId) return res.status(400).json({ message: '요청 정보가 올바르지 않습니다' });

  try {
    const portfolio = await getMiniPortfolio(portfolioDb, userId, portfolioId);
    if (!portfolio) return res.status(404).json({ message: '미니포트폴리오를 찾을 수 없습니다' });

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
      tm.part
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

    res.json(results || []);
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

app.get('/teams/:teamId/heatmap', (req, res) => {
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
    FROM todos
    WHERE team_id = ?
      AND status = '완료'
      AND COALESCE(completed_at, updated_at) >= ?
      AND COALESCE(completed_at, updated_at) < ?
    GROUP BY DATE(COALESCE(completed_at, updated_at))
    ORDER BY activity_date ASC
  `;

  db.query(sql, [teamId, monthStartKey, nextMonthStartKey], (err, results) => {
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
      self_intro: '안녕하세요!'
    });
    
    return res.json({
      success: true,
      user: dummyUser
    });
  }
  
  // 실제 DB 쿼리
  const userQuery = 'SELECT id AS user_id, email, name, department, student_number, birth AS birth_date, profile_picture, self_intro FROM users WHERE id = ?';
  
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

// 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

app.post('/api/upload', upload.single('image'), (req, res) => {
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

app.post('/api/upload/profile/:userId', upload.single('image'), (req, res) => {
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
