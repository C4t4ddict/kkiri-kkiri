const createRateLimiter = ({
  windowMs,
  max,
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown',
  message = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  maxEntries = 10_000,
  now = () => Date.now(),
} = {}) => {
  if (!Number.isFinite(windowMs) || windowMs <= 0 || !Number.isInteger(max) || max <= 0
    || !Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new TypeError('rate limiter에는 올바른 windowMs, max, maxEntries가 필요합니다');
  }

  const entries = new Map();

  const prune = (currentTime) => {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= currentTime) entries.delete(key);
    }
  };

  const reject = (res, resetAt, currentTime) => {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - currentTime) / 1000));
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', '0');
    res.set('RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({ message, retry_after_seconds: retryAfterSeconds });
  };
  let nextPruneAt = 0;

  const middleware = (req, res, next) => {
    const currentTime = now();
    const key = String(keyGenerator(req) || 'unknown').slice(0, 256);
    let entry = entries.get(key);
    if (!entry || entry.resetAt <= currentTime) {
      // Never evict an active bucket: rotating keys must not reset another
      // client's limit. Bound both memory and full-map cleanup under load.
      if (!entry && entries.size >= maxEntries) {
        if (currentTime >= nextPruneAt) {
          prune(currentTime);
          nextPruneAt = currentTime + Math.min(windowMs, 1_000);
        }
        if (entries.size >= maxEntries) return reject(res, nextPruneAt, currentTime);
      }
      entry = { count: 0, resetAt: currentTime + windowMs };
      entries.set(key, entry);
    }
    entry.count = Math.min(max + 1, entry.count + 1);

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

  middleware.reset = () => { entries.clear(); nextPruneAt = 0; };
  return middleware;
};

module.exports = { createRateLimiter };
