const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { ensureUserFriendCode } = require('../social/service');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
  console.error('ADMIN_EMAIL과 8자 이상의 ADMIN_PASSWORD가 필요합니다.');
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
    const passwordHash = await bcrypt.hash(password, 10);
    await connection.execute(
      `INSERT INTO users
        (email, email_verified, account_type, password, name, is_admin)
       VALUES (?, 1, 'GENERAL', ?, '끼리끼리 운영자', 1)
       ON DUPLICATE KEY UPDATE
         password = VALUES(password), email_verified = 1, is_admin = 1`,
      [email, passwordHash],
    );
    const [[admin]] = await connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    await ensureUserFriendCode(connection, admin.id);
    console.log(`운영자 계정 준비 완료: ${email}`);
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  console.error(`운영자 계정 준비 실패: ${error.message}`);
  process.exit(1);
});
