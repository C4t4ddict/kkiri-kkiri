const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');
const {
  ActivityDocumentError,
  DOCUMENT_LIMITS,
  createActivityDocument,
  deleteActivityDocument,
  ensureActivityDocumentsSchema,
  listActivityDocuments,
  parseExpectedVersion,
  sanitizeDocumentInput,
  updateActivityDocument,
} = require('../../activity-documents/service');
const {
  createActivityDocumentsRouter,
  parseListLimit,
  parsePositiveId,
} = require('../../activity-documents/router');

const createScriptedConnection = (responses = []) => {
  const calls = [];
  const state = {
    began: 0,
    committed: 0,
    rolledBack: 0,
    released: 0,
  };
  return {
    calls,
    state,
    async query(sql, params = []) {
      calls.push({ sql, params });
      assert.ok(responses.length, `예상하지 못한 쿼리: ${sql}`);
      const response = responses.shift();
      return typeof response === 'function' ? response(sql, params) : response;
    },
    async beginTransaction() { state.began += 1; },
    async commit() { state.committed += 1; },
    async rollback() { state.rolledBack += 1; },
    release() { state.released += 1; },
  };
};

const createPool = (connection) => ({
  async getConnection() {
    return connection;
  },
});

test('Markdown 문서 입력은 제목을 정리하고 본문의 줄바꿈과 표 문법을 보존한다', () => {
  const document = sanitizeDocumentInput({
    title: '  주간 회의록  ',
    content_markdown: '## 결정 사항\r\n\r\n| 담당 | 작업 |\r\n| --- | --- |\r\n| 민지 | API |',
  });

  assert.equal(document.title, '주간 회의록');
  assert.equal(document.contentMarkdown, '## 결정 사항\n\n| 담당 | 작업 |\n| --- | --- |\n| 민지 | API |');
});

test('빈 Markdown 초안은 허용하지만 제목과 본문의 타입·길이는 엄격히 검증한다', () => {
  assert.equal(sanitizeDocumentInput({ title: '초안', content_markdown: '' }).contentMarkdown, '');
  assert.throws(
    () => sanitizeDocumentInput(null),
    (error) => error.statusCode === 400 && error.details.field === 'body',
  );
  assert.throws(
    () => sanitizeDocumentInput([]),
    (error) => error.statusCode === 400 && error.details.field === 'body',
  );
  assert.throws(
    () => sanitizeDocumentInput({ title: ' ', content_markdown: '' }),
    (error) => error instanceof ActivityDocumentError && error.details.field === 'title',
  );
  assert.throws(
    () => sanitizeDocumentInput({ title: '문서', content_markdown: null }),
    (error) => error instanceof ActivityDocumentError && error.details.field === 'content_markdown',
  );
  assert.throws(
    () => sanitizeDocumentInput({
      title: '문서',
      content_markdown: '가'.repeat(DOCUMENT_LIMITS.contentMarkdown + 1),
    }),
    (error) => error.statusCode === 400 && error.details.field === 'content_markdown',
  );
});

test('version과 경로 ID는 안전한 양의 정수만 허용한다', () => {
  assert.equal(parseExpectedVersion('3'), 3);
  assert.equal(parsePositiveId('42', '문서'), 42);
  for (const invalid of [undefined, 0, -1, 1.5, 'abc']) {
    assert.throws(() => parseExpectedVersion(invalid), ActivityDocumentError);
    assert.throws(() => parsePositiveId(invalid, '문서'), ActivityDocumentError);
  }
  assert.equal(parseListLimit(undefined), 100);
  assert.equal(parseListLimit('25'), 25);
  assert.equal(parseListLimit('999'), 200);
  assert.equal(parseListLimit('-3'), 1);
  assert.equal(parseListLimit('3.5'), 100);
});

test('기존 DB에서도 Markdown, soft-delete, version 컬럼을 포함한 문서 테이블을 준비한다', async () => {
  const statements = [];
  const database = {
    async query(sql) {
      statements.push(sql);
      return [[], []];
    },
  };

  await ensureActivityDocumentsSchema(database);

  assert.equal(statements.length, 1);
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS activity_documents/);
  assert.match(statements[0], /content_markdown MEDIUMTEXT NOT NULL/);
  assert.match(statements[0], /version INT UNSIGNED NOT NULL DEFAULT 1/);
  assert.match(statements[0], /deleted_at DATETIME NULL/);
});

test('문서 목록은 팀원 확인 후 삭제되지 않은 팀 문서만 파라미터 쿼리로 조회한다', async () => {
  const documents = [{ document_id: 9, team_id: 4, title: '회의록', version: 2 }];
  const database = createScriptedConnection([
    [[{ user_id: 7 }], []],
    [documents, []],
  ]);

  assert.deepEqual(await listActivityDocuments(database, 4, 7), documents);
  assert.deepEqual(database.calls[0].params, [4, 7]);
  assert.match(database.calls[0].sql, /JOIN users u ON u\.id = tm\.user_id/);
  assert.deepEqual(database.calls[1].params, [4, 100]);
  assert.match(database.calls[1].sql, /d\.deleted_at IS NULL/);
  assert.match(database.calls[1].sql, /LIMIT \?/);
  assert.doesNotMatch(database.calls[1].sql, /d\.content_markdown/);
  assert.match(database.calls[1].sql, /creator_name/);
  assert.match(database.calls[1].sql, /editor_name/);
});

test('팀원이 아니면 문서 본문을 조회하지 않는다', async () => {
  const database = createScriptedConnection([
    [[], []],
  ]);

  await assert.rejects(
    () => listActivityDocuments(database, 4, 99),
    (error) => error.statusCode === 403 && error.code === 'ACTIVITY_DOCUMENT_TEAM_MEMBERS_ONLY',
  );
  assert.equal(database.calls.length, 1);
});

