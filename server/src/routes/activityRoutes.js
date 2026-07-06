const express = require('express');

module.exports = ({ db }) => {
  const router = express.Router();

  // 활동 목록 조회 API
  router.get('/api/activities', (req, res) => {
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
  router.get('/api/activities/:id', (req, res) => {
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
  
      res.status(200).json(results[0]);
    });
  });
  
  // 10. 특정 활동의 참여자 목록 조회
  router.get('/api/activities/:activity_id/participants', (req, res) => {
    const { activity_id } = req.params;
    
    const sql = `
      SELECT 
        p.user_id,
        u.name,
        u.department,
        p.participated_at
      FROM user_activity_participations p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.activity_id = ?
      ORDER BY p.created_at ASC
    `;
    
    db.query(sql, [activity_id], (err, results) => {
      if (err) {
        console.error('활동 참여자 조회 오류:', err);
        return res.status(500).json({ success: false, message: '서버 오류' });
      }
      
      res.json({ success: true, participants: results });
    });
  });

  return router;
};
