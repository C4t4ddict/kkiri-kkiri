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

test('동시에 발생한 동일 캐시 미스를 한 번만 조회한다', async () => {
  const cache = createTtlCache();
  let loads = 0;
  const loader = async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { value: 42 };
  };

  const [first, second, third] = await Promise.all([
    cache.remember('shared', loader),
    cache.remember('shared', loader),
    cache.remember('shared', loader),
  ]);

  assert.equal(loads, 1);
  assert.deepEqual(first, { value: 42 });
  assert.equal(first, second);
  assert.equal(second, third);
  assert.equal(cache.pending(), 0);
});
