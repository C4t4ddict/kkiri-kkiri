const { buildCurriculumPlan, parseDateOnly } = require('../lib/curriculumSchedule');

const CURRICULUM_SOURCE_TYPE = 'ENTERPRISE_CURRICULUM';
const PARTICIPATION_MODES = new Set(['PERSONAL', 'TEAM']);
const CURRICULUM_LEVELS = new Set(['MONTHLY', 'WEEKLY', 'DAILY']);
const ASSIGNMENT_MODES = new Set(['ALL_MEMBERS', 'ASSIGNED_MEMBERS', 'TEAM_ONCE']);

const slugify = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9가-힣]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120);

const clamp = (value, minimum, maximum, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
};

const ensureColumn = async (database, table, column, definition) => {
  const [columns] = await database.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (!columns.length) await database.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
};

const ensureIndex = async (database, table, indexName, definition) => {
  const [indexes] = await database.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [indexName]);
  if (!indexes.length) await database.query(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` ${definition}`);
};

const ensureCurriculumSchema = async (database) => {
  await database.query(`CREATE TABLE IF NOT EXISTS enterprise_organizations (
    organization_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    description TEXT NULL,
    logo_url VARCHAR(500) NULL,
    website_url VARCHAR(500) NULL,
    brand_color VARCHAR(7) NOT NULL DEFAULT '#6C5CE7',
    is_verified TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_enterprise_organizations_slug (slug)
  )`);

  await database.query(`CREATE TABLE IF NOT EXISTS enterprise_curricula (
    curriculum_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    title VARCHAR(180) NOT NULL,
    slug VARCHAR(160) NOT NULL,
    role_title VARCHAR(120) NULL,
    summary VARCHAR(500) NOT NULL,
    description TEXT NULL,
    difficulty VARCHAR(24) NOT NULL DEFAULT 'BEGINNER',
    duration_weeks INT NOT NULL DEFAULT 8,
    weekly_hours DECIMAL(5,1) NOT NULL DEFAULT 5.0,
    cover_image_url VARCHAR(500) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    latest_version_id INT NULL,
    created_by INT NULL,
    published_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_enterprise_curricula_slug (organization_id, slug),
    INDEX idx_enterprise_curricula_status_published (status, published_at)
  )`);

  await database.query(`CREATE TABLE IF NOT EXISTS enterprise_curriculum_versions (
    version_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    curriculum_id INT NOT NULL,
    version_number INT NOT NULL,
    changelog VARCHAR(500) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    published_at DATETIME NULL,
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_curriculum_version_number (curriculum_id, version_number),
    INDEX idx_curriculum_versions_status (curriculum_id, status)
  )`);

  await database.query(`CREATE TABLE IF NOT EXISTS enterprise_curriculum_nodes (
    node_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    version_id INT NOT NULL,
    stable_key VARCHAR(120) NOT NULL,
    parent_node_id INT NULL,
    level VARCHAR(16) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    relative_start_day INT NOT NULL DEFAULT 0,
    relative_end_day INT NOT NULL DEFAULT 0,
    estimated_minutes INT NOT NULL DEFAULT 0,
    is_required TINYINT(1) NOT NULL DEFAULT 1,
    assignment_mode VARCHAR(24) NOT NULL DEFAULT 'ALL_MEMBERS',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_curriculum_node_stable (version_id, stable_key),
    INDEX idx_curriculum_nodes_version_order (version_id, sort_order)
  )`);

  await database.query(`CREATE TABLE IF NOT EXISTS curriculum_enrollments (
    enrollment_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    curriculum_id INT NOT NULL,
    version_id INT NOT NULL,
    owner_user_id INT NOT NULL,
    team_id INT NOT NULL,
    participation_mode VARCHAR(16) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    schedule_preferences JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_curriculum_enrollment_team (team_id),
    INDEX idx_curriculum_enrollments_owner_status (owner_user_id, status),
    INDEX idx_curriculum_enrollments_curriculum (curriculum_id, version_id)
  )`);

  await ensureColumn(database, 'teams', 'source_type', "VARCHAR(32) NOT NULL DEFAULT 'COMPETITION' AFTER activity_status");
  await ensureColumn(database, 'teams', 'source_id', 'INT NULL AFTER source_type');
  await ensureColumn(database, 'teams', 'source_version_id', 'INT NULL AFTER source_id');
  await ensureColumn(database, 'teams', 'participation_mode', "VARCHAR(16) NOT NULL DEFAULT 'TEAM' AFTER source_version_id");
  await ensureColumn(database, 'teams', 'visibility', "VARCHAR(16) NOT NULL DEFAULT 'CLOSED' AFTER participation_mode");
  await ensureIndex(database, 'teams', 'idx_teams_source', '(source_type, source_id, activity_status)');

  await ensureColumn(database, 'todos', 'curriculum_enrollment_id', 'INT NULL AFTER range_color');
  await ensureColumn(database, 'todos', 'curriculum_node_id', 'INT NULL AFTER curriculum_enrollment_id');
  await ensureColumn(database, 'todos', 'source_stable_key', 'VARCHAR(120) NULL AFTER curriculum_node_id');
  await ensureColumn(database, 'todos', 'assignment_mode', "VARCHAR(24) NULL AFTER source_stable_key");
  await ensureIndex(database, 'todos', 'idx_todos_curriculum_member', '(curriculum_enrollment_id, assigned_user_id, curriculum_node_id)');

  await ensureColumn(database, 'team_recruitments', 'curriculum_id', 'INT NULL AFTER activity_id');
  await ensureIndex(database, 'team_recruitments', 'idx_team_recruitments_curriculum_status', '(curriculum_id, status)');
};

