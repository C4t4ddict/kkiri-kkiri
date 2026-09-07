const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseWindow, parseEvent, goalEvents, saveEvent } = require('../../calendar/service');
const { createCalendarRouter } = require('../../calendar/router');

const input = { title: '약속', notes: '', start_date: '2026-09-08', end_date: '2026-09-08', all_day: false,
  start_time: '10:00', end_time: '11:00', important: true, completed: false, team_id: null };
test('실재하는 날짜와 최대 조회 기간을 검증한다', () => {
  assert.throws(() => parseWindow('2026-02-29', '2026-03-01'));
  assert.throws(() => parseWindow('2026-09-10', '2026-09-01'));
  assert.throws(() => parseWindow('2026-01-01', '2026-12-31'));
  assert.deepEqual(parseWindow('2024-02-29', '2024-03-03'), { start: '2024-02-29', end: '2024-03-03' });
  assert.doesNotThrow(() => parseWindow('1999-12-27', '2000-02-06'));
});
test('시간 역전·같은 시각·잘못된 필드와 길이를 거부한다', () => {
  for (const patch of [{ start_time: '11:00' }, { end_time: '09:00' }, { start_time: '25:00' },
    { title: ' ' }, { title: 'a'.repeat(161) }, { important: 'true' }, { team_id: -1 }, { end_date: '2026-02-30' }]) {
    assert.throws(() => parseEvent({ ...input, ...patch }));
  }
  assert.equal(parseEvent({ ...input, all_day: true }).start_time, null);
  assert.doesNotThrow(() => parseEvent({ ...input, end_date: '2026-09-09', end_time: '09:00' }));
});
test('구간 목표의 일별 행을 중복 표시하지 않고 전체 완료율을 계산한다', () => {
  const rows = [1, 2, 3].map(id => ({ todo_id: id, team_id: 2, team_name: '팀', title: '자료 조사', scope_type: '일일',
    status: id === 3 ? '진행중' : '완료', range_group_id: 'range1', range_start_date: '2026-08-31', range_end_date: '2026-09-02' }));
  const result = goalEvents(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].completed_count, 2);
  assert.equal(result[0].total_count, 3);
  assert.equal(result[0].completed, false);
  assert.equal(result[0].in_progress, true);
  assert.equal(goalEvents([...rows, { ...rows[0], team_id: 3 }]).length, 2);
});
test('참여하지 않은 팀으로 연결하는 일정은 저장하지 않는다', async () => {
  let writes = 0;
  await assert.rejects(saveEvent({ query: async sql => { if (!sql.startsWith('SELECT')) writes++; return [[]]; } }, 7, { ...input, team_id: 12 }), error => error.status === 403);
  assert.equal(writes, 0);
});
test('수정은 로그인 사용자와 버전까지 일치해야 하며 다른 사용자 ID를 무시한다', async () => {
  let seen;
  await assert.rejects(saveEvent({ query: async (sql, values) => { seen = { sql, values }; return [{ affectedRows: 0 }]; } }, 7,
    { ...input, user_id: 999, version: 3 }, 10), error => error.status === 409);
  assert.match(seen.sql, /event_id=\? AND user_id=\?.*version=\?/s);
  assert.deepEqual(seen.values.slice(-3), [10, 7, 3]);
});
test('캘린더 라우터는 익명·레거시 헤더 인증을 거부하고 삭제 소유자를 한정한다', async () => {
  const queries = [];
  const app = express();
  app.use(express.json());
  // 테스트 인증 경계: 실제 앱은 서명된 Bearer 토큰으로 authUserId를 설정한다.
  app.use((req, _res, next) => { req.authUserId = req.get('authorization') === 'test-session' ? 7 : null; next(); });
  app.use('/api/calendar', createCalendarRouter({ database: { query: async (sql, values) => { queries.push({ sql, values }); return [{ affectedRows: 0 }]; } }, getSchemaReady: () => Promise.resolve() }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/calendar`;
  try {
    assert.equal((await fetch(url, { headers: { 'x-user-id': '7' } })).status, 401);
    assert.equal(queries.length, 0);
    const result = await fetch(`${url}/events/99?user_id=999`, { method: 'DELETE', headers: { authorization: 'test-session' } });
    assert.equal(result.status, 404);
    assert.deepEqual(queries[0].values, [99, 7]);
    assert.match(queries[0].sql, /user_id=\?/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
