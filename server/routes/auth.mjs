import { Router } from "express";
import { z } from "zod";
import { config } from "../config.mjs";
import { createToken } from "../utils/crypto.mjs";
import { authLimiter } from "../middleware/rateLimiter.mjs";
import { updateStore } from "../store/index.mjs";
import { nanoid } from "nanoid";

export const authRouter = Router();

function ensureUser(data, input = {}) {
  const identifier = String(input.identifier ?? "").trim().toLowerCase();
  const existing = identifier
    ? data.users.find((user) => user.identifier === identifier)
    : data.users.find((user) => user.id === input.userId);
  if (existing) return existing;
  const user = {
    id: input.userId ?? `u-${nanoid(10)}`,
    identifier: identifier || `guest-${nanoid(8)}`,
    nickname: input.nickname || "新用户",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=160&h=160",
    role: "user",
    createdAt: new Date().toISOString(),
  };
  data.users.unshift(user);
  return user;
}

function normalizePersona(source = {}, userId) {
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

function ensurePersona(data, userId) {
  data.personas = Array.isArray(data.personas) ? data.personas : data.persona ? [data.persona] : [];
  const index = data.personas.findIndex((item) => item.userId === userId);
  if (index === -1) {
    const persona = normalizePersona({}, userId);
    data.personas.unshift(persona);
    return persona;
  }
  const persona = normalizePersona(data.personas[index], userId);
  data.personas[index] = persona;
  return persona;
}

// Export for use by other route files
export { ensureUser, ensurePersona, normalizePersona };

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
      user: {
        id: "admin",
        nickname: "管理员",
        avatar: "",
        role: "admin",
        createdAt: new Date().toISOString(),
      },
    });
  }
  const result = await updateStore((data) => {
    const user = ensureUser(data, { identifier: body.identifier, nickname: body.nickname || "星河旅人" });
    ensurePersona(data, user.id);
    return { user, token: createToken({ sub: user.id, role: "user" }) };
  });
  res.json(result);
});
