/**
 * Admin Routes — Fully migrated to SQLite
 */
import { Router } from "express";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, sqlite } from "../../db/index.mjs";
import * as schema from "../../db/schema.mjs";
import { config } from "../../config.mjs";
import { timestamp } from "../../utils/helpers.mjs";
import { encryptSecret } from "../../utils/crypto.mjs";
import { postJson } from "../../utils/http.mjs";
import { llmLimiter } from "../../middleware/rateLimiter.mjs";
import { getRuntimeModelConfig, publicModelConfig } from "../../services/llm.mjs";

export const adminRouter = Router();

function safeJsonParse(v, f) { try { return JSON.parse(v); } catch { return f; } }

// --- Dashboard ---
adminRouter.get("/dashboard", async (_req, res) => {
  const stats = {
    users: sqlite.prepare("SELECT COUNT(*) as c FROM users").get().c,
    conversations: sqlite.prepare("SELECT COUNT(*) as c FROM conversations").get().c,
    characters: sqlite.prepare("SELECT COUNT(*) as c FROM characters").get().c,
    messages: sqlite.prepare("SELECT COUNT(*) as c FROM messages").get().c,
    memories: sqlite.prepare("SELECT COUNT(*) as c FROM memories").get().c,
    relationships: sqlite.prepare("SELECT COUNT(*) as c FROM relationships").get().c,
    imageJobs: sqlite.prepare("SELECT COUNT(*) as c FROM image_jobs").get().c,
    subscriptions: sqlite.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active' AND plan != 'free'").get().c,
    todayMessages: sqlite.prepare("SELECT COUNT(*) as c FROM messages WHERE created_at LIKE ?").get(`${new Date().toISOString().slice(0, 10)}%`).c,
    todayNewUsers: sqlite.prepare("SELECT COUNT(*) as c FROM users WHERE created_at LIKE ?").get(`${new Date().toISOString().slice(0, 10)}%`).c,
  };
  const recentLogs = sqlite.prepare("SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT 10").all();
  res.json({ stats, recentLogs });
});

// --- Users ---
adminRouter.get("/users", async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const users = sqlite.prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT ?").all(limit);
  res.json(users.map(u => ({ ...u, favoriteCharacterIds: safeJsonParse(u.favorite_character_ids, []) })));
});

// --- Characters CRUD ---
adminRouter.get("/characters", async (_req, res) => {
  const chars = db.select().from(schema.characters).all();
  res.json(chars.map(c => ({ ...c, tags: safeJsonParse(c.tags, []), fixedMemories: safeJsonParse(c.fixedMemories, []) })));
});

adminRouter.post("/characters", async (req, res) => {
  const body = z.object({
    name: z.string().min(1).max(48),
    avatar: z.string().max(500).default(""),
    cover: z.string().max(500).default(""),
    shortBio: z.string().max(200).default(""),
    profile: z.string().max(2000).default(""),
    personality: z.string().max(500).default(""),
    speakingStyle: z.string().max(500).default(""),
    relationship: z.string().max(200).default(""),
    worldSetting: z.string().max(1000).default(""),
    scenario: z.string().max(1000).default(""),
    firstMessage: z.string().max(2000).default(""),
    tags: z.array(z.string()).max(10).default([]),
    visibility: z.enum(["public", "private"]).default("private"),
    isRecommended: z.boolean().default(false),
    themeColor: z.string().max(20).default("#0f766e"),
    onlineText: z.string().max(60).default(""),
    fixedMemories: z.array(z.string()).max(10).default([]),
  }).parse(req.body ?? {});

  const now = new Date().toISOString();
  const char = {
    id: `c-${nanoid(8)}`,
    ...body,
    tags: JSON.stringify(body.tags),
    fixedMemories: JSON.stringify(body.fixedMemories),
    exampleDialogs: "[]",
    status: "published",
    interactionCount: 0,
    workflowConfig: "{}",
    relationshipConfig: "{}",
    isRecommended: body.isRecommended ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.characters).values(char).run();

  // Log
  sqlite.prepare("INSERT INTO operation_logs (id, operator_id, action, target_type, target_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(`op-${nanoid(8)}`, "admin", "character.create", "character", char.id, `创建角色 ${body.name}`, now);

  res.status(201).json({ ...char, tags: body.tags, fixedMemories: body.fixedMemories });
});

adminRouter.put("/characters/:id", async (req, res) => {
  const existing = db.select().from(schema.characters).where(eq(schema.characters.id, req.params.id)).get();
  if (!existing) return res.status(404).json({ error: "角色不存在" });

  const body = req.body ?? {};
  const updates = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "avatar", "cover", "shortBio", "profile", "personality", "speakingStyle", "relationship", "worldSetting", "scenario", "firstMessage", "visibility", "status", "themeColor", "onlineText"]) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (body.tags) updates.tags = JSON.stringify(body.tags);
  if (body.fixedMemories) updates.fixedMemories = JSON.stringify(body.fixedMemories);
  if (body.isRecommended !== undefined) updates.isRecommended = body.isRecommended ? 1 : 0;

  db.update(schema.characters).set(updates).where(eq(schema.characters.id, req.params.id)).run();
  const updated = db.select().from(schema.characters).where(eq(schema.characters.id, req.params.id)).get();
  res.json({ ...updated, tags: safeJsonParse(updated.tags, []), fixedMemories: safeJsonParse(updated.fixedMemories, []) });
});

