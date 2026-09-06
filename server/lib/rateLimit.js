const normalizePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const createMemoryRateLimiter = ({
  windowMs = 60_000,
  maximum = 300,
  maxKeys = 10_000,
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown',
  skip = (req) => req.method === 'OPTIONS',
  message = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요',
} = {}) => {
  const duration = normalizePositiveInteger(windowMs, 60_000);
  const limit = normalizePositiveInteger(maximum, 300);
  const capacity = normalizePositiveInteger(maxKeys, 10_000);
  const buckets = new Map();

  const removeExpired = (now) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  const limiter = (req, res, next) => {
    if (skip(req)) return next();
    const now = Date.now();
    const key = String(keyGenerator(req) || 'unknown');
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= capacity) removeExpired(now);
      if (buckets.size >= capacity) buckets.delete(buckets.keys().next().value);
      bucket = { count: 0, resetAt: now + duration };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, limit - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json({
        message,
        code: 'RATE_LIMITED',
        retry_after_seconds: resetSeconds,
      });
    }

    return next();
  };

  limiter.clear = () => buckets.clear();
  limiter.size = () => buckets.size;
  return limiter;
};

module.exports = { createMemoryRateLimiter };
