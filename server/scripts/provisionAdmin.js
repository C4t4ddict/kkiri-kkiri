const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');
const allowedAdminEmails = String(process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || !allowedAdminEmails.includes(email)) {
  console.error('운영자 계정 환경변수 설정을 확인해주세요.');
  process.exit(1);
}

const run = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'myappdb',
    port: Number(process.env.DB_PORT || 3306),
    charset: 'utf8mb4',
  });

  try {
    const [adminColumns] = await connection.query("SHOW COLUMNS FROM users LIKE 'is_admin'");
    if (!adminColumns.length) {
      await connection.query('ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await connection.execute(
      `UPDATE users
       SET password = ?, email_verified = 1, is_admin = 1
       WHERE LOWER(email) = ?`,
      [passwordHash, email],
    );
    if (!result.affectedRows) {
      throw new Error('먼저 일반 회원가입으로 생성된 계정이 필요합니다.');
    }
    console.log('운영자 계정 준비 완료');
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  console.error(`운영자 계정 준비 실패: ${error.message}`);
  process.exit(1);
});
