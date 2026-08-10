const test = require('node:test');
const assert = require('node:assert/strict');
const { getAllowedOrigins, isOriginAllowed } = require('../httpSecurity');

test('웹 CORS는 설정된 출처와 네이티브 요청만 허용한다', () => {
  const origins = getAllowedOrigins('https://kkiri.example,http://localhost:5173');
  assert.equal(isOriginAllowed('https://kkiri.example', origins), true);
  assert.equal(isOriginAllowed('https://attacker.example', origins), false);
  assert.equal(isOriginAllowed(undefined, origins), true);
});
