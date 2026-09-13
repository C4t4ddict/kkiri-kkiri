/* eslint-env node, browser */
// Local QA only. Run against the disposable API:3001 / web:5174 database.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const runtimeRequire = process.env.QA_NODE_MODULES
  ? createRequire(path.join(process.env.QA_NODE_MODULES, '__qa__.cjs'))
  : require;
const { chromium } = runtimeRequire('playwright');
const output = path.resolve(
  __dirname,
  '../screenshots/2026-09-14-team-journey',
  `run-${Date.now()}`,
);
const WEB = 'http://127.0.0.1:5174';
const API = 'http://127.0.0.1:3001';

(async () => {
  const health = await (await fetch(API + '/api/db-health')).json();
  assert.equal(health.database, 'kkiri_journey_qa');
  assert.equal(health.port, 3308);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  fs.mkdirSync(output, { recursive: true });
  const api = async (url, method = 'GET', body) => {
    const token = await page.evaluate(() =>
      localStorage.getItem('kkiri_token'),
    );
    const response = await fetch(API + url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    assert.ok(response.ok, JSON.stringify(data));
    return data;
  };
  try {
    await page.goto(WEB + '/activity/new');
    await page.getByLabel('이메일', { exact: true }).fill('test@test.com');
    await page.getByLabel('비밀번호', { exact: true }).fill('test123');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.getByRole('heading', { name: '우리 팀 활동 시작' }).waitFor();
    await page
      .getByLabel('활동 이름', { exact: true })
      .fill('QA · 우리 동네 서비스 기획');
    await page
      .getByLabel('내 역할', { exact: true })
      .fill('기획 · 사용자 조사');
    await page.getByRole('button', { name: '팀 공간 만들기' }).click();
    await page.waitForURL(/\/activity\/\d+\/work/);
    const teamId = Number(page.url().match(/activity\/(\d+)/)[1]);
    const workspace = await api('/api/journey/teams/' + teamId);
    const documentId = workspace.documents[0].document_id;
    await page.goto(
      WEB + `/activity/${teamId}/documents?document=${documentId}`,
    );
    await page.getByLabel('문서 제목').waitFor();
    assert.equal(
      await page.getByLabel('문서 제목').inputValue(),
      '첫 모임 · 목표와 역할',
    );
    await page
      .getByLabel('Markdown 본문')
      .fill(
        '# 사용자 조사\n\n| 질문 | 확인한 점 |\n| --- | --- |\n| 모임을 찾기 어려운가요? | 시간 조율이 어렵다 |',
      );
    await page
      .getByText('모든 변경사항 저장됨', { exact: true })
      .waitFor({ timeout: 15000 });
    const saved = await api(`/teams/${teamId}/documents/${documentId}`);
    assert.match(saved.content_markdown, /시간 조율/);
    await page.getByRole('link', { name: '이 문서에서 할 일 만들기' }).click();
    const form = page.locator('#journey-new-task');
    await form
      .getByLabel('할 일', { exact: true })
      .fill('참여자 인터뷰 5건 정리');
    await form.getByLabel('마감', { exact: true }).fill('2026-09-21');
    assert.equal(
      await form.locator('select[name=document_id]').inputValue(),
      String(documentId),
    );
    await form.getByRole('button', { name: '작업 추가' }).click();
    const task = page
      .locator('.journey-task-list article')
      .filter({ hasText: '참여자 인터뷰 5건 정리' });
    await task.locator('select').selectOption('진행중');
    await page
      .getByText('작업 상태를 저장했습니다.', { exact: true })
      .waitFor();
    assert.ok((await task.innerText()).includes('2026-09-21'));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'workspace-desktop.png') });
    await task.locator('select').selectOption('완료');
    await page
      .getByText('작업 상태를 저장했습니다.', { exact: true })
      .waitFor();
    await task.getByRole('button', { name: '근거·내 기여' }).click();
    const record = page.locator('#journey-record-editor');
    await record
      .getByLabel('내가 맡아 한 일')
      .fill('질문지를 설계하고 인터뷰 5건의 공통 불편을 정리했습니다.');
    await record
      .locator('[name=outcome]')
      .fill('모임 시간 조율을 첫 번째 개선 과제로 정했습니다.');
    await record.getByRole('button', { name: '내 포트폴리오에 기록' }).click();
    await page
      .getByText('내 기여를 포트폴리오 초안에 연결했습니다.', { exact: true })
      .waitFor();
    await page
      .getByRole('link', { name: '내 포트폴리오', exact: true })
      .click();
    await page
      .getByLabel('활동 소개', { exact: true })
      .fill(
        '동네에서 함께할 사람을 찾고 모이는 과정을 개선한 팀 프로젝트입니다.',
      );
    await page.getByRole('button', { name: '소개·회고 저장' }).click();
    await page
      .getByText('소개와 회고를 저장했습니다.', { exact: true })
      .waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'portfolio-desktop.png') });
    await page
      .getByRole('button', { name: '미리보기 확인·공유 링크 만들기' })
      .click();
    await page.getByRole('link', { name: '공개본 확인' }).waitFor();
    const publicPath = await page
      .getByRole('link', { name: '공개본 확인' })
      .getAttribute('href');
    const publicContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'ko-KR',
    });
    const publicPage = await publicContext.newPage();
    await publicPage.goto(WEB + publicPath);
    await publicPage
      .getByRole('heading', { name: '내가 기여한 경험' })
      .waitFor();
    assert.ok(
      (await publicPage.locator('body').innerText()).includes('인터뷰 5건'),
    );
    assert.equal(
      await publicPage
        .locator('body')
        .evaluate(el => el.scrollWidth > innerWidth),
      false,
    );
    await publicPage.screenshot({
      path: path.join(output, 'shared-mobile.png'),
      fullPage: true,
    });
    await publicContext.close();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(WEB + `/activity/${teamId}/work`);
    await page.getByRole('heading', { name: '함께 시작하기' }).waitFor();
    assert.equal(
      await page.locator('body').evaluate(el => el.scrollWidth > innerWidth),
      false,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'workspace-mobile.png') });
    // Completed teams must remain selectable for evaluations in the full application.
    const all = await api('/my-teams?include=all');
    const archived = all.find(team => team.activity_status === 'COMPLETED');
    assert.ok(archived);
    await page.goto(WEB + `/mypage/evaluations?team=${archived.team_id}`);
    await page.getByLabel('활동 선택', { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('활동 선택', { exact: true }).inputValue(),
      String(archived.team_id),
    );
    await page.getByRole('button', { name: '최고예요', exact: true }).click();
    await page
      .getByLabel('평가 코멘트')
      .fill('QA: 맡은 작업과 근거를 함께 확인했습니다.');
    await page.getByRole('button', { name: /평가 (저장|수정)/ }).click();
    await page.locator('.form-success').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          passed: true,
          teamId,
          archivedEvaluationTeam: archived.team_id,
          screenshots: output,
          checks: [
            '로그인 후 시작 경로 복귀',
            '팀·문서 생성',
            '마크다운 표 자동 저장',
            '문서에서 작업 추가',
            '작업 상태·기여 기록',
            '포트폴리오 공유',
            '익명 모바일 공개본',
            '모바일 가로 넘침 없음',
            '완료 팀 평가 저장',
            '브라우저 런타임 오류 없음',
          ],
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await page.screenshot({
      path: path.join(output, 'last-failure.png'),
      fullPage: true,
    });
    console.error(
      'QA page:',
      page.url(),
      (await page.locator('body').innerText()).slice(-5500),
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
