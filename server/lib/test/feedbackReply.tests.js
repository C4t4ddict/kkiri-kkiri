const test = require('node:test');
const assert = require('node:assert/strict');
const { createFeedbackReply } = require('../../feedback/service');

const createDatabase = ({ feedback = { feedback_id: 3, user_id: 17 }, failure } = {}) => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); },
    async query(sql, values) {
      events.push({ sql, values });
      if (failure && sql.includes(failure)) throw new Error('database failure');
      if (sql.startsWith('SELECT feedback_id')) return [[feedback].filter(Boolean)];
      if (sql.includes('INSERT INTO developer_feedback_replies')) return [{ insertId: 91 }];
      return [{ affectedRows: 1 }];
    },
  };
  return { database: { getConnection: async () => connection }, events };
};

test('운영자 답장과 사용자 공지 알림을 하나의 트랜잭션으로 저장한다', async () => {
  const { database, events } = createDatabase();
  const result = await createFeedbackReply(database, {
    feedbackId: 3,
    adminUserId: 9,
    content: '확인 후 수정했습니다.',
  });
  assert.deepEqual(result, { replyId: 91, userId: 17 });
  assert.equal(events[0], 'begin');
  assert.equal(events.at(-2), 'commit');
  assert.equal(events.at(-1), 'release');
  const notification = events.find((event) => typeof event === 'object' && event.sql.includes('INSERT INTO user_notifications'));
  assert.deepEqual(notification.values, [17, '확인 후 수정했습니다.']);
});

test('피드백이 없으면 답장과 알림을 만들지 않고 롤백한다', async () => {
  const { database, events } = createDatabase({ feedback: null });
  assert.equal(await createFeedbackReply(database, { feedbackId: 404, adminUserId: 9, content: '답장' }), null);
  assert.deepEqual(events.filter((event) => typeof event === 'string'), ['begin', 'rollback', 'release']);
});

test('알림 저장이 실패하면 답장까지 함께 롤백한다', async () => {
  const { database, events } = createDatabase({ failure: 'INSERT INTO user_notifications' });
  await assert.rejects(
    createFeedbackReply(database, { feedbackId: 3, adminUserId: 9, content: '답장' }),
    /database failure/,
  );
  assert.equal(events.includes('commit'), false);
  assert.deepEqual(events.slice(-2), ['rollback', 'release']);
});
