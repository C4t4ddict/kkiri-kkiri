const test = require('node:test');
const assert = require('node:assert/strict');
const {
  areFriends,
  ensureMessagingSchema,
  normalizeFriendshipPair,
} = require('../../messaging/service');

test('친구 관계 사용자 ID를 항상 같은 순서로 정규화한다', () => {
  assert.deepEqual(normalizeFriendshipPair(9, 2), [2, 9]);
  assert.deepEqual(normalizeFriendshipPair(2, 9), [2, 9]);
});

test('수락된 친구 관계만 쪽지 가능 관계로 판단한다', async () => {
  const calls = [];
  const database = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [[{ friendship_id: 4 }], []];
    },
  };

  assert.equal(await areFriends(database, 7, 3), true);
  assert.deepEqual(calls[0].params, [3, 7]);
  assert.match(calls[0].sql, /status = 'ACCEPTED'/);
});

test('친구와 쪽지 테이블을 함께 준비한다', async () => {
  const statements = [];
  const database = {
    query: async (sql) => {
      statements.push(sql);
      return [[], []];
    },
  };

  await ensureMessagingSchema(database);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /user_friendships/);
  assert.match(statements[1], /direct_messages/);
});
