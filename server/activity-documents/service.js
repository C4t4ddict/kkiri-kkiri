const DOCUMENT_LIMITS = Object.freeze({
  title: 160,
  contentMarkdown: 100_000,
});

class ActivityDocumentError extends Error {
  constructor(message, { statusCode = 400, code = 'ACTIVITY_DOCUMENT_ERROR', details } = {}) {
    super(message);
    this.name = 'ActivityDocumentError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const countCharacters = (value) => Array.from(value).length;

const validationError = (message, field) => new ActivityDocumentError(message, {
  statusCode: 400,
  code: 'INVALID_ACTIVITY_DOCUMENT',
  details: { field },
});

const sanitizeDocumentInput = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('활동 문서 요청 본문이 올바르지 않습니다', 'body');
  }
  if (typeof input.title !== 'string') {
    throw validationError('문서 제목은 문자열이어야 합니다', 'title');
  }

  const title = input.title.trim();
  if (!title) {
    throw validationError('문서 제목을 입력해주세요', 'title');
  }
  if (countCharacters(title) > DOCUMENT_LIMITS.title) {
    throw validationError(`문서 제목은 ${DOCUMENT_LIMITS.title}자 이하여야 합니다`, 'title');
  }

  if (typeof input.content_markdown !== 'string') {
    throw validationError('Markdown 본문은 문자열이어야 합니다', 'content_markdown');
  }

  const contentMarkdown = input.content_markdown.replace(/\r\n?/g, '\n');
  if (contentMarkdown.includes('\u0000')) {
    throw validationError('Markdown 본문에 허용되지 않는 문자가 있습니다', 'content_markdown');
  }
  if (countCharacters(contentMarkdown) > DOCUMENT_LIMITS.contentMarkdown) {
    throw validationError(
      `Markdown 본문은 ${DOCUMENT_LIMITS.contentMarkdown.toLocaleString('ko-KR')}자 이하여야 합니다`,
      'content_markdown',
    );
  }

  return { title, contentMarkdown };
};

const parseExpectedVersion = (value) => {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw validationError('올바른 문서 version이 필요합니다', 'version');
  }
  return version;
};

const ensureActivityDocumentsSchema = async (database) => {
  await database.query(`CREATE TABLE IF NOT EXISTS activity_documents (
    document_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    team_id INT NOT NULL,
    author_id INT NOT NULL,
    last_editor_id INT NOT NULL,
    title VARCHAR(160) NOT NULL,
    content_markdown MEDIUMTEXT NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_activity_documents_team_deleted_updated (team_id, deleted_at, updated_at, document_id),
    INDEX idx_activity_documents_author (author_id),
    INDEX idx_activity_documents_last_editor (last_editor_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};

const assertTeamMember = async (database, teamId, userId, { forUpdate = false } = {}) => {
  const [rows] = await database.query(
    `SELECT tm.user_id
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ? AND tm.user_id = ?
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [teamId, userId],
  );

  if (!rows.length) {
    throw new ActivityDocumentError('팀원만 활동 문서에 접근할 수 있습니다', {
      statusCode: 403,
      code: 'ACTIVITY_DOCUMENT_TEAM_MEMBERS_ONLY',
    });
  }
};

const DOCUMENT_METADATA_SELECT = `
  SELECT d.document_id, d.team_id, d.author_id, d.last_editor_id,
    d.title, d.version, d.created_at, d.updated_at, d.deleted_at,
    COALESCE(creator.name, '알 수 없음') AS creator_name,
    COALESCE(editor.name, '알 수 없음') AS editor_name
  FROM activity_documents d
  LEFT JOIN users creator ON creator.id = d.author_id
  LEFT JOIN users editor ON editor.id = d.last_editor_id
`;

const DOCUMENT_SELECT = DOCUMENT_METADATA_SELECT.replace(
  'd.title, d.version',
  'd.title, d.content_markdown, d.version',
);

const findDocument = async (database, teamId, documentId, { includeDeleted = false } = {}) => {
  const [rows] = await database.query(
    `${DOCUMENT_SELECT}
     WHERE d.document_id = ? AND d.team_id = ?${includeDeleted ? '' : ' AND d.deleted_at IS NULL'}
     LIMIT 1`,
    [documentId, teamId],
  );
  return rows[0] || null;
};

