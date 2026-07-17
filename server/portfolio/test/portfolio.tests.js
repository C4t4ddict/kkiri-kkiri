const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const test = require('node:test');
const { getRelativePeriodEnd, groupCompletedTasks, normalizePortfolio } = require('../service');
const { buildTaskPages, createMiniPortfolioPdf } = require('../pdf');

test('완료 작업을 월간·주간·일일 범위로 분류한다', () => {
  const grouped = groupCompletedTasks([
    { todo_id: 1, title: '월간 결과물', scope_type: '월간', scope_start_date: '2026-07-01', scope_end_date: '2026-07-31' },
    { todo_id: 2, title: '주간 회고', scope_type: '주간', scope_start_date: '2026-07-13', scope_end_date: '2026-07-19' },
    { todo_id: 3, title: '오늘 작업', scope_type: '일일', scope_start_date: '2026-07-17', scope_end_date: '2026-07-17' },
  ]);

  assert.deepEqual(grouped.monthly.map((task) => task.title), ['월간 결과물']);
  assert.deepEqual(grouped.weekly.map((task) => task.title), ['주간 회고']);
  assert.deepEqual(grouped.daily.map((task) => task.title), ['오늘 작업']);
});

test('기존 미니포트폴리오 goals를 완료 작업으로 호환한다', () => {
  const portfolio = normalizePortfolio({
    portfolio_id: 1,
    goals: '기획서 완성, 최종 발표',
    completed_tasks: null,
    period_start: '2026-07-01',
    period_end: '2026-07-17',
  });

  assert.equal(portfolio.completed_task_count, 2);
  assert.deepEqual(portfolio.completed_tasks.overall.map((task) => task.title), ['기획서 완성', '최종 발표']);
});

test('주 단위 활동 기간으로 자동 종료일을 계산한다', () => {
  assert.equal(getRelativePeriodEnd('2026-07-01', '4주'), '2026-07-29');
  assert.equal(getRelativePeriodEnd('2026-07-01', '기간 미정'), null);
});

test('한글 미니포트폴리오 PDF를 생성한다', async () => {
  const pdf = createMiniPortfolioPdf({
    activity_name: '선형대수학 학습공동체',
    activity_type: '학습공동체',
    user_name: '홍길동',
    role: '리더',
    period: '2026-07-01 ~ 2026-07-17',
    completed_task_count: 3,
    member_count: 4,
    summary: '벡터와 행렬 개념을 학습하고 팀 프로젝트를 완수했습니다.',
    completed_tasks: {
      monthly: [{ todo_id: 1, title: '월간 학습 계획 완료' }],
      weekly: [{ todo_id: 2, title: '5주차 스터디 진행' }],
      daily: [{ todo_id: 3, title: '문제 풀이 및 회고' }],
      overall: [],
    },
  });
  const output = new PassThrough();
  const chunks = [];
  output.on('data', (chunk) => chunks.push(chunk));
  pdf.pipe(output);
  await new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
  });
  const buffer = Buffer.concat(chunks);

  assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
  assert.ok(buffer.length > 10_000);
});

test('완료 작업이 많아도 페이지 높이에 맞춰 분할한다', () => {
  const dailyTasks = Array.from({ length: 61 }, (_, index) => ({
    todo_id: index + 1,
    title: `일일 목표 ${index + 1}`,
  }));
  const pages = buildTaskPages({ monthly: [], weekly: [], daily: dailyTasks, overall: [] });

  assert.ok(pages.length > 1);
  assert.deepEqual(
    pages.flatMap((page) => page.flatMap((section) => section.tasks)),
    dailyTasks,
  );
  pages.forEach((page) => {
    const usedHeight = page.reduce((total, section) => total + section.height + 14, 0);
    assert.ok(usedHeight <= 634);
  });
  assert.equal(pages[1][0].offset > 0, true);
});
