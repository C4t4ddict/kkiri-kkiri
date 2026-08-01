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

module.exports = {
  FEEDBACK_CATEGORIES,
  ensureDeveloperFeedbackSchema,
  normalizeFeedback,
};
