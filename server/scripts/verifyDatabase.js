const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const requiredTables = [
  'users',
  'activitys',
  'crawler_runs',
  'crawler_raw_items',
  'teams',
  'team_members',
  'todos',
  'team_notices',
  'team_issues',
  'activity_documents',
  'user_friendships',
  'direct_messages',
];

const verifyImage = async (activity) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(activity.main_image_url, {
      headers: {
        'User-Agent': process.env.CRAWLER_USER_AGENT || 'kkiri-kkiri-data-verifier/1.0',
        Range: 'bytes=0-2047',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    return {
      activity_id: activity.activity_id,
      source_name: activity.source_name,
      status: response.status,
      content_type: contentType,
      ok: response.ok && contentType.toLowerCase().startsWith('image/'),
    };
  } catch (error) {
    return {
      activity_id: activity.activity_id,
      source_name: activity.source_name,
      status: 0,
      content_type: '',
      ok: false,
      error: error.message,
    };
  } finally {
    clearTimeout(timer);
  }
};

const run = async () => {
  const databaseName = process.env.DB_NAME || 'myappdb';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: databaseName,
    port: Number(process.env.DB_PORT || 3306),
    charset: 'utf8mb4',
  });

  try {
    const [[identity]] = await connection.query(
      'SELECT DATABASE() AS database_name, @@port AS port, CURRENT_USER() AS account',
    );
    const [tables] = await connection.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = ? AND table_name IN (${requiredTables.map(() => '?').join(', ')})`,
      [databaseName, ...requiredTables],
    );
    const tableNames = new Set(tables.map((row) => row.TABLE_NAME || row.table_name));
    const missingTables = requiredTables.filter((table) => !tableNames.has(table));
    const orphanDocumentsSelect = tableNames.has('activity_documents')
      ? `(SELECT COUNT(*)
         FROM activity_documents activity_document
         LEFT JOIN teams document_team ON document_team.team_id = activity_document.team_id
         LEFT JOIN users document_creator ON document_creator.id = activity_document.author_id
         LEFT JOIN users document_editor ON document_editor.id = activity_document.last_editor_id
         WHERE document_team.team_id IS NULL
           OR document_creator.id IS NULL
           OR document_editor.id IS NULL) AS orphan_documents`
      : '0 AS orphan_documents';

    const [[activityStats]] = await connection.query(`
      SELECT
        COUNT(*) AS total,
        SUM(source_name IN ('위비티', '씽굿')) AS sourced,
        SUM(source_name = 'local-demo') AS fixtures,
        SUM(source_name = 'local-demo' AND COALESCE(is_hidden, 0) = 0) AS visible_fixtures,
        SUM(source_name IN ('위비티', '씽굿') AND (main_image_url IS NULL OR TRIM(main_image_url) = '')) AS sourced_without_images
      FROM activitys
    `);
    const [[duplicateSources]] = await connection.query(`
      SELECT COUNT(*) AS duplicate_groups FROM (
        SELECT source_name, source_item_id
        FROM activitys
        WHERE source_name IN ('위비티', '씽굿')
        GROUP BY source_name, source_item_id
        HAVING COUNT(*) > 1
      ) duplicates
    `);
    const [[missingRawItems]] = await connection.query(`
      SELECT COUNT(*) AS missing_raw_items
      FROM activitys activity
      LEFT JOIN crawler_raw_items raw_item
        ON raw_item.source_name = activity.source_name
       AND raw_item.source_item_id = activity.source_item_id
      WHERE activity.source_name IN ('위비티', '씽굿')
        AND raw_item.raw_item_id IS NULL
    `);
    const [[teamStats]] = await connection.query(`
      SELECT
        SUM(activity_status = 'IN_PROGRESS' AND status <> 'ARCHIVED') AS active_teams,
        (SELECT COUNT(*) FROM team_members) AS memberships,
        (SELECT COUNT(*) FROM team_members member LEFT JOIN teams team ON team.team_id = member.team_id WHERE team.team_id IS NULL) AS orphan_memberships,
        (SELECT COUNT(*) FROM todos todo LEFT JOIN teams team ON team.team_id = todo.team_id WHERE team.team_id IS NULL) AS orphan_todos,
        (SELECT COUNT(*) FROM team_issues issue_item LEFT JOIN teams team ON team.team_id = issue_item.team_id WHERE team.team_id IS NULL) AS orphan_issues,
        ${orphanDocumentsSelect},
        (SELECT COUNT(*)
         FROM teams sourced_team
         JOIN team_members sourced_member ON sourced_member.team_id = sourced_team.team_id AND sourced_member.user_id = 1
         JOIN activitys sourced_activity ON sourced_activity.activity_id = sourced_team.source_id
         WHERE sourced_team.activity_status = 'IN_PROGRESS'
           AND sourced_team.status <> 'ARCHIVED'
           AND sourced_team.participation_mode = 'TEAM'
           AND sourced_activity.source_name IN ('위비티', '씽굿')) AS kim_sourced_teams
      FROM teams
    `);
    const [[crawler]] = await connection.query(`
      SELECT run_id, source_name, status, discovered_count, saved_count, error_count, started_at, finished_at
      FROM crawler_runs ORDER BY run_id DESC LIMIT 1
    `);
    const [images] = await connection.query(`
      SELECT activity_id, source_name, main_image_url
      FROM activitys
      WHERE source_name IN ('위비티', '씽굿')
      ORDER BY activity_id
    `);

    const imageResults = [];
    for (let index = 0; index < images.length; index += 5) {
      imageResults.push(...await Promise.all(images.slice(index, index + 5).map(verifyImage)));
    }
    const failedImages = imageResults.filter((image) => !image.ok);
    const checks = {
      schema: missingTables.length === 0,
      sourced_data: Number(activityStats.sourced || 0) > 0,
      fixtures_hidden: Number(activityStats.visible_fixtures || 0) === 0,
      unique_sources: Number(duplicateSources.duplicate_groups || 0) === 0,
      raw_snapshots: Number(missingRawItems.missing_raw_items || 0) === 0,
      relationships: Number(teamStats.orphan_memberships || 0) === 0
        && Number(teamStats.orphan_todos || 0) === 0
        && Number(teamStats.orphan_issues || 0) === 0
        && Number(teamStats.orphan_documents || 0) === 0,
      kim_sourced_team: Number(teamStats.kim_sourced_teams || 0) > 0,
      crawler: crawler?.status === 'completed' && Number(crawler?.error_count || 0) === 0,
      images: failedImages.length === 0 && Number(activityStats.sourced_without_images || 0) === 0,
    };
    const ok = Object.values(checks).every(Boolean);

    console.log(JSON.stringify({
      status: ok ? 'ok' : 'failed',
      connection: identity,
      checks,
      missing_tables: missingTables,
      activities: {
        total: Number(activityStats.total || 0),
        sourced: Number(activityStats.sourced || 0),
        fixtures: Number(activityStats.fixtures || 0),
        visible_fixtures: Number(activityStats.visible_fixtures || 0),
      },
      teams: {
        active: Number(teamStats.active_teams || 0),
        memberships: Number(teamStats.memberships || 0),
        orphan_memberships: Number(teamStats.orphan_memberships || 0),
        orphan_todos: Number(teamStats.orphan_todos || 0),
        orphan_issues: Number(teamStats.orphan_issues || 0),
        orphan_documents: Number(teamStats.orphan_documents || 0),
        kim_sourced_teams: Number(teamStats.kim_sourced_teams || 0),
      },
      crawler,
      images: { checked: imageResults.length, failed: failedImages },
    }, null, 2));

    if (!ok) process.exitCode = 1;
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  console.error('DB 검증 실패:', error.message);
  process.exitCode = 1;
});
