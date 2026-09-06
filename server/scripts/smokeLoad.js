const targetUrl = process.argv[2] || 'http://127.0.0.1:3000/api/health';
const totalRequests = Math.min(1000, Math.max(1, Number(process.argv[3]) || 100));
const concurrency = Math.min(50, Math.max(1, Number(process.argv[4]) || 10));
const latencies = [];
const statuses = new Map();
let nextRequest = 0;

const worker = async () => {
  while (nextRequest < totalRequests) {
    nextRequest += 1;
    const startedAt = performance.now();
    try {
      const response = await fetch(targetUrl, {
        headers: { accept: 'application/json', 'accept-encoding': 'gzip' },
      });
      await response.arrayBuffer();
      const status = String(response.status);
      statuses.set(status, (statuses.get(status) || 0) + 1);
    } catch (error) {
      statuses.set('network_error', (statuses.get('network_error') || 0) + 1);
    } finally {
      latencies.push(performance.now() - startedAt);
    }
  }
};

const percentile = (values, ratio) => values[Math.min(values.length - 1, Math.floor(values.length * ratio))];

const run = async () => {
  const startedAt = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const durationMs = performance.now() - startedAt;
  latencies.sort((left, right) => left - right);
  const summary = {
    targetUrl,
    totalRequests,
    concurrency,
    durationMs: Number(durationMs.toFixed(1)),
    requestsPerSecond: Number((totalRequests / (durationMs / 1000)).toFixed(1)),
    latencyMs: {
      p50: Number(percentile(latencies, 0.5).toFixed(1)),
      p95: Number(percentile(latencies, 0.95).toFixed(1)),
      max: Number(latencies.at(-1).toFixed(1)),
    },
    statuses: Object.fromEntries(statuses),
  };
  console.log(JSON.stringify(summary, null, 2));
  if ([...statuses.keys()].some((status) => !/^2\d\d$/.test(status))) process.exitCode = 1;
};

run();
