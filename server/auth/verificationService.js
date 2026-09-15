const crypto = require('crypto');
const { sendVerificationCode } = require('./mailer');
const { getAccountIdentity, normalizeEmail } = require('./accountPolicy');

const CODE_TTL_MINUTES = 10;
const SIGNUP_VERIFICATION_TTL_MINUTES = 30;
const RESET_TOKEN_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const REQUEST_COOLDOWN_SECONDS = 60;

const hashSecret = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const generateCode = () => String(crypto.randomInt(100000, 1000000));
const generateToken = () => crypto.randomBytes(32).toString('hex');

const queryWithLockRetry = async (db, sql, params = [], maximumAttempts = 3) => {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await db.query(sql, params);
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') return [[], []];
      if (!['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code) || attempt === maximumAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw new Error('인증 스키마 변경 재시도에 실패했습니다');
};

const ensureAuthVerificationSchema = async (db) => {
  const [userColumns] = await db.query('SHOW COLUMNS FROM users');
  const columnNames = new Set(userColumns.map((column) => column.Field));
  const additions = [
    ['email_verified', "TINYINT(1) NOT NULL DEFAULT 1 AFTER email"],
    ['account_type', "VARCHAR(20) NOT NULL DEFAULT 'GENERAL' AFTER email_verified"],
    ['school_domain', 'VARCHAR(255) NULL AFTER account_type'],
    ['school_name', 'VARCHAR(255) NULL AFTER school_domain'],
  ];
  for (const [name, definition] of additions) {
    if (!columnNames.has(name)) {
      await queryWithLockRetry(db, `ALTER TABLE users ADD COLUMN \`${name}\` ${definition}`);
    }
  }

  await db.query(`CREATE TABLE IF NOT EXISTS email_verifications (
    verification_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    purpose VARCHAR(30) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    verified_at DATETIME NULL,
    consumed_at DATETIME NULL,
    requested_ip VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_verification_lookup (email, purpose, created_at),
    INDEX idx_email_verification_expiry (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    reset_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_password_reset_token (token_hash),
    INDEX idx_password_reset_user (user_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS school_email_domains (
    school_domain VARCHAR(255) NOT NULL PRIMARY KEY,
    school_name VARCHAR(255) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`INSERT IGNORE INTO school_email_domains (school_domain, school_name)
    SELECT DISTINCT
      LOWER(SUBSTRING_INDEX(email, '@', -1)),
      LOWER(SUBSTRING_INDEX(email, '@', -1))
    FROM users
    WHERE LOWER(SUBSTRING_INDEX(email, '@', -1)) REGEXP '(^|\\.)ac\\.kr$'`);

  const configuredDomains = String(process.env.SCHOOL_EMAIL_DOMAINS || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => /(^|\.)ac\.kr$/i.test(domain));
  for (const domain of configuredDomains) {
    await db.query(
      `INSERT INTO school_email_domains (school_domain, school_name, is_active)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE is_active = 1`,
      [domain, domain],
    );
  }

  await db.query(`UPDATE users
    SET account_type = 'STUDENT',
        school_domain = LOWER(SUBSTRING_INDEX(email, '@', -1)),
        school_name = LOWER(SUBSTRING_INDEX(email, '@', -1))
    WHERE LOWER(SUBSTRING_INDEX(email, '@', -1)) REGEXP '(^|\\.)ac\\.kr$'
      AND (school_domain IS NULL OR school_domain = '')`);
};

const getRegisteredSchool = async (db, email) => {
  const identity = getAccountIdentity(email);
  if (!identity.schoolDomain) return null;
  const [rows] = await db.query(
    `SELECT school_domain, school_name
     FROM school_email_domains
     WHERE school_domain = ? AND is_active = 1
     LIMIT 1`,
    [identity.schoolDomain],
  );
  return rows[0] || null;
};

const requestEmailCode = async (db, { email, purpose, requestedIp }) => {
  const normalizedEmail = normalizeEmail(email);
  const [recent] = await db.query(
    `SELECT verification_id, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS elapsed_seconds
     FROM email_verifications
     WHERE email = ? AND purpose = ?
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, purpose],
  );
  if (recent.length && Number(recent[0].elapsed_seconds) < REQUEST_COOLDOWN_SECONDS) {
    return {
      rateLimited: true,
      retryAfterSeconds: REQUEST_COOLDOWN_SECONDS - Number(recent[0].elapsed_seconds),
    };
  }

  const code = generateCode();
  const [result] = await db.query(
    `INSERT INTO email_verifications
      (email, purpose, code_hash, expires_at, requested_ip)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)`,
    [normalizedEmail, purpose, hashSecret(code), CODE_TTL_MINUTES, requestedIp || null],
  );
  try {
    const delivery = await sendVerificationCode({ email: normalizedEmail, code, purpose });
    return { rateLimited: false, ...delivery };
  } catch (error) {
    await db.query('DELETE FROM email_verifications WHERE verification_id = ?', [result.insertId]);
    throw error;
  }
};

const verifyEmailCode = async (db, { email, purpose, code, consume = false }) => {
  const normalizedEmail = normalizeEmail(email);
  const [rows] = await db.query(
    `SELECT verification_id, code_hash, attempts
     FROM email_verifications
     WHERE email = ? AND purpose = ? AND expires_at > NOW()
       AND verified_at IS NULL AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, purpose],
  );
  if (!rows.length) return { verified: false, reason: 'EXPIRED' };
  const verification = rows[0];
  if (Number(verification.attempts) >= MAX_CODE_ATTEMPTS) {
    return { verified: false, reason: 'ATTEMPTS_EXCEEDED' };
  }
  if (verification.code_hash !== hashSecret(code)) {
    await db.query(
      'UPDATE email_verifications SET attempts = attempts + 1 WHERE verification_id = ?',
      [verification.verification_id],
    );
    return { verified: false, reason: 'INVALID_CODE' };
  }
  await db.query(
    `UPDATE email_verifications
     SET verified_at = NOW(), consumed_at = ${consume ? 'NOW()' : 'NULL'}
     WHERE verification_id = ?`,
    [verification.verification_id],
  );
  return { verified: true, verificationId: verification.verification_id };
};

const hasVerifiedSignup = async (db, email) => {
  const [rows] = await db.query(
    `SELECT verification_id
     FROM email_verifications
     WHERE email = ? AND purpose = 'SIGNUP' AND verified_at IS NOT NULL AND consumed_at IS NULL
       AND verified_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
     ORDER BY verified_at DESC LIMIT 1`,
    [normalizeEmail(email), SIGNUP_VERIFICATION_TTL_MINUTES],
  );
  return rows[0]?.verification_id || null;
};

const consumeSignupVerification = async (db, verificationId) => {
  await db.query(
    'UPDATE email_verifications SET consumed_at = NOW() WHERE verification_id = ? AND consumed_at IS NULL',
    [verificationId],
  );
};

const createPasswordResetToken = async (db, userId) => {
  const token = generateToken();
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [userId, hashSecret(token), RESET_TOKEN_TTL_MINUTES],
  );
  return token;
};

const resetPasswordWithToken = async (db, { token, passwordHash }) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT reset_id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND expires_at > NOW() AND used_at IS NULL
       FOR UPDATE`,
      [hashSecret(token)],
    );
    if (!rows.length) {
      await connection.rollback();
      return false;
    }
    await connection.query('UPDATE users SET password = ? WHERE id = ?', [passwordHash, rows[0].user_id]);
    await connection.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE reset_id = ?', [rows[0].reset_id]);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  MAX_CODE_ATTEMPTS,
  consumeSignupVerification,
  createPasswordResetToken,
  ensureAuthVerificationSchema,
  generateCode,
  getAccountIdentity,
  getRegisteredSchool,
  hasVerifiedSignup,
  hashSecret,
  requestEmailCode,
  resetPasswordWithToken,
  verifyEmailCode,
};
