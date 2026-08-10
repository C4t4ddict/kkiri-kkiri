const crypto = require('crypto');

const FRIEND_CODE_LENGTH = 8;
const MESSAGE_MAX_LENGTH = 200;
const FRIENDSHIP_STATUSES = new Set(['PENDING', 'ACCEPTED', 'REJECTED']);
const MENU_KEYS = new Set([
  'my_evaluation',
  'team_evaluation',
  'settings',
  'favorites',
  'my_recruitments',
  'my_applications',
  'awards',
  'friends',
  'school_verification',
  'developer_feedback',
]);

const normalizeFriendCode = (value) => String(value || '').trim().toUpperCase();
const normalizeMessage = (value) => String(value || '').trim().slice(0, MESSAGE_MAX_LENGTH);
const createFriendCode = () => crypto.randomBytes(6).toString('base64url').slice(0, FRIEND_CODE_LENGTH).toUpperCase();
const getFriendPair = (firstUserId, secondUserId) => {
  const first = Number(firstUserId);
  const second = Number(secondUserId);
  return first < second ? [first, second] : [second, first];
};

const normalizeMenuOrder = (value, { includeAdmin = false } = {}) => {
  if (!Array.isArray(value)) return [];
  const allowed = includeAdmin ? new Set([...MENU_KEYS, 'admin']) : MENU_KEYS;
  return [...new Set(value
    .map((item) => String(item || '').trim())
    .filter((item) => allowed.has(item)))];
};

const queryWithDuplicateRetry = async (job, maximumAttempts = 8) => {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await job();
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || attempt === maximumAttempts) throw error;
    }
  }
  throw new Error('고유 친구 코드를 생성하지 못했습니다');
};

const ensureUserFriendCode = async (db, userId) => {
  const [rows] = await db.query('SELECT friend_code FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length) return null;
  if (rows[0].friend_code) return rows[0].friend_code;
  return queryWithDuplicateRetry(async () => {
    const friendCode = createFriendCode();
    const [result] = await db.query(
      'UPDATE users SET friend_code = ? WHERE id = ? AND friend_code IS NULL',
      [friendCode, userId],
    );
    if (result.affectedRows) return friendCode;
    const [updated] = await db.query('SELECT friend_code FROM users WHERE id = ? LIMIT 1', [userId]);
    return updated[0]?.friend_code || null;
  });
};

const ensureSocialSchema = async (db) => {
  const [userColumns] = await db.query('SHOW COLUMNS FROM users');
  const userColumnNames = new Set(userColumns.map((column) => column.Field));
  if (!userColumnNames.has('friend_code')) {
    await db.query('ALTER TABLE users ADD COLUMN friend_code VARCHAR(10) NULL AFTER school_name');
  }
  const [friendCodeIndexes] = await db.query(
    "SHOW INDEX FROM users WHERE Key_name = 'uq_users_friend_code'",
  );
  if (!friendCodeIndexes.length) {
    await db.query('ALTER TABLE users ADD UNIQUE INDEX uq_users_friend_code (friend_code)');
  }

  await db.query(`CREATE TABLE IF NOT EXISTS friendships (
    friendship_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_low_id INT NOT NULL,
    user_high_id INT NOT NULL,
    requested_by INT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    responded_at DATETIME NULL,
    UNIQUE KEY uq_friendship_pair (user_low_id, user_high_id),
    INDEX idx_friendship_low_status (user_low_id, status),
    INDEX idx_friendship_high_status (user_high_id, status),
    INDEX idx_friendship_requester (requested_by, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS friend_messages (
    message_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    friendship_id BIGINT NOT NULL,
    sender_id INT NOT NULL,
    recipient_id INT NOT NULL,
    content VARCHAR(200) NOT NULL,
    read_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_friend_messages_thread (friendship_id, created_at),
    INDEX idx_friend_messages_unread (recipient_id, read_at, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS user_menu_preferences (
    user_id INT NOT NULL,
    menu_key VARCHAR(40) NOT NULL,
    sort_order SMALLINT UNSIGNED NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, menu_key),
    INDEX idx_user_menu_order (user_id, sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const [notificationColumns] = await db.query('SHOW COLUMNS FROM user_notifications');
  const teamIdColumn = notificationColumns.find((column) => column.Field === 'team_id');
  if (teamIdColumn && String(teamIdColumn.Null).toUpperCase() !== 'YES') {
    await db.query('ALTER TABLE user_notifications MODIFY COLUMN team_id INT NULL');
  }

  const [usersWithoutCode] = await db.query('SELECT id FROM users WHERE friend_code IS NULL');
  for (const user of usersWithoutCode) {
    await ensureUserFriendCode(db, user.id);
  }
};

module.exports = {
  FRIENDSHIP_STATUSES,
  FRIEND_CODE_LENGTH,
  MESSAGE_MAX_LENGTH,
  createFriendCode,
  ensureSocialSchema,
  ensureUserFriendCode,
  getFriendPair,
  normalizeFriendCode,
  normalizeMenuOrder,
  normalizeMessage,
};
