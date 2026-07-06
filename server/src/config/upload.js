const path = require('path');
const multer = require('multer');
const { uploadsDir, profilesDir } = require('./paths');

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profilesDir);
  },
  filename: (req, file, cb) => {
    const userId = req.params.id;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, 'profile_' + userId + '_' + timestamp + ext);
  },
});

const upload = multer({ storage });
const uploadProfile = multer({
  storage: profileStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('이미지 파일만 업로드 가능합니다.'));
    }
  },
});

module.exports = {
  upload,
  uploadProfile,
};
