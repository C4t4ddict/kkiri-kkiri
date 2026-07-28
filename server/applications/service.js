const TEMPLATE_LIMITS = {
  title: 80,
  content: 2000,
};

const sanitizeTemplate = (input = {}) => ({
  title: String(input.title || '').trim().slice(0, TEMPLATE_LIMITS.title),
  content: String(input.content || '').trim().slice(0, TEMPLATE_LIMITS.content),
  isDefault: Boolean(input.is_default),
});

const ensureApplicationSchema = async (db) => {
  await db.query(`CREATE TABLE IF NOT EXISTS application_templates (
    template_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(80) NOT NULL,
    content TEXT NOT NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_application_templates_user_updated (user_id, updated_at),
    INDEX idx_application_templates_user_default (user_id, is_default)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.query(`CREATE TABLE IF NOT EXISTS application_status_events (
    event_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    status VARCHAR(24) NOT NULL,
    actor_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_application_events_application_created (application_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const [columns] = await db.query("SHOW COLUMNS FROM applications LIKE 'template_id'");
  if (!columns.length) {
    await db.query('ALTER TABLE applications ADD COLUMN template_id INT NULL AFTER applicant_id');
  }
};

const recordApplicationEvent = async (db, applicationId, status, actorId) => {
  await db.query(
    `INSERT INTO application_status_events (application_id, status, actor_id)
     VALUES (?, ?, ?)`,
    [applicationId, status, actorId || null],
  );
};

const getApplicationTimeline = async (db, applicationId) => {
  const [events] = await db.query(
    `SELECT event_id, status, actor_id, created_at
     FROM application_status_events
     WHERE application_id = ?
     ORDER BY created_at, event_id`,
    [applicationId],
  );
  return events;
};

const buildApplicationTimeline = (application, events = []) => {
  const byStatus = new Map(events.map((event) => [event.status, event]));
  const appliedAt = byStatus.get('APPLIED')?.created_at || application.applied_at || application.created_at;
  const reviewingAt = byStatus.get('REVIEWING')?.created_at || appliedAt;
  const offerAt = byStatus.get('JOIN_OFFERED')?.created_at || application.offer_created_at || null;
  const finalStatus = application.application_status === 'APPROVED'
    ? 'ACCEPTED'
    : application.application_status === 'REJECTED'
      ? 'REJECTED'
      : application.application_status === 'CANCELED'
        ? 'CANCELED'
        : application.offer_status === 'REJECTED'
          ? 'REJECTED'
          : null;
  const finalEvent = finalStatus ? byStatus.get(finalStatus) : null;

  return [
    { key: 'APPLIED', label: '지원 완료', state: 'completed', occurred_at: appliedAt },
    {
      key: 'REVIEWING',
      label: '지원서 검토',
      state: offerAt || finalStatus ? 'completed' : 'current',
      occurred_at: reviewingAt,
    },
    {
      key: 'JOIN_OFFERED',
      label: '합류 제안',
      state: offerAt ? (application.offer_status === 'PENDING' ? 'current' : 'completed') : (finalStatus ? 'skipped' : 'upcoming'),
      occurred_at: offerAt,
    },
    {
      key: finalStatus || 'FINAL',
      label: finalStatus === 'ACCEPTED'
        ? '팀 합류 확정'
        : finalStatus === 'REJECTED'
          ? '지원 종료'
          : finalStatus === 'CANCELED'
            ? '지원 취소'
            : '최종 결과',
      state: finalStatus ? 'completed' : 'upcoming',
      occurred_at: finalEvent?.created_at || application.offer_responded_at || null,
    },
  ];
};

module.exports = {
  TEMPLATE_LIMITS,
  buildApplicationTimeline,
  ensureApplicationSchema,
  getApplicationTimeline,
  recordApplicationEvent,
  sanitizeTemplate,
};
