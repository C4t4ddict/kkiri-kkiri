const path = require('path');
const { spawn } = require('child_process');

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getSchedulerConfig = (env = process.env) => ({
  enabled: String(env.CRAWLER_AUTO_ENABLED ?? 'true').toLowerCase() !== 'false',
  intervalMs: toPositiveNumber(env.CRAWLER_AUTO_INTERVAL_HOURS, 6) * 60 * 60 * 1000,
  initialDelayMs: toPositiveNumber(env.CRAWLER_AUTO_INITIAL_DELAY_SECONDS, 30) * 1000,
});

const createCrawlerRunner = ({
  env = process.env,
  logger = console,
  spawnProcess = spawn,
} = {}) => {
  let running = false;

  const runNow = () => {
    if (running) {
      logger.warn('[crawler] 이전 자동 수집이 진행 중이어서 이번 실행을 건너뜁니다.');
      return Promise.resolve(false);
    }

    running = true;
    logger.log('[crawler] 공모전 자동 수집을 시작합니다.');

    return new Promise((resolve) => {
      const child = spawnProcess(process.execPath, [path.join(__dirname, 'index.js')], {
        cwd: path.join(__dirname, '..'),
        env,
        stdio: 'inherit',
      });
      let settled = false;

      const finish = (success, message) => {
        if (settled) return;
        settled = true;
        running = false;
        if (message) logger.error(message);
        else logger.log('[crawler] 공모전 자동 수집을 마쳤습니다.');
        resolve(success);
      };

      child.once('error', (error) => {
        finish(false, `[crawler] 자동 수집 프로세스 실행 실패: ${error.message}`);
      });
      child.once('exit', (code, signal) => {
        finish(
          code === 0,
          code === 0
            ? null
            : `[crawler] 자동 수집이 비정상 종료되었습니다. code=${code} signal=${signal || '-'}`
        );
      });
    });
  };

  return { runNow, isRunning: () => running };
};

const startCrawlerScheduler = ({ env = process.env, logger = console, spawnProcess = spawn } = {}) => {
  const config = getSchedulerConfig(env);
  const runner = createCrawlerRunner({ env, logger, spawnProcess });

  if (!config.enabled) {
    logger.log('[crawler] 공모전 자동 수집이 비활성화되어 있습니다.');
    return { ...runner, stop: () => undefined, config };
  }

  const initialTimer = setTimeout(() => runner.runNow(), config.initialDelayMs);
  const intervalTimer = setInterval(() => runner.runNow(), config.intervalMs);
  initialTimer.unref?.();
  intervalTimer.unref?.();

  logger.log(
    `[crawler] ${config.initialDelayMs / 1000}초 후 첫 실행, ` +
    `${config.intervalMs / (60 * 60 * 1000)}시간 간격으로 자동 수집합니다.`
  );

  return {
    ...runner,
    config,
    stop: () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    },
  };
};

module.exports = { createCrawlerRunner, getSchedulerConfig, startCrawlerScheduler };
