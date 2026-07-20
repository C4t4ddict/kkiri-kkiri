console.log('끼리끼리 서버 시작...');

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const {
  archiveExpiredTeams,
  archiveTeam,
  ensurePortfolioSchema,
  getMiniPortfolio,
  listPastActivities,
} = require('./portfolio/service');
const { createMiniPortfolioPdf } = require('./portfolio/pdf');
const { startCrawlerScheduler } = require('./crawler/scheduler');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (error) {
  // dotenv는 개발 편의용입니다. 설치되어 있지 않으면 환경변수만 사용합니다.
}

const app = express();
const PORT = 3000;
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

const getRequestUserId = (req) => Number(req.get('x-user-id') || req.body?.user_id || req.query?.user_id);

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

// 요청 로깅
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// uploads 폴더를 정적으로 서빙
app.use('/uploads', express.static(UPLOADS_DIR));

// MySQL 연결 설정
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'myappdb', // 범수 프로젝트 DB
  port: Number(process.env.DB_PORT || 3306)
});
const portfolioDb = db.promise();
let portfolioQueue = Promise.resolve();

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

// 데이터베이스 연결 테스트
db.connect((err) => {
  if (err) {
    console.error('❌ MySQL 연결 실패:', err.message);
    console.log('MySQL 없이 서버 계속 실행...');
  } else {
    console.log('✅ MySQL 연결 성공!');
    ensureActivityTables();
    ensureTodoCompletionColumn();
    startCrawlerScheduler();
    ensurePortfolioSchema(portfolioDb)
      .then(() => runArchiveMaintenance())
      .then((archived) => {
        if (archived.length) {
          console.log(`✅ 지난 활동 자동 아카이브 ${archived.length}개 팀 완료`);
        }
      })
      .catch((portfolioError) => console.error('미니포트폴리오 초기화 오류:', portfolioError));
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
    timestamp: new Date().toISOString()
  });
});

// 데이터베이스 연결 상태 확인
app.get('/api/db-health', (req, res) => {
  if (!db || db.state === 'disconnected') {
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
        error: err.message
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

// ===== 인증 관련 API =====

// 새로운 로그인 API (LoginScreen0에서 사용)
app.post('/api/login', (req, res) => {
  console.log('새로운 로그인 API 요청:', req.body);
  
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
        user: dummyUser
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

    console.log('로그인 성공:', user.email);
    res.json({
      success: true,
      message: '로그인 성공',
      user: toClientUser(user)
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
        user: dummyUser
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

    console.log('로그인 성공:', user.email);
    res.json({
      success: true,
      message: '로그인 성공',
      user: toClientUser(user)
    });
  });
});

// 새로운 회원가입 API
app.post('/api/register', (req, res) => {
  console.log('새로운 회원가입 API 요청:', req.body);
  
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

  // 실제 DB 쿼리
  const sql = 'SELECT * FROM activitys ORDER BY created_at DESC';

  db.query(sql, (err, results) => {
    if (err) {
      console.error('활동 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    res.status(200).json((results || []).map(normalizeActivity));
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
  const sql = 'SELECT * FROM activitys WHERE activity_id = ?';
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

// ===== 매칭/활동 탭 API =====

app.get('/api/team-recruitments', (req, res) => {
  if (!db || db.state === 'disconnected') {
    return res.json([]);
  }

  const sql = `
    SELECT
      recruitment_id,
      owner_user_id,
      team_id,
      post_name,
      activity_name,
      activity_type,
      qualification_department,
      qualification_student_number,
      qualification_age,
      required_members,
      activity_period,
      meeting_type,
      memo,
      status,
      created_at
    FROM team_recruitments
    ORDER BY created_at DESC, recruitment_id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('팀 모집글 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    res.json(results || []);
  });
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

app.get('/notifications', (req, res) => {
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });
  db.query(
    `SELECT notification_id, team_id, notice_id, type, title, content, is_read, created_at
     FROM user_notifications WHERE user_id = ?
     ORDER BY created_at DESC, notification_id DESC LIMIT 100`,
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.json(rows || []);
    }
  );
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

// ===== 사용자 관련 API =====

// 사용자 정보 조회 API
app.get('/api/user/:id', (req, res) => {
  const userId = req.params.id;
  
  console.log(`사용자 정보 조회 요청: 사용자 ID ${userId}`);
  
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
    console.log('조회된 사용자 정보:', userData);
    
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
  
  console.log(`사용자 참여 활동 조회: 사용자 ID ${userId}`);
  
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
  
  console.log('배치 사용자 정보 조회:', user_ids);
  
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
  
  console.log('평가 저장/수정 요청:', req.body);
  
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
  
  console.log(`사용자 평가 통계 조회: 사용자 ID ${userId}`);
  
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
  
  console.log(`사용자 활동 이력 조회: 사용자 ID ${userId}`);
  
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
  const userId = req.params.id;
  const updateData = req.body;
  
  console.log(`사용자 정보 업데이트: 사용자 ID ${userId}`, updateData);
  
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

// 사용자 탈퇴 (Setting에서 사용)
app.delete('/api/delete-user/:id', (req, res) => {
  const userId = req.params.id;
  
  console.log(`사용자 탈퇴 요청: 사용자 ID ${userId}`);
  
  // 더미 응답 (DB 연결 전)
  if (!db || db.state === 'disconnected') {
    console.log('더미 사용자 탈퇴 (MySQL 미연결)');
    return res.json({
      success: true,
      message: '회원 탈퇴가 완료되었습니다'
    });
  }

  // 실제 DB 쿼리 - 관련된 모든 데이터 삭제
  db.beginTransaction((err) => {
    if (err) {
      console.error('트랜잭션 시작 에러:', err);
      return res.status(500).json({
        success: false,
        message: '탈퇴 처리 실패'
      });
    }

    // 1. 리뷰 삭제 (평가자, 피평가자 모두)
    db.query('DELETE FROM reviews WHERE reviewer_id = ? OR reviewee_id = ?', [userId, userId], (err) => {
      if (err) {
        return db.rollback(() => {
          console.error('리뷰 삭제 에러:', err);
          res.status(500).json({
            success: false,
            message: '탈퇴 처리 실패'
          });
        });
      }

      // 2. 참여 정보 삭제
      db.query('DELETE FROM user_activity_participations WHERE user_id = ?', [userId], (err) => {
        if (err) {
          return db.rollback(() => {
            console.error('참여 정보 삭제 에러:', err);
            res.status(500).json({
              success: false,
              message: '탈퇴 처리 실패'
            });
          });
        }

        // 3. 사용자 정보 삭제
        db.query('DELETE FROM users WHERE id = ?', [userId], (err) => {
          if (err) {
            return db.rollback(() => {
              console.error('사용자 삭제 에러:', err);
              res.status(500).json({
                success: false,
                message: '탈퇴 처리 실패'
              });
            });
          }

          // 트랜잭션 커밋
          db.commit((err) => {
            if (err) {
              return db.rollback(() => {
                console.error('트랜잭션 커밋 에러:', err);
                res.status(500).json({
                  success: false,
                  message: '탈퇴 처리 실패'
                });
              });
            }

            console.log(`사용자 ${userId} 탈퇴 완료`);
            res.json({
              success: true,
              message: '회원 탈퇴가 완료되었습니다'
            });
          });
        });
      });
    });
  });
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
  console.log('🧪 테스트용 계정:');
  console.log('  📧 이메일: test@test.com');
  console.log('  🔑 비밀번호: test123');
  console.log('');
  console.log('✅ 서버 설정 완료!');
});

console.log('서버 준비 중...');
