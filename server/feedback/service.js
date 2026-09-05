const FEEDBACK_CATEGORIES = new Set(['IMPROVEMENT', 'BUG', 'OTHER']);

const ensureDeveloperFeedbackSchema = async (db) => {
  await db.query(`CREATE TABLE IF NOT EXISTS developer_feedback (
    feedback_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    category VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    platform VARCHAR(20) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_developer_feedback_user (user_id, created_at),
    INDEX idx_developer_feedback_status (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS developer_feedback_replies (
    reply_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    feedback_id BIGINT NOT NULL,
    admin_user_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_feedback_replies_feedback (feedback_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};

const normalizeFeedback = ({ category, content, platform }) => ({
  category: FEEDBACK_CATEGORIES.has(String(category || '').toUpperCase())
    ? String(category).toUpperCase()
    : 'OTHER',
  content: String(content || '').trim(),
  platform: ['ios', 'android', 'web'].includes(String(platform || '').toLowerCase())
    ? String(platform).toLowerCase()
    : null,
});

const normalizeFeedbackReply = (content) => Array.from(String(content || '').trim()).slice(0, 2000).join('');

const createReplyNotificationPreview = (content) => Array.from(String(content || '')).slice(0, 255).join('');

const attachReplies = (feedbacks, replies) => {
  const repliesByFeedback = new Map();
  replies.forEach((reply) => {
    const list = repliesByFeedback.get(reply.feedback_id) || [];
    list.push(reply);
    repliesByFeedback.set(reply.feedback_id, list);
  });
  return feedbacks.map((feedback) => ({
    ...feedback,
    replies: repliesByFeedback.get(feedback.feedback_id) || [],
  }));
};

const createFeedbackReply = async (db, { feedbackId, adminUserId, content }) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[feedback]] = await connection.query(
      'SELECT feedback_id, user_id FROM developer_feedback WHERE feedback_id = ? FOR UPDATE',
      [feedbackId],
    );
    if (!feedback) {
      await connection.rollback();
      return null;
    }
    const [result] = await connection.query(
      `INSERT INTO developer_feedback_replies (feedback_id, admin_user_id, content)
       VALUES (?, ?, ?)`,
      [feedbackId, adminUserId, content],
    );
    await connection.query(
      "UPDATE developer_feedback SET status = 'REPLIED' WHERE feedback_id = ?",
      [feedbackId],
    );
    await connection.query(
      `INSERT INTO user_notifications (user_id, team_id, notice_id, type, title, content)
       VALUES (?, NULL, NULL, 'developer_reply', '개발자 답장이 도착했어요', ?)`,
      [feedback.user_id, createReplyNotificationPreview(content)],
    );
    await connection.commit();
    return { replyId: result.insertId, userId: feedback.user_id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  attachReplies,
  createFeedbackReply,
  createReplyNotificationPreview,
  FEEDBACK_CATEGORIES,
  ensureDeveloperFeedbackSchema,
  normalizeFeedback,
  normalizeFeedbackReply,
};
