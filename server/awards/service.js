const MAX_PRIZE_AMOUNT = 100000000000;

const toBoolean = (value) => value === true || value === 1 || value === '1';

const normalizePrizeAmount = (value) => {
  const rawValue = String(value ?? '').trim();
  if (rawValue.startsWith('-')) return 0;
  const amount = Number(rawValue.replace(/[^\d]/g, ''));
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.min(Math.round(amount), MAX_PRIZE_AMOUNT);
};

const calculateNetPrize = (prizeAmount, taxApplied) =>
  Math.round(normalizePrizeAmount(prizeAmount) * (taxApplied ? 0.78 : 1));

const sanitizeAwardInput = (input = {}) => {
  const isAwarded = toBoolean(input.is_awarded);
  const hasPrize = isAwarded && toBoolean(input.has_prize);
  const prizeAmount = hasPrize ? normalizePrizeAmount(input.prize_amount) : 0;
  const taxApplied = hasPrize && toBoolean(input.tax_applied);
  return {
    isAwarded,
    awardTitle: isAwarded ? String(input.award_title || '').trim().slice(0, 120) || null : null,
    hasPrize,
    prizeAmount,
    taxApplied,
  };
};

const ensureAwardsSchema = async (db) => {
  await db.query(`CREATE TABLE IF NOT EXISTS user_awards (
    award_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    portfolio_id INT NOT NULL,
    is_awarded TINYINT(1) NOT NULL DEFAULT 0,
    award_title VARCHAR(120) NULL,
    has_prize TINYINT(1) NOT NULL DEFAULT 0,
    prize_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,
    tax_applied TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_awards_user_portfolio (user_id, portfolio_id),
    INDEX idx_user_awards_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};

const normalizeAward = (row) => {
  const prizeAmount = Number(row.prize_amount || 0);
  const taxApplied = Boolean(row.tax_applied);
  return {
    ...row,
    is_recorded: Boolean(row.award_id),
    is_awarded: Boolean(row.is_awarded),
    has_prize: Boolean(row.has_prize),
    prize_amount: prizeAmount,
    tax_applied: taxApplied,
    net_prize_amount: calculateNetPrize(prizeAmount, taxApplied),
  };
};

const listAwards = async (db, userId) => {
  const [rows] = await db.query(
    `SELECT
      mp.portfolio_id,
      mp.team_id,
      COALESCE(pe.custom_title, mp.activity_name, t.team_name, tr.activity_name, tr.post_name, CONCAT('활동 ', mp.team_id)) AS activity_name,
      COALESCE(pe.custom_activity_type, mp.activity_type, tr.activity_type, '팀 활동') AS activity_type,
      mp.period,
      ua.award_id,
      COALESCE(ua.is_awarded, 0) AS is_awarded,
      ua.award_title,
      COALESCE(ua.has_prize, 0) AS has_prize,
      COALESCE(ua.prize_amount, 0) AS prize_amount,
      COALESCE(ua.tax_applied, 0) AS tax_applied,
      ua.updated_at
    FROM miniportfolios mp
    LEFT JOIN portfolio_edits pe ON pe.portfolio_id = mp.portfolio_id AND pe.user_id = mp.user_id
    LEFT JOIN teams t ON t.team_id = mp.team_id
    LEFT JOIN team_recruitments tr ON tr.recruitment_id = mp.recruitment_id
    LEFT JOIN user_awards ua ON ua.portfolio_id = mp.portfolio_id AND ua.user_id = mp.user_id
    WHERE mp.user_id = ?
    ORDER BY COALESCE(mp.archived_at, mp.created_at) DESC, mp.portfolio_id DESC`,
    [userId],
  );

  const items = rows.map(normalizeAward);
  return {
    summary: {
      award_count: items.filter((item) => item.is_awarded).length,
      total_net_prize: items.reduce((total, item) => total + item.net_prize_amount, 0),
    },
    items,
  };
};

const upsertAward = async (db, userId, portfolioId, input) => {
  const [portfolios] = await db.query(
    'SELECT portfolio_id FROM miniportfolios WHERE portfolio_id = ? AND user_id = ?',
    [portfolioId, userId],
  );
  if (!portfolios.length) return null;

  const award = sanitizeAwardInput(input);
  await db.query(
    `INSERT INTO user_awards (
      user_id, portfolio_id, is_awarded, award_title, has_prize, prize_amount, tax_applied
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      is_awarded = VALUES(is_awarded),
      award_title = VALUES(award_title),
      has_prize = VALUES(has_prize),
      prize_amount = VALUES(prize_amount),
      tax_applied = VALUES(tax_applied),
      updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      portfolioId,
      award.isAwarded,
      award.awardTitle,
      award.hasPrize,
      award.prizeAmount,
      award.taxApplied,
    ],
  );
  return listAwards(db, userId);
};

module.exports = {
  calculateNetPrize,
  ensureAwardsSchema,
  listAwards,
  normalizeAward,
  normalizePrizeAmount,
  sanitizeAwardInput,
  upsertAward,
};
