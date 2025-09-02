const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware 설정
app.use(cors());
app.use(bodyParser.json());

const path = require('path');

// uploads 폴더를 정적으로 서빙
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MySQL 연결 설정
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',       // MySQL 사용자명
  password: 'hoya0613', // MySQL 비밀번호
  database: 'myappdb',     // 사용할 DB명
});

// DB 연결 확인
db.connect((err) => {
  if (err) {
    console.error('⚠ MySQL 연결 실패:', err);
    return;
  }
  console.log('✅ MySQL 연결 성공');
});

// 회원가입 API
app.post('/register', (req, res) => {
  const { email, password, name, department, student_number, birth } = req.body;

  // 필수값 확인
  if (!email || !password || !name) {
    return res.status(400).json({ message: '필수 항목이 누락되었습니다.' });
  }

  const sql = `INSERT INTO users (email, password, name, department, student_number, birth)
               VALUES (?, ?, ?, ?, ?, ?)`;

  const values = [email, password, name, department, student_number, birth];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('회원가입 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }
    return res.status(201).json({ message: '회원가입 성공' });
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
});

// 로그인 API
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: '이메일과 비밀번호를 입력해주세요.' });
  }

  const sql = `SELECT * FROM users WHERE email = ? AND password = ?`;
  db.query(sql, [email, password], (err, results) => {
    if (err) {
      console.error('로그인 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: '이메일 또는 비밀번호가 일치하지 않습니다.' });
    }

    const user = results[0];
    return res.status(200).json({
      message: '로그인 성공',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        studentId: user.student_number, // 데이터베이스 student_number를 studentId로 반환
        birth: user.birth,
      }
    });
  });
});

// 활동 목록 조회 API
app.get('/api/activities', (req, res) => {
  const sql = 'SELECT * FROM activitys ORDER BY created_at DESC';

  db.query(sql, (err, results) => {
    if (err) {
      console.error('활동 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    res.status(200).json(results);
  });
});

// 활동 상세 조회 API
app.get('/api/activities/:id', (req, res) => {
  const activityId = req.params.id;

  const sql = 'SELECT * FROM activitys WHERE activity_id = ?';
  db.query(sql, [activityId], (err, results) => {
    if (err) {
      console.error('활동 상세 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: '활동을 찾을 수 없습니다.' });
    }

    res.status(200).json({ success: true, activity: results[0] });
  });
});

// 이미지 업로드
const multer = require('multer');

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage });

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: '파일이 없습니다.' });

  const imageUrl = `http://localhost:3000/uploads/${req.file.filename}`;
  res.status(200).json({ imageUrl });
});

// 헬스 체크 API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/db-health', (req, res) => {
  if (!db || db.state === 'disconnected') {
    return res.status(500).json({ status: 'error', message: 'Database not connected' });
  }

  db.query('SELECT 1 as test', (err, results) => {
    if (err) {
      return res.status(500).json({ status: 'error', message: 'Query failed', error: err.message });
    } else {
      res.json({ status: 'ok', message: 'Database connected', timestamp: new Date().toISOString() });
    }
  });
});

// 사용자 정보 조회 API
app.get('/api/user/:id', (req, res) => {
  const userId = req.params.id;
  const sql = 'SELECT id, email, name, department, student_number, birth, profile_picture FROM users WHERE id = ?';

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('사용자 조회 오류:', err);
      return res.status(500).json({ success: false, message: '서버 오류' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다' });
    }

    const userData = { ...results[0] };
    if (userData.birth instanceof Date) {
      userData.birth = userData.birth.toISOString().split('T')[0];
    }
    
    // 클라이언트가 기대하는 필드명으로 변환
    userData.studentId = userData.student_number;
    delete userData.student_number;

    res.json({ success: true, user: userData });
  });
});

// 사용자 정보 수정 API
app.put('/api/user/:id', (req, res) => {
  const userId = req.params.id;
  const updates = req.body;

  const allowedFields = ['name', 'email', 'department', 'student_number', 'birth', 'profile_picture'];
  let updateFields = [];
  let updateValues = [];

  for (const field in updates) {
    if (allowedFields.includes(field)) {
      updateFields.push(`${field} = ?`);
      updateValues.push(updates[field]);
    }
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ success: false, message: '업데이트할 필드가 없습니다' });
  }

  const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
  updateValues.push(userId);

  db.query(sql, updateValues, (err, result) => {
    if (err) {
      console.error('사용자 수정 오류:', err);
      return res.status(500).json({ success: false, message: '서버 오류' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다' });
    }

    res.json({ success: true, message: '사용자 정보가 업데이트되었습니다' });
  });
});

