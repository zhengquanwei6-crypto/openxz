import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { config } from "../config.mjs";
import { createToken } from "../utils/crypto.mjs";
import { authLimiter } from "../middleware/rateLimiter.mjs";
import { db } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";

export const authRouter = Router();

// --- Database-backed user/persona helpers ---

export function ensureUser(_data, input = {}) {
  const identifier = String(input.identifier ?? "").trim().toLowerCase();
  const now = new Date().toISOString();

  // Try to find existing user
  let existing = null;
  if (identifier) {
    existing = db.select().from(schema.users).where(eq(schema.users.identifier, identifier)).get();
  } else if (input.userId) {
    existing = db.select().from(schema.users).where(eq(schema.users.id, input.userId)).get();
  }
  if (existing) return deserializeUser(existing);

  // Create new user
  const user = {
    id: input.userId ?? `u-${nanoid(10)}`,
    identifier: identifier || `guest-${nanoid(8)}`,
    nickname: input.nickname || "新用户",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=160&h=160",
    role: "user",
    favoriteCharacterIds: "[]",
    createdAt: now,
  };
  db.insert(schema.users).values(user).run();
  return deserializeUser(user);
}

export function normalizePersona(source = {}, userId) {
  return {
    id: source.id || `persona-${nanoid(8)}`,
    userId,
    nickname: typeof source.nickname === "string" ? source.nickname : "新用户",
    preferredName: typeof source.preferredName === "string" ? source.preferredName : "朋友",
    gender: typeof source.gender === "string" ? source.gender : "不限定",
    ageRange: typeof source.ageRange === "string" ? source.ageRange : "25-34",
    interests: Array.isArray(source.interests) ? source.interests.filter((item) => typeof item === "string") : [],
    chatPreference: typeof source.chatPreference === "string" ? source.chatPreference : "希望角色说话自然、有边界。",
  };
}

export function ensurePersona(_data, userId) {
  const existing = db.select().from(schema.personas).where(eq(schema.personas.userId, userId)).get();
  if (existing) return deserializePersona(existing);

  const persona = {
    id: `persona-${nanoid(8)}`,
    userId,
    nickname: "新用户",
    preferredName: "朋友",
    gender: "不限定",
    ageRange: "25-34",
    interests: "[]",
    chatPreference: "希望角色说话自然、有边界。",
  };
  db.insert(schema.personas).values(persona).run();
  return deserializePersona(persona);
}

// --- Serialization helpers ---

function deserializeUser(row) {
  return {
    ...row,
    favoriteCharacterIds: safeJsonParse(row.favoriteCharacterIds, []),
  };
}

function deserializePersona(row) {
  return {
    ...row,
    interests: safeJsonParse(row.interests, []),
  };
}

function safeJsonParse(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

// --- Routes ---

authRouter.post("/login", authLimiter, async (req, res) => {
  const body = z
    .object({
      role: z.enum(["user", "admin"]).optional(),
      token: z.string().optional(),
      identifier: z.string().optional(),
      nickname: z.string().optional(),
    })
    .parse(req.body ?? {});

  if (body.role === "admin" && body.token !== config.adminToken) {
    return res.status(401).json({ error: "管理员令牌无效" });
  }
  if (body.role === "admin") {
    const token = createToken({ sub: "admin", role: "admin" }, 60 * 60 * 12);
    return res.json({
      token,
      user: { id: "admin", nickname: "管理员", avatar: "", role: "admin", createdAt: new Date().toISOString() },
    });
  }

  const user = ensureUser(null, { identifier: body.identifier, nickname: body.nickname || "星河旅人" });
  ensurePersona(null, user.id);
  const token = createToken({ sub: user.id, role: "user" });
  res.json({ user, token });
});