const normalizeCurriculum = (row) => ({
  ...row,
  curriculum_id: Number(row.curriculum_id),
  organization_id: Number(row.organization_id),
  version_id: row.version_id ? Number(row.version_id) : null,
  duration_weeks: Number(row.duration_weeks || 0),
  weekly_hours: Number(row.weekly_hours || 0),
  goal_count: Number(row.goal_count || 0),
  participant_count: Number(row.participant_count || 0),
  is_verified: Boolean(row.is_verified),
});

const listCurricula = async (database, filters = {}) => {
  const search = String(filters.search || '').trim();
  const difficulty = String(filters.difficulty || '').trim().toUpperCase();
  const values = [];
  const conditions = ["c.status = 'PUBLISHED'", "v.status = 'PUBLISHED'"];
  if (search) {
    conditions.push('(c.title LIKE ? OR c.role_title LIKE ? OR o.name LIKE ? OR c.summary LIKE ?)');
    const term = `%${search}%`;
    values.push(term, term, term, term);
  }
  if (difficulty) {
    conditions.push('c.difficulty = ?');
    values.push(difficulty);
  }

  const [rows] = await database.query(
    `SELECT
      c.curriculum_id, c.organization_id, c.title, c.slug, c.role_title, c.summary,
      c.description, c.difficulty, c.duration_weeks, c.weekly_hours, c.cover_image_url,
      c.published_at, c.latest_version_id AS version_id,
      o.name AS organization_name, o.logo_url AS organization_logo_url,
      o.brand_color, o.is_verified,
      COUNT(DISTINCT n.node_id) AS goal_count,
      COUNT(DISTINCT ce.enrollment_id) AS participant_count
     FROM enterprise_curricula c
     JOIN enterprise_organizations o ON o.organization_id = c.organization_id
     JOIN enterprise_curriculum_versions v ON v.version_id = c.latest_version_id
     LEFT JOIN enterprise_curriculum_nodes n ON n.version_id = v.version_id
     LEFT JOIN curriculum_enrollments ce ON ce.curriculum_id = c.curriculum_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY c.curriculum_id, v.version_id
     ORDER BY c.published_at DESC, c.curriculum_id DESC`,
    values,
  );
  return rows.map(normalizeCurriculum);
};