adminRouter.delete("/characters/:id", async (req, res) => {
  db.delete(schema.characters).where(eq(schema.characters.id, req.params.id)).run();
  sqlite.prepare("INSERT INTO operation_logs (id, operator_id, action, target_type, target_id, summary, risk_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(`op-${nanoid(8)}`, "admin", "character.delete", "character", req.params.id, "删除角色", "high", new Date().toISOString());
  res.status(204).end();
});

// --- Model Config ---
adminRouter.get("/model-config", async (_req, res) => {
  res.json(publicModelConfig({}));
});

adminRouter.put("/model-config", async (req, res) => {
  // Model config stored in a simple key-value approach via env
  // For now return current config (env-based)
  res.json(publicModelConfig({}));
});

adminRouter.post("/model-config/test", async (_req, res) => {
  const runtime = getRuntimeModelConfig({});
  if (!config.llmEnabled || !runtime.baseUrl) return res.json({ ok: false, message: "LLM 未配置" });
  const start = Date.now();
  try {
    const response = await postJson(`${runtime.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      timeoutMs: runtime.timeoutSeconds * 1000,
      headers: runtime.apiKey ? { Authorization: `Bearer ${runtime.apiKey}` } : {},
      body: { model: runtime.modelName, stream: false, messages: [{ role: "user", content: "ping" }] },
    });
    res.json({ ok: response.ok, latencyMs: Date.now() - start, message: response.ok ? "连接正常" : `HTTP ${response.status}` });
  } catch (e) {
    res.json({ ok: false, latencyMs: Date.now() - start, message: e.message });
  }
});

// --- Conversations ---
adminRouter.get("/conversations", async (_req, res) => {
  const convs = sqlite.prepare("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 100").all();
  res.json(convs);
});

// --- Operation Logs ---
adminRouter.get("/operation-logs", async (_req, res) => {
  const logs = sqlite.prepare("SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT 200").all();
  res.json(logs);
});

// --- Analytics (v0.2) ---
adminRouter.get("/analytics", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const messages = sqlite.prepare("SELECT COUNT(*) as c FROM messages WHERE created_at LIKE ?").get(`${dateStr}%`).c;
    const newUsers = sqlite.prepare("SELECT COUNT(*) as c FROM users WHERE created_at LIKE ?").get(`${dateStr}%`).c;
    const checkIns = sqlite.prepare("SELECT COUNT(*) as c FROM check_ins WHERE date = ?").get(dateStr).c;
    days.push({ date: dateStr, messages, newUsers, checkIns });
  }

  const totalRevenue = sqlite.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active' AND plan = 'basic'").get().c * 19.9
    + sqlite.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active' AND plan = 'premium'").get().c * 49.9;

  res.json({
    days,
    totals: {
      users: sqlite.prepare("SELECT COUNT(*) as c FROM users").get().c,
      paidUsers: sqlite.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active' AND plan != 'free'").get().c,
      monthlyRevenue: totalRevenue,
      avgMessagesPerUser: sqlite.prepare("SELECT CAST(COUNT(*) AS REAL) / MAX(1, (SELECT COUNT(DISTINCT user_id) FROM conversations)) FROM messages").get()?.["CAST(COUNT(*) AS REAL) / MAX(1, (SELECT COUNT(DISTINCT user_id) FROM conversations))"] ?? 0,
    },
  });
});

// --- Content Moderation Queue ---
adminRouter.get("/moderation", async (_req, res) => {
  const reports = sqlite.prepare("SELECT * FROM feedback WHERE type = 'report' ORDER BY created_at DESC LIMIT 50").all();
  res.json(reports);
});

adminRouter.post("/moderation/:id/resolve", async (req, res) => {
  const body = z.object({ action: z.enum(["dismiss", "warn", "ban"]) }).parse(req.body ?? {});
  // Mark feedback as resolved
  sqlite.prepare("UPDATE feedback SET type = ? WHERE id = ?").run(`report_${body.action}`, req.params.id);
  sqlite.prepare("INSERT INTO operation_logs (id, operator_id, action, target_type, target_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(`op-${nanoid(8)}`, "admin", `moderation.${body.action}`, "report", req.params.id, `审核处理: ${body.action}`, new Date().toISOString());
  res.json({ success: true });
});

export default adminRouter;
