const express = require('express');

module.exports = ({ db, deleteOldProfileImage }) => {
  const router = express.Router();

  // 사용자 정보 조회 API
  router.get('/api/user/:id', (req, res) => {
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
  
  // ✅ 사용자 정보 수정 API도 업데이트 (기본 이미지로 변경 시 기존 파일 삭제)
  router.put('/api/user/:id', (req, res) => {
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
  
    // ✅ profile_picture를 null로 변경하는 경우 기존 파일 삭제
    const isProfilePictureUpdate = updates.hasOwnProperty('profile_picture');
    const newProfilePicture = updates.profile_picture;
  
    if (isProfilePictureUpdate) {
      // 먼저 기존 프로필 사진 URL 조회
      const selectQuery = 'SELECT profile_picture FROM users WHERE id = ?';
      
      db.query(selectQuery, [userId], (selectErr, selectResults) => {
        if (selectErr) {
          console.error('기존 프로필 사진 조회 오류:', selectErr);
          return res.status(500).json({ success: false, message: '서버 오류' });
        }
  
        if (selectResults.length === 0) {
          return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다' });
        }
  
        const currentProfilePicture = selectResults[0].profile_picture;
  
        // DB 업데이트 실행
        const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
        updateValues.push(userId);
  
        db.query(updateQuery, updateValues, (updateErr, result) => {
          if (updateErr) {
            console.error('사용자 수정 오류:', updateErr);
            return res.status(500).json({ success: false, message: '서버 오류' });
          }
  
          if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다' });
          }
  
          // ✅ 업데이트 성공 후 기존 파일 삭제 (null로 변경되는 경우)
          if (newProfilePicture === null && currentProfilePicture) {
            deleteOldProfileImage(currentProfilePicture);
            console.log(`사용자 ${userId}의 프로필 사진을 기본 이미지로 변경하고 기존 파일 삭제`);
          }
  
          res.json({ success: true, message: '사용자 정보가 업데이트되었습니다' });
        });
      });
    } else {
      // profile_picture 변경이 아닌 경우 기존 로직 유지
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
    }
  });
  
  // 회원 탈퇴 API
  router.delete('/api/delete-user/:id', (req, res) => {
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
  
  // 3. 사용자별 받은 평가 요약 조회 API (개선된 버전)
  router.get('/api/user/:id/evaluations', (req, res) => {
    const { id } = req.params;
    
    console.log(`=== 사용자 ${id} 평가 요약 조회 ===`);
    
    const sql = `
      SELECT 
        COALESCE(SUM(review_low), 0) as review_low,
        COALESCE(SUM(review_medium), 0) as review_medium,
        COALESCE(SUM(review_high), 0) as review_high,
        COUNT(*) as total_reviews
      FROM reviews 
      WHERE reviewee_id = ?
    `;
    
    db.query(sql, [id], (err, results) => {
      if (err) {
        console.error('사용자 평가 조회 오류:', err);
        return res.status(500).json({ success: false, message: '서버 오류' });
      }
      
      const evaluations = results[0] || { review_low: 0, review_medium: 0, review_high: 0, total_reviews: 0 };
      
      console.log('✅ 평가 요약 조회 결과:', evaluations);
      
      res.json({ 
        success: true, 
        evaluations,
        debug: `사용자 ${id}의 평가 요약 - 총 ${evaluations.total_reviews}개 리뷰`
      });
    });
  });
  
  // 4. 사용자 활동 이력 조회 API (실제 데이터와 연결)
  router.get('/api/user/:id/activities', (req, res) => {
    const { id } = req.params;
    
    console.log(`=== 사용자 ${id} 활동 이력 조회 ===`);
    
    // user_id 유효성 검사
    if (!id || id === 'undefined') {
      console.log('❌ 유효하지 않은 id:', id);
      return res.status(400).json({ 
        success: false, 
        message: '유효한 사용자 ID가 필요합니다' 
      });
    }
    
    // 실제 참여 데이터와 활동 정보를 조인하여 조회
    const sql = `
      SELECT DISTINCT
        a.activity_id as id,
        a.title,
        p.participated_at,
        p.participated_with,
        COALESCE(r.comment, '아직 평가가 없습니다.') as comment
      FROM activitys a
      INNER JOIN user_activity_participations p ON a.activity_id = p.activity_id
      LEFT JOIN reviews r ON r.reviewee_id = ? AND r.related_team_id = a.activity_id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `;
    
    db.query(sql, [id, id], (err, results) => {
      if (err) {
        console.error('사용자 활동 조회 오류:', err);
        return res.status(500).json({ success: false, message: '서버 오류' });
      }
      
      console.log(`✅ 활동 이력 조회 결과: ${results.length}개 활동`);
      console.log('조회된 활동:', results);
      
      res.json({ success: true, activities: results });
    });
  });
  
  // 5. 사용자의 참여 정보 조회 API (실제 테이블 구조에 맞게 수정)
  router.get('/api/participations/user/:id', (req, res) => {
    const { id } = req.params;
    
    console.log(`=== 사용자 ${id} 참여 정보 조회 ===`);
    
    // user_id 유효성 검사
    if (!id || id === 'undefined') {
      return res.status(400).json({ 
        success: false, 
        message: '유효한 사용자 ID가 필요합니다' 
      });
    }
    
    // 실제 테이블명과 컬럼명 사용
    const sql = `
      SELECT 
        participation_id, 
        user_id,
        activity_id, 
        participated_at,
        participated_with,
        created_at
      FROM user_activity_participations 
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    
    db.query(sql, [id], (err, results) => {
      if (err) {
        console.error('참여 정보 조회 오류:', err);
        return res.status(500).json({ success: false, message: '서버 오류' });
      }
      
      console.log(`✅ 참여 정보 조회 결과: ${results.length}개 참여`);
      console.log('조회된 데이터:', results);
      
      res.json({ success: true, participations: results });
    });
  });
  
  // 6. 여러 사용자 정보 일괄 조회 API (수정된 버전 - 핵심 수정사항)
  router.post('/api/users/batch', (req, res) => {
    const { user_ids } = req.body;
    
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ success: false, message: '사용자 ID 배열이 필요합니다' });
    }
    
    console.log(`=== 일괄 사용자 조회: ${user_ids.length}명 ===`);
    
    const placeholders = user_ids.map(() => '?').join(',');
    // ✅ 핵심 수정: id as user_id 별칭 제거, 직접 id 반환
    const sql = `SELECT id, name, department FROM users WHERE id IN (${placeholders})`;
    
    db.query(sql, user_ids, (err, results) => {
      if (err) {
        console.error('사용자 일괄 조회 오류:', err);
        return res.status(500).json({ success: false, message: '서버 오류' });
      }
      
      console.log(`✅ 일괄 조회 결과: ${results.length}명`);
      console.log('조회된 사용자 데이터:', results); // 디버깅용
      res.json({ success: true, users: results });
    });
  });
  
  // 7. MyPage2에서 사용할 팀원 정보 조회 API (실제 데이터 기반)
  router.get('/api/user/:user_id/teammates', (req, res) => {
    const { user_id } = req.params;
    
    console.log(`=== 사용자 ${user_id}의 팀원 정보 조회 ===`);
    
    if (!user_id || user_id === 'undefined') {
      return res.status(400).json({ 
        success: false, 
        message: '유효한 사용자 ID가 필요합니다' 
      });
    }
    
    // 사용자가 참여한 활동별로 팀원 정보 조회
    const sql = `
      SELECT 
        p.activity_id,
        a.title as activity_title,
        p.participated_with,
        p.participated_at
      FROM user_activity_participations p
      INNER JOIN activitys a ON p.activity_id = a.activity_id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `;
    
    db.query(sql, [user_id], (err, results) => {
      if (err) {
        console.error('팀원 정보 조회 오류:', err);
        return res.status(500).json({ success: false, message: '서버 오류' });
      }
      
      console.log(`✅ 사용자 ${user_id}의 참여 활동: ${results.length}개`);
      
      if (results.length === 0) {
        return res.json({ success: true, participations: [] });
      }
      
      // participated_with에서 본인 제외하고 다른 팀원들의 정보 가져오기
      const processParticipations = async () => {
        const participations = [];
        
        for (const participation of results) {
          try {
            // JSON 파싱
            let participatedWith = [];
            if (participation.participated_with) {
              if (typeof participation.participated_with === 'string') {
                participatedWith = JSON.parse(participation.participated_with);
              } else {
                participatedWith = participation.participated_with;
              }
            }
            
            // 본인 제외
            const teammateIds = participatedWith.filter(id => Number(id) !== Number(user_id));
            
            console.log(`활동 ${participation.activity_id}: 팀원 ${teammateIds.length}명`);
            
            if (teammateIds.length > 0) {
              participations.push({
                activity_id: participation.activity_id,
                activity_title: participation.activity_title,
                participated_at: participation.participated_at,
                participated_with: teammateIds
              });
            }
          } catch (parseError) {
            console.error('JSON 파싱 오류:', parseError);
          }
        }
        
        res.json({ success: true, participations });
      };
      
      processParticipations();
    });
  });

  // 8. 디버깅용 - 전체 참여 정보 조회
  router.get('/api/participations/debug', (req, res) => {
    const sql = `
      SELECT
        p.*,
        a.title as activity_title,
        u.name as user_name
      FROM user_activity_participations p
      LEFT JOIN activitys a ON p.activity_id = a.activity_id
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `;

    db.query(sql, (err, results) => {
      if (err) {
        console.error('참여 정보 디버그 조회 오류:', err);
        return res.status(500).json({ success: false, message: '서버 오류' });
      }

      res.json({ success: true, participations: results });
    });
  });

  return router;
};