test('문서 생성은 팀원 잠금·INSERT·조회 전체를 한 트랜잭션에서 수행한다', async () => {
  const saved = {
    document_id: 15,
    team_id: 4,
    author_id: 7,
    last_editor_id: 7,
    creator_name: '김팀원',
    editor_name: '김팀원',
    title: '킥오프',
    content_markdown: '# 안건',
    version: 1,
  };
  const connection = createScriptedConnection([
    [[{ user_id: 7 }], []],
    [{ insertId: 15, affectedRows: 1 }, []],
    [[saved], []],
  ]);

  const result = await createActivityDocument(
    createPool(connection),
    4,
    7,
    { title: ' 킥오프 ', content_markdown: '# 안건' },
  );

  assert.deepEqual(result, saved);
  assert.match(connection.calls[0].sql, /FOR UPDATE/);
  assert.deepEqual(connection.calls[1].params, [4, 7, 7, '킥오프', '# 안건']);
  assert.deepEqual(connection.state, { began: 1, committed: 1, rolledBack: 0, released: 1 });
});

test('트랜잭션 시작 자체가 실패해도 풀 연결을 반드시 반환한다', async () => {
  const connection = createScriptedConnection([]);
  connection.beginTransaction = async () => {
    connection.state.began += 1;
    throw new Error('begin failed');
  };

  await assert.rejects(
    () => createActivityDocument(
      createPool(connection),
      4,
      7,
      { title: '실패 테스트', content_markdown: '' },
    ),
    /begin failed/,
  );

  assert.deepEqual(connection.state, { began: 1, committed: 0, rolledBack: 0, released: 1 });
  assert.equal(connection.calls.length, 0);
});

test('오래된 version으로 수정하면 롤백하고 최신 version을 포함한 409를 반환할 수 있다', async () => {
  const connection = createScriptedConnection([
    [[{ user_id: 7 }], []],
    [{ affectedRows: 0 }, []],
    [[{ version: 5, deleted_at: null }], []],
  ]);

  await assert.rejects(
    () => updateActivityDocument(
      createPool(connection),
      4,
      7,
      15,
      { title: '변경', content_markdown: '본문', version: 4 },
    ),
    (error) => error.statusCode === 409
      && error.code === 'DOCUMENT_VERSION_CONFLICT'
      && error.details.current_version === 5,
  );

  assert.deepEqual(connection.calls[1].params, ['변경', '본문', 7, 15, 4, 4]);
  assert.deepEqual(connection.state, { began: 1, committed: 0, rolledBack: 1, released: 1 });
});

test('문서 삭제는 행을 제거하지 않고 version을 올리며 deleted_at을 기록한다', async () => {
  const deleted = {
    document_id: 15,
    team_id: 4,
    title: '완료 문서',
    version: 3,
    deleted_at: '2026-09-05T10:00:00.000Z',
  };
  const connection = createScriptedConnection([
    [[{ user_id: 7 }], []],
    [{ affectedRows: 1 }, []],
    [[deleted], []],
  ]);

  const result = await deleteActivityDocument(createPool(connection), 4, 7, 15, 2);

  assert.deepEqual(result, deleted);
  assert.match(connection.calls[1].sql, /SET deleted_at = CURRENT_TIMESTAMP/);
  assert.match(connection.calls[1].sql, /version = version \+ 1/);
  assert.deepEqual(connection.calls[1].params, [7, 15, 4, 2]);
  assert.deepEqual(connection.state, { began: 1, committed: 1, rolledBack: 0, released: 1 });
});

test('문서 API는 스키마 준비를 기다리고 인증 정보와 no-store 정책을 적용한다', async (context) => {
  let schemaReadyCount = 0;
  const app = express();
  app.use(express.json());
  app.use('/teams/:teamId/documents', createActivityDocumentsRouter({
    database: {
      async query() {
        throw new Error('잘못된 ID 요청은 DB에 도달하면 안 됩니다');
      },
    },
    getRequestUserId: (req) => req.get('x-test-user') === '7' ? 7 : null,
    getSchemaReady: async () => { schemaReadyCount += 1; },
    logError: () => undefined,
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await once(server, 'listening');

  const { port } = server.address();
  const unauthorizedResponse = await fetch(`http://127.0.0.1:${port}/teams/4/documents`);
  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(unauthorizedResponse.headers.get('cache-control'), 'private, no-store');

  const response = await fetch(`http://127.0.0.1:${port}/teams/not-a-number/documents`, {
    headers: { 'x-test-user': '7' },
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(body.code, 'INVALID_ACTIVITY_DOCUMENT_ID');
  assert.equal(schemaReadyCount, 2);
});

test('문서 API는 optimistic concurrency 충돌을 안정적인 409 응답으로 변환한다', async (context) => {
  const connection = createScriptedConnection([
    [[{ user_id: 7 }], []],
    [{ affectedRows: 0 }, []],
    [[{ version: 5, deleted_at: null }], []],
  ]);
  const app = express();
  app.use(express.json());
  app.use('/teams/:teamId/documents', createActivityDocumentsRouter({
    database: createPool(connection),
    getRequestUserId: () => 7,
    logError: () => undefined,
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await once(server, 'listening');

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/teams/4/documents/15`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '동시 편집', content_markdown: '최신 초안', version: 4 }),
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(body.code, 'DOCUMENT_VERSION_CONFLICT');
  assert.equal(body.current_version, 5);
  assert.equal(connection.state.rolledBack, 1);
});
