const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createCrawlerRunner, getSchedulerConfig } = require('../scheduler');

test('자동 수집 기본값은 활성화, 6시간 간격, 30초 지연이다', () => {
  assert.deepEqual(getSchedulerConfig({}), {
    enabled: true,
    intervalMs: 6 * 60 * 60 * 1000,
    initialDelayMs: 30 * 1000,
  });
});

test('자동 수집 환경 변수를 밀리초 설정으로 변환한다', () => {
  assert.deepEqual(getSchedulerConfig({
    CRAWLER_AUTO_ENABLED: 'false',
    CRAWLER_AUTO_INTERVAL_HOURS: '12',
    CRAWLER_AUTO_INITIAL_DELAY_SECONDS: '45',
  }), {
    enabled: false,
    intervalMs: 12 * 60 * 60 * 1000,
    initialDelayMs: 45 * 1000,
  });
});

test('이전 수집이 끝나기 전에는 중복 프로세스를 만들지 않는다', async () => {
  const child = new EventEmitter();
  let spawnCount = 0;
  const runner = createCrawlerRunner({
    logger: { log() {}, warn() {}, error() {} },
    spawnProcess: () => {
      spawnCount += 1;
      return child;
    },
  });

  const firstRun = runner.runNow();
  assert.equal(await runner.runNow(), false);
  assert.equal(spawnCount, 1);
  child.emit('exit', 0, null);
  assert.equal(await firstRun, true);
  assert.equal(runner.isRunning(), false);
});