// 회원 탈퇴 API
app.delete('/api/delete-user/:id', (req, res) => {
  const userId = req.params.id;

  db.query('SELECT id FROM users WHERE id = ?', [userId], (err, results) => {
    if (err) {
      console.error('사용자 확인 오류:', err);
      return res.status(500).json({ success: false, message: '서버 오류' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다' });
    }

    db.query('DELETE FROM users WHERE id = ?', [userId], (err, deleteResult) => {
      if (err) {
        console.error('사용자 삭제 오류:', err);
        return res.status(500).json({ success: false, message: '삭제 실패' });
      }

      res.json({ success: true, message: '회원 탈퇴가 완료되었습니다' });
    });
  });
});

/* ======================
   MyPage 관련 API 엔드포인트 추가
   ====================== */

// 사용자의 활동 참여 정보 조회 API
app.get('/api/participations/user/:userId', (req, res) => {
  const userId = req.params.userId;
  
  // 실제 DB 구조에 맞게 수정 필요 - 현재는 더미 데이터 반환
  // participations 테이블이 있다고 가정
  const sql = `
    SELECT 
      participation_id,
      user_id,
      activity_id,
      participated_at,
      participated_with
    FROM user_activity_participations 
    WHERE user_id = ?
  `;
  
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('참여 정보 조회 오류:', err);
      return res.status(500).json({ success: false, message: '서버 오류' });
    }
    
    res.json({ 
      success: true, 
      participations: results || [] 
    });
  });
});

// 여러 사용자 정보 일괄 조회 API
app.post('/api/users/batch', (req, res) => {
  const { user_ids } = req.body;
  
  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ success: false, message: '사용자 ID 목록이 필요합니다' });
  }
  
  const placeholders = user_ids.map(() => '?').join(',');
  const sql = `SELECT id, name, email, department FROM users WHERE id IN (${placeholders})`;
  
  db.query(sql, user_ids, (err, results) => {
    if (err) {
      console.error('사용자 일괄 조회 오류:', err);
      return res.status(500).json({ success: false, message: '서버 오류' });
    }
    
    // 결과에서 id를 user_id로도 복사 (MyPage2에서 user_id를 기대하므로)
    const users = (results || []).map(user => ({
      ...user,
      user_id: user.id // id를 user_id로 복사
    }));
    
    res.json({ 
      success: true, 
      users: users 
    });
  });
});

// 기존 평가 조회 API
app.get('/api/reviews/existing/:reviewerId/:revieweeId/:activityId', (req, res) => {
  const { reviewerId, revieweeId, activityId } = req.params;
  
  const sql = `
    SELECT 
      review_id,
      reviewer_id,
      reviewee_id,
      related_team_id,
      review_high,
      review_medium,
      review_low,
      comment,
      CASE 
        WHEN review_high = 1 THEN 'high'
        WHEN review_medium = 1 THEN 'medium'
        WHEN review_low = 1 THEN 'low'
        ELSE NULL
      END as evaluation_type
    FROM reviews 
    WHERE reviewer_id = ? AND reviewee_id = ? AND related_team_id = ?
  `;
  
  db.query(sql, [reviewerId, revieweeId, activityId], (err, results) => {
    if (err) {
      console.error('기존 평가 조회 오류:', err);
      return res.status(500).json({ success: false, message: '서버 오류' });
    }
    
    if (results.length > 0) {
      res.json({ 
        success: true, 
        existingReview: results[0] 
      });
    } else {
      res.json({ 
        success: true, 
        existingReview: null 
      });
    }
  });
});

