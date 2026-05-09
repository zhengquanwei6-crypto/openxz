/**
 * Quota Check Middleware
 *
 * Intercepts message/image requests and checks if the user has
 * remaining daily quota based on their subscription plan.
 *
 * Usage:
 *   app.post("/api/conversations/:id/messages", requireAuth, quotaCheck("message"), ...)
 */
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";

// --- Plan limits ---
const PLAN_LIMITS = {
  free: { messagesPerDay: 20, imagesPerDay: 0 },
  basic: { messagesPerDay: 200, imagesPerDay: 10 },
  premium: { messagesPerDay: -1, imagesPerDay: -1 }, // unlimited
};

function getUserPlan(userId) {
  const sub = db.select().from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.status, "active")))
    .get();

  if (!sub) return "free";

  // Check expiration
  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) {
    db.update(schema.subscriptions)
      .set({ status: "expired" })
      .where(eq(schema.subscriptions.id, sub.id))
      .run();
    return "free";
  }

  return sub.plan || "free";
}

function countTodayMessages(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const userConvs = db.select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, userId))
    .all();

  if (userConvs.length === 0) return 0;

  const convIds = userConvs.map((c) => c.id);
  // Use raw SQL for IN clause efficiency
  const placeholders = convIds.map(() => "?").join(",");
  const stmt = db.run
    ? null
    : null;

  // Fallback: iterate (for SQLite with Drizzle)
  let count = 0;
  for (const convId of convIds) {
    const msgs = db.select().from(schema.messages)
      .where(and(
        eq(schema.messages.conversationId, convId),
        eq(schema.messages.role, "user"),
      ))
      .all();
    count += msgs.filter((m) => m.createdAt?.startsWith(today)).length;
  }
  return count;
}

function countTodayImages(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const jobs = db.select().from(schema.imageJobs)
    .where(eq(schema.imageJobs.userId, userId))
    .all();
  return jobs.filter((j) => j.createdAt?.startsWith(today)).length;
}

/**
 * Creates a middleware that checks quota before allowing the request.
 * @param {"message" | "image"} type - The quota type to check
 */
export function quotaCheck(type) {
  return (req, res, next) => {
    const userId = req.auth?.sub;
    if (!userId) return res.status(401).json({ error: "请先登录" });

    // Admin bypasses quota
    if (req.auth?.role === "admin") return next();

    const plan = getUserPlan(userId);
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    if (type === "message") {
      const limit = limits.messagesPerDay;
      if (limit === -1) return next(); // unlimited

      const used = countTodayMessages(userId);
      if (used >= limit) {
        return res.status(429).json({
          error: "今日消息额度已用完",
          quota: { type: "message", used, limit, plan },
          upgradeHint: plan === "free"
            ? "升级到基础版可获得每日 200 条消息"
            : "升级到高级版享受无限消息",
        });
      }
      // Attach quota info for downstream use
      req.quota = { type, used, limit, remaining: limit - used, plan };
      return next();
    }

    if (type === "image") {
      const limit = limits.imagesPerDay;
      if (limit === -1) return next(); // unlimited

      if (limit === 0 && plan === "free") {
        return res.status(429).json({
          error: "免费版不支持图片生成",
          quota: { type: "image", used: 0, limit: 0, plan },
          upgradeHint: "升级到基础版可获得每日 10 张图片",
        });
      }

      const used = countTodayImages(userId);
      if (used >= limit) {
        return res.status(429).json({
          error: "今日图片额度已用完",
          quota: { type: "image", used, limit, plan },
          upgradeHint: plan === "basic"
            ? "升级到高级版享受无限图片生成"
            : "明天额度将重置",
        });
      }
      req.quota = { type, used, limit, remaining: limit - used, plan };
      return next();
    }

    // Unknown type, allow through
    next();
  };
}
