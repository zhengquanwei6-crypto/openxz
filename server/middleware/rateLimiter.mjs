import { config } from "../config.mjs";

export function createRateLimiter({ windowMs, max, label, keyFn }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${label}:${keyFn(req)}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "请求过于频繁，请稍后再试。", retryAfter });
    }
    return next();
  };
}

const clientIp = (req) => req.ip || req.socket.remoteAddress || "unknown";

export const authLimiter = createRateLimiter({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  label: "auth",
  keyFn: clientIp,
});

export const llmLimiter = createRateLimiter({
  windowMs: config.llmRateLimitWindowMs,
  max: config.llmRateLimitMax,
  label: "llm",
  keyFn: (req) => req.auth?.sub || clientIp(req),
});
