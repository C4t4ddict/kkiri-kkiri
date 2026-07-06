const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
const profilesDir = path.join(uploadsDir, 'profiles');

function ensureUploadDirs() {
  if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
    console.log('📁 uploads/profiles 디렉토리 생성됨');
  }
}

module.exports = {
  uploadsDir,
  profilesDir,
  ensureUploadDirs,
};
