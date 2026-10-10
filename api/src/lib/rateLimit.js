/**
 * Dependency-free fixed-window rate limiter.
 *
 * The API has no Redis and runs as a single process, so an in-memory window is
 * the honest choice: it resets on restart, and it does not pretend to be a
 * distributed limit. It is enough to stop one account or one IP from burning
 * through a paid model quota, which is the threat this exists for.
 */

const buckets = new Map();

let lastSweep = Date.now();

function sweep(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Who a request is attributed to. Authenticated traffic is limited per
 *  account; anything still anonymous is limited per address. */
export function clientKey(req) {
  return req.user?.id ? `u:${req.user.id}` : `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`;
}

/**
 * @param {{ windowMs: number, max: number, name?: string, key?: (req) => string }} options
 */
export function rateLimit({ windowMs, max, name = "default", key = clientKey }) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error("rateLimit: windowMs must be > 0");
  if (!Number.isFinite(max) || max <= 0) throw new Error("rateLimit: max must be > 0");

  return (req, res, next) => {
    const now = Date.now();
    sweep(now);

    const id = `${name}:${key(req)}`;
    let bucket = buckets.get(id);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(id, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "Too many requests, please wait a moment and try again",
        code: "rate_limited",
        retryAfter,
      });
    }

    return next();
  };
}

/** Test hook: forget every bucket. Never called by application code. */
export function resetRateLimits() {
  buckets.clear();
}
