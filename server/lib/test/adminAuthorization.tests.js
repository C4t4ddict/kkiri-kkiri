const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequireAdmin } = require('../../auth/adminAuthorization');

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('로그인하지 않은 사용자의 운영자 접근을 차단한다', async () => {
  const response = createResponse();
  const requireAdmin = createRequireAdmin({
    database: { query: async () => [[]] },
    getAdminEmails: () => 'test@test.com',
    getSchemaReady: async () => {},
  });
  await requireAdmin({}, response, () => assert.fail('next가 호출되면 안 됩니다'));
  assert.equal(response.statusCode, 401);
});

test('일반 사용자의 운영자 접근을 차단한다', async () => {
  const response = createResponse();
  const requireAdmin = createRequireAdmin({
    database: { query: async () => [[{ is_admin: 0 }]] },
    getAdminEmails: () => 'test@test.com',
    getSchemaReady: async () => {},
  });
  await requireAdmin({ authUserId: 11 }, response, () => assert.fail('next가 호출되면 안 됩니다'));
  assert.equal(response.statusCode, 403);
});

test('운영자만 운영 API 처리를 계속한다', async () => {
  const response = createResponse();
  let nextCalled = false;
  const requireAdmin = createRequireAdmin({
    database: { query: async () => [[{ is_admin: 1, email: 'test@test.com' }]] },
    getAdminEmails: () => 'test@test.com',
    getSchemaReady: async () => {},
  });
  await requireAdmin({ authUserId: 7 }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, 200);
});

test('x-user-id와 요청 본문의 관리자 플래그는 인증으로 인정하지 않는다', async () => {
  const response = createResponse();
  const middleware = createRequireAdmin({ database: { query: () => assert.fail('DB 접근 금지') }, getSchemaReady: async () => {} });
  await middleware({ body: { user_id: 1, is_admin: true }, get: () => '1' }, response, () => assert.fail('접근 금지'));
  assert.equal(response.statusCode, 401);
});

for (const [label, row, emails] of [
  ['동명 일반 계정', { name: '김끼리', is_admin: 0, email: 'test@test.com' }, 'test@test.com'],
  ['지정되지 않은 관리자', { name: '김끼리', is_admin: 1, email: 'other@example.com' }, 'test@test.com'],
  ['관리자 지정 누락', { is_admin: 1, email: 'test@test.com' }, ''],
  ['권한 회수', { is_admin: '0', email: 'test@test.com' }, 'test@test.com'],
]) test(`${label} 차단`, async () => {
  const response = createResponse();
  const middleware = createRequireAdmin({ database: { query: async () => [[row]] }, getSchemaReady: async () => {}, getAdminEmails: () => emails });
  await middleware({ authUserId: 1 }, response, () => assert.fail('접근 금지'));
  assert.equal(response.statusCode, 403);
});
