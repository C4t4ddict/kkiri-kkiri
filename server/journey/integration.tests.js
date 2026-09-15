// Opt-in: JOURNEY_DB_TEST=1 node --test journey/integration.tests.js
// Only the disposable localhost:3308 / kkiri_journey_qa database is accepted.
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const test = require('node:test');
const express = require('express');
const { once } = require('node:events');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { attachAuth, issueAuthToken } = require('../lib/auth');
const service = require('./service');
const { createJourneyRouter } = require('./router');
const {
  ensurePortfolioSchema,
  archiveExpiredTeams,
} = require('../portfolio/service');
const {
  ensureActivityDocumentsSchema,
} = require('../activity-documents/service');

test(
  '실제 MySQL: 생성 → 동시 합류 → 문서·기여 → 확인 → 공유·해제 → 보관',
  { skip: process.env.JOURNEY_DB_TEST !== '1', timeout: 90000 },
  async t => {
    const db = require('mysql2/promise').createPool({
      host: '127.0.0.1',
      port: 3308,
      user: 'kkiri_qa',
      password: process.env.DB_PASSWORD,
      database: 'kkiri_journey_qa',
      connectionLimit: 5,
      dateStrings: true,
    });
    t.after(() => db.end());
    await ensurePortfolioSchema(db);
    await ensureActivityDocumentsSchema(db);
    await service.ensureJourneySchema(db);
    const app = express();
    app.use(express.json({ limit: '64kb' }));
    app.use(attachAuth);
    app.use(
      '/api/journey',
      createJourneyRouter({ database: db, getSchemaReady: async () => {} }),
    );
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}/api/journey`;
    const request = async (user, url, method = 'GET', body) => {
      const response = await fetch(base + url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(user ? { Authorization: `Bearer ${issueAuthToken(user)}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      return { status: response.status, data };
    };
    const created = await request(1, '/teams', 'POST', {
      team_name: 'QA · 근거 기반 팀 프로젝트',
      required_members: 2,
      due_date: '2020-01-01',
      part: '기획',
    });
    assert.equal(created.status, 200, JSON.stringify(created));
    const id = created.data.team_id;
    const url = `/teams/${id}`;
    let workspace = (await request(1, url)).data;
    assert.equal(workspace.members.length, 1);
    assert.equal(workspace.documents.length, 1);
    assert.equal(workspace.tasks.length, 1);
    assert.equal(
      workspace.tasks[0].document_id,
      workspace.documents[0].document_id,
    );
    await archiveExpiredTeams(db);
    assert.equal((await request(1, url)).data.team.phase, 'IN_PROGRESS');
    assert.equal((await request(2, url)).status, 403);
    const token = (await request(1, url + '/invite', 'POST')).data.token;
    assert.match(token, /^[a-f0-9]{64}$/);
    const [first, second] = await Promise.all([
      request(2, `/invite/${token}/accept`, 'POST', { part: '디자인' }),
      request(3, `/invite/${token}/accept`, 'POST', { part: '개발' }),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    const member = first.status === 200 ? 2 : 3;
    const outsider = member === 2 ? 3 : 2;
    assert.equal(
      (await request(member, `/invite/${token}/accept`, 'POST', {})).status,
      200,
    );
    assert.equal((await request(1, url)).data.members.length, 2);
    assert.equal(
      (await request(member, url + '/phase', 'PUT', { phase: 'WRAPPING' }))
        .status,
      403,
    );
    const foreign = (
      await request(outsider, '/teams', 'POST', { team_name: 'QA · 다른 팀' })
    ).data.team_id;
    const foreignDocument = (await request(outsider, `/teams/${foreign}`)).data
      .documents[0].document_id;
    const task = workspace.tasks[0].todo_id;
    const document = workspace.documents[0].document_id;
    assert.equal(
      (
        await request(1, url + '/records', 'POST', {
          todo_id: task,
          document_id: foreignDocument,
          contribution: '침범',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(1, url + '/tasks', 'POST', {
          title: '다른 팀원',
          assigned_user_id: outsider,
          due_date: '2026-10-01',
        })
      ).status,
      403,
    );
    assert.equal(
      (await request(1, url + `/tasks/${task}`, 'PUT', { status: '완료' }))
        .status,
      200,
    );
    const recordInput = {
      todo_id: task,
      document_id: document,
      contribution: '사용자 인터뷰를 설계하고 5건을 정리했습니다.',
      outcome: '팀의 핵심 문제를 정리했습니다.',
      artifact_url: 'https://example.com/qa-result',
    };
    const record = await request(1, url + '/records', 'POST', recordInput);
    assert.equal(record.status, 200, JSON.stringify(record));
    const recordId = record.data.record_id;
    assert.equal(
      (
        await request(1, url + `/records/${recordId}/confirm`, 'PUT', {
          version: 1,
          confirm: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(member, url + `/records/${recordId}/confirm`, 'PUT', {
          version: 1,
          confirm: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(1, url + '/draft')).data.records[0].confirmation_count,
      1,
    );
    await request(1, url + '/records', 'POST', {
      ...recordInput,
      outcome: '5건의 근거로 핵심 문제를 정리했습니다.',
    });
    assert.equal(
      (await request(1, url + '/draft')).data.records[0].confirmation_count,
      0,
    );
    assert.equal(
      (
        await request(member, url + `/records/${recordId}/confirm`, 'PUT', {
          version: 1,
          confirm: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(member, url + `/records/${recordId}/confirm`, 'PUT', {
          version: 2,
          confirm: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(member, url + '/share', 'POST', {
          record_ids: [recordId],
        })
      ).status,
      403,
    );
    await request(1, url + '/draft', 'PUT', {
      summary: '근거 기반 팀 프로젝트',
      reflection: '비공개 회고',
    });
    const published = await request(1, url + '/share', 'POST', {
      record_ids: [recordId],
    });
    assert.equal(published.status, 200);
    const share = await request(null, '/share/' + published.data.token);
    assert.equal(share.status, 200);
    assert.equal(share.data.reflection, '');
    assert.equal(share.data.records[0].artifact_url, '');
    assert.equal(share.data.documents, undefined);
    await request(1, url + '/draft', 'PUT', {
      summary: '수정된 비공개 초안',
      reflection: '새 회고',
    });
    assert.equal(
      (await request(null, '/share/' + published.data.token)).data.summary,
      '근거 기반 팀 프로젝트',
    );
    const pdf = await fetch(base + url + '/pdf', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${issueAuthToken(1)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ record_ids: [recordId] }),
    });
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type'), /application\/pdf/);
    assert.equal(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 4)
        .toString(),
      '%PDF',
    );
    await request(1, url + '/share', 'DELETE');
    assert.equal(
      (await request(null, '/share/' + published.data.token)).status,
      404,
    );
    assert.equal(
      (await request(1, url + '/phase', 'PUT', { phase: 'COMPLETED' })).status,
      409,
    );
    assert.equal(
      (await request(1, url + '/phase', 'PUT', { phase: 'WRAPPING' })).status,
      200,
    );
    assert.equal(
      (await request(1, url + '/phase', 'PUT', { phase: 'COMPLETED' })).status,
      200,
    );
    workspace = (await request(1, url)).data;
    assert.equal(workspace.team.phase, 'COMPLETED');
    assert.ok(workspace.portfolio_id);
    assert.equal(
      (await request(1, url + `/tasks/${task}`, 'PUT', { status: '진행중' }))
        .status,
      409,
    );
    assert.equal((await request(null, `/invite/${token}`)).status, 404);
    assert.equal(
      (await request(1, url + '/records', 'POST', recordInput)).status,
      200,
    );
    assert.equal((await request(1, url + '/draft')).data.records.length, 1);
    assert.equal(workspace.documents.length, 1);
    // A separate active link must be invalidated on revocation, not merely on completion.
    const invite2 = (
      await request(outsider, `/teams/${foreign}/invite`, 'POST')
    ).data.token;
    await request(outsider, `/teams/${foreign}/invite`, 'DELETE');
    assert.equal(
      (await request(member, `/invite/${invite2}/accept`, 'POST', {})).status,
      404,
    );
  },
);