const getCurriculum = async (database, curriculumId, options = {}) => {
  const versionCondition = options.allowDraft
    ? 'v.version_id = COALESCE(?, c.latest_version_id)'
    : "v.version_id = c.latest_version_id AND c.status = 'PUBLISHED' AND v.status = 'PUBLISHED'";
  const params = options.allowDraft ? [Number(options.versionId) || null, Number(curriculumId)] : [Number(curriculumId)];
  const [rows] = await database.query(
    `SELECT
      c.curriculum_id, c.organization_id, c.title, c.slug, c.role_title, c.summary,
      c.description, c.difficulty, c.duration_weeks, c.weekly_hours, c.cover_image_url,
      c.published_at, v.version_id, v.version_number, v.changelog,
      o.name AS organization_name, o.logo_url AS organization_logo_url,
      o.website_url AS organization_website_url, o.brand_color, o.is_verified,
      (SELECT COUNT(*) FROM curriculum_enrollments ce WHERE ce.curriculum_id = c.curriculum_id) AS participant_count
     FROM enterprise_curricula c
     JOIN enterprise_organizations o ON o.organization_id = c.organization_id
     JOIN enterprise_curriculum_versions v ON ${versionCondition}
     WHERE c.curriculum_id = ?
     LIMIT 1`,
    params,
  );
  if (!rows.length) return null;

  const curriculum = normalizeCurriculum(rows[0]);
  const [nodes] = await database.query(
    `SELECT node_id, version_id, stable_key, parent_node_id, level, title, description,
            relative_start_day, relative_end_day, estimated_minutes, is_required,
            assignment_mode, sort_order
     FROM enterprise_curriculum_nodes
     WHERE version_id = ?
     ORDER BY sort_order, relative_start_day, node_id`,
    [curriculum.version_id],
  );
  curriculum.nodes = nodes.map((node) => ({
    ...node,
    node_id: Number(node.node_id),
    version_id: Number(node.version_id),
    parent_node_id: node.parent_node_id ? Number(node.parent_node_id) : null,
    relative_start_day: Number(node.relative_start_day || 0),
    relative_end_day: Number(node.relative_end_day || 0),
    estimated_minutes: Number(node.estimated_minutes || 0),
    is_required: Boolean(node.is_required),
  }));
  curriculum.goal_count = curriculum.nodes.length;
  return curriculum;
};

const previewCurriculum = async (database, curriculumId, input = {}) => {
  const curriculum = await getCurriculum(database, curriculumId);
  if (!curriculum) return null;
  const startDate = String(input.start_date || new Date().toISOString().slice(0, 10));
  return {
    curriculum: { ...curriculum, nodes: undefined },
    plan: buildCurriculumPlan(curriculum.nodes, {
      startDate,
      availableWeekdays: input.available_weekdays,
      weeklyHours: curriculum.weekly_hours,
      durationWeeks: curriculum.duration_weeks,
    }),
  };
};

const normalizeNodeInput = (node, index) => {
  const level = String(node.level || 'DAILY').toUpperCase();
  const assignmentMode = String(node.assignment_mode || 'ALL_MEMBERS').toUpperCase();
  if (!CURRICULUM_LEVELS.has(level)) throw new Error(`지원하지 않는 목표 단계입니다: ${level}`);
  if (!ASSIGNMENT_MODES.has(assignmentMode)) throw new Error(`지원하지 않는 수행 방식입니다: ${assignmentMode}`);
  const relativeStartDay = Math.max(0, Number(node.relative_start_day || 0));
  return {
    stableKey: String(node.stable_key || `goal-${index + 1}`).trim().slice(0, 120),
    parentStableKey: String(node.parent_stable_key || '').trim() || null,
    level,
    title: String(node.title || '').trim().slice(0, 255),
    description: String(node.description || '').trim(),
    relativeStartDay,
    relativeEndDay: Math.max(relativeStartDay, Number(node.relative_end_day ?? relativeStartDay)),
    estimatedMinutes: clamp(node.estimated_minutes, 0, 100_000, 0),
    isRequired: node.is_required === undefined ? true : Boolean(node.is_required),
    assignmentMode,
    sortOrder: Number(node.sort_order ?? (index + 1) * 10),
  };
};

