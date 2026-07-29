const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const serverRoot = path.join(projectRoot, 'server');
const apiHealthUrl = process.env.KKIRI_API_HEALTH_URL || 'http://127.0.0.1:3000/api/health';
const dbHealthUrl = process.env.KKIRI_DB_HEALTH_URL || 'http://127.0.0.1:3000/api/db-health';
const logPath = path.join(os.tmpdir(), 'kkiri-api-server.log');

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
        resolve({ reachable: true, healthy: response.statusCode === 200 && payload.status === 'ok' });
      } catch {
        resolve({ reachable: true, healthy: false });
      }
    });
  });
  request.on('timeout', () => request.destroy());
  request.on('error', () => resolve({ reachable: false, healthy: false }));
});

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
    throw new Error('API 서버는 실행 중이지만 데이터베이스 연결이 끊겼습니다. 서버 로그를 확인해주세요.');
  }

  const pid = startServer();
  if (!(await waitForDatabase())) {
    throw new Error(`API 서버를 시작하지 못했습니다. 로그: ${logPath}`);
  }
  console.log(`API 서버를 시작했습니다. PID ${pid}`);
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
