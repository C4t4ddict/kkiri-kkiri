const fs = require('fs');
const path = require('path');

function createProfileImageRemover(profilesDir) {
  return function deleteOldProfileImage(profilePictureUrl) {
    if (!profilePictureUrl) return;

    try {
      const urlParts = profilePictureUrl.split('/');
      const filename = urlParts[urlParts.length - 1];
      const filePath = path.join(profilesDir, filename);

      console.log('기존 프로필 이미지 삭제 시도: ' + filePath);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('✅ 기존 프로필 이미지 삭제 완료: ' + filename);
      } else {
        console.log('⚠️ 삭제할 파일이 존재하지 않음: ' + filename);
      }
    } catch (error) {
      console.error('❌ 기존 프로필 이미지 삭제 오류:', error);
    }
  };
}

module.exports = createProfileImageRemover;
