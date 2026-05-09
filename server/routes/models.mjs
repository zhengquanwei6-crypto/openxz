/**
 * Multi-Model Switching
 * 
 * GET  /api/models              — List available models
 * GET  /api/models/current      — Get user's selected model
 * PUT  /api/models/current      — Switch model (requires subscription tier)
 */
import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.mjs";
import { db, sqlite } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";
import { config } from "../config.mjs";

export const modelsRouter = Router();

const AVAILABLE_MODELS = [
  {
    id: "basic",
    name: "基础模型",
    description: "适合日常陪伴聊天，响应快速",
    provider: "default",
    requiredPlan: "free",
    speed: "fast",
    quality: "good",
  },
  {
    id: "standard",
    name: "标准模型",
    description: "平衡响应速度和回复质量",
    provider: "default",
    requiredPlan: "basic",
    speed: "medium",
    quality: "better",
  },
  {
    id: "premium",
    name: "最强模型",
    description: "最高质量回复，更深度的角色扮演",
    provider: "default",
    requiredPlan: "premium",
    speed: "slower",
    quality: "best",
  },
];

function getUserPlan(userId) {
  const sub = sqlite.prepare("SELECT plan FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(userId);
  return sub?.plan || "free";
}

function getUserModel(userId) {
  const pref = sqlite.prepare("SELECT model_id FROM user_preferences WHERE user_id = ? AND key = 'selected_model'").get(userId);
  return pref?.model_id || "basic";
}

modelsRouter.get("/", requireAuth, async (req, res) => {
  const userPlan = getUserPlan(req.auth.sub);
  const planOrder = { free: 0, basic: 1, premium: 2 };

  const models = AVAILABLE_MODELS.map(m => ({
    ...m,
    available: planOrder[userPlan] >= planOrder[m.requiredPlan],
    current: false, // Will be set below
  }));

  const currentModel = getUserModel(req.auth.sub);
  const result = models.map(m => ({ ...m, current: m.id === currentModel }));

  res.json(result);
});

modelsRouter.get("/current", requireAuth, async (req, res) => {
  const modelId = getUserModel(req.auth.sub);
  const model = AVAILABLE_MODELS.find(m => m.id === modelId) || AVAILABLE_MODELS[0];
  res.json(model);
});

modelsRouter.put("/current", requireAuth, async (req, res) => {
  const body = z.object({ modelId: z.string() }).parse(req.body);
  const model = AVAILABLE_MODELS.find(m => m.id === body.modelId);
  if (!model) return res.status(404).json({ error: "模型不存在" });

  // Check plan access
  const userPlan = getUserPlan(req.auth.sub);
  const planOrder = { free: 0, basic: 1, premium: 2 };
  if (planOrder[userPlan] < planOrder[model.requiredPlan]) {
    return res.status(403).json({ error: `需要${model.requiredPlan === "basic" ? "基础版" : "高级版"}会员才能使用此模型`, requiredPlan: model.requiredPlan });
  }

  // Save preference
  sqlite.prepare(`
    INSERT OR REPLACE INTO user_preferences (id, user_id, key, model_id, updated_at)
    VALUES (?, ?, 'selected_model', ?, ?)
  `).run(`pref-${req.auth.sub}`, req.auth.sub, body.modelId, new Date().toISOString());

  res.json({ ...model, current: true });
});
