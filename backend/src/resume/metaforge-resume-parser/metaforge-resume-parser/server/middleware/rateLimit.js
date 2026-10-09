const buckets = new Map();

export function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 30, keyPrefix = "" }) {
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const key = `${keyPrefix}:${userId}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - bucket.count));

    if (bucket.count > max) {
      return res.status(429).json({
        error: "Rate limit exceeded. Please try again later.",
        retryAfterMs: bucket.resetAt - now,
      });
    }

    next();
  };
}
