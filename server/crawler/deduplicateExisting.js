const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createPool, ensureCrawlerSchema } = require('./database');

const run = async () => {
  const pool = createPool();
  try {
    await ensureCrawlerSchema(pool);
    const [[summary]] = await pool.query(`
      SELECT
        SUM(source_name <> 'local-demo') AS sourced_total,
        SUM(source_name <> 'local-demo' AND is_hidden = 0) AS visible_total,
        SUM(source_name <> 'local-demo' AND is_hidden = 1 AND dedup_key IS NOT NULL) AS hidden_duplicates
      FROM activitys
    `);
    console.log(JSON.stringify({ status: 'ok', ...summary }, null, 2));
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error('기존 활동 중복 정리 실패:', error.message);
  process.exitCode = 1;
});
