const express = require('express');

module.exports = ({ db }) => {
  const router = express.Router();

  // 1. 리뷰 작성/수정 API (개선된 버전)
  router.post('/api/reviews', (req, res) => {
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
  
    console.log('=== 리뷰 요청 데이터 ===');
    console.log('reviewer_id:', reviewer_id);
    console.log('reviewee_id:', reviewee_id);
    console.log('related_team_id:', related_team_id);
    console.log('is_update:', is_update);
  
    // 필수 데이터 검증
    if (!reviewer_id || !reviewee_id || !related_team_id) {
      return res.status(400).json({ 
        success: false, 
        message: '필수 정보가 누락되었습니다' 
      });
    }
  
    // 자기 자신을 평가하는 것 방지
    if (reviewer_id === reviewee_id) {
      return res.status(400).json({ 
        success: false, 
        message: '자기 자신을 평가할 수 없습니다' 
      });
    }
  
    if (is_update) {
      // 기존 리뷰 수정
      const updateSql = `
        UPDATE reviews 
        SET review_high = ?, review_medium = ?, review_low = ?, comment = ?, updated_at = NOW()
        WHERE reviewer_id = ? AND reviewee_id = ? AND related_team_id = ?
      `;
      
      db.query(updateSql, [review_high, review_medium, review_low, comment, reviewer_id, reviewee_id, related_team_id], (err, result) => {
        if (err) {
          console.error('리뷰 수정 오류:', err);
          return res.status(500).json({ success: false, message: '서버 오류: ' + err.message });
        }
        
        if (result.affectedRows === 0) {
          return res.status(404).json({ success: false, message: '수정할 리뷰를 찾을 수 없습니다' });
        }
        
        console.log('✅ 리뷰 수정 성공');
        res.json({ success: true, message: '리뷰가 성공적으로 수정되었습니다' });
      });
    } else {
      // 새 리뷰 작성 - 먼저 중복 체크
      const checkSql = `
        SELECT review_id FROM reviews 
        WHERE reviewer_id = ? AND reviewee_id = ? AND related_team_id = ?
      `;
      
      db.query(checkSql, [reviewer_id, reviewee_id, related_team_id], (checkErr, checkResults) => {
        if (checkErr) {
          console.error('중복 체크 오류:', checkErr);
          return res.status(500).json({ success: false, message: '서버 오류' });
        }
        
        if (checkResults.length > 0) {
          return res.status(400).json({ 
            success: false, 
            message: '이미 이 팀원에 대한 평가를 작성했습니다. 수정하려면 기존 평가를 편집해주세요.' 
          });
        }
        
        // 새 리뷰 작성
        const insertSql = `
          INSERT INTO reviews (reviewer_id, reviewee_id, related_team_id, review_high, review_medium, review_low, comment)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.query(insertSql, [reviewer_id, reviewee_id, related_team_id, review_high, review_medium, review_low, comment], (err, result) => {
          if (err) {
            console.error('리뷰 작성 오류:', err);
            if (err.code === 'ER_DUP_ENTRY') {
              return res.status(400).json({ success: false, message: '이미 이 팀원에 대한 평가를 작성했습니다' });
            }
            return res.status(500).json({ success: false, message: '서버 오류: ' + err.message });
          }
          
          console.log('✅ 새 리뷰 작성 성공');
          res.json({ success: true, message: '리뷰가 성공적으로 작성되었습니다', review_id: result.insertId });
        });
      });
    }
  });
  
  // 2. 기존 리뷰 조회 API (개선된 버전)
  router.get('/api/reviews/existing/:reviewer_id/:reviewee_id/:related_team_id', (req, res) => {
    const { reviewer_id, reviewee_id, related_team_id } = req.params;
    
    console.log(`=== 기존 리뷰 조회 요청 ===`);
    console.log(`reviewer_id: ${reviewer_id}, reviewee_id: ${reviewee_id}, related_team_id: ${related_team_id}`);
    
    const sql = `
      SELECT review_id, review_high, review_medium, review_low, comment,
             CASE 
               WHEN review_high = 1 THEN 'high'
               WHEN review_medium = 1 THEN 'medium'
               WHEN review_low = 1 THEN 'low'
               ELSE NULL
             END as evaluation_type,
             created_at, updated_at
      FROM reviews 
      WHERE reviewer_id = ? AND reviewee_id = ? AND related_team_id = ?
    `;
    
    db.query(sql, [reviewer_id, reviewee_id, related_team_id], (err, results) => {
      if (err) {
        console.error('기존 리뷰 조회 오류:', err);
        return res.status(500).json({ success: false, message: '서버 오류' });
      }
      
      console.log(`조회 결과: ${results.length}개 리뷰 발견`);
      
      if (results.length > 0) {
        console.log('✅ 기존 리뷰 발견:', results[0]);
        res.json({ success: true, existingReview: results[0] });
      } else {
        console.log('기존 리뷰 없음');
        res.json({ success: true, existingReview: null });
      }
    });
  });
  
  // 9. 디버깅용 리뷰 전체 조회 API
  router.get('/api/reviews/debug', (req, res) => {
    const sql = `
      SELECT r.*, 
             u1.name as reviewer_name, 
             u2.name as reviewee_name
      FROM reviews r
      LEFT JOIN users u1 ON r.reviewer_id = u1.id
      LEFT JOIN users u2 ON r.reviewee_id = u2.id
      ORDER BY r.created_at DESC
    `;
    
    db.query(sql, (err, results) => {
      if (err) {
        console.error('리뷰 디버그 조회 오류:', err);
        return res.status(500).json({ success: false, message: '서버 오류' });
      }
      
      res.json({ success: true, reviews: results });
    });
  });

  return router;
};