const createCurriculum = async (database, adminUserId, input = {}) => {
  const organizationName = String(input.organization_name || '').trim();
  const title = String(input.title || '').trim();
  const summary = String(input.summary || '').trim();
  const nodes = (Array.isArray(input.nodes) ? input.nodes : []).map(normalizeNodeInput);
  if (!organizationName || !title || !summary || !nodes.length) {
    const error = new Error('기업명, 커리큘럼 제목, 요약, 목표를 모두 입력해주세요');
    error.statusCode = 400;
    throw error;
  }
  if (nodes.some((node) => !node.title || !node.stableKey)) {
    const error = new Error('모든 목표에는 제목과 고유 키가 필요합니다');
    error.statusCode = 400;
    throw error;
  }

  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const organizationSlug = slugify(input.organization_slug || organizationName) || `organization-${Date.now()}`;
    await connection.query(
      `INSERT INTO enterprise_organizations
        (name, slug, description, logo_url, website_url, brand_color, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        name = VALUES(name), description = VALUES(description), logo_url = VALUES(logo_url),
        website_url = VALUES(website_url), brand_color = VALUES(brand_color)`,
      [
        organizationName,
        organizationSlug,
        String(input.organization_description || '').trim() || null,
        String(input.organization_logo_url || '').trim() || null,
        String(input.organization_website_url || '').trim() || null,
        /^#[0-9A-F]{6}$/i.test(String(input.brand_color || '')) ? input.brand_color : '#6C5CE7',
        input.organization_verified ? 1 : 0,
      ],
    );
    const [[organization]] = await connection.query(
      'SELECT organization_id FROM enterprise_organizations WHERE slug = ? LIMIT 1',
      [organizationSlug],
    );
    const curriculumSlug = slugify(input.slug || title) || `curriculum-${Date.now()}`;
    const status = String(input.status || 'PUBLISHED').toUpperCase() === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
    const [curriculumResult] = await connection.query(
      `INSERT INTO enterprise_curricula
        (organization_id, title, slug, role_title, summary, description, difficulty,
         duration_weeks, weekly_hours, cover_image_url, status, created_by, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'PUBLISHED' ? 'NOW()' : 'NULL'})`,
      [
        organization.organization_id,
        title,
        curriculumSlug,
        String(input.role_title || '').trim() || null,
        summary,
        String(input.description || '').trim() || null,
        String(input.difficulty || 'BEGINNER').toUpperCase(),
        clamp(input.duration_weeks, 1, 104, 8),
        clamp(input.weekly_hours, 0.5, 80, 5),
        String(input.cover_image_url || '').trim() || null,
        status,
        adminUserId,
      ],
    );
    const curriculumId = Number(curriculumResult.insertId);
    const [versionResult] = await connection.query(
      `INSERT INTO enterprise_curriculum_versions
        (curriculum_id, version_number, changelog, status, published_at, created_by)
       VALUES (?, 1, ?, ?, ${status === 'PUBLISHED' ? 'NOW()' : 'NULL'}, ?)`,
      [curriculumId, String(input.changelog || '첫 배포').trim(), status, adminUserId],
    );
    const versionId = Number(versionResult.insertId);
    const nodeIdByStableKey = new Map();
    for (const node of nodes) {
      const parentNodeId = node.parentStableKey ? nodeIdByStableKey.get(node.parentStableKey) || null : null;
      const [nodeResult] = await connection.query(
        `INSERT INTO enterprise_curriculum_nodes
          (version_id, stable_key, parent_node_id, level, title, description,
           relative_start_day, relative_end_day, estimated_minutes, is_required,
           assignment_mode, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          versionId, node.stableKey, parentNodeId, node.level, node.title, node.description || null,
          node.relativeStartDay, node.relativeEndDay, node.estimatedMinutes, node.isRequired ? 1 : 0,
          node.assignmentMode, node.sortOrder,
        ],
      );
      nodeIdByStableKey.set(node.stableKey, Number(nodeResult.insertId));
    }
    await connection.query(
      'UPDATE enterprise_curricula SET latest_version_id = ? WHERE curriculum_id = ?',
      [versionId, curriculumId],
    );
    await connection.commit();
    return getCurriculum(database, curriculumId, { allowDraft: true, versionId });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const insertPlanTodos = async (connection, enrollmentId, teamId, userId, goals) => {
  if (!goals.length) return;
  const placeholders = goals.map(() => '(?, ?, ?, \'미진행\', ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const values = goals.flatMap((goal) => [
    teamId,
    userId,
    goal.title,
    goal.scope_type,
    goal.scope_start_date,
    goal.scope_end_date,
    enrollmentId,
    goal.curriculum_node_id,
    goal.stable_key,
    goal.assignment_mode,
  ]);
  await connection.query(
    `INSERT INTO todos
      (team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date,
       curriculum_enrollment_id, curriculum_node_id, source_stable_key, assignment_mode)
     VALUES ${placeholders}`,
    values,
  );
};

const enrollCurriculum = async (database, userId, curriculumId, input = {}) => {
  const mode = String(input.participation_mode || 'PERSONAL').toUpperCase();
  if (!PARTICIPATION_MODES.has(mode)) {
    const error = new Error('개인 또는 팀 참여 방식을 선택해주세요');
    error.statusCode = 400;
    throw error;
  }
  const startDate = String(input.start_date || new Date().toISOString().slice(0, 10));
  if (!parseDateOnly(startDate)) {
    const error = new Error('올바른 시작일을 선택해주세요');
    error.statusCode = 400;
    throw error;
  }
  const curriculum = await getCurriculum(database, curriculumId);
  if (!curriculum) return null;
  const plan = buildCurriculumPlan(curriculum.nodes, {
    startDate,
    availableWeekdays: input.available_weekdays,
    weeklyHours: curriculum.weekly_hours,
    durationWeeks: curriculum.duration_weeks,
  });
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const requiredMembers = mode === 'PERSONAL' ? 1 : Math.round(clamp(input.required_members, 2, 20, 4));
    const teamName = String(input.team_name || `${curriculum.organization_name} · ${curriculum.title}`).trim().slice(0, 255);
    const visibility = mode === 'PERSONAL' ? 'PRIVATE' : (input.open_recruitment === false ? 'CLOSED' : 'RECRUITING');
    const [teamResult] = await connection.query(
      `INSERT INTO teams
        (recruitment_id, team_name, leader_user_id, required_members, status, due_date,
         activity_status, source_type, source_id, source_version_id, participation_mode, visibility)
       VALUES (NULL, ?, ?, ?, 'ACTIVE', ?, 'IN_PROGRESS', ?, ?, ?, ?, ?)`,
      [
        teamName, userId, requiredMembers, plan.end_date, CURRICULUM_SOURCE_TYPE,
        curriculum.curriculum_id, curriculum.version_id, mode, visibility,
      ],
    );
    const teamId = Number(teamResult.insertId);
    await connection.query(
      `INSERT INTO team_members (team_id, user_id, role, part)
       VALUES (?, ?, 'LEADER', ?)`,
      [teamId, userId, mode === 'PERSONAL' ? '학습자' : '스터디 리더'],
    );
    const [enrollmentResult] = await connection.query(
      `INSERT INTO curriculum_enrollments
        (curriculum_id, version_id, owner_user_id, team_id, participation_mode,
         start_date, end_date, status, schedule_preferences)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      [
        curriculum.curriculum_id,
        curriculum.version_id,
        userId,
        teamId,
        mode,
        plan.start_date,
        plan.end_date,
        JSON.stringify({
          available_weekdays: plan.available_weekdays,
          weekly_hours: Number(input.weekly_hours || curriculum.weekly_hours),
        }),
      ],
    );
    const enrollmentId = Number(enrollmentResult.insertId);
    await insertPlanTodos(connection, enrollmentId, teamId, userId, plan.goals);

    let recruitmentId = null;
    if (mode === 'TEAM' && visibility === 'RECRUITING') {
      const [recruitmentResult] = await connection.query(
        `INSERT INTO team_recruitments (
          owner_user_id, team_id, activity_id, curriculum_id, post_name, activity_name,
          activity_type, qualification_department, qualification_student_number,
          qualification_age, required_members, activity_start_date, activity_end_date,
          activity_period, meeting_type, recruitment_scope, school_domain, memo, status
        ) VALUES (?, ?, NULL, ?, ?, ?, '기업 커리큘럼', '무관', NULL, NULL, ?, ?, ?, ?, ?, 'NATIONWIDE', NULL, ?, 'OPEN')`,
        [
          userId,
          teamId,
          curriculum.curriculum_id,
          String(input.recruitment_title || `${curriculum.title} 같이 완주해요`).trim().slice(0, 255),
          curriculum.title,
          requiredMembers,
          plan.start_date,
          plan.end_date,
          `${plan.start_date} ~ ${plan.end_date}`,
          String(input.meeting_type || '비대면'),
          String(input.recruitment_memo || `${curriculum.organization_name} 제공 커리큘럼을 함께 학습합니다.`).trim(),
        ],
      );
      recruitmentId = Number(recruitmentResult.insertId);
      await connection.query('UPDATE teams SET recruitment_id = ? WHERE team_id = ?', [recruitmentId, teamId]);
    }

    await connection.commit();
    return {
      enrollment_id: enrollmentId,
      team_id: teamId,
      recruitment_id: recruitmentId,
      participation_mode: mode,
      activity_name: teamName,
      plan,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getEnrollment = async (database, enrollmentId, userId) => {
  const [rows] = await database.query(
    `SELECT ce.*, c.title AS curriculum_title, c.role_title, c.cover_image_url,
            o.name AS organization_name, o.brand_color,
            t.team_name, t.participation_mode, t.visibility
     FROM curriculum_enrollments ce
     JOIN enterprise_curricula c ON c.curriculum_id = ce.curriculum_id
     JOIN enterprise_organizations o ON o.organization_id = c.organization_id
     JOIN teams t ON t.team_id = ce.team_id
     JOIN team_members tm ON tm.team_id = ce.team_id AND tm.user_id = ?
     WHERE ce.enrollment_id = ?
     LIMIT 1`,
    [userId, enrollmentId],
  );
  if (!rows.length) return null;
  const [goals] = await database.query(
    `SELECT todo_id, title, status, scope_type,
            DATE_FORMAT(scope_start_date, '%Y-%m-%d') AS scope_start_date,
            DATE_FORMAT(scope_end_date, '%Y-%m-%d') AS scope_end_date,
            curriculum_node_id, source_stable_key, assignment_mode
     FROM todos
     WHERE curriculum_enrollment_id = ? AND assigned_user_id = ?
     ORDER BY scope_start_date, todo_id`,
    [enrollmentId, userId],
  );
  return { ...rows[0], enrollment_id: Number(rows[0].enrollment_id), goals };
};

const provisionCurriculumGoalsForMember = async (database, teamId, userId) => {
  const [enrollments] = await database.query(
    `SELECT enrollment_id, owner_user_id
     FROM curriculum_enrollments
     WHERE team_id = ? AND participation_mode = 'TEAM' AND status = 'ACTIVE'
     LIMIT 1`,
    [teamId],
  );
  if (!enrollments.length) return { created: 0 };
  const enrollment = enrollments[0];
  const [result] = await database.query(
    `INSERT INTO todos
      (team_id, assigned_user_id, title, status, scope_type, scope_start_date, scope_end_date,
       curriculum_enrollment_id, curriculum_node_id, source_stable_key, assignment_mode)
     SELECT source.team_id, ?, source.title, '미진행', source.scope_type,
            source.scope_start_date, source.scope_end_date, source.curriculum_enrollment_id,
            source.curriculum_node_id, source.source_stable_key, source.assignment_mode
     FROM todos source
     WHERE source.curriculum_enrollment_id = ?
       AND source.assigned_user_id = ?
       AND COALESCE(source.assignment_mode, 'ALL_MEMBERS') = 'ALL_MEMBERS'
       AND NOT EXISTS (
         SELECT 1 FROM todos existing
         WHERE existing.curriculum_enrollment_id = source.curriculum_enrollment_id
           AND existing.curriculum_node_id = source.curriculum_node_id
           AND existing.assigned_user_id = ?
       )`,
    [userId, enrollment.enrollment_id, enrollment.owner_user_id, userId],
  );
  return { created: Number(result.affectedRows || 0), enrollment_id: Number(enrollment.enrollment_id) };
};

module.exports = {
  CURRICULUM_SOURCE_TYPE,
  createCurriculum,
  ensureCurriculumSchema,
  enrollCurriculum,
  getCurriculum,
  getEnrollment,
  listCurricula,
  previewCurriculum,
  provisionCurriculumGoalsForMember,
  slugify,
};
