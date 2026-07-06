const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '..', '..', '.env');
const result = dotenv.config({ path: envPath, quiet: true });

if (result.error?.code === 'ENOENT') {
  console.warn('⚠ .env 파일이 없어 시스템 환경변수를 사용합니다.');
} else if (result.error) {
  console.error('⚠ .env 로드 실패:', result.error);
} else {
  console.log('[env] loaded: ' + Object.keys(result.parsed || {}).join(', '));
}

const REQUIRED_KEYS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of REQUIRED_KEYS) {
  if (!process.env[key]) {
    throw new Error('환경변수 ' + key + ' 누락: .env를 확인하세요');
  }
}

const appPort = Number(process.env.PORT || 3000);
const serverBaseUrl = process.env.SERVER_BASE_URL || 'http://localhost:' + appPort;

module.exports = {
  appPort,
  serverBaseUrl,
  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  },
};
