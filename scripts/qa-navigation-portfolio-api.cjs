// Synthetic integration data is retained ONLY in kkiri_journey_qa (port 3308).
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const API = 'http://127.0.0.1:3001';
let token = '';
const request = async (url, method = 'GET', body, expected = 200, customToken = token) => {
  const response = await fetch(API + url, { method,
    headers: { ...(customToken ? { Authorization: `Bearer ${customToken}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(data)}`);
  return data;
};
(async () => {
  const health = await request('/api/db-health');
  assert.equal(health.database, 'kkiri_journey_qa'); assert.equal(health.port, 3308);
  const admin = await request('/api/login', 'POST', { email: 'test@test.com', password: 'test123' });
  token = admin.token;
  assert.equal((await request('/api/admin/access')).allowed, true);
  const member = await request('/api/login', 'POST', { email: 'designer@test.com', password: 'test123' });
  for (const [url, method] of [['/api/admin/access','GET'], ['/api/admin/overview','GET'], ['/api/admin/activities','GET'], ['/api/admin/developer-feedback','GET'], ['/api/admin/curricula','POST'], ['/api/admin/curricula/images','POST'], ['/api/admin/crawler/run','POST']]) {
    await request(url, method, undefined, 403, member.token);
    await request(url, method, undefined, 401, '');
  }
  const spoof = await fetch(API + '/api/admin/access', { headers: { 'x-user-id': '1' } });
  assert.equal(spoof.status, 401);
  const team = await request('/api/journey/teams', 'POST', { team_name: 'QA · 미니 포트폴리오 보존 검증', part: '서비스 기획', template_id: 'kickoff' });
  const teamId = team.team_id;
  const opened = await Promise.all([request(`/api/teams/${teamId}/mini-portfolio`, 'POST'), request(`/api/teams/${teamId}/mini-portfolio`, 'POST')]);
  const id = opened[0].portfolio_id;
  assert.equal(id, opened[1].portfolio_id);
  const url = `/users/1/past-activities/${id}`;
  assert.equal((await request(url)).is_draft, true);
  await request(`/api/teams/${teamId}/mini-portfolio`, 'POST', undefined, 403, member.token);
  await request(url, 'GET', undefined, 403, member.token);
  await request(url, 'PUT', { title: '가로채기' }, 403, member.token);
  const edited = { title: '내가 다듬은 활동 제목', role: 'UX 기획', summary: '인터뷰부터 결과 발표까지 담당했습니다.', achievements: ['사용자 인터뷰 진행'], reflection: '다음에는 초기 검증을 더 빠르게', links: [{ title: '결과물', url: 'https://example.com' }], image_urls: [] };
  await request(url, 'PUT', edited);
  assert.equal((await request(url)).activity_name, edited.title);
  assert.equal((await request('/users/1/past-activities')).some(item => item.portfolio_id === id), false);
  assert.equal((await request('/users/1/awards')).items.some(item => item.portfolio_id === id), false);
  const goal = await request('/todos', 'POST', { team_id: teamId, title: 'QA 완료 목표', scope_type: '일일', scope_start_date: '2026-09-16', scope_end_date: '2026-09-16' }, 201);
  await request(`/todos/${goal.todo_id}`, 'PUT', { status: '완료' });
  assert.equal((await request(url)).completed_task_count, 1);
  await request(`/todos/${goal.todo_id}`, 'PUT', { status: '미진행' });
  assert.equal((await request(url)).completed_task_count, 0);
  await request(`/todos/${goal.todo_id}`, 'PUT', { status: '완료' });
  await request(`/api/journey/teams/${teamId}/phase`, 'PUT', { phase: 'WRAPPING' });
  await request(`/api/journey/teams/${teamId}/phase`, 'PUT', { phase: 'COMPLETED' });
  const completed = await request(url);
  assert.equal(completed.is_draft, false); assert.ok(completed.archived_at);
  assert.equal(completed.activity_name, edited.title); assert.equal(completed.summary, edited.summary);
  assert.equal(completed.reflection, edited.reflection); assert.deepEqual(completed.achievements, edited.achievements);
  assert.equal(completed.completed_task_count, 1);
  assert.equal((await request('/users/1/past-activities')).filter(item => item.portfolio_id === id).length, 1);
  assert.equal((await request('/api/portfolios/activities')).some(item => item.team_id === teamId), false);
  assert.equal((await request(`/api/teams/${teamId}/mini-portfolio`, 'POST')).portfolio_id, id);
  const image = new FormData(); image.append('image', new Blob([readFileSync(path.join(__dirname, '../web/public/tutorial/curriculum-catalog.jpg'))], { type: 'image/jpeg' }), 'curriculum-preview.jpg');
  const uploaded = await request('/api/admin/curricula/images', 'POST', image, 201);
  assert.ok(uploaded.imageUrl);
  const curriculum = await request('/api/admin/curricula', 'POST', {
    organization_name: 'QA · 끼리끼리', organization_slug: 'qa-kkiri-navigation', title: `QA 기업 이미지 표시 검증 ${Date.now()}`, summary: '대표 이미지가 있는 카드의 표시·저장 검증 과정입니다.',
    cover_image_url: uploaded.imageUrl, organization_logo_url: uploaded.imageUrl, duration_weeks: 2, weekly_hours: 3,
    nodes: [{ stable_key: 'first', level: 'DAILY', title: '미니 포트폴리오 작성', relative_start_day: 0, relative_end_day: 0, estimated_minutes: 60 }],
  }, 201);
  assert.equal(curriculum.cover_image_url, uploaded.imageUrl);
  assert.equal((await request(`/api/curricula/${curriculum.curriculum_id}`)).organization_logo_url, uploaded.imageUrl);
  console.log(JSON.stringify({ ok: true, database: health.database, archivedTeamId: teamId, portfolioId: id, curriculumId: curriculum.curriculum_id,
    checks: ['admin allowlist+DB role+signed token', 'anonymous/member API denial', 'draft idempotency', 'cross-user isolation', 'draft not archived/awarded', 'live goals and reversal', 'completion preserves edits and ID', 'image upload+curriculum persistence'] }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
