const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const env = require('./src/config/env');
const createDatabaseConnection = require('./src/config/database');
const { ensureUploadDirs, uploadsDir, profilesDir } = require('./src/config/paths');
const { upload, uploadProfile } = require('./src/config/upload');
const requireUser = require('./src/middlewares/requireUser');
const createProfileImageRemover = require('./src/utils/profileImage');
const registerRoutes = require('./src/routes');

const app = express();
const db = createDatabaseConnection(env.db);
const deleteOldProfileImage = createProfileImageRemover(profilesDir);

ensureUploadDirs();

app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(uploadsDir));

registerRoutes(app, {
  db,
  upload,
  uploadProfile,
  serverBaseUrl: env.serverBaseUrl,
  deleteOldProfileImage,
  requireUser,
});

app.listen(env.appPort, () => {
  console.log('🚀 서버 실행 중: ' + env.serverBaseUrl);
});

console.log('✅ 모든 API가 성공적으로 등록되었습니다');
console.log('✅ 개선된 리뷰 관련 API가 포함되었습니다');
console.log('✅ user_activity_participations 테이블에 맞게 수정된 API가 포함되었습니다');
console.log('✅ users.id 필드 변경에 따른 수정이 완료되었습니다');
console.log('✅ 프로필 이미지 업로드 기능이 개선되었습니다');
