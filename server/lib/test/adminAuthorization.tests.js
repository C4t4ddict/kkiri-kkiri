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
    getRequestUserId: () => null,
    getSchemaReady: async () => {},
  });
  await requireAdmin({}, response, () => assert.fail('next가 호출되면 안 됩니다'));
  assert.equal(response.statusCode, 401);
});

test('일반 사용자의 운영자 접근을 차단한다', async () => {
  const response = createResponse();
  const requireAdmin = createRequireAdmin({
    database: { query: async () => [[{ is_admin: 0 }]] },
    getRequestUserId: () => 11,
    getSchemaReady: async () => {},
  });
  await requireAdmin({}, response, () => assert.fail('next가 호출되면 안 됩니다'));
  assert.equal(response.statusCode, 403);
});

test('운영자만 운영 API 처리를 계속한다', async () => {
  const response = createResponse();
  let nextCalled = false;
  const requireAdmin = createRequireAdmin({
    database: { query: async () => [[{ is_admin: 1 }]] },
    getRequestUserId: () => 7,
    getSchemaReady: async () => {},
  });
  await requireAdmin({}, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, 200);
});
