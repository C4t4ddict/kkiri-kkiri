const normalizeFriendshipPair = (firstUserId, secondUserId) => {
  const first = Number(firstUserId);
  const second = Number(secondUserId);
  return first < second ? [first, second] : [second, first];
};

const ensureMessagingSchema = async (database) => {
  await database.query(`CREATE TABLE IF NOT EXISTS user_friendships (
    friendship_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_low_id INT NOT NULL,
    user_high_id INT NOT NULL,
    requester_id INT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_friendships_pair (user_low_id, user_high_id),
    INDEX idx_user_friendships_low_status (user_low_id, status),
    INDEX idx_user_friendships_high_status (user_high_id, status),
    INDEX idx_user_friendships_requester_status (requester_id, status)
  )`);

  await database.query(`CREATE TABLE IF NOT EXISTS direct_messages (
    message_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    recipient_id INT NOT NULL,
    content TEXT NOT NULL,
    read_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_direct_messages_conversation (sender_id, recipient_id, created_at),
    INDEX idx_direct_messages_recipient_read (recipient_id, read_at, created_at)
  )`);
};

const areFriends = async (database, firstUserId, secondUserId) => {
  const [userLowId, userHighId] = normalizeFriendshipPair(firstUserId, secondUserId);
  const [rows] = await database.query(
    `SELECT friendship_id
     FROM user_friendships
     WHERE user_low_id = ? AND user_high_id = ? AND status = 'ACCEPTED'
     LIMIT 1`,
    [userLowId, userHighId],
  );
  return Boolean(rows.length);
};

module.exports = {
  areFriends,
  ensureMessagingSchema,
  normalizeFriendshipPair,
};
