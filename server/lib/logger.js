const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const configuredLevel = process.env.LOG_LEVEL || 'info';
const threshold = levels[configuredLevel] ?? levels.info;
const requestMetrics = {
  startedAt: new Date().toISOString(),
  total: 0,
  clientErrors: 0,
  serverErrors: 0,
  slow: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
};

const write = (level, message, metadata = {}) => {
  if (levels[level] > threshold) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata,
  };
  const output = JSON.stringify(entry);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
};

const logger = {
  error: (message, metadata) => write('error', message, metadata),
  warn: (message, metadata) => write('warn', message, metadata),
  info: (message, metadata) => write('info', message, metadata),
  debug: (message, metadata) => write('debug', message, metadata),
};

const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const requestId = req.get('x-request-id') || cryptoRandomId();
  res.setHeader('x-request-id', requestId);
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    requestMetrics.total += 1;
    requestMetrics.totalDurationMs += durationMs;
    requestMetrics.maxDurationMs = Math.max(requestMetrics.maxDurationMs, durationMs);
    if (res.statusCode >= 500) requestMetrics.serverErrors += 1;
    else if (res.statusCode >= 400) requestMetrics.clientErrors += 1;
    if (durationMs >= 1000) requestMetrics.slow += 1;
    const metadata = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
    };
    if (res.statusCode >= 500) logger.error('request_completed', metadata);
    else if (res.statusCode >= 400 || durationMs >= 1000) logger.warn('request_completed', metadata);
    else logger.debug('request_completed', metadata);
  });
  next();
};

const cryptoRandomId = () => require('crypto').randomBytes(8).toString('hex');

const getRequestMetrics = () => ({
  ...requestMetrics,
  averageDurationMs: requestMetrics.total
    ? Number((requestMetrics.totalDurationMs / requestMetrics.total).toFixed(1))
    : 0,
  maxDurationMs: Number(requestMetrics.maxDurationMs.toFixed(1)),
  totalDurationMs: undefined,
});

module.exports = { getRequestMetrics, logger, requestLogger };
