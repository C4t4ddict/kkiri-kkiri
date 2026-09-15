const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { runInNewContext } = require('node:vm');
const scope = { exports: {}, Date };
runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../web/src/shared/date/calendarDaysUntil.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, scope);
const { calendarDaysUntil } = scope.exports;
const previousTimezone = process.env.TZ;
try {
  for (const zone of ['Asia/Seoul', 'UTC', 'America/Los_Angeles']) {
    process.env.TZ = zone;
    for (const hour of [0, 8, 9, 23]) {
      const now = new Date(2026, 8, 9, hour, 59);
      assert.equal(calendarDaysUntil('2026-09-09', now), 0, `${zone} ${hour}: closing today`);
      assert.equal(calendarDaysUntil('2026-09-10', now), 1);
      assert.equal(calendarDaysUntil('2026-09-08', now), -1);
    }
    assert.equal(calendarDaysUntil('2028-02-29', new Date(2028, 1, 28)), 1);
    assert.equal(calendarDaysUntil('2027-01-01', new Date(2026, 11, 31)), 1);
    assert.equal(calendarDaysUntil('2026-03-09', new Date(2026, 2, 7, 23)), 2);
    assert.equal(calendarDaysUntil('2026-11-02', new Date(2026, 9, 31, 23)), 2);
    for (const value of [undefined, null, '', 'invalid', '2026-02-30', '2026-13-01']) {
      assert.equal(calendarDaysUntil(value), null);
    }
  }
  process.env.TZ = 'Asia/Seoul';
  assert.equal(calendarDaysUntil('2026-09-08T15:00:00Z', new Date(2026, 8, 9, 1)), 0);
  assert.equal(calendarDaysUntil('2026-09-09', new Date('invalid')), null);
} finally {
  if (previousTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimezone;
}
console.log('PASS activity deadlines: KST midnight/morning, UTC, negative offset, leap year and DST boundaries');
