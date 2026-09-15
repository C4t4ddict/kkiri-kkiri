// Creates synthetic goals ONLY in the isolated kkiri_journey_qa database.
// Never run against the user's original local DB or a production API.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { runInNewContext } = require('node:vm');
const { exports: progress } = (() => {
  const sandbox = { exports: {} };
  const source = readFileSync(path.join(__dirname, '../web/src/features/activity/goalProgress.ts'), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, sandbox);
  return sandbox;
})();
const API = 'http://127.0.0.1:3001';
let token;
const request = async (url, method = 'GET', body) => {
  const response = await fetch(API + url, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${url}: ${response.status}`);
  return data;
};
const key = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
(async () => {
  const health = await request('/api/db-health');
  assert.equal(health.database, 'kkiri_journey_qa');
  assert.equal(health.port, 3308);
  const session = await request('/api/login', 'POST', { email: 'test@test.com', password: 'test123' });
  assert.ok(session.token);
  token = session.token;
  const team = await request('/api/journey/teams', 'POST', {
    team_name: 'QA · 동네한바퀴 UX 개선팀', part: '서비스 기획', template_id: 'kickoff', required_members: 4,
  });
  const teamId = team.team_id;
  assert.ok(teamId);
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (today.getDay() + 6) % 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const ranges = {
    월간: [key(new Date(today.getFullYear(), today.getMonth(), 1)), key(new Date(today.getFullYear(), today.getMonth() + 1, 0))],
    주간: [key(monday), key(sunday)], 일일: [key(today), key(today)],
  };
  const examples = [
    ['월간', '문제 정의와 핵심 가설 정리', '완료'], ['월간', '프로토타입 사용자 테스트', '진행중'],
    ['주간', '사용자 인터뷰 질문지 완성', '완료'], ['주간', '인터뷰 결과와 개선점 정리', '진행중'], ['주간', '개선안 팀 리뷰', '미진행'],
    ['일일', '인터뷰 참여자 일정 확인', '완료'], ['일일', '핵심 화면 흐름 그리기', '진행중'], ['일일', '회의록과 결정 사항 공유', '미진행'],
  ];
  let lastId;
  for (const [scope, title, status] of examples) {
    const todo = await request('/todos', 'POST', { team_id: teamId, title, scope_type: scope,
      scope_start_date: ranges[scope][0], scope_end_date: ranges[scope][1] });
    if (status !== '미진행') await request(`/todos/${todo.todo_id}`, 'PUT', { status });
    lastId = todo.todo_id;
  }
  const loadGroups = async () => {
    const groups = {};
    for (const scope of ['월간', '주간', '일일']) {
      const [start, end] = scope === '일일' ? [key(monday), key(sunday)] : ranges[scope];
      groups[scope] = await request(`/todos/${teamId}?scope_type=${encodeURIComponent(scope)}&start=${start}&end=${end}&exact_period=1`);
    }
    return groups;
  };
  let metrics = progress.goalProgress(await loadGroups(), key(today));
  // Team creation also persists its first weekly kickoff goal; it must count too.
  assert.equal(metrics[0].total, 9);
  assert.deepEqual(Array.from(metrics, metric => metric.percent), [33, 50, 25, 33]);
  await request(`/todos/${lastId}`, 'PUT', { status: '진행중' });
  metrics = progress.goalProgress(await loadGroups(), key(today));
  assert.equal(metrics[0].percent, 33);
  assert.equal(metrics[0].inProgress, 4);
  await request(`/todos/${lastId}`, 'PUT', { status: '완료' });
  metrics = progress.goalProgress(await loadGroups(), key(today));
  assert.equal(metrics[0].percent, 44);
  assert.equal(metrics[3].percent, 67);
  await request(`/todos/${lastId}`, 'PUT', { status: '미진행' });
  metrics = progress.goalProgress(await loadGroups(), key(today));
  assert.equal(metrics[0].percent, 33);
  console.log(JSON.stringify({ ok: true, database: health.database, teamId, date: key(today),
    preview: `http://127.0.0.1:5174/activity?team=${teamId}`, metrics,
    checks: ['DB identity', 'three goal scope API reads', 'start/in-progress/completed transitions', 'completion reversal'] }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
