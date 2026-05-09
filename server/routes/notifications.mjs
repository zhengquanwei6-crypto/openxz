/**
 * Push Notifications (Web Push API)
 * 
 * POST /api/notifications/subscribe — Register push subscription
 * POST /api/notifications/send      — Admin: send push to user(s)
 * DELETE /api/notifications/subscribe — Unsubscribe
 */
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.mjs";
import { sqlite } from "../db/index.mjs";

export const notificationsRouter = Router();

notificationsRouter.post("/subscribe", requireAuth, async (req, res) => {
  const body = z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }).parse(req.body);

  // Upsert subscription
  sqlite.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`push-${nanoid(8)}`, req.auth.sub, body.endpoint, body.keys.p256dh, body.keys.auth, new Date().toISOString());

  res.status(201).json({ success: true });
});

notificationsRouter.delete("/subscribe", requireAuth, async (req, res) => {
  sqlite.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(req.auth.sub);
  res.status(204).end();
});

// Admin: get subscription count
notificationsRouter.get("/stats", async (_req, res) => {
  const count = sqlite.prepare("SELECT COUNT(*) as c FROM push_subscriptions").get().c;
  res.json({ subscribedUsers: count });
});

// Admin: send notification (stub — actual web-push library needed in production)
notificationsRouter.post("/send", async (req, res) => {
  const body = z.object({
    userId: z.string().optional(),
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(300),
  }).parse(req.body);

  let targets;
  if (body.userId) {
    targets = sqlite.prepare("SELECT * FROM push_subscriptions WHERE user_id = ?").all(body.userId);
  } else {
    targets = sqlite.prepare("SELECT * FROM push_subscriptions LIMIT 1000").all();
  }

  // In production, use web-push library here to send actual push notifications
  // For now, log and return count
  console.log(`[Push] Would send to ${targets.length} subscriptions: "${body.title}"`);

  res.json({ sent: targets.length, title: body.title });
});
