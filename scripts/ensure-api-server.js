const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const serverRoot = path.join(projectRoot, 'server');
const apiHealthUrl = process.env.KKIRI_API_HEALTH_URL || 'http://127.0.0.1:3000/api/health';
const dbHealthUrl = process.env.KKIRI_DB_HEALTH_URL || 'http://127.0.0.1:3000/api/db-health';
const logPath = path.join(os.tmpdir(), 'kkiri-api-server.log');
const pidPath = path.join(os.tmpdir(), 'kkiri-api-server.pid.json');
const apiPort = Number(new URL(apiHealthUrl).port || 80);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const requestHealth = (url) => new Promise((resolve) => {
  const request = http.get(url, { timeout: 1500 }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => {
      body += chunk;
    });
    response.on('end', () => {
      try {
        const payload = JSON.parse(body);
        resolve({
          reachable: true,
          healthy: response.statusCode === 200 && payload.status === 'ok',
          payload,
        });
      } catch {
        resolve({ reachable: true, healthy: false, payload: null });
      }
    });
  });
  request.on('timeout', () => request.destroy());
  request.on('error', () => resolve({ reachable: false, healthy: false, payload: null }));
});

const isKkiriHealthPayload = (payload) => Boolean(
  payload
  && payload.status === 'ok'
  && Object.prototype.hasOwnProperty.call(payload, 'activity_cache_entries')
  && Object.prototype.hasOwnProperty.call(payload, 'database'),
);

const parseWindowsListeningPids = (output, port) => [...new Set(String(output || '')
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .filter((fields) => fields.length >= 5
    && fields[0].toUpperCase() === 'TCP'
    && fields[1].endsWith(`:${port}`)
    && fields[3].toUpperCase() === 'LISTENING')
  .map((fields) => Number(fields[4]))
  .filter((pid) => Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid))];

const readTrackedPid = () => {
  try {
    const record = JSON.parse(fs.readFileSync(pidPath, 'utf8'));
    return record?.projectRoot === projectRoot && Number.isSafeInteger(record.pid) ? record.pid : null;
  } catch {
    return null;
  }
};

const findApiPids = () => {
  const pids = [readTrackedPid()].filter(Boolean);
  if (process.platform === 'win32') {
    try {
      const output = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
      pids.push(...parseWindowsListeningPids(output, apiPort));
    } catch {
      // PID 파일이 있으면 해당 프로세스만으로 복구를 계속합니다.
    }
  }
  return [...new Set(pids)];
};

const recycleStaleApi = async () => {
  const pids = findApiPids();
  if (!pids.length) return false;
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  try { fs.rmSync(pidPath, { force: true }); } catch { /* 다음 시작에서 덮어씁니다. */ }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await requestHealth(apiHealthUrl)).reachable) return true;
    await wait(250);
  }
  return !(await requestHealth(apiHealthUrl)).reachable;
};

const waitForDatabase = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await requestHealth(dbHealthUrl);
    if (status.healthy) return true;
    await wait(500);
  }
  return false;
};

const startServer = () => {
  const output = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: serverRoot,
    detached: true,
    env: process.env,
    stdio: ['ignore', output, output],
  });
  child.unref();
  fs.closeSync(output);
  fs.writeFileSync(pidPath, JSON.stringify({ pid: child.pid, projectRoot, startedAt: new Date().toISOString() }));
  return child.pid;
};

const run = async () => {
  const database = await requestHealth(dbHealthUrl);
  if (database.healthy) {
    console.log('API 서버와 데이터베이스가 이미 실행 중입니다.');
    return;
  }

  const api = await requestHealth(apiHealthUrl);
  if (api.reachable) {
    if (!isKkiriHealthPayload(api.payload)) {
      throw new Error(`포트 ${apiPort}을 다른 프로그램이 사용 중입니다. 해당 프로그램을 종료해주세요.`);
    }
    console.log('데이터베이스 연결이 끊긴 이전 끼리끼리 API를 재시작합니다.');
    if (!(await recycleStaleApi())) {
      throw new Error(`포트 ${apiPort}의 이전 API를 종료하지 못했습니다. 서버 로그를 확인해주세요.`);
    }
  }

  const pid = startServer();
  if (!(await waitForDatabase())) {
    throw new Error(`API 서버를 시작하지 못했습니다. 로그: ${logPath}`);
  }
  console.log(`API 서버를 시작했습니다. PID ${pid}`);
};

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { isKkiriHealthPayload, parseWindowsListeningPids };
