const express = require('express');

module.exports = ({ db, requireUser }) => {
  const router = express.Router();

  // ActivityScreen
  // GET /users/:id/teams
  router.get('/users/:id/teams', async (req, res) => {
    const userId = Number(req.params.id);
    const sql = `
      SELECT t.team_id AS teamId, t.team_name AS teamName, tm.part AS part
      FROM team_members tm
      JOIN teams t ON t.team_id = tm.team_id
      WHERE tm.user_id = ? AND t.status = 'ACTIVE'
      ORDER BY t.created_at DESC
    `;
    db.query(sql, [userId], (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error', err });
      res.json(rows);
    });
  });
  
  // ─────────────────────────────────────────────────────────────
  // 1) GET /my-teams
  //    로그인 사용자가 속한 팀 목록 + 팀 내 역할(part) 반환
  //    반환: [{ team_id, team_name, part }]
  // ─────────────────────────────────────────────────────────────
  router.get('/my-teams', requireUser, (req, res) => {
    const userId = req.user.id;
  
    const sql = `
      SELECT tm.team_id, t.team_name, tm.part, tm.part
      FROM team_members tm
      JOIN teams t ON t.team_id = tm.team_id
      WHERE tm.user_id = ?
      ORDER BY t.team_name ASC
    `;
  
    db.query(sql, [userId], (err, rows) => {
      if (err) {
        console.error('❌ /my-teams 실패:', err);
        return res.status(500).json({ error: 'DB_ERROR' });
      }
      return res.json(rows);
    });
  });
  
  // ─────────────────────────────────────────────────────────────
  // 2) GET /todos/:teamId
  //    특정 팀의 "로그인 사용자에게 할당된" 투두만 반환
  //    반환: [{ todo_id, title, status, scope_start_date, scope_end_date, scope_type }]
  // ─────────────────────────────────────────────────────────────
  // GET /todos/:teamId?scope_type=주간&start=2025-09-08&end=2025-09-14
  router.get('/todos/:teamId', requireUser, (req, res) => {
    const userId = req.user.id;
    const { teamId } = req.params;
    const { scope_type, start, end } = req.query;
  
    const params = [teamId, userId];
    let where = `team_id = ? AND assigned_user_id = ?`;
  
    if (scope_type) {
      where += ` AND COALESCE(scope_type,
        CASE
          WHEN DATEDIFF(scope_end_date, scope_start_date) = 0 THEN '일일'
          WHEN DATEDIFF(scope_end_date, scope_start_date) BETWEEN 1 AND 6 THEN '주간'
          ELSE '월간'
        END
      ) = ?`;
      params.push(scope_type);
    }
  
    // 기간이 주어지면 "겹치는 것"을 모두 보여줌
    if (start && end) {
      where += ` AND NOT (scope_end_date < ? OR scope_start_date > ?)`;
      params.push(start, end);
    }
  
    const sql = `
      SELECT
        todo_id, title, status, scope_start_date, scope_end_date,
        COALESCE(
          scope_type,
          CASE
            WHEN DATEDIFF(scope_end_date, scope_start_date) = 0 THEN '일일'
            WHEN DATEDIFF(scope_end_date, scope_start_date) BETWEEN 1 AND 6 THEN '주간'
            ELSE '월간'
          END
        ) AS scope_type
      FROM todos
      WHERE ${where}
      ORDER BY scope_start_date ASC, created_at ASC
    `;
  
    db.query(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB_ERROR' });
      res.json(rows);
    });
  });
  
  // todo 상태 업데이트
  // 제목/상태 수정 (둘 중 하나만 와도 OK)
  router.put('/todos/:id', requireUser, (req, res) => {
    const { id } = req.params;
    const { title, status } = req.body;
  
    // 제목을 비워서 보냈다면 삭제 처리 권장 → 클라이언트에서는 DELETE 호출 권장
    if (typeof title === 'string' && title.trim() === '') {
      return res.status(400).json({ error: 'EMPTY_TITLE', message: '빈 제목은 허용되지 않습니다. 삭제를 사용하세요.' });
    }
  
    const fields = [];
    const params = [];
    if (typeof title === 'string') { fields.push('title = ?'); params.push(title.trim()); }
    if (typeof status === 'string') { fields.push('status = ?'); params.push(status); }
  
    if (fields.length === 0) return res.status(400).json({ error: 'NO_FIELDS' });
  
    const sql = `UPDATE todos SET ${fields.join(', ')} WHERE todo_id = ?`;
    params.push(id);
  
    db.query(sql, params, (err) => {
      if (err) return res.status(500).json({ error: 'DB_ERROR' });
      res.json({ success: true });
    });
  });
  
  // 투두 삭제
  router.delete('/todos/:id', requireUser, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM todos WHERE todo_id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: 'DB_ERROR' });
      res.json({ success: true });
    });
  });
  
  // todo 추가
  // ✅ todo 추가 (로그인 사용자 기준)
  router.post('/todos', requireUser, (req, res) => {
    const userId = req.user.id;
    const { team_id, title, scope_type, scope_start_date, scope_end_date } = req.body;
  
    if (!team_id || !title || !scope_type || !scope_start_date || !scope_end_date) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: '필수 값 누락' });
    }
  
    const sql = `
      INSERT INTO todos
        (team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date)
      VALUES
        (?, ?, ?, '미진행', ?, ?, ?)
    `;
  
    db.query(
      sql,
      [team_id, userId, title, scope_type, scope_start_date, scope_end_date],
      (err, result) => {
        if (err) {
          console.error('❌ INSERT /todos 실패:', err);
          return res.status(500).json({ error: 'DB_ERROR' });
        }
        // 방금 만든 todo를 응답 (프론트가 바로 그릴 수 있게)
        res.json({
          todo_id: result.insertId,
          team_id,
          assigned_user_id: userId,
          title,
          status: '미진행',
          scope_type,
          scope_start_date,
          scope_end_date,
        });
      }
    );
  });
  
  // 역할 수정 (본인 part)
  // PUT /team-members/:teamId/part
  // 파트 수정 (본인만)
  router.put('/team-members/:teamId/part', requireUser, (req, res) => {
    const userId = req.user.id;
    const { teamId } = req.params;
    const { part } = req.body;
  
    if (typeof part !== 'string') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'part(문자열)이 필요합니다.' });
    }
  
    const sql = `UPDATE team_members SET part = ? WHERE team_id = ? AND user_id = ? LIMIT 1`;
    db.query(sql, [part.trim(), teamId, userId], (err, result) => {
      if (err) {
        console.error('DB_ERROR(update part):', err);
        return res.status(500).json({ error: 'DB_ERROR' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'NOT_FOUND', message: '해당 팀의 구성원 정보가 없습니다.' });
      }
      res.json({ success: true, part: part.trim() });
    });
  });
  
  // 팀원 목록
  // GET /teams/:teamId/members  -> [{user_id, name, part}]
  router.get('/teams/:teamId/members', requireUser, (req, res) => {
    const { teamId } = req.params;
    const userId = req.user.id;
    const sql = `
      SELECT u.id AS user_id, u.name, tm.part
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ? AND u.id <> ?
      ORDER BY u.name ASC
    `;
    db.query(sql, [teamId, userId], (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB_ERROR' });
      res.json(rows);
    });
  });
  
  // 팀원 todo 조회
  // GET /teams/:teamId/todos?user_id=3&scope_type=주간&start=2025-09-08&end=2025-09-14
  router.get('/teams/:teamId/todos', requireUser, (req, res) => {
    const { teamId } = req.params;
    const { user_id, scope_type, start, end } = req.query;
  
    if (!user_id) return res.status(400).json({ error: 'BAD_REQUEST', message: 'user_id 필요' });
  
    const params = [teamId, user_id];
    let where = `team_id = ? AND assigned_user_id = ?`;
  
    if (scope_type) {
      where += ` AND COALESCE(scope_type,
        CASE
          WHEN DATEDIFF(scope_end_date, scope_start_date) = 0 THEN '일일'
          WHEN DATEDIFF(scope_end_date, scope_start_date) BETWEEN 1 AND 6 THEN '주간'
          ELSE '월간'
        END
      ) = ?`;
      params.push(scope_type);
    }
    if (start && end) {
      where += ` AND NOT (scope_end_date < ? OR scope_start_date > ?)`;
      params.push(start, end);
    }
  
    const sql = `
      SELECT
        todo_id, title, status, scope_start_date, scope_end_date,
        COALESCE(
          scope_type,
          CASE
            WHEN DATEDIFF(scope_end_date, scope_start_date) = 0 THEN '일일'
            WHEN DATEDIFF(scope_end_date, scope_start_date) BETWEEN 1 AND 6 THEN '주간'
            ELSE '월간'
          END
        ) AS scope_type
      FROM todos
      WHERE ${where}
      ORDER BY scope_start_date ASC, created_at ASC
    `;
    db.query(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB_ERROR' });
      res.json(rows);
    });
  });
  
  // 팀원 todo 생성
  // POST /teams/:teamId/todos  { assigned_user_id, title, scope_type, scope_start_date, scope_end_date }
  router.post('/teams/:teamId/todos', requireUser, (req, res) => {
    const { teamId } = req.params;
    const { assigned_user_id, title, scope_type, scope_start_date, scope_end_date } = req.body;
    if (!assigned_user_id || !title || !scope_type || !scope_start_date || !scope_end_date) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: '필수 값 누락' });
    }
    const sql = `
      INSERT INTO todos
        (team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date)
      VALUES (?, ?, ?, '미진행', ?, ?, ?)
    `;
    db.query(sql, [teamId, assigned_user_id, title, scope_type, scope_start_date, scope_end_date],
      (err, result) => {
        if (err) return res.status(500).json({ error: 'DB_ERROR' });
        res.json({
          todo_id: result.insertId,
          team_id: Number(teamId),
          assigned_user_id,
          title,
          status: '미진행',
          scope_type,
          scope_start_date,
          scope_end_date,
        });
      }
    );
  });
  
  // Activity 페이지 프그래스바
  // GET /teams/:teamId/progress?scope_type=월간&start=YYYY-MM-DD&end=YYYY-MM-DD
  router.get('/teams/:teamId/progress', (req, res) => {
    const { teamId } = req.params;
    const { scope_type = '월간', start, end } = req.query;
  
    if (!start || !end) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'start, end 필요' });
    }
  
    const sql = `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status = '완료' THEN 1 ELSE 0 END) AS done
      FROM todos
      WHERE team_id = ?
        AND COALESCE(scope_type,
          CASE
            WHEN DATEDIFF(scope_end_date, scope_start_date) = 0 THEN '일일'
            WHEN DATEDIFF(scope_end_date, scope_start_date) BETWEEN 1 AND 6 THEN '주간'
            ELSE '월간'
          END
        ) = ?
        AND NOT (scope_end_date < ? OR scope_start_date > ?)
    `;
    db.query(sql, [teamId, scope_type, start, end], (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB_ERROR' });
      const { total = 0, done = 0 } = rows[0] || {};
      const percent = total === 0 ? 0 : Math.round((done / total) * 100);
      res.json({ total, done, percent });
    });
  });
  
  // ✅ 이슈트래커용 API 추가
  // GET /teams/:teamId/daily-todos - 특정 팀의 모든 일일 todo 조회
  router.get('/teams/:teamId/daily-todos', (req, res) => {
    const { teamId } = req.params;
    const today = new Date().toISOString().split('T')[0];
  
    const sql = `
      SELECT 
        t.todo_id,
        t.title,
        t.status,
        u.name as assigned_user_name,
        t.scope_start_date,
        t.scope_end_date
      FROM todos t
      INNER JOIN users u ON t.assigned_user_id = u.id
      WHERE t.team_id = ?
        AND t.scope_type = '일일'
        AND ? BETWEEN t.scope_start_date AND t.scope_end_date
      ORDER BY 
        CASE t.status 
          WHEN '미진행' THEN 1 
          WHEN '진행중' THEN 2 
          WHEN '완료' THEN 3 
          ELSE 4 
        END,
        t.created_at ASC
    `;
  
    db.query(sql, [teamId, today], (err, results) => {
      if (err) {
        console.error('❌ 팀 목표 조회 오류:', err);
        return res.status(500).json({ error: 'DB_ERROR', message: '서버 오류' });
      }
      res.json(results);
    });
  });

  return router;
};
