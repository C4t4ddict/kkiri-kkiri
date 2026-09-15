// Pure UI math tests. No server, database, or browser required.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const source = readFileSync(path.join(__dirname, '../web/src/features/activity/goalProgress.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const sandbox = { exports: {} };
runInNewContext(compiled, sandbox);
const { summarizeGoals, goalProgress } = sandbox.exports;
const goal = (id, status = '미진행', start = '2026-09-15', end = start) => ({
  todo_id: id, title: '테스트 목표', status, scope_type: '일일',
  scope_start_date: start, scope_end_date: end,
});

test('no goals is distinguishable from 0% completed', () => {
  assert.equal(summarizeGoals([]).total, 0);
  assert.equal(summarizeGoals([]).percent, 0);
  assert.equal(summarizeGoals([goal(1)]).total, 1);
  assert.equal(summarizeGoals([goal(1)]).percent, 0);
});
test('in-progress goals never count as completed', () => {
  const result = summarizeGoals([goal(1, '진행중'), goal(2, '완료'), goal(3)]);
  assert.equal(result.completed, 1);
  assert.equal(result.percent, 33);
  assert.equal(result.inProgress, 1);
  assert.equal(result.remaining, 2);
});
test('deduplicates goals by their API id before calculating percentages', () => {
  const result = summarizeGoals([goal(1, '완료'), goal(1, '완료'), goal(2)]);
  assert.equal(result.total, 2);
  assert.equal(result.percent, 50);
});
test('all complete and status reversals recalculate accurately', () => {
  const items = [goal(1, '완료'), goal(2, '완료')];
  assert.equal(summarizeGoals(items).percent, 100);
  items[1].status = '미진행';
  assert.equal(summarizeGoals(items).percent, 50);
  assert.equal(summarizeGoals(items).remaining, 1);
});
test('rings keep separate month/week/today denominators', () => {
  const groups = { 월간: [goal(1, '완료')], 주간: [goal(2)], 일일: [goal(3, '완료'), goal(4, '진행중')] };
  const metrics = goalProgress(groups, '2026-09-15');
  assert.equal(metrics.length, 4);
  assert.deepEqual(Array.from(metrics, item => item.percent), [50, 100, 0, 50]);
  assert.deepEqual(Array.from(metrics, item => item.total), [4, 1, 1, 2]);
});
test('today includes multi-day goals covering today, excludes other dates', () => {
  const groups = { 월간: [], 주간: [], 일일: [
    goal(1, '완료', '2026-09-14', '2026-09-16'),
    goal(2, '완료', '2026-09-15T00:00:00.000Z'),
    goal(3, '미진행', '2026-09-14'), goal(4, '미진행', '2026-09-16'),
  ] };
  assert.equal(goalProgress(groups, '2026-09-15')[3].total, 2);
  assert.equal(goalProgress(groups, '2026-09-15')[3].percent, 100);
});
test('calculation does not reorder or mutate goals', () => {
  const goals = Object.freeze([Object.freeze(goal(4)), Object.freeze(goal(1, '완료'))]);
  summarizeGoals(goals);
  assert.equal(goals[0].todo_id, 4);
  assert.equal(goals[1].todo_id, 1);
});
