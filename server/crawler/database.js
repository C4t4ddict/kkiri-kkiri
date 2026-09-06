const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { buildActivityDedupKey, chooseCanonicalActivity } = require('./deduplicate');

const ACTIVITY_COLUMNS = {
  prize_details: 'TEXT NULL AFTER points',
  topic_category: 'VARCHAR(100) NULL AFTER category',
  source_name: 'VARCHAR(50) NULL AFTER main_image_url',
  source_item_id: 'VARCHAR(100) NULL AFTER source_name',
  source_url: 'VARCHAR(1000) NULL AFTER source_item_id',
  official_url: 'VARCHAR(1000) NULL AFTER source_url',
  source_categories: 'TEXT NULL AFTER official_url',
  last_crawled_at: 'DATETIME NULL AFTER source_categories',
  dedup_key: 'CHAR(64) NULL AFTER last_crawled_at',
};

const CRAWLER_SOURCES = ['씽굿', '위비티'];

const createPool = () =>
  mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'myappdb',
    port: Number(process.env.DB_PORT || 3306),
    connectionLimit: 4,
    charset: 'utf8mb4',
  });

const ensureCrawlerSchema = async (pool) => {
  const databaseName = process.env.DB_NAME || 'myappdb';
  const [tables] = await pool.execute(
    `SELECT COUNT(*) AS table_count
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = 'activitys'`,
    [databaseName]
  );
  if (!tables[0]?.table_count) {
    throw new Error('activitys 테이블을 찾을 수 없습니다. DB_NAME과 스키마를 확인해주세요.');
  }

  const [columns] = await pool.query('SHOW COLUMNS FROM activitys');
  const existingColumns = new Set(columns.map((column) => column.Field));
  for (const [columnName, definition] of Object.entries(ACTIVITY_COLUMNS)) {
    if (!existingColumns.has(columnName)) {
      await pool.query(`ALTER TABLE activitys ADD COLUMN \`${columnName}\` ${definition}`);
    }
  }

  const [indexes] = await pool.execute(
    `SELECT index_name
     FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = 'activitys' AND index_name = 'uq_activity_source'`,
    [databaseName]
  );
  if (!indexes.length) {
    await pool.query('ALTER TABLE activitys ADD UNIQUE INDEX uq_activity_source (source_name, source_item_id)');
  }

  const [dedupIndexes] = await pool.execute(
    `SELECT index_name
     FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = 'activitys' AND index_name = 'idx_activitys_dedup_key'`,
    [databaseName]
  );
  if (!dedupIndexes.length) {
    await pool.query('ALTER TABLE activitys ADD INDEX idx_activitys_dedup_key (dedup_key, is_hidden)');
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS crawler_runs (
    run_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    source_name VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    discovered_count INT NOT NULL DEFAULT 0,
    saved_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    error_message TEXT NULL,
    INDEX idx_crawler_runs_started (started_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS crawler_raw_items (
    raw_item_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT NULL,
    activity_id INT NULL,
    source_name VARCHAR(50) NOT NULL,
    source_item_id VARCHAR(100) NOT NULL,
    source_url VARCHAR(1000) NOT NULL,
    content_hash CHAR(64) NOT NULL,
    raw_html MEDIUMTEXT NOT NULL,
    normalized_json LONGTEXT NOT NULL,
    fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX uq_crawler_raw_version (source_name, source_item_id, content_hash),
    INDEX idx_crawler_raw_activity (activity_id),
    INDEX idx_crawler_raw_fetched (fetched_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS crawler_errors (
    error_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT NULL,
    source_name VARCHAR(50) NOT NULL,
    source_item_id VARCHAR(100) NULL,
    source_url VARCHAR(1000) NULL,
    stage VARCHAR(30) NOT NULL,
    error_message TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_crawler_errors_run (run_id),
    INDEX idx_crawler_errors_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`UPDATE activitys
    SET main_image_url = NULL
    WHERE source_name = '씽굿'
      AND main_image_url LIKE '%/common/display.do?filepath=&filename=&filegubun=poster%'`);

  await backfillActivityDedupKeys(pool);
  await deduplicateActivities(pool);
};

const backfillActivityDedupKeys = async (pool) => {
  const placeholders = CRAWLER_SOURCES.map(() => '?').join(', ');
  const [activities] = await pool.query(
    `SELECT activity_id, title, organizer, application_period_start, application_period_end, official_url, dedup_key
     FROM activitys
     WHERE source_name IN (${placeholders})`,
    CRAWLER_SOURCES
  );
  for (const activity of activities) {
    const dedupKey = buildActivityDedupKey(activity);
    if (dedupKey && dedupKey !== activity.dedup_key) {
      await pool.execute('UPDATE activitys SET dedup_key = ? WHERE activity_id = ?', [dedupKey, activity.activity_id]);
    }
  }
};

const deduplicateActivityGroup = async (connection, dedupKey) => {
  if (!dedupKey) return 0;
  const placeholders = CRAWLER_SOURCES.map(() => '?').join(', ');
  const [activities] = await connection.query(
    `SELECT activity_id, is_hidden, details, main_image_url, official_url, organizer,
            target_audience, application_period_end, contact
     FROM activitys
     WHERE dedup_key = ? AND source_name IN (${placeholders})
     FOR UPDATE`,
    [dedupKey, ...CRAWLER_SOURCES]
  );
  const visibleActivities = activities.filter((activity) => Number(activity.is_hidden) === 0);
  if (visibleActivities.length <= 1) return 0;

  const canonical = chooseCanonicalActivity(visibleActivities);
  const duplicates = visibleActivities.filter((activity) => activity.activity_id !== canonical.activity_id);
  if (!duplicates.length) return 0;
  await connection.query(
    `UPDATE activitys SET is_hidden = 1 WHERE activity_id IN (${duplicates.map(() => '?').join(', ')})`,
    duplicates.map((activity) => activity.activity_id)
  );
  return duplicates.length;
};

const deduplicateActivities = async (pool) => {
  const placeholders = CRAWLER_SOURCES.map(() => '?').join(', ');
  const [groups] = await pool.query(
    `SELECT dedup_key
     FROM activitys
     WHERE dedup_key IS NOT NULL AND source_name IN (${placeholders})
     GROUP BY dedup_key
     HAVING SUM(is_hidden = 0) > 1`,
    CRAWLER_SOURCES
  );
  let hidden = 0;
  for (const group of groups) hidden += await deduplicateActivityGroup(pool, group.dedup_key);
  return hidden;
};

const startRun = async (pool, sourceName) => {
  const [result] = await pool.execute('INSERT INTO crawler_runs (source_name) VALUES (?)', [sourceName]);
  return result.insertId;
};

const acquireCrawlerLock = async (pool) => {
  const connection = await pool.getConnection();
  const [rows] = await connection.execute("SELECT GET_LOCK('kkiri_competition_crawler', 0) AS acquired");
  if (Number(rows[0]?.acquired) !== 1) {
    connection.release();
    return null;
  }
  return connection;
};

const releaseCrawlerLock = async (connection) => {
  if (!connection) return;
  try {
    await connection.execute("SELECT RELEASE_LOCK('kkiri_competition_crawler')");
  } finally {
    connection.release();
  }
};

const finishRun = async (pool, runId, summary) => {
  await pool.execute(
    `UPDATE crawler_runs
     SET status = ?, discovered_count = ?, saved_count = ?, error_count = ?,
         error_message = ?, finished_at = CURRENT_TIMESTAMP
     WHERE run_id = ?`,
    [summary.status, summary.discovered, summary.saved, summary.errors, summary.errorMessage || null, runId]
  );
};

const saveCrawlError = async (pool, runId, sourceName, item, stage, error) => {
  await pool.execute(
    `INSERT INTO crawler_errors
      (run_id, source_name, source_item_id, source_url, stage, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      runId,
      sourceName,
      item?.sourceItemId || null,
      item?.sourceUrl || null,
      stage,
      String(error?.stack || error?.message || error).slice(0, 10000),
    ]
  );
};

const saveActivity = async (pool, runId, activity, rawHtml) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const dedupKey = buildActivityDedupKey(activity);
    const [activityResult] = await connection.execute(
      `INSERT INTO activitys (
        title, target_audience, organizer, location,
        operation_period_start, operation_period_end,
        application_period_start, application_period_end,
        points, prize_details, contact, details, category, topic_category, main_image_url,
        source_name, source_item_id, source_url, official_url, source_categories, last_crawled_at, dedup_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON DUPLICATE KEY UPDATE
        activity_id = LAST_INSERT_ID(activity_id),
        title = VALUES(title),
        target_audience = COALESCE(VALUES(target_audience), target_audience),
        organizer = COALESCE(VALUES(organizer), organizer),
        location = COALESCE(VALUES(location), location),
        operation_period_start = COALESCE(VALUES(operation_period_start), operation_period_start),
        operation_period_end = COALESCE(VALUES(operation_period_end), operation_period_end),
        application_period_start = COALESCE(VALUES(application_period_start), application_period_start),
        application_period_end = COALESCE(VALUES(application_period_end), application_period_end),
        prize_details = COALESCE(VALUES(prize_details), prize_details),
        contact = VALUES(contact),
        details = COALESCE(VALUES(details), details),
        category = VALUES(category),
        topic_category = VALUES(topic_category),
        main_image_url = COALESCE(VALUES(main_image_url), main_image_url),
        source_url = VALUES(source_url),
        official_url = COALESCE(VALUES(official_url), official_url),
        source_categories = VALUES(source_categories),
        dedup_key = VALUES(dedup_key),
        last_crawled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP`,
      [
        activity.title,
        activity.targetAudience,
        activity.organizer,
        activity.location,
        activity.operationPeriodStart,
        activity.operationPeriodEnd,
        activity.applicationPeriodStart,
        activity.applicationPeriodEnd,
        activity.points,
        activity.prizeDetails,
        activity.contact,
        activity.details,
        activity.category,
        activity.topicCategory,
        activity.mainImageUrl,
        activity.sourceName,
        activity.sourceItemId,
        activity.sourceUrl,
        activity.officialUrl,
        JSON.stringify(activity.sourceCategories),
        dedupKey,
      ]
    );
    const activityId = activityResult.insertId;
    const duplicatesHidden = await deduplicateActivityGroup(connection, dedupKey);
    const normalizedJson = JSON.stringify(activity);
    const contentHash = crypto.createHash('sha256').update(normalizedJson).digest('hex');
    const [rawResult] = await connection.execute(
      `INSERT INTO crawler_raw_items (
        run_id, activity_id, source_name, source_item_id, source_url,
        content_hash, raw_html, normalized_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        run_id = VALUES(run_id),
        activity_id = VALUES(activity_id),
        normalized_json = VALUES(normalized_json),
        fetched_at = CURRENT_TIMESTAMP`,
      [
        runId,
        activityId,
        activity.sourceName,
        activity.sourceItemId,
        activity.sourceUrl,
        contentHash,
        rawHtml,
        normalizedJson,
      ]
    );
    await connection.commit();
    return {
      activityId,
      activityCreated: activityResult.affectedRows === 1,
      snapshotCreated: rawResult.affectedRows === 1,
      duplicatesHidden,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  acquireCrawlerLock,
  createPool,
  deduplicateActivities,
  deduplicateActivityGroup,
  ensureCrawlerSchema,
  finishRun,
  releaseCrawlerLock,
  saveActivity,
  saveCrawlError,
  startRun,
};
