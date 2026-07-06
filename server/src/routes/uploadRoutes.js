const fs = require('fs');
const express = require('express');

module.exports = ({ db, upload, uploadProfile, serverBaseUrl, deleteOldProfileImage }) => {
  const router = express.Router();

  router.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: '파일이 없습니다.' });
  
    const imageUrl = serverBaseUrl + '/uploads/' + req.file.filename;
    res.status(200).json({ imageUrl });
  });
  
  // ✅ 개선된 프로필 사진 업로드 및 업데이트 API
  router.post('/api/upload/profile/:id', uploadProfile.single('image'), (req, res) => {
    const userId = req.params.id;
    
    console.log(`=== 프로필 사진 업로드 요청 ===`);
    console.log(`사용자 ID: ${userId}`);
    console.log(`업로드된 파일:`, req.file);
    
    if (!userId) {
      return res.status(400).json({ success: false, message: '사용자 ID가 필요합니다' });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: '업로드할 이미지가 없습니다' });
    }
  
      // ✅ 새로운 이미지 URL 생성
    const newProfileImageUrl = serverBaseUrl + '/uploads/profiles/' + req.file.filename;
    
    console.log(`생성된 이미지 URL: ${newProfileImageUrl}`);
    // ✅ 업로드된 파일의 URL 생성 (정적 파일 서빙 경로에 맞춤)
  
    // ✅ 먼저 기존 프로필 사진 정보 조회
    const selectQuery = 'SELECT profile_picture FROM users WHERE id = ?';
    
    db.query(selectQuery, [userId], (selectErr, selectResults) => {
      if (selectErr) {
        console.error('❌ 기존 프로필 사진 조회 오류:', selectErr);
        // 새로 업로드된 파일 삭제
        try {
          fs.unlinkSync(req.file.path);
          console.log('업로드된 파일 삭제됨 (조회 오류로 인해)');
        } catch (unlinkError) {
          console.error('파일 삭제 오류:', unlinkError);
        }
        return res.status(500).json({ 
          success: false, 
          message: '기존 프로필 사진 조회에 실패했습니다',
          error: selectErr.message 
        });
      }
  
      if (selectResults.length === 0) {
        // 사용자가 없음
        try {
          fs.unlinkSync(req.file.path);
          console.log('업로드된 파일 삭제됨 (사용자 없음)');
        } catch (unlinkError) {
          console.error('파일 삭제 오류:', unlinkError);
        }
        return res.status(404).json({ 
          success: false, 
          message: '사용자를 찾을 수 없습니다' 
        });
      }
  
      const currentProfilePicture = selectResults[0].profile_picture;
      
      // ✅ DB에서 새 프로필 사진 URL 업데이트
      const updateQuery = 'UPDATE users SET profile_picture = ? WHERE id = ?';
      
      db.query(updateQuery, [newProfileImageUrl, userId], (updateErr, updateResult) => {
        if (updateErr) {
          console.error('❌ DB 프로필 사진 업데이트 오류:', updateErr);
          
          // 새로 업로드된 파일 삭제
          try {
            fs.unlinkSync(req.file.path);
            console.log('업로드된 파일 삭제됨 (DB 오류로 인해)');
          } catch (unlinkError) {
            console.error('파일 삭제 오류:', unlinkError);
          }
          
          return res.status(500).json({ 
            success: false, 
            message: '데이터베이스 업데이트에 실패했습니다',
            error: updateErr.message 
          });
        }
  
        if (updateResult.affectedRows === 0) {
          // 사용자를 찾을 수 없음
          try {
            fs.unlinkSync(req.file.path);
            console.log('업로드된 파일 삭제됨 (사용자 없음)');
          } catch (unlinkError) {
            console.error('파일 삭제 오류:', unlinkError);
          }
          
          return res.status(404).json({ 
            success: false, 
            message: '사용자를 찾을 수 없습니다' 
          });
        }
  
        // ✅ DB 업데이트 성공 후 기존 프로필 사진 파일 삭제
        if (currentProfilePicture) {
          deleteOldProfileImage(currentProfilePicture);
        }
  
        console.log(`✅ 사용자 ${userId}의 프로필 사진 업데이트 완료: ${newProfileImageUrl}`);
        
        res.json({ 
          success: true, 
          message: '프로필 사진이 성공적으로 업데이트되었습니다', 
          imageUrl: newProfileImageUrl 
        });
      });
    });
  });

  return router;
};
