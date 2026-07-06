const express = require('express');

module.exports = ({ db }) => {
  const router = express.Router();

  // 팀 모집글 목록 (최신순)
  router.get('/api/team-recruitments', (req, res) => {
    const sql = `
      SELECT
        tr.recruitment_id, tr.owner_user_id, tr.team_id,
        tr.post_name, tr.activity_name, tr.activity_type,
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
  router.get('/api/team-recruitments-with-count', (req, res) => {
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
  router.get('/api/team-recruitments/:id', (req, res) => {
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
  router.post('/api/team-recruitments', (req, res) => {
    const {
      owner_user_id,
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
      status = 'OPEN',
    } = req.body;
  
    if (!owner_user_id || !post_name || !activity_type || !required_members || !activity_name ) {
      return res.status(400).json({ message: '필수 항목이 누락되었습니다.' });
    }
  
    const sql = `
      INSERT INTO team_recruitments
      (owner_user_id, post_name, activity_name, activity_type, qualification_department, qualification_student_number,
       qualification_age, required_members, activity_period, meeting_type, memo, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
  
    const values = [
      owner_user_id, post_name, activity_name, activity_type, qualification_department,
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
  router.get('/api/applications', (req, res) => {
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
  router.get('/api/team-recruitments/:id/applications', (req, res) => {
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
  router.post('/api/applications', (req, res) => {
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
  router.put('/api/applications/:id/status', (req, res) => {
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
               tr.team_id, tr.required_members, tr.post_name, tr.activity_name, tr.owner_user_id, tr.status AS recruit_status
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
  router.get('/api/recruitments/:id/team', (req, res) => {
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

  return router;
};
