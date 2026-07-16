const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createPool, ensureCrawlerSchema, finishRun, saveActivity, saveCrawlError, startRun } = require('./database');
const { HttpClient } = require('./httpClient');
const { createThinkcontestSource } = require('./sources/thinkcontest');
const { createWevitySource } = require('./sources/wevity');

const SOURCE_FACTORIES = {
  thinkcontest: createThinkcontestSource,
  wevity: createWevitySource,
};

const toPositiveInteger = (value, name) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name}은 1 이상의 정수여야 합니다.`);
  return parsed;
};

const parseArguments = (argumentsList) => {
  const options = {
    source: 'all',
    pages: toPositiveInteger(process.env.CRAWLER_PAGES || 3, 'CRAWLER_PAGES'),
    limit: toPositiveInteger(process.env.CRAWLER_LIMIT || 50, 'CRAWLER_LIMIT'),
    dryRun: false,
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--source') options.source = argumentsList[++index];
    else if (argument === '--pages') options.pages = toPositiveInteger(argumentsList[++index], '--pages');
    else if (argument === '--limit') options.limit = toPositiveInteger(argumentsList[++index], '--limit');
    else if (argument === '--help') options.help = true;
    else throw new Error(`지원하지 않는 옵션입니다: ${argument}`);
  }
  if (options.source !== 'all' && !SOURCE_FACTORIES[options.source]) {
    throw new Error(`--source는 all, ${Object.keys(SOURCE_FACTORIES).join(', ')} 중 하나여야 합니다.`);
  }
  return options;
};

const printHelp = () => {
  console.log(`사용법: npm run crawl:competitions -- [옵션]

옵션:
  --source all|wevity|thinkcontest  수집 사이트 선택
  --pages <숫자>                     사이트별 목록 페이지 수
  --limit <숫자>                     사이트별 최대 상세 수집 수
  --dry-run                           DB 저장 없이 결과 확인
  --help                              도움말 출력`);
};

const previewActivity = (activity) => ({
  ...activity,
  details: activity.details ? `${activity.details.slice(0, 300)}${activity.details.length > 300 ? '...' : ''}` : null,
});

const run = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const selectedKeys = options.source === 'all' ? Object.keys(SOURCE_FACTORIES) : [options.source];
  const sources = selectedKeys.map((key) => SOURCE_FACTORIES[key]());
  const client = new HttpClient({
    userAgent:
      process.env.CRAWLER_USER_AGENT ||
      'kkiri-kkiri-crawler/1.0 (+https://github.com/C4t4ddict/kkiri-kkiri)',
    delayMs: Number(process.env.CRAWLER_REQUEST_DELAY_MS || 1000),
    timeoutMs: Number(process.env.CRAWLER_TIMEOUT_MS || 15000),
    retries: Number(process.env.CRAWLER_RETRIES || 3),
    respectRobots: process.env.CRAWLER_RESPECT_ROBOTS !== 'false',
  });

  let pool = null;
  let runId = null;
  const summary = { discovered: 0, saved: 0, errors: 0, errorMessages: [] };

  try {
    if (!options.dryRun) {
      pool = createPool();
      await ensureCrawlerSchema(pool);
      runId = await startRun(pool, sources.map((source) => source.name).join(','));
    }

    for (const source of sources) {
      let items;
      try {
        items = await source.discover(client, options);
        summary.discovered += items.length;
        console.log(`[${source.name}] 목록 ${items.length}건 발견`);
      } catch (error) {
        summary.errors += 1;
        summary.errorMessages.push(`[${source.name}/목록] ${error.message}`);
        console.error(`[${source.name}] 목록 수집 실패:`, error.message);
        if (pool) await saveCrawlError(pool, runId, source.name, null, 'discover', error);
        continue;
      }

      for (const item of items) {
        try {
          const { activity, rawHtml } = await source.fetchDetail(client, item);
          if (options.dryRun) {
            console.log(JSON.stringify(previewActivity(activity), null, 2));
          } else {
            const result = await saveActivity(pool, runId, activity, rawHtml);
            console.log(`[${source.name}] 저장 #${result.activityId} ${activity.title}`);
          }
          summary.saved += 1;
        } catch (error) {
          summary.errors += 1;
          summary.errorMessages.push(`[${source.name}/${item.sourceItemId}] ${error.message}`);
          console.error(`[${source.name}] ${item.sourceItemId} 처리 실패:`, error.message);
          if (pool) await saveCrawlError(pool, runId, source.name, item, 'detail', error);
        }
      }
    }

    const status = summary.errors === 0 ? 'completed' : summary.saved > 0 ? 'partial' : 'failed';
    if (pool && runId) {
      await finishRun(pool, runId, {
        ...summary,
        status,
        errorMessage: summary.errorMessages.join('\n').slice(0, 10000),
      });
    }
    console.log(`수집 완료: 발견 ${summary.discovered}건, 저장 ${summary.saved}건, 오류 ${summary.errors}건`);
    if (status === 'failed') process.exitCode = 1;
  } catch (error) {
    if (pool && runId) {
      await finishRun(pool, runId, {
        ...summary,
        errors: summary.errors + 1,
        status: 'failed',
        errorMessage: error.stack || error.message,
      });
    }
    throw error;
  } finally {
    if (pool) await pool.end();
  }
};

run().catch((error) => {
  console.error('크롤러 실행 실패:', error);
  process.exitCode = 1;
});
