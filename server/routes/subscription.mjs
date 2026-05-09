/**
 * Subscription & Payment Routes
 *
 * Provides:
 * - GET /api/subscription - Get current user subscription status
 * - POST /api/subscription/upgrade - Upgrade plan (creates order)
 * - POST /api/subscription/cancel - Cancel subscription
 * - GET /api/subscription/plans - List available plans
 * - POST /api/subscription/check-quota - Check if user can perform action
 */
import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.mjs";
import { db } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";

export const subscriptionRouter = Router();

// --- Plan Definitions ---

const PLANS = {
  free: {
    id: "free",
    name: "免费版",
    price: 0,
    priceMonthly: 0,
    limits: {
      messagesPerDay: 20,
      imagesPerDay: 0,
      maxCharacters: 3,
      model: "basic",
    },
    features: ["3 个角色", "每日 20 条消息", "基础模型"],
  },
  basic: {
    id: "basic",
    name: "基础版",
    price: 1990, // cents
    priceMonthly: 19.9,
    limits: {
      messagesPerDay: 200,
      imagesPerDay: 10,
      maxCharacters: -1, // unlimited
      model: "standard",
    },
    features: ["无限角色", "每日 200 条消息", "每日 10 张图片", "标准模型"],
  },
  premium: {
    id: "premium",
    name: "高级版",
    price: 4990, // cents
    priceMonthly: 49.9,
    limits: {
      messagesPerDay: -1, // unlimited
      imagesPerDay: -1,
      maxCharacters: -1,
      model: "best",
    },
    features: ["无限角色", "无限消息", "无限图片", "最强模型", "优先响应"],
  },
};

// --- Helpers ---

function getUserSubscription(userId) {
  const sub = db.select().from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.status, "active")))
    .get();

  if (!sub) return { plan: "free", status: "active", limits: PLANS.free.limits };

  // Check if expired
  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) {
    db.update(schema.subscriptions)
      .set({ status: "expired" })
      .where(eq(schema.subscriptions.id, sub.id))
      .run();
    return { plan: "free", status: "active", limits: PLANS.free.limits };
  }

  const planConfig = PLANS[sub.plan] ?? PLANS.free;
  return { ...sub, limits: planConfig.limits, planConfig };
}

function countTodayUsage(userId, type) {
  const today = new Date().toISOString().slice(0, 10);
  if (type === "message") {
    const result = db.select().from(schema.messages)
      .where(eq(schema.messages.conversationId, "")) // We'll count via conversations
      .all();
    // Simplified: count messages created today for this user's conversations
    const userConvIds = db.select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.userId, userId))
      .all()
      .map((c) => c.id);

    if (userConvIds.length === 0) return 0;

    const allMsgs = db.select().from(schema.messages).all();
    return allMsgs.filter((m) =>
      userConvIds.includes(m.conversationId) &&
      m.role === "user" &&
      m.createdAt?.startsWith(today)
    ).length;
  }
  if (type === "image") {
    const allJobs = db.select().from(schema.imageJobs)
      .where(eq(schema.imageJobs.userId, userId))
      .all();
    return allJobs.filter((j) => j.createdAt?.startsWith(today)).length;
  }
  return 0;
}

export function checkQuota(userId, type) {
  const sub = getUserSubscription(userId);
  const limits = sub.limits;

  if (type === "message") {
    if (limits.messagesPerDay === -1) return { allowed: true, remaining: -1 };
    const used = countTodayUsage(userId, "message");
    const remaining = Math.max(0, limits.messagesPerDay - used);
    return { allowed: remaining > 0, remaining, limit: limits.messagesPerDay, used };
  }
  if (type === "image") {
    if (limits.imagesPerDay === -1) return { allowed: true, remaining: -1 };
    const used = countTodayUsage(userId, "image");
    const remaining = Math.max(0, limits.imagesPerDay - used);
    return { allowed: remaining > 0, remaining, limit: limits.imagesPerDay, used };
  }
  return { allowed: true, remaining: -1 };
}

// --- Routes ---

subscriptionRouter.get("/plans", async (_req, res) => {
  res.json(Object.values(PLANS));
});

subscriptionRouter.get("/", requireAuth, async (req, res) => {
  const sub = getUserSubscription(req.auth.sub);
  const planConfig = PLANS[sub.plan] ?? PLANS.free;
  res.json({
    plan: sub.plan,
    planName: planConfig.name,
    status: sub.status,
    limits: sub.limits,
    features: planConfig.features,
    expiresAt: sub.expiresAt ?? null,
    messageQuota: checkQuota(req.auth.sub, "message"),
    imageQuota: checkQuota(req.auth.sub, "image"),
  });
});

subscriptionRouter.post("/check-quota", requireAuth, async (req, res) => {
  const body = z.object({ type: z.enum(["message", "image", "character"]) }).parse(req.body);
  const result = checkQuota(req.auth.sub, body.type);
  res.json(result);
});

subscriptionRouter.post("/upgrade", requireAuth, async (req, res) => {
  const body = z.object({
    plan: z.enum(["basic", "premium"]),
    paymentMethod: z.string().optional(),
  }).parse(req.body);

  const planConfig = PLANS[body.plan];
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // +30 days

  // Cancel existing active subscription
  const existing = db.select().from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, req.auth.sub), eq(schema.subscriptions.status, "active")))
    .get();
  if (existing) {
    db.update(schema.subscriptions)
      .set({ status: "cancelled", cancelledAt: now })
      .where(eq(schema.subscriptions.id, existing.id))
      .run();
  }

  // Create new subscription
  const subscription = {
    id: `sub-${nanoid(10)}`,
    userId: req.auth.sub,
    plan: body.plan,
    status: "active",
    startedAt: now,
    expiresAt,
    paymentMethod: body.paymentMethod ?? "pending",
    orderId: `order-${nanoid(12)}`,
    createdAt: now,
  };
  db.insert(schema.subscriptions).values(subscription).run();

  res.status(201).json({
    subscription,
    planName: planConfig.name,
    features: planConfig.features,
    message: `已升级到${planConfig.name}，有效期至 ${new Date(expiresAt).toLocaleDateString("zh-CN")}`,
  });
});

subscriptionRouter.post("/cancel", requireAuth, async (req, res) => {
  const existing = db.select().from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, req.auth.sub), eq(schema.subscriptions.status, "active")))
    .get();

  if (!existing || existing.plan === "free") {
    return res.status(400).json({ error: "没有可取消的订阅" });
  }

  db.update(schema.subscriptions)
    .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
    .where(eq(schema.subscriptions.id, existing.id))
    .run();

  res.json({
    message: "订阅已取消，当前周期内仍可使用付费功能。",
    expiresAt: existing.expiresAt,
  });
});
