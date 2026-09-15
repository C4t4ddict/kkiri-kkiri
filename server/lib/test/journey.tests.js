const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { once } = require('node:events');
const { attachAuth, issueAuthToken } = require('../auth');
const service = require('../../journey/service');
const { createJourneyRouter } = require('../../journey/router');
const { archiveExpiredTeams } = require('../../portfolio/service');

const draft = () => ({
  activity_name: '팀 프로젝트',
  user_name: '작성자',
  role: '기획',
  period: '2026',
  summary: '소개',
  reflection: '비공개 회고',
  team: { phase: 'IN_PROGRESS', leader_user_id: 1 },
  documents: [{ content_markdown: '비밀 문서' }],
  members: [{ name: '비공개 팀원' }],
  records: [
    {
      record_id: 1,
      user_id: 1,
      document_id: 55,
      title: '조사',
      contribution: '인터뷰 진행',
      outcome: '가설 수정',
      artifact_url: 'https://example.com/result',
      task_status: '완료',
      confirmation_count: 2,
    },
  ],
});

test('계정 삭제 시 새 개인 데이터와 팀장 초대를 사용자 범위 안에서 정리한다', async () => {
  const calls=[];
  await service.deleteJourneyUserData({query:async(sql,params)=>{calls.push(sql);assert.ok(params.every(id=>id===7));assert.match(sql,/WHERE/);return []; }},7);
  assert.equal(calls.length,5);
  assert.match(calls.join(' '),/journey_shares/);
  assert.match(calls.join(' '),/journey_invites SET token=NULL/);
});

test('공유는 본인 선택 기록만 허용하고 비공개 문서·팀원·ID를 노출하지 않는다', () => {
  const snapshot = service.buildPublicSnapshot(draft(), { record_ids: [1] });
  assert.deepEqual(
    Object.keys(snapshot).sort(),
    [
      'activity_name',
      'user_name',
      'role',
      'period',
      'phase',
      'summary',
      'reflection',
      'records',
    ].sort(),
  );
  assert.equal(snapshot.reflection, '');
  assert.equal(snapshot.records[0].artifact_url, '');
  assert.equal(snapshot.records[0].record_id, undefined);
  assert.equal(snapshot.documents, undefined);
  assert.equal(snapshot.records[0].confirmation_count, 2);
  assert.throws(
    () => service.buildPublicSnapshot(draft(), { record_ids: [99] }),
    { statusCode: 403 },
  );
  assert.throws(() => service.buildPublicSnapshot(draft(), { record_ids: [] }));
  assert.throws(() =>
    service.buildPublicSnapshot(draft(), { record_ids: Array(31).fill(1) }),
  );
});

test('회고와 외부 링크는 명시적으로 선택한 경우만 공개한다', () => {
  const snapshot = service.buildPublicSnapshot(draft(), {
    record_ids: [1, 1],
    include_links: true,
    include_reflection: true,
  });
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.reflection, '비공개 회고');
  assert.equal(snapshot.records[0].artifact_url, 'https://example.com/result');
  assert.equal(
    service.buildPublicSnapshot(draft(), {
      record_ids: [1],
      include_links: 'true',
    }).records[0].artifact_url,
    '',
  );
});

test('잘못된 ID·날짜와 실행 가능한 URL을 거부한다', () => {
  for (const value of [0, -1, '1 OR 1=1', 1.2])
    assert.throws(() => service.positiveId(value));
  for (const value of ['2026-02-30', '2026-13-01', 'today'])
    assert.throws(() => service.validDate(value));
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,x',
    'https://user:secret@example.com',
  ])
    assert.throws(() => service.safeUrl(value));
  assert.equal(service.validDate('2028-02-29'), '2028-02-29');
});

test('마감일만 지난 팀은 자동 보관 대상으로 선택하지 않는다', async () => {
  await archiveExpiredTeams({
    query: async sql => {
      assert.match(sql, /activity_status = 'COMPLETED'/);
      assert.doesNotMatch(sql, /due_date\s*<=|NOW\(\)|REGEXP/);
      return [[]];
    },
  });
});

test('새 API는 익명·위조 사용자 헤더를 거부하고 공개 링크에 캐시 금지를 적용한다', async t => {
  const app = express();
  app.use(express.json());
  app.use(attachAuth);
  app.use(
    '/api/journey',
    createJourneyRouter({
      database: { query: async () => [[]] },
      getSchemaReady: async () => {},
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/journey`;
  for (const headers of [
    {},
    { 'x-user-id': '1' },
    { Authorization: 'Bearer forged' },
  ])
    assert.equal((await fetch(base + '/teams/1', { headers })).status, 401);
  assert.equal(
    (
      await fetch(base + '/templates', {
        headers: { Authorization: `Bearer ${issueAuthToken(1)}` },
      })
    ).status,
    200,
  );
  const response = await fetch(base + '/share/' + 'a'.repeat(64));
  assert.equal(response.status, 404);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
});
