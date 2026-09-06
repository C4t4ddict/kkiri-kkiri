const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isKkiriHealthPayload,
  parseWindowsListeningPids,
} = require('../../../scripts/ensure-api-server');

test('Windows netstat 결과에서 지정 포트의 LISTENING PID만 찾는다', () => {
  const output = [
    'TCP    0.0.0.0:3000     0.0.0.0:0      LISTENING       42720',
    'TCP    [::]:3000        [::]:0         LISTENING       42720',
    'TCP    127.0.0.1:5173   0.0.0.0:0      LISTENING       50000',
    'TCP    127.0.0.1:3000   127.0.0.1:9    ESTABLISHED     42720',
  ].join('\r\n');
  assert.deepEqual(parseWindowsListeningPids(output, 3000), [42720]);
});

test('끼리끼리 health 응답만 오래된 API 재시작 대상으로 인정한다', () => {
  assert.equal(isKkiriHealthPayload({
    status: 'ok',
    database: 'connected',
    activity_cache_entries: 1,
  }), true);
  assert.equal(isKkiriHealthPayload({ status: 'ok' }), false);
  assert.equal(isKkiriHealthPayload(null), false);
});
