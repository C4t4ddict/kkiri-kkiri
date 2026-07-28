const assert = require('node:assert/strict');
const test = require('node:test');
const { createTtlCache } = require('../ttlCache');

test('캐시는 설정된 최대 항목 수를 넘지 않는다', () => {
  const cache = createTtlCache({ ttlMs: 1000, maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('b'), 2);
  assert.equal(cache.get('c'), 3);
});

test('캐시를 명시적으로 비울 수 있다', () => {
  const cache = createTtlCache();
  cache.set('activities', [1]);
  cache.clear();
  assert.equal(cache.size(), 0);
});
