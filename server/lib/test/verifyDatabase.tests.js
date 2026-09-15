const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('reviews 등 필수 테이블 누락은 데이터 조회 없이 스키마 실패로 보고한다', async () => {
  const output = [];
  let closed = false;
  let queries = 0;
  const connection = {
    query: async (sql, params) => {
      queries += 1;
      if (sql.startsWith('SELECT DATABASE')) return [[{ database_name: 'test', port: 3308 }]];
      if (sql.includes('information_schema')) return [params.slice(1).filter(name => name !== 'reviews').map(table_name => ({ table_name }))];
      assert.fail('필수 테이블 누락 후 데이터 쿼리를 실행했습니다');
    },
    end: async () => { closed = true; },
  };
  const context = { module: { exports: {} }, __dirname: path.join(__dirname, '../../scripts'),
    process: { env: { DB_NAME: 'test' } }, console: { log: value => output.push(JSON.parse(value)), error: assert.fail },
    require: name => name === 'path' ? path : name === 'dotenv' ? { config() {} } : { createConnection: async () => connection },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../scripts/verifyDatabase.js'), 'utf8'), context);
  await context.module.exports.run();
  assert.equal(queries, 2);
  assert.equal(closed, true);
  assert.equal(context.process.exitCode, 1);
  assert.equal(output[0].checks.schema, false);
  assert.deepEqual(output[0].missing_tables, ['reviews']);
});