// 평가 저장/수정 API
app.post('/api/reviews', (req, res) => {
  const {
    reviewer_id,
    reviewee_id,
    related_team_id,
    review_high,
    review_medium,
    review_low,
    comment,
    is_update
  } = req.body;
  
  if (!reviewer_id || !reviewee_id || !related_team_id) {
    return res.status(400).json({ success: false, message: '필수 정보가 누락되었습니다' });
  }
  
  if (is_update) {
    // 기존 평가 수정
    const updateSql = `
      UPDATE reviews 
      SET review_high = ?, review_medium = ?, review_low = ?, comment = ?, updated_at = NOW()
      WHERE reviewer_id = ? AND reviewee_id = ? AND related_team_id = ?
    `;
    
    db.query(updateSql, [review_high, review_medium, review_low, comment, reviewer_id, reviewee_id, related_team_id], (err, result) => {
      if (err) {
        console.error('평가 수정 오류:', err);
        return res.status(500).json({ success: false, message: '서버 오류' });
      }
      
      res.json({ success: true, message: '평가가 수정되었습니다' });
    });
  } else {
    // 새 평가 저장
    const insertSql = `
      INSERT INTO reviews (reviewer_id, reviewee_id, related_team_id, review_high, review_medium, review_low, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.query(insertSql, [reviewer_id, reviewee_id, related_team_id, review_high, review_medium, review_low, comment], (err, result) => {
      if (err) {
        console.error('평가 저장 오류:', err);
        return res.status(500).json({ success: false, message: '서버 오류' });
      }
      
      res.json({ success: true, message: '평가가 저장되었습니다', review_id: result.insertId });
    });
  }
});

// 사용자가 받은 평가 요약 조회 API
app.get('/api/user/:userId/evaluations', (req, res) => {
  const userId = req.params.userId;
  
  const sql = `
    SELECT 
      SUM(review_low) as review_low,
      SUM(review_medium) as review_medium,
      SUM(review_high) as review_high
    FROM reviews 
    WHERE reviewee_id = ?
  `;
  
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('사용자 평가 요약 조회 오류:', err);
      return res.status(500).json({ success: false, message: '서버 오류' });
    }
    
    const evaluations = results[0] || {
      review_low: 0,
      review_medium: 0,
      review_high: 0
    };
    
    res.json({ 
      success: true, 
      evaluations: {
        review_low: evaluations.review_low || 0,
        review_medium: evaluations.review_medium || 0,
        review_high: evaluations.review_high || 0
      },
      debug: `사용자 ${userId}의 평가 요약 조회 완료`
    });
  });
});

// 사용자의 활동 이력 조회 API
app.get('/api/user/:userId/activities', (req, res) => {
  const userId = req.params.userId;
  
  const sql = `
    SELECT DISTINCT
      a.activity_id as id,
      a.title,
      COALESCE(r.comment, '아직 평가가 없습니다.') as comment
    FROM activitys a
    LEFT JOIN participations p ON a.activity_id = p.activity_id
    LEFT JOIN reviews r ON r.reviewee_id = ? AND r.related_team_id = a.activity_id
    WHERE p.user_id = ?
    ORDER BY a.created_at DESC
  `;
  
  db.query(sql, [userId, userId], (err, results) => {
    if (err) {
      console.error('사용자 활동 이력 조회 오류:', err);
      return res.status(500).json({ success: false, message: '서버 오류' });
    }
    
    res.json({ 
      success: true, 
      activities: results || [] 
    });
  });
});

/* ======================
   Team Recruitments & Applications APIs
   ====================== */

// 팀 모집글 목록 (최신순)
app.get('/api/team-recruitments', (req, res) => {
  const sql = `
    SELECT
      tr.recruitment_id, tr.owner_user_id, tr.team_id,
      tr.activity_name, tr.activity_type,
      tr.qualification_department, tr.qualification_student_number, tr.qualification_age,
      tr.required_members, tr.activity_period, tr.meeting_type,
      tr.memo, tr.status, tr.created_at
    FROM team_recruitments tr
    ORDER BY tr.created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('팀 모집글 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }
    res.status(200).json(results);
  });
});