const listActivityDocuments = async (database, teamId, userId, limit = 100) => {
  await assertTeamMember(database, teamId, userId);
  const [rows] = await database.query(
    `${DOCUMENT_METADATA_SELECT}
     WHERE d.team_id = ? AND d.deleted_at IS NULL
     ORDER BY d.updated_at DESC, d.document_id DESC
     LIMIT ?`,
    [teamId, limit],
  );
  return rows;
};

const getActivityDocument = async (database, teamId, userId, documentId) => {
  await assertTeamMember(database, teamId, userId);
  const document = await findDocument(database, teamId, documentId);
  if (!document) {
    throw new ActivityDocumentError('활동 문서를 찾을 수 없습니다', {
      statusCode: 404,
      code: 'ACTIVITY_DOCUMENT_NOT_FOUND',
    });
  }
  return document;
};

const withTransaction = async (database, operation) => {
  const connection = typeof database.getConnection === 'function'
    ? await database.getConnection()
    : database;
  const shouldRelease = connection !== database && typeof connection.release === 'function';
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  } finally {
    if (shouldRelease) connection.release();
  }
};

const createActivityDocument = async (database, teamId, userId, input) => {
  const document = sanitizeDocumentInput(input);
  return withTransaction(database, async (connection) => {
    await assertTeamMember(connection, teamId, userId, { forUpdate: true });
    const [result] = await connection.query(
      `INSERT INTO activity_documents
        (team_id, author_id, last_editor_id, title, content_markdown, version)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [teamId, userId, userId, document.title, document.contentMarkdown],
    );
    return findDocument(connection, teamId, result.insertId);
  });
};

const getCurrentVersion = async (database, teamId, documentId) => {
  const [rows] = await database.query(
    `SELECT version, deleted_at
     FROM activity_documents
     WHERE document_id = ? AND team_id = ?
     LIMIT 1`,
    [documentId, teamId],
  );
  return rows[0] || null;
};

const throwMutationMiss = async (database, teamId, documentId) => {
  const current = await getCurrentVersion(database, teamId, documentId);
  if (!current || current.deleted_at) {
    throw new ActivityDocumentError('활동 문서를 찾을 수 없습니다', {
      statusCode: 404,
      code: 'ACTIVITY_DOCUMENT_NOT_FOUND',
    });
  }

  throw new ActivityDocumentError('다른 팀원이 먼저 문서를 변경했습니다. 최신 내용을 불러온 뒤 다시 시도해주세요', {
    statusCode: 409,
    code: 'DOCUMENT_VERSION_CONFLICT',
    details: { current_version: Number(current.version) },
  });
};

const updateActivityDocument = async (database, teamId, userId, documentId, input) => {
  const document = sanitizeDocumentInput(input);
  const version = parseExpectedVersion(input.version);

  return withTransaction(database, async (connection) => {
    await assertTeamMember(connection, teamId, userId, { forUpdate: true });
    const [result] = await connection.query(
      `UPDATE activity_documents
       SET title = ?, content_markdown = ?, last_editor_id = ?,
         version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE document_id = ? AND team_id = ? AND version = ? AND deleted_at IS NULL`,
      [document.title, document.contentMarkdown, userId, documentId, teamId, version],
    );

    if (!result.affectedRows) {
      await throwMutationMiss(connection, teamId, documentId);
    }
    return findDocument(connection, teamId, documentId);
  });
};

const deleteActivityDocument = async (database, teamId, userId, documentId, expectedVersion) => {
  const version = parseExpectedVersion(expectedVersion);

  return withTransaction(database, async (connection) => {
    await assertTeamMember(connection, teamId, userId, { forUpdate: true });
    const [result] = await connection.query(
      `UPDATE activity_documents
       SET deleted_at = CURRENT_TIMESTAMP, last_editor_id = ?,
         version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE document_id = ? AND team_id = ? AND version = ? AND deleted_at IS NULL`,
      [userId, documentId, teamId, version],
    );

    if (!result.affectedRows) {
      await throwMutationMiss(connection, teamId, documentId);
    }
    return findDocument(connection, teamId, documentId, { includeDeleted: true });
  });
};

module.exports = {
  ActivityDocumentError,
  DOCUMENT_LIMITS,
  assertTeamMember,
  createActivityDocument,
  deleteActivityDocument,
  ensureActivityDocumentsSchema,
  getActivityDocument,
  listActivityDocuments,
  parseExpectedVersion,
  sanitizeDocumentInput,
  updateActivityDocument,
};
