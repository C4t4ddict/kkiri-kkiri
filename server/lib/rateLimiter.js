const createRateLimiter = ({
  windowMs,
  max,
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown',
  message = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  maxEntries = 10_000,
  now = () => Date.now(),
} = {}) => {
  if (!Number.isFinite(windowMs) || windowMs <= 0 || !Number.isInteger(max) || max <= 0) {
    throw new TypeError('rate limiter에는 올바른 windowMs와 max가 필요합니다');
  }

  const entries = new Map();

  const prune = (currentTime) => {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= currentTime) entries.delete(key);
    }
    while (entries.size >= maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  };

  const middleware = (req, res, next) => {
    const currentTime = now();
    if (entries.size >= maxEntries) prune(currentTime);

    const key = String(keyGenerator(req) || 'unknown').slice(0, 256);
    let entry = entries.get(key);
    if (!entry || entry.resetAt <= currentTime) {
      entry = { count: 0, resetAt: currentTime + windowMs };
      entries.set(key, entry);
    }
    entry.count += 1;

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000));
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.set('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ message, retry_after_seconds: retryAfterSeconds });
    }

    return next();
  };

  middleware.reset = () => entries.clear();
  return middleware;
};

module.exports = { createRateLimiter };