// (옵션) 카운트까지 한 번에 받고 싶으면 이걸 사용해도 됨
// MatchingScreen에서 이 엔드포인트를 쓰면 applications 호출을 생략 가능
app.get('/api/team-recruitments-with-count', (req, res) => {
  const sql = `
    SELECT
      tr.*,
      SUM(CASE WHEN a.status IN ('REJECTED','CANCELED') THEN 0 ELSE 1 END) AS current_members
    FROM team_recruitments tr
    LEFT JOIN applications a ON a.recruitment_id = tr.recruitment_id
    GROUP BY tr.recruitment_id
    ORDER BY tr.created_at DESC
  `;
  db.query(sql, (err, rows) => {
    if (err) {
      console.error('모집글+카운트 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }
    res.json(rows);
  });
});

// 팀 모집글 상세
app.get('/api/team-recruitments/:id', (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM team_recruitments WHERE recruitment_id = ?', [id], (err, results) => {
    if (err) {
      console.error('팀 모집글 상세 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }
    if (results.length === 0) return res.status(404).json({ message: '모집글이 없습니다.' });
    res.json(results[0]);
  });
});

// 모집글 작성(TeamMakeScreen에서 사용)
app.post('/api/team-recruitments', (req, res) => {
  const {
    owner_user_id,
    activity_name,
    activity_type,
    qualification_department,
    qualification_student_number,
    qualification_age,
    required_members,
    activity_period,
    meeting_type,
    memo,
    status = 'OPEN',
  } = req.body;

  if (!owner_user_id || !activity_name || !activity_type || !required_members) {
    return res.status(400).json({ message: '필수 항목이 누락되었습니다.' });
  }

  const sql = `
    INSERT INTO team_recruitments
    (owner_user_id, activity_name, activity_type, qualification_department, qualification_student_number,
     qualification_age, required_members, activity_period, meeting_type, memo, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    owner_user_id, activity_name, activity_type, qualification_department,
    qualification_student_number, qualification_age || null, required_members,
    activity_period, meeting_type, memo, status
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('모집글 생성 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }
    res.status(201).json({ message: '모집글이 생성되었습니다.', recruitment_id: result.insertId });
  });
});

// 신청 목록(전체) — MatchingScreen의 집계용
app.get('/api/applications', (req, res) => {
  const sql = `
    SELECT application_id, recruitment_id, applicant_id, memo, status, created_at
    FROM applications
    ORDER BY created_at DESC
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('신청 목록 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }
    res.json(results);
  });
});

// 특정 모집글 신청 목록
app.get('/api/team-recruitments/:id/applications', (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM applications WHERE recruitment_id = ? ORDER BY created_at DESC', [id], (err, results) => {
    if (err) {
      console.error('신청 조회 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }
    res.json(results);
  });
});

// 신청 생성(팀 지원)
app.post('/api/applications', (req, res) => {
  const { recruitment_id, applicant_id, memo, status = 'PENDING' } = req.body;
  if (!recruitment_id || !applicant_id) {
    return res.status(400).json({ message: '필수 항목이 누락되었습니다.' });
  }

  const sql = 'INSERT INTO applications (recruitment_id, applicant_id, memo, status) VALUES (?, ?, ?, ?)';
  db.query(sql, [recruitment_id, applicant_id, memo || null, status], (err, result) => {
    if (err) {
      console.error('신청 생성 오류:', err);
      return res.status(500).json({ message: '서버 오류' });
    }
    res.status(201).json({ message: '신청이 등록되었습니다.', application_id: result.insertId });
  });
});

// 신청 상태 변경 (수락/반려)
app.put('/api/applications/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'APPROVED' | 'REJECTED'
  if (!['APPROVED','REJECTED'].includes(status)) {
    return res.status(400).json({ message: 'invalid status' });
  }

  db.beginTransaction(err => {
    if (err) {
      console.error('트랜잭션 시작 오류:', err);
      return res.status(500).json({ message: 'server error' });
    }

    // 1) 신청/모집글/작성자/현재 팀 정보 조회
    const q1 = `
      SELECT a.application_id, a.recruitment_id, a.applicant_id, a.status AS app_status,
             tr.team_id, tr.required_members, tr.activity_name, tr.owner_user_id, tr.status AS recruit_status
      FROM applications a
      JOIN team_recruitments tr ON tr.recruitment_id = a.recruitment_id
      WHERE a.application_id = ? FOR UPDATE
    `;
    db.query(q1, [id], (err1, rows) => {
      if (err1) return rollback(err1, res);
      if (rows.length === 0) return rollback({ message: 'not found' }, res, 404);
      const row = rows[0];

      // 2) 먼저 신청 상태 업데이트
      const q2 = `UPDATE applications SET status = ? WHERE application_id = ?`;
      db.query(q2, [status, id], (err2) => {
        if (err2) return rollback(err2, res);

        if (status === 'REJECTED') {
          // 멤버였던 경우 제거(안전장치)
          if (row.team_id) {
            const qDel = `DELETE FROM team_members WHERE team_id = ? AND user_id = ?`;
            db.query(qDel, [row.team_id, row.applicant_id], (errDel) => {
              if (errDel) return rollback(errDel, res);
              return commit(res, { message: '반려 처리되었습니다.' });
            });
          } else {
            return commit(res, { message: '반려 처리되었습니다.' });
          }
          return;
        }

        // === APPROVED 흐름 ===
        // 3) 팀이 없으면 생성
        const createTeamIfNotExist = (cb) => {
          if (row.team_id) return cb(null, row.team_id); // 이미 팀 있음
          const qCreateTeam = `
            INSERT INTO teams (recruitment_id, team_name, leader_user_id, required_members)
            VALUES (?, ?, ?, ?)
          `;
          db.query(qCreateTeam, [row.recruitment_id, row.activity_name, row.owner_user_id, row.required_members], (errC, result) => {
            if (errC) return cb(errC);
            const newTeamId = result.insertId;
            // 모집글에 team_id 반영
            db.query(`UPDATE team_recruitments SET team_id = ? WHERE recruitment_id = ?`, [newTeamId, row.recruitment_id], (errU) => {
              if (errU) return cb(errU);
              // 팀장 등록(없을 때만)
              db.query(
                `INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'LEADER')`,
                [newTeamId, row.owner_user_id],
                (errL) => (errL ? cb(errL) : cb(null, newTeamId))
              );
            });
          });
        };

        createTeamIfNotExist((errCreate, teamId) => {
          if (errCreate) return rollback(errCreate, res);

          // 4) 신청자 팀원으로 추가(중복 방지)
          const qAddMember = `INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, 'MEMBER')`;
          db.query(qAddMember, [teamId, row.applicant_id], (errAdd) => {
            if (errAdd) return rollback(errAdd, res);

            // 5) 현재 팀원 수 계산(리더 + 승인된 멤버)
            const qCount = `SELECT COUNT(*) AS cnt FROM team_members WHERE team_id = ?`;
            db.query(qCount, [teamId], (errCnt, cntRows) => {
              if (errCnt) return rollback(errCnt, res);
              const memberCount = cntRows[0].cnt;

              // 정원 다 차면 모집글 종료
              if (memberCount >= row.required_members) {
                db.query(`UPDATE team_recruitments SET status = 'CLOSED' WHERE recruitment_id = ?`, [row.recruitment_id], (errClose) => {
                  if (errClose) return rollback(errClose, res);
                  return commit(res, { message: '수락 완료. 정원이 찼으므로 모집이 마감되었습니다.', team_id: teamId, memberCount });
                });
              } else {
                return commit(res, { message: '수락 완료. 팀에 합류되었습니다.', team_id: teamId, memberCount });
              }
            });
          });
        });
      });
    });
  });

  function rollback(err, res, code = 500) {
    console.error('TX ROLLBACK:', err);
    db.rollback(() => res.status(code).json({ message: 'server error', error: err.message || err }));
  }
  function commit(res, payload) {
    db.commit((err) => {
      if (err) {
        console.error('TX COMMIT 오류:', err);
        return db.rollback(() => res.status(500).json({ message: 'server error' }));
      }
      res.json(payload);
    });
  }
});

// 특정 모집글의 팀 요약
app.get('/api/recruitments/:id/team', (req, res) => {
  const { id } = req.params;
  const q = `
    SELECT t.*, 
           (SELECT JSON_ARRAYAGG(JSON_OBJECT('user_id', tm.user_id, 'role', tm.role))
            FROM team_members tm WHERE tm.team_id = t.team_id) AS members
    FROM teams t WHERE t.recruitment_id = ?
  `;
  db.query(q, [id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'server error' });
    if (rows.length === 0) return res.status(404).json({ message: 'team not found' });
    res.json(rows[0]);
  });
});